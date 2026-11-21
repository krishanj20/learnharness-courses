import { ask } from './model.mjs';
import { material, advanceLessons } from './native-teaching.mjs';
import { points } from './passages.mjs';
import { nativeAnswers } from './learning.mjs';

const prompt = `Prepare one self-contained offline book lesson for exactly the assigned subpoint. Use the supplied book passage, notation, and page images. Adapt to the learner's previous attempts if present. Write a concise explanation and one worked example, then two different multiple-choice questions, the second testing a fresh application. Give each option specific feedback that helps the learner reason through the answer. Check the arithmetic and ensure exactly one correct choice per question. Use only self-contained text and Markdown math. Return {"explanation":"...","example":"...","checks":[{"question":"...","choices":[{"label":"...","feedback":"..."},{"label":"...","feedback":"..."}],"correct":0}]}. correct is the zero-based index. Vary its position.`;

function validate(lesson) {
  const text = (s) =>
    typeof s === 'string' && !!s.trim() && !/!\[|<\s*(?:img|iframe|video|audio|embed|object)\b/i.test(s);
  if (
    !text(lesson?.explanation) ||
    !text(lesson.example) ||
    lesson.checks?.length !== 2 ||
    !Array.isArray(lesson.checks) ||
    lesson.checks.some(
      (q) =>
        !text(q?.question) ||
        !Array.isArray(q.choices) ||
        q.choices.length < 2 ||
        q.choices.length > 6 ||
        !Number.isInteger(q.correct) ||
        !q.choices[q.correct] ||
        q.choices.some((c) => !text(c?.label) || !text(c.feedback)) ||
        new Set(q.choices.map((c) => c.label.trim().toLowerCase())).size !== q.choices.length,
    ) ||
    new Set(lesson.checks.map((q) => q.question.trim().toLowerCase())).size !== 2
  )
    throw Error('The offline lesson has an incomplete explanation or answer key. Try preparing it again.');
}

export function registerOfflineLessons(ctx, { edit, book, state, imageList }) {
  function saved(ch, key) {
    if (!Object.hasOwn(ch.offlineLessons ?? {}, key)) throw Error('Prepare this lesson online first.');
    return ch.offlineLessons[key];
  }
  ctx.handle('offline-prepare', (a) =>
    edit(a, async (ch) => {
      const section = ch.sections.findIndex((s, i) => points(s, i).some((p) => p.key === a.key));
      if (section < 0 || !ch.objectives) throw Error('Choose a lesson in a prepared chapter.');
      if (ch.offlineLessons?.[a.key]) return;
      const point = points(ch.sections[section], section).findIndex((p) => p.key === a.key);
      const b = book(a.id);
      const sessionId = ch.teaching?.[a.key]?.sessionId;
      const prior = sessionId
        ? nativeAnswers(ctx.learning.getSession(sessionId)?.messages ?? []).slice(-6)
        : [];
      const lesson = await ask(
        ctx,
        prompt,
        {
          chapter: ch.title,
          assigned: material(b, b.chapters[a.chapter], section, point),
          previousAttempts: prior.map(({ prompt, answer }) => ({ question: prompt, answer })),
        },
        imageList(a),
      );
      validate(lesson);
      (ch.offlineLessons ??= {})[a.key] = {
        explanation: lesson.explanation,
        example: lesson.example,
        checks: lesson.checks,
        answers: [],
        read: false,
        finished: false,
      };
    }),
  );
  ctx.handle('offline-study', (a) => {
    const lesson = saved(state(a.id).chapters[a.chapter], a.key);
    if (!lesson.read) throw Error('Confirm the assigned reading first.');
    return {
      explanation: lesson.explanation,
      example: lesson.example,
      finished: lesson.finished,
      checks: lesson.checks.map((q, i) => {
        const selected = lesson.answers[i];
        return {
          question: q.question,
          choices: q.choices.map((c) => c.label),
          ...(selected != null
            ? { selected, correct: q.correct, feedback: q.choices[selected].feedback }
            : {}),
        };
      }),
    };
  });
  ctx.handle('offline-read', (a) =>
    edit(a, (ch) => {
      saved(ch, a.key).read = true;
    }),
  );
  ctx.handle('offline-answer', (a) =>
    edit(a, (ch) => {
      const lesson = saved(ch, a.key);
      const q = lesson.checks[a.check];
      if (
        !lesson.read ||
        !Number.isInteger(a.check) ||
        !q ||
        !Number.isInteger(a.choice) ||
        !q.choices[a.choice]
      )
        throw Error('Choose an answer for this offline lesson.');
      if (lesson.answers[a.check] === a.choice) return;
      if (lesson.answers.length !== a.check || lesson.finished)
        throw Error('Open the next unanswered check.');
      lesson.answers.push(a.choice);
    }),
  );
  ctx.handle('offline-finish', (a) =>
    edit(a, (ch) => {
      const lesson = saved(ch, a.key);
      if (!lesson.read || lesson.answers.length !== lesson.checks.length)
        throw Error('Answer both checks first.');
      lesson.finished = true;
      advanceLessons(ch);
    }),
  );
}
