import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { activate } from '../src/backend.mjs';

const volatility = 'Volatility measures the dispersion of excess returns.';
const capacity = 'Capacity limits the amount that can earn an excess return.';
const sections = [
  ['Volatility and Sharpe ratio', volatility],
  ['Capacity', capacity],
];
const solo = [['Volatility and Sharpe ratio', volatility]];
function chapter(units, exercises = []) {
  return {
    title: 'What is Performance?',
    start: 1,
    end: units.length,
    exercises,
    sections: units.map(([title, text], i) => ({
      title,
      text,
      number: '3.' + (i + 1),
      start: i + 1,
      end: i + 1,
      parts: [{ page: i + 1, text }],
    })),
  };
}
function plan(input, ids = []) {
  return {
    sections: input.sections.map((s, i) => ({
      section: s.section,
      objectives: [
        {
          skill: s.title,
          page: s.pages[0].page,
          quote: s.pages[0].text.replace(/^\[[^\]]+\] /, ''),
          evidence: ids[i] ?? [],
          status: 'demonstrated',
        },
      ],
    })),
  };
}
function host(t, chapters = [chapter(solo)], sessions = [], nodes = []) {
  const root = mkdtempSync(join(tmpdir(), 'course-backend-test-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const pages = [volatility, capacity, 'A worked answer key.'].map((text, i) => ({
    number: i + 1,
    label: String(i + 1),
    text,
  }));
  const source = { title: 'Synthetic investing book', warnings: [], chapters, pages };
  const requests = [];
  let handle, nextReply;
  const restart = () => {
    handle = new Map();
    activate({
      dataDirectory: root,
      signal: new AbortController().signal,
      handle: (name, fn) => handle.set(name, fn),
      learning: {
        graph: () => ({ nodes, propositions: nodes }),
        listSessions: () => sessions.map(({ id, title }) => ({ id, title })),
        getSession: (id) => sessions.find((s) => s.id === id),
      },
      inference: {
        catalog: () => ({ slots: { strong: { model: { provider: 'test', id: 'fixture' } } } }),
        complete: async (request) => {
          const content = request.context.messages[0].content;
          const input = JSON.parse(content[0].text);
          requests.push(input);
          assert.ok(nextReply, 'Unexpected model call');
          const value = await nextReply(input, content.slice(1));
          return { stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(value) }] };
        },
      },
    });
  };
  restart();
  function importBook(name) {
    const bytes = Buffer.from('test bytes for ' + name);
    const id = createHash('sha256').update(bytes).digest('hex');
    const upload = { id, offset: 0, data: bytes.toString('base64') };
    assert.equal(handle.get('upload')(upload), bytes.length);
    assert.equal(handle.get('upload')(upload), bytes.length);
    handle.get('import')({ id, source: { ...source, title: name } });
    return id;
  }
  const id = importBook(source.title);
  return {
    restart,
    importBook,
    id,
    source,
    requests,
    reply(f) {
      nextReply = typeof f === 'function' ? f : () => f;
    },
    call: async (name, args = {}) => handle.get(name)({ id, chapter: 0, ...args }),
  };
}
async function finishReadings(h) {
  h.reply((i) => plan(i));
  await h.call('prepare');
  const { chapters } = await h.call('course');
  for (const [i] of chapters[0].sections.entries()) {
    h.reply({ reply: 'What explains this result?', demonstrated: [] });
    await h.call('turn', { action: 'read' });
    h.reply({ reply: 'That explains the result.', demonstrated: [i + 1 + '.1'] });
    await h.call('turn', { action: 'answer', text: 'The change in dispersion alters the denominator.' });
    await h.call('next');
  }
}
function verification(ids = ['1.1']) {
  return {
    question: 'Use the objective in a new example.',
    rubric: 'Calculate and explain the result.',
    check: 'Substitution in a second example gives the same result.',
    objectives: ids,
    verifiable: true,
  };
}
function session(id, messages) {
  return { id, title: 'Saved session ' + id, messages };
}
function quiz(id, prompt, answer, correct = true) {
  return {
    id,
    role: 'toolResult',
    toolName: 'quiz',
    details: {
      kind: 'quiz',
      questionText: prompt,
      answers: [{ value: 'a', label: answer, index: 1 }],
      correct,
    },
  };
}
const checkVariance = 'How does volatility enter the Sharpe ratio?';
const checkSize = 'What limits the size that can earn excess return?';
const linked = [
  {
    id: 'n1',
    name: 'Capacity',
    statement: 'Size changes marginal return.',
    aliases: [],
    provenance: [
      { chatId: 'p', messageId: 'practice-answer' },
      { chatId: 'src_notes', messageId: '' },
    ],
  },
];
function practice(outcome) {
  return session('p', [
    {
      id: 'pose',
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 'pose1',
          name: 'problem',
          arguments: { statement: checkSize, modelSolution: 'Secret model solution' },
        },
      ],
    },
    { id: 'ack', role: 'toolResult', toolName: 'problem', toolCallId: 'pose1', isError: false },
    {
      id: 'practice-answer',
      role: 'custom',
      customType: 'practice-thinking',
      details: { problemCallId: 'pose1', text: 'Larger trades incur more price impact.' },
    },
    {
      id: 'done',
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 'conclude1',
          name: 'conclude',
          arguments: { outcome, rung: outcome === 'solved' ? null : 'R2' },
        },
      ],
    },
    { id: 'concluded', role: 'toolResult', toolName: 'conclude', toolCallId: 'conclude1', isError: false },
  ]);
}
test('recommends Skip only on independent native evidence for every objective and preserves source identities', async (t) => {
  for (const outcome of ['solved', 'solvedWithHints']) {
    const h = host(
      t,
      [chapter(sections)],
      [session('q', [quiz('a', checkVariance, 'Divides excess return by volatility')]), practice(outcome)],
      linked,
    );
    h.reply((input) => {
      assert.deepEqual(new Set(input.priorAnswers.map((a) => a.id)), new Set(['q/a', 'p/practice-answer']));
      assert.doesNotMatch(JSON.stringify(input.priorAnswers), /Secret model solution/);
      return plan(input, [['q/a'], ['p/practice-answer']]);
    });
    await h.call('prepare');
    const ch = (await h.call('course')).chapters[0];
    assert.equal(ch.recommendation.choice, outcome === 'solved' ? 'Skip' : 'Cover');
    assert.deepEqual(ch.recommendation.gaps, outcome === 'solved' ? [] : ['2.1']);
    assert.equal(ch.objectives[0].evidence[0].answer, 'Divides excess return by volatility');
    if (outcome === 'solvedWithHints') assert.ok(ch.objectives[1].uncertainEvidence[0].assisted);
  }
});
test('graph notes, tutor prose, a dismissed check, unrelated answers and conflicting choices cannot establish independent evidence', async (t) => {
  const sessions = [
    session('q', [
      quiz('correct', checkVariance, 'Volatility enters the denominator'),
      quiz('wrong', checkVariance, 'Volatility enters the numerator', false),
      {
        id: 'skip',
        role: 'toolResult',
        toolName: 'quiz',
        details: { questionText: checkVariance, dismissed: true, answers: [{ label: 'Volatility' }] },
      },
      { id: 'tutor', role: 'assistant', content: [{ type: 'text', text: capacity }] },
    ]),
    session('irrelevant', [quiz('bird', 'Which bird migrates?', 'Swallow')]),
  ];
  const h = host(t, [chapter(sections)], sessions, linked);
  h.reply((i) => {
    assert.deepEqual(new Set(i.priorAnswers.map((a) => a.id)), new Set(['q/correct', 'q/wrong']));
    return plan(i, [['q/correct'], ['src_notes', 'q/tutor']]);
  });
  await h.call('prepare');
  const ch = (await h.call('course')).chapters[0];
  assert.deepEqual(ch.recommendation.gaps, ['1.1', '2.1']);
  assert.equal(ch.objectives[0].uncertainEvidence.length, 2);
});
test('diagnostic answer survives failed grading and restart and updates only its targeted objective', async (t) => {
  const h = host(
    t,
    [chapter(sections)],
    [session('q', [quiz('v', checkVariance, 'Use volatility as denominator.')])],
  );
  h.reply((i) => plan(i, [['q/v']]));
  await h.call('prepare');
  h.reply({ reply: checkSize, demonstrated: [] });
  await h.call('diagnostic');
  h.reply(() => {
    throw Error('offline');
  });
  const answer = 'Price impact raises costs as deployment grows.';
  await assert.rejects(h.call('diagnostic', { answer }), /offline/);
  h.restart();
  assert.equal((await h.call('course')).chapters[0].diagnostic.pendingAnswer, answer);
  await assert.rejects(h.call('diagnostic', { answer }), /saved/);
  h.reply((i) => {
    assert.equal(i.answer, answer);
    assert.deepEqual(
      i.objectives.map((o) => o.id),
      ['2.1'],
    );
    return { reply: 'That identifies the cost.', demonstrated: ['2.1', '99.9'] };
  });
  await h.call('diagnostic', { retry: true });
  const ch = (await h.call('course')).chapters[0];
  assert.equal(ch.recommendation.choice, 'Skip');
  assert.equal(ch.diagnosticHistory.length, 1);
  assert.equal(ch.objectives[1].evidence[0].answer, answer);
  await assert.rejects(h.call('diagnostic', { retry: true }));
});
test('same-titled chapter chats stay separate; a skipped chapter can be reopened and every section waits for acknowledgement', async (t) => {
  const h = host(t, [chapter(sections), chapter(solo)]),
    other = h.importBook('Another book');
  h.reply((i) => plan(i));
  await h.call('prepare');
  await h.call('override', { choice: 'Skip' });
  h.restart();
  const ch = (await h.call('course')).chapters[0];
  assert.equal(ch.override, 'Skip');
  assert.equal(ch.recommendation.choice, 'Cover');
  await assert.rejects(h.call('turn', { action: 'answer', text: 'Advance' }), /reading/);
  h.reply((i) => {
    assert.match(i.reading, /Volatility measures/);
    assert.doesNotMatch(i.reading, /Capacity limits/);
    return { reply: checkVariance, demonstrated: ['1.1'] };
  });
  const first = await h.call('turn', { action: 'read' });
  assert.equal(first.ready, false);
  assert.equal(first.results.length, 0);
  await assert.rejects(h.call('next'), /Finish/);
  h.reply(() => {
    throw Error('offline');
  });
  await assert.rejects(h.call('turn', { action: 'answer', text: 'It divides excess return.' }), /offline/);
  h.restart();
  let chat = await h.call('chat');
  assert.equal(chat.pending.text, 'It divides excess return.');
  assert.equal((await h.call('chat', { id: other })).messages.length, 0);
  assert.equal((await h.call('chat', { chapter: 1 })).messages.length, 0);
  h.reply((i) => {
    assert.equal(i.history.filter((m) => m.role === 'learner').length, 1);
    return { reply: 'Correct.', demonstrated: ['1.1', '2.1'] };
  });
  chat = await h.call('turn', { action: 'retry', rev: chat.rev });
  assert.deepEqual(chat.covered, ['1.1']);
  const second = await h.call('next');
  assert.equal(second.phase, 'reading');
  assert.equal(second.section, 1);
  await assert.rejects(h.call('turn', { action: 'answer', text: 'Next' }), /reading/);
  h.reply((i) => {
    assert.match(i.reading, /Capacity limits/);
    assert.deepEqual(i.history, []);
    return { reply: checkSize, demonstrated: [] };
  });
  await h.call('turn', { action: 'read' });
});
test('overlapping mutations are rejected in one chapter; independent chapter saves survive and completed planning is reused', async (t) => {
  const h = host(t, [chapter(solo), chapter(solo)]);
  let start, finish;
  const started = new Promise((r) => {
    start = r;
  });
  h.reply((i) => {
    start();
    return new Promise((r) => {
      finish = () => r(plan(i));
    });
  });
  const first = h.call('prepare');
  await started;
  await assert.rejects(h.call('override', { choice: 'Skip' }), /already processing/);
  await h.call('override', { chapter: 1, choice: 'Skip' });
  finish();
  await first;
  h.restart();
  assert.equal((await h.call('course')).chapters[1].override, 'Skip');
  await h.call('prepare');
  assert.equal(h.requests.length, 1);
  h.reply((i) => {
    const result = plan(i);
    result.sections[0].objectives[0].quote = 'fabricated passage';
    return result;
  });
  await assert.rejects(h.call('prepare', { chapter: 1 }), /Unverified passage/);
  assert.equal((await h.call('list'))[0].prepared, 1);
});
test('book exam preserves provenance, resumes scaffold position and credits a fresh unaided transfer separately', async (t) => {
  const question = 'Exercise 3.1. (a) Compute dispersion. (b) Explain the change.';
  const key = 'Published solution and equality condition.';
  const exercises = [
    {
      id: '3.1',
      text: question,
      page: 1,
      endPage: 2,
      answer: key,
      answerPage: 3,
      answerEndPage: 3,
      hint: 'Use two observations.',
      hintPage: 1,
    },
    { id: '3.2', text: 'Refer to ??', page: 2, endPage: 2, blocked: 'unresolved reference' },
  ];
  const h = host(t, [chapter(solo, exercises)]);
  await finishReadings(h);
  h.reply((i) => {
    assert.equal(i.exercise.answer, key);
    assert.equal(i.exercise.text, question);
    return verification();
  });
  const empty = await h.call('exam');
  assert.equal(empty.exam.current.question, question);
  assert.match(empty.exam.current.answerOrigin, /Book solution.*3/);
  assert.match(empty.exam.current.hintOrigin, /Book hint.*1/);
  assert.doesNotMatch(JSON.stringify(empty), /Published solution and equality condition/);
  assert.match(empty.exam.ungraded[0], /3\.2/);
  h.reply({ reply: 'What happens to the first observation?', solved: false, assisted: true });
  const step = await h.call('turn', { action: 'answer', text: "I don't know" });
  h.restart();
  assert.deepEqual(await h.call('chat'), step);
  h.reply((i) => {
    assert.equal(i.item.hint, exercises[0].hint);
    assert.match(i.history[2].text, /first observation/);
    return { reply: 'Now establish both parts of the original.', solved: false, assisted: true };
  });
  await h.call('turn', { action: 'answer', text: 'It rises.' });
  h.reply({ reply: 'Both parts are complete.', solved: true, assisted: false });
  let result = await h.call('turn', { action: 'answer', text: 'Here are both parts of my argument.' });
  assert.equal(result.results[0].assisted, true);
  assert.equal(result.results[0].solution, key);
  h.reply((i) => {
    assert.ok(i.entry.transfer);
    assert.equal(i.entry.previous, question);
    return verification();
  });
  const transfer = await h.call('exam');
  assert.ok(transfer.exam.current.transfer);
  assert.equal(transfer.exam.current.origin, 'Tutor-written');
  h.reply((i) => {
    assert.equal(i.history.length, 2);
    return { reply: 'Your direct proof is valid too.', solved: true, assisted: false };
  });
  result = await h.call('turn', {
    action: 'answer',
    text: 'I used a direct argument with two equally likely outcomes.',
  });
  assert.equal(result.phase, 'complete');
  assert.deepEqual(
    result.results.map((r) => r.assisted),
    [true, false],
  );
});
test('unverified or damaged source items are excluded and a hint-only exercise keeps the book question and a tutor-derived rubric', async (t) => {
  const exercises = [
    { id: '3.1', text: 'Exercise 3.1. Broken formula \u0002', page: 1, endPage: 1 },
    {
      id: '3.2',
      text: 'Exercise 3.2. Evaluate the limit.',
      page: 2,
      endPage: 2,
      hint: 'Start by simplifying.',
      hintPage: 2,
    },
  ];
  const h = host(t, [chapter(solo, exercises)]);
  await finishReadings(h);
  h.reply(verification());
  assert.equal((await h.call('exam')).phase, 'exam-next');
  h.reply({ ...verification(), verifiable: 'true' });
  await assert.rejects(h.call('exam'), /Incomplete exam verification/);
  h.reply(verification());
  const original = await h.call('exam');
  assert.equal(original.exam.current.question, exercises[1].text);
  assert.match(original.exam.current.answerOrigin, /Tutor-derived/);
  assert.match(original.exam.current.hintOrigin, /PDF p. 2/);
  h.reply({ reply: 'The argument is complete.', solved: true, assisted: false });
  await h.call('turn', { action: 'answer', text: 'Use substitution.' });
  h.reply(verification());
  assert.equal((await h.call('exam')).exam.current.origin, 'Tutor-written');
});
test('unfinished mastery can be reported when a transfer also needs help, without creating an endless exam', async (t) => {
  const h = host(t);
  await finishReadings(h);
  h.reply(verification());
  await h.call('exam');
  for (let i = 0; i < 2; i++) {
    h.reply({ reply: 'Try a smaller example.', solved: false, assisted: true });
    await h.call('turn', { action: 'answer', text: 'Help' });
    h.reply({ reply: 'That completes the whole problem.', solved: true, assisted: false });
    await h.call('turn', { action: 'answer', text: 'My full solution.' });
    if (i === 0) {
      h.reply(verification());
      await assert.rejects(h.call('exam'), /repeated/);
      h.reply({ ...verification(), question: 'How would a portfolio with twice the volatility compare?' });
      await h.call('exam');
    }
  }
  const chat = await h.call('chat');
  assert.equal(chat.phase, 'complete');
  assert.deepEqual(
    chat.results.map((r) => r.assisted),
    [true, true],
  );
});
test('re-import refreshes source metadata while retaining existing study and refuses incompatible outlines', async (t) => {
  const h = host(t);
  h.reply((i) => plan(i));
  await h.call('prepare');
  await h.call('override', { choice: 'Skip' });
  h.reply({ reply: 'What changes your estimate?', demonstrated: [] });
  const saved = await h.call('turn', { action: 'read' });
  const updated = structuredClone(h.source);
  updated.pages[0].text += ' A squared return satisfies r² ≥ 0.';
  updated.chapters[0].exercises = [
    {
      id: '3.1',
      text: 'Compute a ratio.',
      page: 1,
      endPage: 1,
      answer: 'Divide by volatility.',
      answerPage: 2,
      answerEndPage: 3,
    },
  ];
  let course = await h.call('import', { source: updated });
  assert.equal(course.chapters[0].override, 'Skip');
  assert.equal(course.chapters[0].exercisePages[0].answerEndPage, 3);
  assert.equal(course.chapters[0].mathPage, 1);
  assert.deepEqual((await h.call('chat')).messages, saved.messages);
  assert.equal((await h.call('list')).length, 1);
  const rev = (await h.call('chat')).rev;
  await h.call('import', { source: updated });
  assert.equal((await h.call('chat')).rev, rev);
  updated.chapters[0].sections[0].title = 'A different section';
  await assert.rejects(h.call('import', { source: updated }), /differs/);
  h.restart();
  course = await h.call('course');
  assert.equal(course.chapters[0].exercisePages[0].id, '3.1');
  assert.equal((await h.call('chat')).phase, 'discussion');
});

