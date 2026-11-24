import { publicExam, restoreExamThreads } from './exam-threads.mjs';
import { anchorPassages } from './passages.mjs';

const asText = (content) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter((x) => x.type === 'text')
          .map((x) => x.text)
          .join('\n')
      : '';
const common = new Set(
  'the and for but not how why can could may has had was were are did does its our you any all one two each will would some use used using also after then other given such this that with chapter have what when should which from your their there into explain through these than learner before about introduction appendix section exercise examples example takeaways basics properties questions part'.split(
    ' ',
  ),
);
function terms(text) {
  return new Set((text.toLowerCase().match(/[\p{L}]{3,}/gu) ?? []).filter((w) => !common.has(w)));
}
function score(text, keywords) {
  return [...terms(text)].filter((w) => keywords.has(w)).length;
}
const questionTools = new Set(['quiz', 'explain', 'probe', 'recall', 'ask_user_question']);

export function nativeAnswers(messages) {
  const answers = [];
  const completed = new Set(
    messages.filter((m) => m.role === 'toolResult' && !m.isError).map((m) => m.toolCallId),
  );
  const problems = new Map();
  const needsFreshProblem = new Set();
  let question = '',
    tutorContext = [],
    current;

  // Stock Teaching persists side-chat updates after a submitted probe. Their
  // timestamps tell us which help the learner could already see at submission.
  const sideHints = [];
  for (const [index, m] of messages.entries()) {
    if (m.role !== 'custom' || m.customType !== 'side-question') continue;
    const updates = m.details?.updates ?? m.details?.snapshot;
    if (!Array.isArray(updates)) continue;
    for (const update of updates) {
      if (update?.role === 'assistant' && update.text?.trim())
        sideHints.push({ index, at: Date.parse(update.at), text: update.text });
    }
  }
  function record(answer, index, at) {
    for (const hint of sideHints) {
      if (hint.used) continue;
      const seen = Number.isFinite(at) && Number.isFinite(hint.at) ? hint.at <= at : hint.index < index;
      if (seen) {
        tutorContext.push(hint.text);
        hint.used = true;
      }
    }
    const guidance = tutorContext.join('\n');
    if (guidance) {
      answer.tutorContext = guidance;
      // A verbatim replay of a supplied explanation cannot show independent reasoning.
      // Keep mathematical operators intact when comparing calculations.
      const words = (s) =>
        s
          .normalize('NFKC')
          .toLowerCase()
          .trim()
          .replace(/[.!?]+$/, '')
          .replace(/\s+/g, ' ');
      const reasoning = words(answer.reasoning ?? '');
      if (reasoning.includes(' ') && words(guidance).includes(reasoning)) answer.assisted = true;
    }
    const questionKey = passageText(answer.prompt).toLowerCase();
    if (needsFreshProblem.has(questionKey)) answer.assisted = true;
    if (answer.negative || answer.assisted || answer.selectionOnly) needsFreshProblem.add(questionKey);
    answers.push(answer);
    tutorContext = [];
    question = '';
  }
  for (const [index, m] of messages.entries()) {
    if (m.role === 'assistant') {
      const prose = [];
      if (typeof m.content === 'string') prose.push(m.content);
      for (const call of Array.isArray(m.content) ? m.content : []) {
        if (call.type === 'text' && call.text?.trim()) prose.push(call.text);
        if (call.type !== 'toolCall' || !completed.has(call.id)) continue;
        if (call.name === 'send_to_user' && typeof call.arguments?.message === 'string')
          prose.push(call.arguments.message);
        // Only the question's public details preceded the answer. Its hidden key
        // and explanation must not qualify as help on the question itself.
        if (questionTools.has(call.name) && typeof call.arguments?.details === 'string')
          prose.push(call.arguments.details);
        if (call.name === 'problem') {
          current = { prompt: call.arguments?.statement, attempts: [] };
          problems.set(call.id, current);
        }
        if (call.name === 'conclude' && current) {
          current.outcome = call.arguments?.outcome;
          current.hinted = call.arguments?.rung != null;
          current = undefined;
        }
      }
      if (prose.length) {
        question = prose.join('\n');
        tutorContext.push(question);
      }
      continue;
    }
    const d = m.details ?? {};
    if (m.role === 'custom' && m.customType === 'practice-thinking') {
      const problem = problems.get(d.problemCallId);
      if (problem && typeof d.text === 'string' && d.text.trim())
        problem.attempts.push({ id: m.id, answer: d.text });
      continue;
    }
    if (
      m.role === 'toolResult' &&
      !m.isError &&
      questionTools.has(m.toolName) &&
      d.questionText &&
      !d.dismissed
    ) {
      const selected = (d.answers ?? [])
        .map((a) => (typeof a === 'string' ? a : (a?.label ?? a?.value)))
        .filter((label) => typeof label === 'string' && label.trim());
      const reasoning = [d.text, d.other, d.thinking ?? d.note]
        .filter((x) => typeof x === 'string' && x.trim())
        .join('\n')
        .trim();
      const answer = d.dontKnow ? "I don't know" : [...selected, reasoning].filter(Boolean).join('\n');
      if (answer.trim())
        record(
          {
            id: m.id,
            prompt: d.questionText,
            answer,
            reasoning,
            selected,
            selectionOnly:
              !!selected.length &&
              (!reasoning ||
                selected.some((s) => passageText(s).toLowerCase() === passageText(reasoning).toLowerCase())),
            confidence: d.confidence,
            negative: d.correct === false || d.dontKnow === true,
          },
          index,
          d.answeredAt ? Date.parse(d.answeredAt) : m.timestamp,
        );
      // The host reveals feedback after submission. It can inform a later answer.
      const reveal = d.explanation ?? d.committed;
      if (typeof reveal === 'string' && d.questionType !== 'predict') tutorContext.push(reveal);
    } else if (m.role === 'user' && question && asText(m.content).trim()) {
      const answer = asText(m.content);
      record({ id: m.id, prompt: question, reasoning: answer, answer }, index, m.timestamp);
    }
  }
  for (const problem of problems.values()) {
    if (!problem.prompt || !problem.attempts.length) continue;
    answers.push({
      id: problem.attempts.at(-1).id,
      prompt: problem.prompt,
      answer: problem.attempts.map((a) => a.answer).join('\n'),
      assisted: problem.hinted || problem.outcome === 'solvedWithHints',
      negative: problem.outcome !== 'solved' && problem.outcome !== 'solvedWithHints',
    });
  }
  return answers;
}

