import { registerOfflineLessons } from './offline-lesson.mjs';
import {
  advanceExam,
  bookQuestions,
  refreshExamSources,
  restoreExamThreads,
  sourceExercise,
} from './exam-threads.mjs';
import { practiceOffer, practiceSummary, registerReview } from './review.mjs';
import { advanceLessons, registerTeaching } from './native-teaching.mjs';
import fs from 'node:fs';
import { pointFinished, pointReadings, points } from './passages.mjs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  ask,
  planningSource,
  planPrompt,
  discussionPrompt,
  diagnosticPrompt,
  prepareExamPrompt,
  gradePrompt,
  sectionContext,
  chapterOpening,
} from './model.mjs';
import {
  initialChat,
  evidenceFor,
  validatePlan,
  recommendation,
  publicChat,
  verifiedItem,
  normalise,
} from './learning.mjs';

const isId = (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
function atomic(file, value) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const msg = (role, text) => ({ role, text });
const validReply = (r) => {
  if (typeof r?.reply !== 'string' || !r.reply.trim()) throw Error('No tutor response. Retry this step.');
  return r.reply;
};

export function activate(ctx) {
  const root = ctx.dataDirectory;
  fs.mkdirSync(root, { recursive: true });
  const busy = new Set();
  const folder = (id) => {
    if (!isId(id)) throw Error('Invalid course ID.');
    return join(root, id);
  };
  const path = (id, name) => join(folder(id), name);
  const state = (id) => read(path(id, 'course.json'));
  const book = (id) => read(path(id, state(id).sourceFile ?? 'source.json'));
  const imageList = (a) =>
    (a.images ?? []).slice(0, 4).map((image) => {
      if (typeof image !== 'string' || image.length > 4000000 || !/^[A-Za-z0-9+/=]+$/.test(image))
        throw Error('Invalid page image.');
      return image;
    });
  function save(id, c) {
    ctx.signal.throwIfAborted();
    atomic(path(id, 'course.json'), c);
  }
  function at(list, n) {
    if (!Number.isInteger(n) || !list[n]) throw Error('Unknown chapter or section.');
    return list[n];
  }
  // Only upgrade an early draft plan while the learner has submitted no work.
  function needsPlan(ch) {
    return (
      !ch.objectives ||
      (!ch.planVersion &&
        ch.objectives.length > ch.sections.length * 2 &&
        !ch.diagnostic &&
        !ch.chat.messages.some((m) => m.role === 'learner') &&
        !ch.chat.results.length)
    );
  }
  function completedPoints(ch, section, readings) {
    if (section < ch.chat.section || !['reading', 'discussion'].includes(ch.chat.phase))
      return readings.length;
    return readings.filter((p) => pointFinished(ch.teaching?.[p.key], ch.offlineLessons?.[p.key])).length;
  }
  function publicCourse(c, source = book(c.id)) {
    return {
      id: c.id,
      title: c.title,
      warnings: c.warnings,
      practiceOffer: practiceOffer(c.chapters),
      chapters: c.chapters.map(({ chat, reviews, offlineLessons, ...ch }, i) => {
        const sections = ch.sections.map((s, j) => {
          const start = j === 0 ? ch.start : s.start;
          const readings = pointReadings(s, j, start, source.pages);
          const count = completedPoints(c.chapters[i], j, readings);
          return {
            ...s,
            start,
            firstLabel: source.pages[start - 1].label,
            includesIntroduction: j === 0 && chapterOpening(source, source.chapters[i]).length > 0,
            readings,
            completedPoints: count,
            done: count === readings.length,
          };
        });
        return {
          offlineLessons: Object.fromEntries(
            Object.entries(offlineLessons ?? {}).map(([key, l]) => [
              key,
              { read: l.read, finished: l.finished },
            ]),
          ),
          ...ch,
          practice: practiceSummary({ ...ch, chat, reviews }),
          sections,
          needsPlan: needsPlan({ ...ch, chat }),
          phase: chat.phase,
          lessonsDone: sections.filter((s) => s.done).length,
        };
      }),
    };
  }
  registerTeaching(ctx, {
    state,
    book,
    save,
    busy,
    ids: () => fs.readdirSync(root).filter((id) => isId(id) && fs.existsSync(path(id, 'course.json'))),
  });
  ctx.handle('list', () =>
    fs
      .readdirSync(root)
      .filter((id) => isId(id) && fs.existsSync(path(id, 'course.json')))
      .map((id) => {
        const c = state(id);
        return {
          id,
          title: c.title,
          count: c.chapters.length,
          lastChapter: c.lastChapter,
          progress: c.chapters.map((ch) => {
            let completed = 0,
              total = 0;
            ch.sections.forEach((s, j) => {
              const readings = points(s, j);
              total += readings.length;
              completed += completedPoints(ch, j, readings);
            });
            return {
              title: ch.title,
              completed,
              total,
              done: ch.chat.phase === 'complete',
              started: Boolean(
                completed ||
                ch.chat.messages.length ||
                ch.chat.selectedPoint ||
                Object.values(ch.teaching ?? {}).some((entry) => entry.sessionId) ||
                Object.values(ch.offlineLessons ?? {}).some((lesson) => lesson.read),
              ),
            };
          }),
          practiceOffer: practiceOffer(c.chapters),
          prepared: c.chapters.filter((c) => c.objectives).length,
        };
      }),
  );
  ctx.handle('upload', ({ id, offset, data }) => {
    const dir = folder(id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path(id, 'book.pdf'),
      tmp = path(id, 'upload.part');
    if (fs.existsSync(file)) return fs.statSync(file).size;
    const size = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
    if (offset !== size) return size;
    if (typeof data !== 'string' || data.length > 800000) throw Error('Book chunk is too large.');
    fs.appendFileSync(tmp, Buffer.from(data, 'base64'), { mode: 0o600 });
    return fs.statSync(tmp).size;
  });
  ctx.handle('import', ({ id, source }) => {
    if ([...busy].some((key) => key.startsWith(id + '/')))
      throw Error('A chapter is still processing. Retry the import when it finishes.');
    const file = path(id, 'book.pdf'),
      tmp = path(id, 'upload.part');
    if (!fs.existsSync(file)) {
      if (createHash('sha256').update(fs.readFileSync(tmp)).digest('hex') !== id) {
        fs.rmSync(tmp);
        throw Error('File upload is incomplete. Choose the PDF again.');
      }
      fs.renameSync(tmp, file);
    }
    if (!source?.pages?.length || !source.chapters?.length) throw Error('No readable book outline.');
    const existing = fs.existsSync(path(id, 'course.json')) ? state(id) : null;
    const sameOutline =
      existing &&
      existing.chapters.length === source.chapters.length &&
      existing.chapters.every((ch, i) => {
        const updated = source.chapters[i];
        return (
          ch.title === updated.title &&
          ch.sections.length === updated.sections.length &&
          ch.sections.every(
            (s, j) =>
              s.title === updated.sections[j].title &&
              s.number === updated.sections[j].number &&
              ((!ch.teaching && !ch.offlineLessons) ||
                JSON.stringify((s.subsections ?? []).map((p) => p.title)) ===
                  JSON.stringify((updated.sections[j].subsections ?? []).map((p) => p.title))),
          )
        );
      });
    if (existing && !sameOutline)
      throw Error(
        'The new outline differs from the saved chapters or sections. The existing course and its progress are intact.',
      );
    const sourceFile =
      'source-' + createHash('sha256').update(JSON.stringify(source)).digest('hex') + '.json';
    if (existing?.sourceFile === sourceFile && existing.chapters.every((ch) => 'mathPage' in ch))
      return publicCourse(existing, source);
    const previousBook = existing?.chapters.some((ch) => ch.chat.exam) ? book(id) : null;
    const c = {
      id,
      title: source.title,
      lastChapter: existing?.lastChapter,
      warnings: source.warnings,
      sourceFile,
      chapters: source.chapters.map((ch, i) => {
        const saved = existing?.chapters[i] ?? { chat: initialChat() };
        if (previousBook) refreshExamSources(saved.chat, previousBook.chapters[i].exercises, ch.exercises);
        if (existing) saved.chat.rev++;
        const chapterPages = source.pages.slice(ch.start - 1, ch.end);
        const math =
          chapterPages.find((p) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(p.text)) ??
          chapterPages.find((p) => /[=∑∫≤≥√]/u.test(p.text));
        return {
          ...saved,
          title: ch.title,
          start: ch.start,
          end: ch.end,
          mathPage: math?.number ?? null,
          sections: ch.sections.map((s) => ({
            title: s.title,
            number: s.number,
            start: s.start,
            end: s.end,
            firstLabel: source.pages[s.start - 1].label,
            lastLabel: source.pages[s.end - 1].label,
            stop: s.stop,
            uncertain: s.uncertain,
            subsections: s.subsections,
          })),
          exercisePages: ch.exercises.map((e) => ({
            id: e.id,
            page: e.page,
            endPage: e.endPage,
            answerPage: e.answerPage,
            answerEndPage: e.answerEndPage,
            hintPage: e.hintPage,
            blocked: e.blocked,
          })),
        };
      }),
    };
    // The course's pointer changes only once its complete new index is on disk.
    atomic(path(id, sourceFile), source);
    save(id, c);
    if (existing && existing.sourceFile !== sourceFile)
      fs.rmSync(path(id, existing.sourceFile ?? 'source.json'), { force: true });
    return publicCourse(c, source);
  });
  ctx.handle('course', ({ id }) => publicCourse(state(id)));
  ctx.handle('pdf', ({ id, offset = 0 }) => {
    if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid PDF offset.');
    const fd = fs.openSync(path(id, 'book.pdf'), 'r');
    try {
      const chunk = Buffer.alloc(384 * 1024);
      const n = fs.readSync(fd, chunk, 0, chunk.length, offset);
      return { data: chunk.subarray(0, n).toString('base64'), total: fs.fstatSync(fd).size };
    } finally {
      fs.closeSync(fd);
    }
  });
  ctx.handle('chat', ({ id, chapter, remember }) => {
    const c = state(id);
    const ch = at(c.chapters, chapter);
    if (remember && c.lastChapter !== chapter) {
      c.lastChapter = chapter;
      save(id, c);
    }
    return publicChat(ch.chat, ch.exercisePages);
  });

  function priorAnswers() {
    const out = [];
    for (const id of fs.readdirSync(root).filter(isId)) {
      if (!fs.existsSync(path(id, 'course.json'))) continue;
      const c = state(id);
      for (const [i, ch] of c.chapters.entries()) {
        for (const [k, d] of (ch.diagnosticHistory ?? []).entries()) {
          if (d.answer)
            out.push({
              id: id + '/' + i + '/diagnostic/' + k,
              source: c.title + ' · ' + ch.title,
              prompt: d.question,
              answer: d.answer,
              negative: !d.demonstrated.length,
            });
        }
        for (const [k, r] of ch.chat.results.entries()) {
          if (r.answer)
            out.push({
              id: id + '/' + i + '/' + k,
              source: c.title + ' · ' + ch.title,
              prompt: r.question,
              answer: r.answer,
              assisted: r.assisted,
            });
        }
      }
    }
    return out;
  }
  // Each mutation reloads the current chapter on commit so another chapter can save during inference.
  async function edit(a, fn) {
    const { id, chapter } = a,
      key = id + '/' + chapter;
    if (busy.has(key)) throw Error('This chapter is already processing a request.');
    busy.add(key);
    try {
      const c = state(id),
        ch = at(c.chapters, chapter);
      if (a.rev !== undefined && ch.chat.rev !== a.rev)
        throw Error('The chapter changed in another window. Reopen it to continue.');
      const store = () => {
        const fresh = state(id);
        fresh.chapters[chapter] = ch;
        save(id, fresh);
      };
      restoreExamThreads(ch.chat, ch.exercisePages);
      const previousPhase = ch.chat.phase;
      await fn(ch, store);
      if (previousPhase !== 'complete' && ch.chat.phase === 'complete') ch.chat.examCompletedAt = Date.now();
      ch.chat.rev++;
      store();
      return publicChat(ch.chat, ch.exercisePages);
    } finally {
      busy.delete(key);
    }
  }
  registerReview(ctx, { edit, book, imageList });
  registerOfflineLessons(ctx, { edit, book, state, imageList });
  ctx.handle('prepare', (a) =>
    edit(a, async (ch) => {
      if (!needsPlan(ch)) return;
      const b = book(a.id),
        source = b.chapters[a.chapter];
      const candidates = evidenceFor(ctx.learning, source, priorAnswers());
      const input = { ...planningSource(b, source), priorAnswers: candidates };
      let failure;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await ask(ctx, planPrompt, { ...input, correction: failure }, imageList(a));
        try {
          ch.objectives = validatePlan(result, source, candidates);
          break;
        } catch (e) {
          failure = e.message;
          if (attempt === 1) throw e;
        }
      }
      ch.planVersion = 1;
      ch.recommendation = recommendation(ch.objectives);
    }),
  );
  ctx.handle('override', (a) =>
    edit(a, async (ch) => {
      if (!['Cover', 'Skip', null].includes(a.choice)) throw Error('Invalid plan choice.');
      ch.override = a.choice;
    }),
  );

  function checkedIds(list, objectives) {
    return Array.isArray(list) ? objectives.filter((o) => list.includes(o.id)).map((o) => o.id) : [];
  }
  function ref(ch) {
    if (!ch.objectives?.length) throw Error('Prepare the chapter plan first.');
  }
  ctx.handle('diagnostic', (a) =>
    edit(a, async (ch, checkpoint) => {
      ref(ch);
      const targets = ch.objectives.filter((o) => !o.evidence.length);
      if (!targets.length) throw Error('All objectives already have evidence.');
      if (a.answer === undefined && !a.retry) {
        if (ch.diagnostic && !ch.diagnostic.feedback) return;
        const assessed = targets.filter((o) => o.section === targets[0].section);
        const reply = await ask(ctx, diagnosticPrompt, { objectives: assessed, question: null });
        ch.diagnostic = { question: validReply(reply), ids: assessed.map((o) => o.id) };
        return;
      }
      const d = ch.diagnostic;
      if (!d || d.feedback) throw Error('Open a new placement question first.');
      if (a.retry) {
        if (!d.pendingAnswer) throw Error('No saved diagnostic answer.');
      } else {
        if (d.pendingAnswer) throw Error('Retry the saved diagnostic answer to continue.');
        if (typeof a.answer !== 'string' || !a.answer.trim()) throw Error('Enter a diagnostic answer.');
        d.pendingAnswer = a.answer.trim();
        ch.chat.rev++;
        checkpoint();
      }
      const assessed = targets.filter((o) => d.ids.includes(o.id));
      const reply = await ask(ctx, diagnosticPrompt, {
        objectives: assessed.map(({ id, skill, page, quote }) => ({ id, skill, page, quote })),
        question: d.question,
        answer: d.pendingAnswer,
      });
      if (!Array.isArray(reply?.demonstrated))
        throw Error('Incomplete diagnostic assessment. Retry the saved answer.');
      d.feedback = validReply(reply);
      d.answer = d.pendingAnswer;
      delete d.pendingAnswer;
      const demonstrated = checkedIds(reply.demonstrated, assessed);
      (ch.diagnosticHistory ??= []).push({ ...d, demonstrated });
      for (const id of demonstrated)
        ch.objectives.find((o) => o.id === id).evidence = [
          { id: 'diagnostic/' + id, source: 'Course diagnostic', prompt: d.question, answer: d.answer },
        ];
      ch.recommendation = recommendation(ch.objectives);
    }),
  );

  ctx.handle('next', (a) =>
    edit(a, async (ch) => {
      const c = ch.chat;
      if (c.phase !== 'discussion' || c.pending || !c.ready)
        throw Error('Finish the current discussion before advancing.');
      (c.lessonRanges ??= {})[c.section] = { start: c.sectionTurnStart ?? 0, end: c.messages.length };
      if (c.section + 1 < ch.sections.length) {
        c.section++;
        c.phase = 'reading';
        c.sectionTurnStart = c.messages.length;
      } else {
        c.examTurnStart = c.messages.length;
        c.phase = 'exam-ready';
      }
      c.ready = false;
      advanceLessons(ch);
    }),
  );
  ctx.handle('turn', (a) =>
    edit(a, async (ch, checkpoint) => {
      ref(ch);
      const c = ch.chat,
        b = book(a.id),
        source = b.chapters[a.chapter],
        images = imageList(a);
      const thread = c.phase === 'exam' ? c.exam.queue[c.exam.index] : null;
      if (a.questionId !== undefined && thread?.id !== a.questionId)
        throw Error('Reopen this exam question to continue.');
      const conversation = thread ?? c;
      if (!conversation.pending) {
        if (c.phase === 'reading' && a.action !== 'read')
          throw Error('Confirm the assigned reading before starting.');
        if (
          (c.phase === 'discussion' && a.action !== 'answer') ||
          (c.phase === 'exam' && a.action !== 'answer')
        )
          throw Error('Enter an answer for this question.');
        if (!['reading', 'discussion', 'exam'].includes(c.phase)) throw Error('No active question.');
        if (a.action === 'answer' && (typeof a.text !== 'string' || !a.text.trim()))
          throw Error('Enter an answer.');
        if (a.action === 'answer') conversation.messages.push(msg('learner', a.text.trim()));
        conversation.pending = { action: a.action, text: a.text?.trim(), submittedAt: Date.now() };
        c.rev++;
        checkpoint();
      } else if (a.action !== 'retry') throw Error('Retry the saved answer to continue.');
      if (c.phase === 'exam') {
        const item = thread.item;
        const helpRequested =
          /^(?:i (?:don['’]t|do not) know|help(?: me)?)[.!?]?(?: please help me work through this[.!?]?)?$/i.test(
            conversation.pending.text,
          );
        const r = await ask(
          ctx,
          gradePrompt,
          {
            item,
            helpRequested,
            history: thread.messages,
            reading: sourceForItem(
              source,
              item,
              ch.objectives.filter((o) => item.objectives.includes(o.id)),
            ),
          },
          images,
        );
        if (helpRequested && r.solved === true) {
          r.solved = false;
          r.assisted = true;
          r.reply =
            'Let’s start with the goal. In your own words, what does this question ask you to find or prove?';
        }
        const reply = validReply(r);
        if (typeof r.solved !== 'boolean' || typeof r.assisted !== 'boolean')
          throw Error('Incomplete exam assessment. Retry the saved answer.');
        const assisted = !!item.assisted || r.assisted || !r.solved;
        conversation.messages.push(msg('tutor', reply));
        item.assisted = assisted;
        if (r.solved) {
          thread.done = true;
          c.results.push({
            solvedAt: conversation.pending.submittedAt ?? Date.now(),
            question: item.question,
            answer: conversation.pending.text,
            objectives: item.objectives,
            fullyTested: item.fullyTested ?? [],
            testedSkill: item.testedSkill ?? item.question,
            assisted,
            transfer: !!item.transfer,
            origin: item.origin,
            number: item.number,
            page: item.page,
            endPage: item.endPage,
            hintOrigin: item.hintOrigin,
            answerOrigin: item.answerOrigin,
            solution: item.solution ?? item.rubric,
          });
          if (assisted && !item.transfer)
            c.exam.queue.splice(c.exam.index + 1, 0, {
              id: thread.id + '-follow-up',
              label: 'Follow-up to ' + (thread.label ?? 'question'),
              transfer: true,
              objectives: item.objectives,
              previous: item.question,
              previousRubric: item.rubric,
              testedSkill: item.testedSkill ?? item.question,
              fullyTested: item.fullyTested ?? [],
            });
          advanceExam(c, c.exam.index + 1);
        }
      } else {
        const objectives = ch.objectives.filter((o) => o.section === c.section);
        const r = await ask(
          ctx,
          discussionPrompt,
          {
            ...sectionContext(b, source, c.section),
            chapter: source.title,
            objectives,
            alreadyDemonstrated: c.covered,
            history: c.messages.slice(c.sectionTurnStart ?? 0),
            action: conversation.pending.action,
          },
          images,
        );
        if (conversation.pending.action === 'answer' && !Array.isArray(r?.demonstrated))
          throw Error('Incomplete discussion assessment. Retry the saved answer.');
        conversation.messages.push(msg('tutor', validReply(r)));
        if (conversation.pending.action === 'answer')
          c.covered = [...new Set([...c.covered, ...checkedIds(r.demonstrated, objectives)])];
        c.ready = objectives.every((o) => c.covered.includes(o.id));
        c.phase = 'discussion';
      }
      delete conversation.pending;
      if (ch.offlineLessons) advanceLessons(ch);
    }),
  );

  function sourceForItem(source, item, objectives) {
    const linked = source.sections.filter((s) => s.start <= item.page && s.end >= item.page);
    const sections = linked.length ? linked : [...new Set(objectives.map((o) => source.sections[o.section]))];
    return sections
      .map((s) => s.text)
      .join('\n')
      .slice(0, 30000);
  }
  ctx.handle('exam', (a) =>
    edit(a, async (ch) => {
      ref(ch);
      const c = ch.chat;
      if (!['exam-ready', 'exam-next', 'exam'].includes(c.phase))
        throw Error('Finish the chapter readings first.');
      const b = book(a.id),
        source = b.chapters[a.chapter];
      if (!c.exam) {
        const exercises = bookQuestions(source.exercises);
        c.exam = {
          index: 0,
          queue: exercises.length
            ? exercises
            : ch.sections.map((_, i) => ({
                id: 'section-' + i,
                label: 'Question ' + (i + 1),
                objectives: ch.objectives.filter((o) => o.section === i).map((o) => o.id),
              })),
          ungraded: source.exercises.filter((e) => e.blocked).map((e) => e.id + ' · ' + e.blocked),
        };
      }
      const exam = c.exam;
      if (a.questionId !== undefined) {
        const selected = exam.queue.findIndex((q) => q.id === a.questionId);
        if (selected < 0 || exam.queue[selected].done) throw Error('Choose an available exam question.');
        exam.index = selected;
      }
      if (exam.index < exam.queue.length) {
        const entry = exam.queue[exam.index];
        if (entry.item) {
          c.phase = 'exam';
          return;
        }
        const exercise = sourceExercise(exam, entry, source.exercises);
        const objectives = entry.objectives
          ? ch.objectives.filter((o) => entry.objectives.includes(o.id))
          : ch.objectives;
        const pages = exercise
          ? [
              ...new Set(
                [exercise.page, exercise.endPage, exercise.answerPage, exercise.answerEndPage].filter(
                  Boolean,
                ),
              ),
            ]
          : [];
        const images = imageList(a);
        const r = await ask(
          ctx,
          prepareExamPrompt,
          {
            chapter: source.title,
            objectives: entry.transfer
              ? objectives.map((o) => ({ id: o.id, skill: entry.testedSkill ?? entry.previous }))
              : objectives.map(({ id, skill, page, quote }) => ({ id, skill, page, quote })),
            exercise,
            entry,
            sources: pages.map((n) => b.pages[n - 1]),
            reading: entry.transfer
              ? entry.previousRubric
              : exercise
                ? sourceForItem(source, exercise, objectives)
                : [...new Set(objectives.map((o) => source.sections[o.section].text))].join('\n'),
          },
          images,
        );
        const item = verifiedItem(r, exercise, objectives, images.length > 0);
        if (!item) {
          exam.ungraded.push(
            (entry.number ? 'Exercise ' + entry.number : 'Tutor question') +
              ' · solution could not be verified',
          );
          exam.queue.splice(exam.index, 1);
          // Give a fresh question when a source exercise cannot be graded.
          if (exercise)
            exam.queue.push({
              id: entry.id + '-replacement',
              label: 'Replacement for Exercise ' + entry.number,
              objectives: objectives.map((o) => o.id),
            });
          advanceExam(c, exam.index);
          return;
        }
        if (entry.transfer && normalise(item.question) === normalise(entry.previous))
          throw Error('The transfer question repeated the assisted problem. Retry for a new example.');
        item.transfer = !!entry.transfer;
        if (entry.transfer)
          item.fullyTested = item.fullyTested.filter((id) => entry.fullyTested?.includes(id));
        entry.item = item;
        entry.messages = [msg('tutor', item.question)];
        c.phase = 'exam';
        return;
      }
      c.phase = 'complete';
    }),
  );
}
