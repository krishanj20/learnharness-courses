import { ask, gradePrompt, prepareExamPrompt } from './model.mjs';
import { normalise, verifiedItem } from './learning.mjs';

const week = 7 * 24 * 60 * 60 * 1000;

function examOutcome(results, id) {
  const attempts = results.filter((r) => r.objectives.includes(id));
  if (attempts.some((r) => !r.assisted && r.fullyTested?.includes(id))) return 'Demonstrated independently';
  if (attempts.some((r) => !r.assisted)) return 'Partly demonstrated independently';
  return attempts.length ? 'Practise again' : 'Not assessed';
}

function examBaseline(chat, id) {
  // Saved answers can be graded out of order after a disconnected attempt.
  const dates = chat.results
    .filter((r) => !r.assisted && r.fullyTested?.includes(id))
    .map((r) => r.solvedAt ?? chat.examCompletedAt)
    .filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : chat.examCompletedAt;
}

export function practiceSummary(ch, now = Date.now()) {
  if (ch.chat.phase !== 'complete') return [];
  return (ch.objectives ?? []).map((o) => {
    const exam = examOutcome(ch.chat.results, o.id);
    const attempts = ch.reviews?.[o.id] ?? [];
    const last = attempts.at(-1);
    const active = !!last && !last.finishedAt;
    const finished = active ? attempts.at(-2) : last;
    const independent = finished ? !finished.assisted : exam === 'Demonstrated independently';
    const since = finished?.finishedAt ?? examBaseline(ch.chat, o.id);
    const dueAt = independent && since && !finished?.delayedSuccess ? since + week : null;
    // Undated legacy exams can supply a skill baseline, but cannot prove a week elapsed.
    const priority = active ? 0 : !independent ? 1 : dueAt && dueAt <= now ? 2 : !since ? 3 : null;
    const outcome = finished
      ? finished.assisted
        ? 'Solved with guidance'
        : finished.delayedSuccess
          ? 'Demonstrated independently after a week'
          : 'Demonstrated independently in practice'
      : null;
    return {
      id: o.id,
      skill: o.skill,
      exam,
      outcome,
      dueAt,
      priority,
      active,
      question: last?.question,
      messages: last?.messages,
      pending: !!last?.pending,
    };
  });
}

export function practiceOffer(chapters) {
  let best;
  for (const [chapter, ch] of chapters.entries()) {
    for (const p of practiceSummary(ch)) {
      if (p.priority === null || (best && p.priority >= best.priority)) continue;
      best = { chapter, objective: p.id, skill: p.skill, active: p.active, priority: p.priority };
    }
  }
  return best;
}

export function registerReview(ctx, { edit, book, imageList }) {
  function objectiveFor(ch, input) {
    if (ch.chat.phase !== 'complete')
      throw Error('Finish the chapter exam before starting follow-up practice.');
    const objective = ch.objectives.find((o) => o.id === input.objective);
    if (!objective) throw Error('Choose an objective from the chapter results.');
    return objective;
  }
  ctx.handle('review-start', (a) =>
    edit(a, async (ch) => {
      const objective = objectiveFor(ch, a);
      const attempts = ((ch.reviews ??= {})[objective.id] ??= []);
      const last = attempts.at(-1);
      if (last && !last.finishedAt) return;
      const previous = [...ch.chat.results.map((r) => r.question), ...attempts.map((r) => r.question)];
      const source = book(a.id).chapters[a.chapter].sections[objective.section];
      const prompt =
        prepareExamPrompt +
        ' This is a short post-exam retrieval question. Test the entire target objective in one new application or decision. Choose a different case and reasoning path from previously seen examples. Ask for reasoning without hints or a solution.';
      const r = await ask(
        ctx,
        prompt,
        {
          chapter: ch.title,
          objectives: [
            { id: objective.id, skill: objective.skill, page: objective.page, quote: objective.quote },
          ],
          previousQuestions: previous,
          reading: source.text,
        },
        imageList(a),
      );
      const item = verifiedItem(r, null, [objective]);
      if (!item?.fullyTested.includes(objective.id))
        throw Error('The question did not test the full objective. Try preparing a new problem.');
      if (previous.some((q) => normalise(q) === normalise(item.question)))
        throw Error('The tutor repeated an earlier problem. Try preparing a new one.');
      const startedAt = Date.now();
      const baseline = last?.finishedAt ?? examBaseline(ch.chat, objective.id);
      const independentlySolved = last
        ? !last.assisted
        : examOutcome(ch.chat.results, objective.id) === 'Demonstrated independently';
      attempts.push({
        question: item.question,
        rubric: item.rubric,
        startedAt,
        delayed: !!baseline && independentlySolved && startedAt - baseline >= week,
        messages: [],
      });
    }),
  );
  ctx.handle('review-answer', (a) =>
    edit(a, async (ch, checkpoint) => {
      const objective = objectiveFor(ch, a);
      const item = ch.reviews?.[objective.id]?.at(-1);
      if (!item || item.finishedAt) throw Error('Open a fresh practice problem first.');
      if (!item.pending) {
        if (a.retry || typeof a.text !== 'string' || !a.text.trim()) throw Error('Enter your answer.');
        item.messages.push({ role: 'learner', text: a.text.trim() });
        item.pending = true;
        ch.chat.rev++;
        checkpoint();
      } else if (!a.retry) throw Error('Retry your saved practice answer.');
      const r = await ask(ctx, gradePrompt, {
        item: { question: item.question, rubric: item.rubric },
        history: item.messages,
      });
      if (
        typeof r.reply !== 'string' ||
        !r.reply.trim() ||
        typeof r.solved !== 'boolean' ||
        typeof r.assisted !== 'boolean'
      )
        throw Error('Incomplete feedback. Retry your saved practice answer.');
      item.messages.push({ role: 'tutor', text: r.reply.trim() });
      item.pending = false;
      item.assisted = !!item.assisted || !r.solved || r.assisted;
      if (r.solved) {
        item.finishedAt = Date.now();
        item.delayedSuccess = item.delayed && !item.assisted;
      }
    }),
  );
}