export function evidenceFor(learning, chapter, prior = []) {
  const keywords = terms(
    [
      chapter.title,
      ...chapter.sections.flatMap((s) => [s.title, ...(s.subsections ?? []).map((h) => h.title)]),
    ].join(' '),
  );
  const graph = learning.graph();
  const linked = new Set();
  for (const node of graph.propositions ?? graph.nodes ?? []) {
    if (score([node.name, node.statement, ...(node.aliases ?? [])].join(' '), keywords)) {
      for (const point of node.provenance ?? []) linked.add(point.chatId);
    }
  }
  const candidates = [];
  function include(record, fromGraph = false) {
    const rank = score(record.prompt + ' ' + record.answer, keywords);
    if (rank || fromGraph)
      candidates.push({
        ...record,
        prompt: record.prompt.slice(-2200),
        answer: record.answer.slice(0, 3000),
        rank,
      });
  }
  for (const record of prior) include(record);
  for (const session of learning.listSessions()) {
    for (const answer of nativeAnswers(learning.getSession(session.id)?.messages ?? [])) {
      include({ ...answer, id: session.id + '/' + answer.id, source: session.title }, linked.has(session.id));
    }
  }
  return candidates.sort((a, b) => b.rank - a.rank).slice(0, 32);
}

export function recommendation(objectives) {
  const gaps = objectives.filter((o) => !o.evidence?.length);
  return { choice: gaps.length ? 'Cover' : 'Skip', gaps: gaps.map((o) => o.id) };
}

export function sourceFor(section) {
  return section.parts.map((p) => '[PDF ' + p.page + '] ' + p.text).join('\n');
}

