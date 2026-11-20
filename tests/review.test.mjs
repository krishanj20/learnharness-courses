import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { practiceSummary } from '../src/review.mjs';
import { activate } from '../src/backend.mjs';

const week = 7 * 86400000;
const epoch = Date.UTC(2026, 10, 20, 12);
const id = 'a'.repeat(64);
const skill = 'Calculate the compounded return and explain the result.';
function learner(t, { dated = true, independent = false, solvedAt, partial = false, complete = true } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: epoch });
  const root = mkdtempSync(join(tmpdir(), 'learnharness-review-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const dir = join(root, id);
  mkdirSync(dir);
  const page = { number: 1, label: '1', text: 'A fresh problem about compounding.' };
  const section = {
    title: 'Returns',
    start: 1,
    end: 1,
    parts: [{ page: 1, text: page.text }],
    text: page.text,
  };
  const objectives = ['1.1', '1.2'].map((id, i) => ({
    id,
    section: 0,
    skill: i ? 'Explain excess returns.' : skill,
    quote: page.text,
    page: 1,
  }));
  const chapter = {
    title: 'Returns',
    start: 1,
    end: 1,
    sections: [section],
    objectives,
    chat: {
      rev: 0,
      phase: complete ? 'complete' : 'reading',
      section: 0,
      messages: [],
      results: [
        {
          question: 'What happens to 100 after two ten percent gains?',
          objectives: ['1.1'],
          fullyTested: partial ? [] : ['1.1'],
          assisted: !independent,
          answer: 'A worked calculation.',
          solvedAt,
        },
      ],
      ...(dated ? { examCompletedAt: epoch } : {}),
    },
  };
  writeFileSync(join(dir, 'source.json'), JSON.stringify({ chapters: [chapter], pages: [page] }));
  writeFileSync(join(dir, 'course.json'), JSON.stringify({ id, title: 'Investing', chapters: [chapter] }));
  let ops;
  let result;
  let requests = [];
  function restart() {
    ops = new Map();
    activate({
      dataDirectory: root,
      signal: new AbortController().signal,
      handle: (k, fn) => ops.set(k, fn),
      inference: {
        catalog: () => ({ slots: { strong: { model: { provider: 'test', id: 'test' } } } }),
        complete: async (req) => {
          const input = JSON.parse(req.context.messages[0].content[0].text);
          requests.push(input);
          if (result instanceof Error) throw result;
          return { stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      },
    });
  }
  restart();
  const call = (name, props = {}) => ops.get(name)({ id, chapter: 0, objective: '1.1', ...props });
  return {
    restart,
    call,
    requests,
    question(q = 'A fund gains 20%, then loses 20%. Explain its final return.') {
      result = {
        verifiable: true,
        question: q,
        fullyTested: ['1.1'],
        objectives: ['1.1'],
        rubric: 'PRIVATE: multiply successive gross returns.',
        check: 'Confirm using two prices.',
      };
    },
    reply(r) {
      result = r;
    },
    practice: () => call('course').chapters[0].practice[0],
    now: (n) => t.mock.timers.setTime(n),
  };
}
const success = {
  reply: 'Your independent calculation and explanation are correct.',
  solved: true,
  assisted: false,
};

test('unfinished exams cannot start review; completed older exams offer a weak or unassessed objective', async (t) => {
  const h = learner(t, { complete: false });
  assert.equal(h.call('list')[0].practiceOffer, undefined);
  await assert.rejects(h.call('review-start'), /Finish the chapter exam/);
});
test('a practice problem and its pending answer survive restart and preserve the exam record', async (t) => {
  const h = learner(t, { dated: false, partial: true, independent: true });
  assert.equal(h.practice().exam, 'Partly demonstrated independently');
  assert.equal(h.call('list')[0].practiceOffer.objective, '1.1');
  assert.equal(h.call('course').chapters[0].practice[1].exam, 'Not assessed');
  const before = h.call('chat');
  h.question();
  await h.call('review-start');
  assert.ok(!JSON.stringify(h.call('course')).includes('PRIVATE:'));
  assert.deepEqual(h.requests[0].previousQuestions, [before.results[0].question]);
  h.reply(new Error('offline'));
  await assert.rejects(h.call('review-answer', { text: 'Could you help with the first step?' }), /offline/);
  h.restart();
  assert.equal(h.practice().pending, true);
  assert.equal(h.call('list')[0].practiceOffer.active, true);
  h.reply({ reply: 'What is the value after the gain?', solved: false, assisted: true });
  await h.call('review-answer', { retry: true });
  h.reply(success);
  await h.call('review-answer', { text: '100 grows to 120 and then becomes 96, so the return is −4%.' });
  assert.equal(h.practice().outcome, 'Solved with guidance');
  assert.equal(h.practice().messages.length, 4);
  assert.deepEqual(h.call('chat').results, before.results);
  assert.equal(h.call('chat').phase, 'complete');
  assert.equal(h.practice().exam, 'Partly demonstrated independently');
  assert.equal(h.practice().dueAt, null);
});
test('only a fresh unaided problem opened at least a week after independent work counts as delayed evidence', async (t) => {
  const h = learner(t, { independent: true });
  assert.equal(h.practice().dueAt, epoch + week);
  h.now(epoch + week - 1000);
  h.question();
  await h.call('review-start');
  h.now(epoch + week + 1000);
  h.reply(success);
  await h.call('review-answer', { text: 'I compounded the gross returns.' });
  assert.equal(h.practice().outcome, 'Demonstrated independently in practice');
  const due = h.practice().dueAt;
  h.now(due);
  h.question('One investment falls 20%. What gain would restore its original value, and why?');
  await h.call('review-start');
  h.reply(success);
  await h.call('review-answer', { text: '25%, because 1.25 × 0.8 = 1.' });
  h.restart();
  assert.equal(h.practice().outcome, 'Demonstrated independently after a week');
  assert.equal(h.practice().dueAt, null);
  assert.equal(h.practice().priority, null);
});
test('legacy independently completed exams establish a dated baseline, and review rejects duplicate questions', async (t) => {
  const h = learner(t, { dated: false, independent: true });
  h.question(h.call('chat').results[0].question);
  await assert.rejects(h.call('review-start'), /repeated an earlier problem/);
  h.question();
  await h.call('review-start');
  h.reply(success);
  await h.call('review-answer', { text: '100 becomes 96.' });
  assert.equal(h.practice().outcome, 'Demonstrated independently in practice');
  assert.equal(h.practice().dueAt, epoch + week);
});

test('a multi-day exam dates retrieval from the last independent solution of that objective', async (t) => {
  const h = learner(t, { independent: true, solvedAt: epoch - week });
  assert.equal(h.practice().dueAt, epoch);
  h.question();
  await h.call('review-start');
  h.reply(success);
  await h.call('review-answer', { text: 'Multiplying gives 0.96, a loss of four percent.' });
  assert.equal(h.practice().outcome, 'Demonstrated independently after a week');
});

test('grading an older saved answer last keeps the later independent demonstration as the baseline', () => {
  const results = [epoch, epoch - 4 * 86400000].map((solvedAt) => ({
    objectives: ['1.1'],
    fullyTested: ['1.1'],
    assisted: false,
    solvedAt,
  }));
  const [practice] = practiceSummary(
    { objectives: [{ id: '1.1', skill }], chat: { phase: 'complete', results, examCompletedAt: epoch } },
    epoch,
  );
  assert.equal(practice.dueAt, epoch + week);
});
