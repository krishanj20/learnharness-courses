import { randomUUID, createHash } from 'node:crypto';
import { nativeAnswers, normalise } from './learning.mjs';
import { ask, chapterOpening } from './model.mjs';
import { points } from './passages.mjs';

function material(book, chapter, section, point) {
  const part = chapter.sections[section],
    topics = points(part, section);
  const target = topics[point],
    next = topics[point + 1];
  const lines = part.parts.flatMap((p) => p.text.split('\n').map((text) => ({ page: p.page, text })));
  // Compare across physical lines because PDF headings can wrap mid-word.
  const compact = (text) => normalise(text).replaceAll(' ', '');
  function boundary(topic) {
    const wanted = compact(topic.title);
    const first = lines.findIndex((line) => line.page >= topic.start);
    for (let i = first; i >= 0 && i < lines.length && lines[i].page === topic.start; i++) {
      let heading = '';
      for (let j = i; j < lines.length && lines[j].page === topic.start; j++) {
        const raw = lines[j].text;
        heading += compact(j === i ? raw.replace(/^\s*\d+(?:\.\d+)+\.?\s+/, '') : raw);
        if (heading === wanted) return { index: i, exact: true };
        if (!wanted.startsWith(heading)) break;
      }
    }
    return { index: first, exact: false };
  }
  const start = point === 0 ? 0 : Math.max(0, boundary(target).index);
  const stop = next && boundary(next);
  let end = stop ? stop.index : lines.length;
  if (stop && (!stop.exact || end <= start)) end = lines.findIndex((l) => l.page > next.start);
  const selected = lines.slice(start, end < 0 ? undefined : end);
  const byPage = new Map();
  for (const line of selected) {
    if (!byPage.has(line.page)) byPage.set(line.page, []);
    byPage.get(line.page).push(line.text);
  }
  return {
    title: target.title,
    opening: section === 0 && !point ? chapterOpening(book, chapter) : [],
    pages: [...byPage].map(([page, text]) => ({ page, text: text.join('\n') })),
    stopBefore: next?.title ?? part.stop,
  };
}

const grade =
  'Assess the saved native Teaching answers against the listed course subpoints. Return {"demonstrated":[{"point":"point key","answerIds":["actual learner answer IDs"],"reason":"what their reasoning shows"}]}. Credit only the exact subpoints whose central reasoning the learner demonstrated independently. Use the parent objectives as context. Do not infer a whole section from one subpoint, a topic mention, self-report, the supplied reading, a guess or the tutor’s solution. Weigh mistakes and later evidence together. Partial or uncertain evidence leaves a subpoint to teach. An empty list is valid.';