test('a malformed exam verdict retains the original attempt and revision blocks replay after a successful retry', async (t) => {
  const h = host(t);
  await finishReadings(h);
  h.reply(verification());
  await h.call('exam');
  const rev = (await h.call('chat')).rev;
  h.reply({ reply: 'Perhaps', solved: 'true', assisted: false });
  await assert.rejects(
    h.call('turn', { rev, action: 'answer', text: 'An alternative derivation.' }),
    /Incomplete exam assessment/,
  );
  await assert.rejects(
    h.call('turn', { rev, action: 'answer', text: 'An alternative derivation.' }),
    /another window/,
  );
  h.restart();
  const pending = await h.call('chat');
  h.reply({ reply: 'Correct by direct derivation.', solved: true, assisted: false });
  const done = await h.call('turn', { rev: pending.rev, action: 'retry' });
  assert.equal(done.results.length, 1);
  assert.equal(done.results[0].answer, 'An alternative derivation.');
  await assert.rejects(h.call('turn', { rev: pending.rev, action: 'retry' }), /another window/);
});

test('verified transcription can recover a damaged formula from the original page and keep its source number', async (t) => {
  const h = host(t, [
    chapter(solo, [{ id: '3.5', text: 'Exercise 3.5: compare x \u0002 2', page: 1, endPage: 1 }]),
  ]);
  await finishReadings(h);
  h.reply((input, images) => {
    assert.equal(input.exercise.id, '3.5');
    assert.equal(images[0].type, 'image');
    return { ...verification(), transcription: 'Exercise 3.5: compare x ≥ 2.' };
  });
  const chat = await h.call('exam', { images: ['AAAA'] });
  assert.equal(chat.exam.current.question, 'Exercise 3.5: compare x ≥ 2.');
  assert.equal(chat.exam.current.number, '3.5');
});