export function normalise(text) {
  return String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const passageText = (text) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();

export function validatePlan(result, chapter, candidates) {
  if (!Array.isArray(result.sections) || result.sections.length !== chapter.sections.length)
    throw Error('The plan omitted a book section. Retry planning.');
  return chapter.sections.flatMap((section, i) => {
    const output = result.sections.find((s) => s.section === i + 1);
    if (output?.objectives?.length > 2)
      throw Error(
        'Group the material in ' +
          section.title +
          ' into one or two main outcomes and move examples into supportingTopics.',
      );
    if (!output || !Array.isArray(output.objectives) || !output.objectives.length)
      throw Error('Missing objectives for ' + section.title + '. Retry planning.');
    const anchors = new Map(
      section.parts.flatMap((part) =>
        anchorPassages(part, i).map((anchor) => [anchor.id, { page: part.page, text: anchor.text }]),
      ),
    );
    return output.objectives.map((o, k) => {
      let page = o.page,
        quote = o.quote;
      if (o.anchor !== undefined) {
        const passage = anchors.get(o.anchor);
        if (!passage) throw Error('Unverified passage anchor for ' + section.title + '. Retry planning.');
        page = passage.page;
        quote = passage.text.slice(0, 240);
      }
      const part = section.parts.find((p) => p.page === page);
      if (
        !part ||
        typeof o.skill !== 'string' ||
        !o.skill.trim() ||
        typeof quote !== 'string' ||
        !passageText(quote) ||
        (o.anchor === undefined &&
          (normalise(quote).length < 4 || !passageText(part.text).includes(passageText(quote))))
      )
        throw Error('Unverified passage for ' + section.title + '. Retry planning.');
      const ids = new Set(Array.isArray(o.evidence) ? o.evidence : []);
      const matched = candidates.filter((c) => ids.has(c.id));
      const prompts = new Set(matched.map((c) => passageText(c.prompt).toLowerCase()));
      const contrary = candidates.filter(
        (c) => c.negative && prompts.has(passageText(c.prompt).toLowerCase()) && !ids.has(c.id),
      );
      const cited = [...matched, ...contrary].map(
        ({ id, source, prompt, answer, assisted, negative, selectionOnly }) => ({
          id,
          source,
          prompt,
          answer,
          assisted,
          negative,
          selectionOnly,
        }),
      );
      const independent =
        o.status === 'demonstrated' &&
        cited.some((c) => !c.selectionOnly) &&
        !cited.some((c) => c.negative || c.assisted);
      return {
        id: i + 1 + '.' + (k + 1),
        section: i,
        skill: o.skill.trim(),
        page,
        quote,
        supportingTopics: Array.isArray(o.supportingTopics)
          ? o.supportingTopics.filter((x) => typeof x === 'string' && x.trim())
          : [],
        prerequisites: Array.isArray(o.prerequisites)
          ? o.prerequisites.filter((p) => typeof p === 'string')
          : [],
        evidence: independent ? cited : [],
        uncertainEvidence: independent ? [] : cited,
      };
    });
  });
}

export function initialChat() {
  return { section: 0, phase: 'reading', messages: [], covered: [], results: [], rev: 0 };
}

export function publicChat(chat, exercises) {
  restoreExamThreads(chat, exercises);
  const { exam, ...visible } = chat;
  // The earliest release stored the start of the last lesson but no end.
  const lastStart = chat.sectionTurnStart ?? 0;
  if (
    !['reading', 'discussion'].includes(chat.phase) &&
    !chat.lessonRanges?.[chat.section] &&
    chat.messages.length > lastStart
  ) {
    visible.lessonRanges = {
      ...chat.lessonRanges,
      [chat.section]: { start: lastStart, end: chat.examTurnStart ?? chat.messages.length },
    };
  }
  const pending = chat.phase === 'exam' && exam?.queue[exam.index]?.pending;
  return { ...visible, ...(pending ? { pending } : {}), exam: publicExam(exam) };
}

export function verifiedItem(output, exercise, objectives, hasImages = false) {
  if (output?.verifiable === false) return null;
  const ids = objectives
    .filter((o) => Array.isArray(output?.objectives) && output.objectives.includes(o.id))
    .map((o) => o.id);
  const hasText = (s) => typeof s === 'string' && !!s.trim();
  if (output?.verifiable !== true || !ids.length || !hasText(output.rubric) || !hasText(output.check)) {
    throw Error('Incomplete exam verification. Retry preparing the question.');
  }
  const unreadable = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/;
  const mathematical =
    exercise && (unreadable.test(exercise.text) || /[=≤≥≠∑∫√^<>+×∈α-ωΑ-Ω]/u.test(exercise.text));
  const transcription =
    mathematical && hasImages && hasText(output.transcription) ? output.transcription.trim() : null;
  if (exercise && unreadable.test(exercise.text) && (!transcription || unreadable.test(transcription)))
    return null;
  const question = exercise ? (transcription ?? exercise.text) : output.question;
  if (!hasText(question)) throw Error('Missing exam question. Retry preparing the question.');
  if (exercise?.answer && unreadable.test(exercise.answer) && !hasImages) return null;
  const solution = exercise?.answer && !unreadable.test(exercise.answer) ? exercise.answer : output.rubric;
  const answerOrigin = exercise?.answer
    ? 'Book solution · PDF p. ' + exercise.answerPage
    : 'Tutor-derived solution';
  return {
    question,
    firstPart:
      exercise && hasText(output.firstPart) && output.firstPart.trim() !== question.trim()
        ? output.firstPart.trim()
        : undefined,
    rubric: output.rubric,
    solution,
    check: output.check,
    objectives: ids,
    fullyTested: ids.filter((id) => Array.isArray(output.fullyTested) && output.fullyTested.includes(id)),
    testedSkill: hasText(output.testedSkill) ? output.testedSkill : question,
    page: exercise?.page ?? objectives.find((o) => o.id === ids[0]).page,
    endPage: exercise?.endPage,
    number: exercise?.id,
    origin: exercise ? 'Book exercise' : 'Tutor-written',
    answerOrigin,
    hint: exercise?.hint,
    hintOrigin: exercise?.hint ? 'Book hint · PDF p. ' + (exercise.hintPage ?? exercise.page) : undefined,
  };
}