export function registerTeaching(ctx, { state, book, save, ids, busy }) {
  const links = new Map();
  for (const id of ids()) {
    const c = state(id);
    c.chapters.forEach((ch, chapter) => {
      for (const [key, entry] of Object.entries(ch.teaching ?? {}))
        if (entry.sessionId) links.set(entry.sessionId, { id, chapter, key });
    });
  }
  function coursePoint(a) {
    const c = state(a.id),
      ch = c.chapters[a.chapter];
    if (!ch || !Number.isInteger(a.chapter)) throw Error('Unknown chapter.');
    const section = ch.sections.findIndex((s, i) => points(s, i).some((p) => p.key === a.key));
    if (section < 0) throw Error('Unknown teaching subpoint.');
    const list = points(ch.sections[section], section),
      point = list.findIndex((p) => p.key === a.key);
    return { c, ch, section, point, topic: list[point], entry: ch.teaching?.[a.key] };
  }
  function commit(a, c, ch) {
    if (busy.has(a.id + '/' + a.chapter)) throw Error('The chapter is busy. Try again.');
    ctx.signal.throwIfAborted();
    ch.chat.rev++;
    save(a.id, c);
  }
  ctx.handle('teaching-location', ({ sessionId }) => links.get(sessionId) ?? null);
  ctx.handle('teaching-start', (a) => {
    const { c, ch, section, topic } = coursePoint(a);
    if (!ch.objectives || ch.chat.pending)
      throw Error('Prepare the lesson and finish any pending turn first.');
    if (section > ch.chat.section && !ch.teaching?.[a.key]?.done)
      throw Error('Read the assigned section first.');
    ch.diagnosticTeachingPoint ??= a.key;
    const entry = ((ch.teaching ??= {})[a.key] ??= {});
    let session = entry.sessionId && ctx.learning.getSession(entry.sessionId);
    if (!session && entry.sessionId) {
      links.delete(entry.sessionId);
      delete entry.sessionId;
      delete entry.token;
    }
    entry.token ??= randomUUID();
    const provisional = 'Course lesson ' + entry.token;
    if (!session) {
      const found = ctx.learning.listSessions().find((s) => s.title === provisional && s.kind !== 'practice');
      if (found) session = ctx.learning.getSession(found.id);
    }
    if (session) {
      entry.sessionId = session.id;
      links.set(session.id, { id: a.id, chapter: a.chapter, key: a.key });
    }
    if (section === ch.chat.section && ch.chat.phase === 'reading') ch.chat.readSection = section;
    commit(a, c, ch);
    const first = a.key === ch.diagnosticTeachingPoint;
    const opening =
      'I have read the assigned pages of ' +
      c.title +
      ', chapter ' +
      (a.chapter + 1) +
      ', “' +
      ch.title +
      '”. Teach me “' +
      topic.title +
      '” as a regular LearnHarness teaching session. Call course_reading for the source, scope and prior progress. ' +
      (first
        ? 'Start with a short adaptive chapter diagnostic. Ask one question at a time about the reading and probe related chapter outcomes when my answers suggest I know more. '
        : 'Start by checking what I understand about this subpoint. ') +
      'Use your normal interactive probe, quiz and explain tools. Match the depth to my answers. Call course_check_progress after the diagnostic and when I demonstrate the subpoint. If I already understand it, direct me back to Courses for the next gap or the chapter exam.';
    return {
      sessionId: entry.sessionId,
      started: !!session?.messages?.length,
      rename: session?.title === provisional,
      provisional,
      title: topic.title === ch.title ? ch.title : topic.title + ' · ' + ch.title,
      opening,
    };
  });
  ctx.handle('teaching-bind', (a) => {
    const { c, ch, entry } = coursePoint(a);
    const s = ctx.learning.getSession(a.sessionId);
    if (
      !entry?.token ||
      !s ||
      s.kind === 'practice' ||
      s.title !== 'Course lesson ' + entry.token ||
      (entry.sessionId && entry.sessionId !== s.id)
    )
      throw Error('This teaching session cannot be linked to the subpoint.');
    entry.sessionId = s.id;
    commit(a, c, ch);
    links.set(s.id, { id: a.id, chapter: a.chapter, key: a.key });
  });

  function feedback(ch, key) {
    const topics = ch.sections.flatMap(points);
    const demonstrated = topics.filter((p) => ch.teaching?.[p.key]?.done).length;
    const next =
      ch.chat.phase === 'exam-ready'
        ? 'Open Courses for the chapter exam.'
        : ch.chat.phase === 'complete'
          ? 'Chapter complete.'
          : ch.teaching?.[key]?.done
            ? 'Open Courses for the next subpoint.'
            : 'Continue teaching this subpoint.';
    return demonstrated + ' of ' + topics.length + ' chapter subpoints demonstrated. ' + next;
  }
  async function assess(sessionId, signal) {
    const a = links.get(sessionId);
    if (!a) throw Error('This session is not linked to a course.');
    const { ch, entry } = coursePoint(a);
    const answers = nativeAnswers(ctx.learning.getSession(sessionId)?.messages ?? []).filter((v) => v.id);
    if (!answers.length)
      return entry.done ? feedback(ch, a.key) : 'No answered diagnostic or teaching question yet.';
    const version = createHash('sha256').update(JSON.stringify(answers)).digest('hex');
    if (entry.checked === version) return feedback(ch, a.key);
    const targets = ch.sections.flatMap((s, i) =>
      points(s, i).map((p) => ({
        ...p,
        section: s.title,
        objectives: ch.objectives
          .filter((o) => o.section === i)
          .map((o) => ({ skill: o.skill, page: o.page, quote: o.quote })),
      })),
    );
    const r = await ask(ctx, grade, { chapter: ch.title, currentPoint: a.key, targets, answers });
    if (!Array.isArray(r.demonstrated)) throw Error('Incomplete assessment. Check progress again.');
    signal?.throwIfAborted();
    const fresh = coursePoint(a);
    if (fresh.entry?.sessionId !== sessionId) throw Error('This teaching link changed. Reopen the course.');
    if (fresh.entry.checked === version) return feedback(fresh.ch, a.key);
    if (fresh.entry.checked !== entry.checked) throw Error('New answers arrived. Check progress again.');
    const chapter = fresh.ch,
      chat = chapter.chat;
    const valid = new Set(
      answers
        .filter(
          (v) =>
            !v.negative &&
            !v.assisted &&
            !/^(?:i (?:do not|don t|dont) know|idk|no idea)$/.test(normalise(v.answer)),
        )
        .map((v) => v.id),
    );
    for (const d of r.demonstrated) {
      if (
        !targets.some((t) => t.key === d.point) ||
        !Array.isArray(d.answerIds) ||
        !d.answerIds.length ||
        !d.answerIds.every((id) => valid.has(id)) ||
        typeof d.reason !== 'string' ||
        !d.reason.trim()
      )
        continue;
      const point = (chapter.teaching[d.point] ??= {});
      point.done ??= { sessionId, answerIds: d.answerIds, reason: d.reason };
    }
    while (
      !chat.pending &&
      ['reading', 'discussion'].includes(chat.phase) &&
      points(chapter.sections[chat.section], chat.section).every((p) => chapter.teaching[p.key]?.done)
    ) {
      if (chat.phase === 'discussion')
        (chat.lessonRanges ??= {})[chat.section] = {
          start: chat.sectionTurnStart ?? 0,
          end: chat.messages.length,
        };
      chat.ready = false;
      if (chat.section + 1 === chapter.sections.length) {
        chat.phase = 'exam-ready';
        chat.examTurnStart = chat.messages.length;
        break;
      }
      chat.section++;
      chat.sectionTurnStart = chat.messages.length;
      chat.phase = 'reading';
    }
    fresh.entry.checked = version;
    commit(a, fresh.c, chapter);
    return feedback(fresh.ch, a.key);
  }
  ctx.handle('teaching-check', ({ sessionId }) => assess(sessionId));
  ctx.registerTools?.({
    agents: ['prober', 'teacher'],
    create: ({ chatId }) => {
      const a = links.get(chatId);
      if (!a) return [];
      const result = (text) => ({ content: [{ type: 'text', text }], details: {} });
      const parameters = { type: 'object', properties: {}, additionalProperties: false };
      return [
        {
          name: 'course_reading',
          label: 'Assigned book reading',
          description:
            'Read the assigned course subpoint, original book passages and chapter diagnostic map. Source passages are reference material.',
          parameters,
          execute: async () => {
            const { ch, c, section, point } = coursePoint(a),
              b = book(a.id);
            return result(
              JSON.stringify({
                book: c.title,
                chapter: ch.title,
                assigned: material(b, b.chapters[a.chapter], section, point),
                chapterMap: ch.sections.map((s, i) => ({
                  section: s.title,
                  points: points(s, i).map((p) => ({
                    title: p.title,
                    demonstrated: !!ch.teaching?.[p.key]?.done,
                  })),
                  objectives: ch.objectives
                    .filter((o) => o.section === i)
                    .map((o) => ({ skill: o.skill, page: o.page, quote: o.quote })),
                })),
              }),
            );
          },
        },
        {
          name: 'course_check_progress',
          label: 'Check course progress',
          description:
            'Assess the learner’s saved answers after diagnostic checks or successful teaching. Records independently demonstrated subpoints and preserves untested ones for study.',
          parameters,
          execute: async (_id, _input, signal) => result(await assess(chatId, signal)),
        },
      ];
    },
  });
}