test('a chapter plan cannot validate a cited inequality with its direction reversed', async (t) => {
  const text = 'When volatility rises, the ratio x < y can hold.';
  const h = host(t, [chapter([['Risk', text]])]);
  h.reply((i) => {
    const r = plan(i);
    r.sections[0].objectives[0].quote = 'the ratio x > y';
    return r;
  });
  await assert.rejects(h.call('prepare'), /Unverified passage/);
});
test('each placement anchor resolves to actual text in the assigned section, including after correction', async (t) => {
  const h = host(t, [chapter(sections)]);
  for (const invalid of ['other-section', 'invented']) {
    h.reply((input) => {
      const p = plan(input);
      const second = input.sections[1].pages[0].text.match(/^\[([^\]]+)\]/)[1];
      p.sections[0].objectives[0].anchor = invalid === 'other-section' ? second : 'never-seen';
      return p;
    });
    await assert.rejects(h.call('prepare'), /Unverified passage anchor/);
  }
  h.reply((input) => {
    const p = plan(input);
    for (const [i, s] of p.sections.entries()) {
      s.objectives[0].anchor = input.sections[i].pages[0].text.match(/^\[([^\]]+)\]/)[1];
      s.objectives[0].page = 999;
      s.objectives[0].quote = 'The model does not supply the source excerpt.';
    }
    return p;
  });
  await h.call('prepare');
  assert.deepEqual(
    (await h.call('course')).chapters[0].objectives.map((o) => [o.page, o.quote]),
    [
      [1, volatility],
      [2, capacity],
    ],
  );
});
