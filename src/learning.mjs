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

function nativeAnswers(messages) {
  const answers = [];
  const completed = new Set(
    messages.filter((m) => m.role === 'toolResult' && !m.isError).map((m) => m.toolCallId),
  );
  const problems = new Map();
  let question = '',
    current;
  for (const m of messages) {
    if (m.role === 'assistant') {
      question = asText(m.content);
      for (const call of Array.isArray(m.content) ? m.content : []) {
        if (call.type !== 'toolCall' || !completed.has(call.id)) continue;
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
      const selected = (d.answers ?? []).map((a) => (typeof a === 'string' ? a : (a?.label ?? a?.value)));
      const answer = d.dontKnow
        ? "I don't know"
        : [d.text, d.other, ...selected, d.thinking ?? d.note]
            .filter((x) => typeof x === 'string')
            .join('\n');
      if (answer.trim())
        answers.push({
          id: m.id,
          prompt: d.questionText,
          answer,
          negative: d.correct === false || d.dontKnow === true,
        });
    } else if (m.role === 'user' && question && asText(m.content).trim()) {
      answers.push({ id: m.id, prompt: question, answer: asText(m.content) });
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
      const cited = [...matched, ...contrary].map(({ id, source, prompt, answer, assisted, negative }) => ({
        id,
        source,
        prompt,
        answer,
        assisted,
        negative,
      }));
      const independent =
        o.status === 'demonstrated' && cited.length && !cited.some((c) => c.negative || c.assisted);
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

export function publicChat(chat) {
  const { exam, ...visible } = chat;
  return {
    ...visible,
    exam: exam
      ? {
          index: exam.index,
          count: exam.items.length,
          ungraded: exam.ungraded,
          next: exam.queue[exam.index]?.number ?? null,
          current: exam.items[exam.index] ? publicItem(exam.items[exam.index]) : null,
        }
      : null,
  };
}
function publicItem(item) {
  const { question, page, endPage, origin, answerOrigin, hintOrigin, number, transfer } = item;
  return { question, page, endPage, origin, answerOrigin, hintOrigin, number, transfer: !!transfer };
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
