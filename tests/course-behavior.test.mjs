import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { nativeAnswers } from '../src/learning.mjs';
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
  let handle, nextReply, teachingTools;
  const restart = () => {
    handle = new Map();
    activate({
      dataDirectory: root,
      signal: new AbortController().signal,
      handle: (name, fn) => handle.set(name, fn),
      registerTools: (factory) => {
        teachingTools = factory;
      },
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
    root,
    restart,
    importBook,
    id,
    source,
    requests,
    tools: (chatId) => teachingTools.create({ chatId, agent: 'prober' }),
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
function reasonedQuiz(id, prompt, selected, reasoning) {
  const question = quiz(id, prompt, selected);
  question.details.thinking = reasoning;
  return question;
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
test('a partial import survives a restart and retry publishes one complete local PDF', async (t) => {
  const h = host(t);
  const bytes = Buffer.from('a book imported in two chunks');
  const id = createHash('sha256').update(bytes).digest('hex');
  const upload = (offset, data) => h.call('upload', { id, offset, data: data.toString('base64') });
  const first = bytes.subarray(0, 9);
  assert.equal(await upload(0, first), first.length);
  h.restart();
  assert.equal(
    (await h.call('list')).some((c) => c.id === id),
    false,
  );
  assert.equal(await upload(0, first), first.length);
  assert.equal(await upload(first.length, bytes.subarray(first.length)), bytes.length);
  await h.call('import', { id, source: h.source });
  await h.call('import', { id, source: h.source });
  assert.equal((await h.call('list')).filter((c) => c.id === id).length, 1);
  assert.deepEqual(Buffer.from((await h.call('pdf', { id })).data, 'base64'), bytes);
});

test('recommends Skip only on independent native evidence for every objective and preserves source identities', async (t) => {
  for (const outcome of ['solved', 'solvedWithHints']) {
    const h = host(
      t,
      [chapter(sections)],
      [
        session('q', [
          reasonedQuiz('a', checkVariance, 'Denominator', 'Divides excess return by volatility'),
        ]),
        practice(outcome),
      ],
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
    assert.equal(ch.objectives[0].evidence[0].answer, 'Denominator\nDivides excess return by volatility');
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
    [
      session('q', [
        reasonedQuiz(
          'v',
          checkVariance,
          'Denominator',
          'For equal excess returns, higher volatility reduces the ratio.',
        ),
      ]),
    ],
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
  h.restart();
  const resumed = await h.call('chat');
  assert.deepEqual(resumed.lessonRanges, { 0: { start: 0, end: chat.messages.length } });
  assert.equal(resumed.sectionTurnStart, chat.messages.length);
  assert.equal(resumed.section, 1);
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
    assert.equal(i.reading, i.entry.previousRubric);
    assert.equal(i.objectives[0].skill, i.entry.testedSkill);
    return { ...verification(), fullyTested: ['1.1'] };
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
    result.results[1].fullyTested,
    [],
    'A transfer on part of an objective cannot establish the whole objective',
  );
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

test('native Teaching scopes the first diagnostic to the book and credits only demonstrated subpoints', async (t) => {
  const ch = chapter(sections);
  ch.sections[0].subsections = [
    { title: 'Dispersion', start: 1 },
    { title: 'Ratios and variance', start: 1 },
  ];
  ch.sections[0].parts[0].text = 'Dispersion\n' + volatility + '\nRatios and vari-\nance\nScale by risk.';
  const sessions = [];
  const h = host(t, [ch], sessions);
  h.reply((i) => plan(i));
  await h.call('prepare');
  const start = (key) => h.call('teaching-start', { key });
  const first = await start('1.1');
  assert.match(first.opening, /short adaptive chapter diagnostic/);
  assert.match((await start('2.1')).opening, /Teach me “Capacity”/);
  sessions.push({
    id: 'native',
    title: first.provisional,
    kind: 'teach',
    messages: [{ id: 'opening', role: 'user', content: first.opening }],
  });
  await assert.rejects(h.call('teaching-bind', { key: '1.1', sessionId: 'other' }), /cannot be linked/);
  assert.equal((await start('1.1')).sessionId, 'native');
  await h.call('teaching-bind', { key: '1.1', sessionId: 'native' });
  sessions[0].title = first.title;
  h.restart();
  assert.deepEqual(await h.call('teaching-location', { sessionId: 'native' }), {
    id: h.id,
    chapter: 0,
    key: '1.1',
  });
  assert.deepEqual(h.tools('unrelated'), []);
  const [read, check] = h.tools('native');
  const source = JSON.parse((await read.execute()).content[0].text);
  assert.deepEqual(
    source.chapterMap[0].points.map((p) => p.title),
    ['Dispersion', 'Ratios and variance'],
  );
  assert.match(source.assigned.pages[0].text, /Volatility/);
  assert.doesNotMatch(source.assigned.pages[0].text, /Scale by risk|Ratios/);
  assert.match((await check.execute()).content[0].text, /No answered/);
  const state = () => h.call('chat');
  assert.equal((await state()).section, 0);
  const award = (point, id) => ({
    point,
    answerIds: [id],
    reason: 'Applied the concept to an unfamiliar case.',
  });
  sessions[0].messages.push(
    reasonedQuiz(
      'correct',
      'How does risk change?',
      'It rises',
      'The observations spread further from their mean.',
    ),
    quiz('wrong', 'How does capacity change?', 'It doubles', false),
  );
  h.reply({ demonstrated: [award('1.1', 'correct'), award('1.2', 'invented-id'), award('2.1', 'wrong')] });
  assert.match((await check.execute()).content[0].text, /1 of 3/);
  const count = h.requests.length;
  await h.call('teaching-check', { sessionId: 'native' });
  assert.equal(h.requests.length, count);
  assert.equal((await state()).section, 0);
  assert.equal((await start('1.1')).started, true);
  const second = await start('1.2');
  assert.doesNotMatch(second.opening, /adaptive chapter diagnostic/);
  sessions.push({ id: 'second', title: second.provisional, kind: 'teach', messages: [] });
  await h.call('teaching-bind', { key: '1.2', sessionId: 'second' });
  const secondSource = JSON.parse((await h.tools('second')[0].execute()).content[0].text);
  assert.match(secondSource.assigned.pages[0].text, /Scale by risk/);
  assert.doesNotMatch(secondSource.assigned.pages[0].text, /Volatility/);
  sessions[1].messages.push(
    reasonedQuiz('explain', 'How is the ratio computed?', 'Risk-adjusted', 'Divide excess return by risk.'),
  );
  h.reply({ demonstrated: [award('1.2', 'explain')] });
  await h.call('teaching-check', { sessionId: 'second' });
  assert.equal((await state()).section, 1);
  assert.notEqual((await state()).readSection, 1);
  sessions[0].messages.push(
    reasonedQuiz(
      'transferred',
      'Explain capacity in a new case.',
      'Capacity binds',
      'Market impact constrains position size.',
    ),
  );
  h.reply({ demonstrated: [award('2.1', 'transferred')] });
  await h.call('teaching-check', { sessionId: 'native' });
  assert.match(await h.call('teaching-check', { sessionId: 'second' }), /3 of 3.*chapter exam/);
  assert.equal((await state()).phase, 'exam-ready');
  assert.equal((await h.call('course')).chapters[0].lessonsDone, 2);
});

test('a choice or a supplied explanation cannot skip the lesson; a fresh unaided application can', async (t) => {
  const sessions = [];
  const h = host(t, [chapter(solo)], sessions);
  h.reply((i) => plan(i));
  await h.call('prepare');
  const first = await h.call('teaching-start', { key: '1.1' });
  const native = { id: 'diagnostic', title: first.provisional, kind: 'teach', messages: [] };
  sessions.push(native);
  await h.call('teaching-bind', { key: '1.1', sessionId: native.id });
  const check = () => h.call('teaching-check', { sessionId: native.id });
  const credit = (id) => ({
    demonstrated: [{ point: '1.1', answerIds: [id], reason: 'Identified the denominator.' }],
  });
  const choice = quiz('choice', checkVariance, 'Denominator');
  choice.details.confidence = 100;
  native.messages.push(choice);
  h.reply((input) => {
    assert.equal(input.answers[0].selectionOnly, true);
    assert.equal(input.answers[0].confidence, 100);
    return credit('choice');
  });
  assert.match(await check(), /0 of 1.*fresh problem/i);
  const supplied = 'The wider spread doubles volatility and halves the ratio.';
  native.messages.push(
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'hint', name: 'send_to_user', arguments: { message: 'Hint: ' + supplied } },
      ],
    },
    { role: 'toolResult', toolName: 'send_to_user', toolCallId: 'hint' },
    {
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 'second',
          name: 'probe',
          arguments: { question: checkVariance, explanation: 'Hidden current quiz key.' },
        },
      ],
    },
    { ...reasonedQuiz('copied', checkVariance, 'Denominator', supplied), toolCallId: 'second' },
  );
  h.reply((input) => {
    const copied = input.answers.at(-1);
    assert.match(copied.tutorContext, /Hint: The wider spread/);
    assert.doesNotMatch(copied.tutorContext, /Hidden current quiz key/);
    assert.equal(copied.assisted, true);
    return credit('copied');
  });
  assert.match(await check(), /0 of 1.*fresh problem/i);
  native.messages.push(
    reasonedQuiz(
      'repeat',
      checkVariance,
      'Denominator',
      'I can restate the last worked answer in my own words.',
    ),
  );
  h.reply((input) => {
    assert.equal(input.answers.at(-1).assisted, true);
    return credit('repeat');
  });
  assert.match(await check(), /0 of 1.*fresh problem/i);
  native.messages.push(
    reasonedQuiz(
      'new',
      'What if volatility triples at constant excess return?',
      'It falls',
      'The numerator is fixed and the denominator triples, so the new ratio is one third.',
    ),
  );
  h.reply((input) => {
    assert.ok(!input.answers.at(-1).assisted);
    return credit('new');
  });
  assert.match(await check(), /1 of 1.*chapter exam/);
  assert.equal((await h.call('chat')).phase, 'exam-ready');
});

test('chapter placement treats a confident option selection without reasoning as uncertain', async (t) => {
  const picked = quiz('picked', checkVariance, 'Denominator');
  picked.details.confidence = 100;
  const h = host(t, [chapter(solo)], [session('q', [picked])]);
  h.reply((i) => plan(i, [['q/picked']]));
  await h.call('prepare');
  const ch = (await h.call('course')).chapters[0];
  assert.equal(ch.recommendation.choice, 'Cover');
  assert.equal(ch.objectives[0].uncertainEvidence[0].selectionOnly, true);
});

test('a helper update persisted after a native probe counts only if visible before submission', () => {
  const explanation = 'Multiply both gross returns to account for compounding.';
  const answer = reasonedQuiz('answered', 'Explain the calculation.', 'Multiply', explanation);
  answer.details.answeredAt = '2026-11-20T10:01:00Z';
  const marker = (at) => ({
    role: 'custom',
    customType: 'side-question',
    details: { updates: [{ role: 'assistant', at, text: explanation }] },
  });
  const [before] = nativeAnswers([answer, marker('2026-11-20T10:00:00Z')]);
  assert.equal(before.assisted, true);
  assert.equal(before.tutorContext, explanation);
  const [after] = nativeAnswers([answer, marker('2026-11-20T10:02:00Z')]);
  assert.equal(after.assisted, undefined);
  assert.equal(after.tutorContext, undefined);
});

test('open book exercises in any order and retry a saved answer inside its own question chat', async (t) => {
  const exercises = ['3.1', '3.2'].map((id) => ({
    id,
    text: 'Derive the result for exercise ' + id,
    page: 1,
  }));
  const h = host(t, [chapter(solo, exercises)]);
  await finishReadings(h);
  h.reply(verification());
  const open = (id) => h.call('exam', { questionId: 'book-' + id });
  const answer = (id, text) => h.call('turn', { action: 'answer', text, questionId: 'book-' + id });
  await open('3.2');
  h.reply({ solved: true, assisted: false, reply: 'Correct!' });
  const help = await answer('3.2', 'I don’t know. Please help me work through this.');
  assert.equal(help.results.length, 0);
  assert.match(help.exam.current.messages.at(-1).text, /find or prove/);
  h.reply(() => {
    throw Error('offline');
  });
  await assert.rejects(answer('3.2', 'Should I start by factoring?'), /offline/);
  h.reply(verification());
  const other = await open('3.1');
  assert.deepEqual(
    other.exam.current.messages.map((m) => m.text),
    [exercises[0].text],
  );
  await assert.rejects(answer('3.2', 'Wrong tab'), /Reopen/);
  h.reply((input) => {
    assert.deepEqual(
      input.history.map((m) => m.text),
      [exercises[0].text, 'My full independent proof.'],
    );
    return { solved: true, assisted: false, reply: 'That establishes the result.' };
  });
  const done = await answer('3.1', 'My full independent proof.');
  assert.equal(done.phase, 'exam-next');
  h.restart();
  const back = await open('3.2');
  assert.ok(back.exam.current.pending);
  assert.equal(back.exam.questions.find((q) => q.number === '3.1').status, 'Done');
  h.reply((input) => {
    assert.equal(input.history.filter((m) => m.text === 'Should I start by factoring?').length, 1);
    assert.ok(!JSON.stringify(input.history).includes('independent proof'));
    return { solved: false, assisted: true, reply: 'Which factor occurs in both terms?' };
  });
  await h.call('turn', { action: 'retry', questionId: 'book-3.2' });
  h.reply({ solved: true, assisted: false, reply: 'You completed the original proof.' });
  const result = await answer('3.2', 'Here is my complete reasoning.');
  assert.deepEqual(
    result.results.map((r) => [r.number, r.assisted]),
    [
      ['3.1', false],
      ['3.2', true],
    ],
  );
  assert.equal(result.exam.questions.at(-1).label, 'Follow-up to Exercise 3.2');
});

test('opening an older sequential exam recovers each question, the lesson transcript and the pending retry', async (t) => {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const h = host(t, [
    chapter(
      solo,
      ['3.1', '3.2'].map((id) => ({ id, text: 'Printed ' + id, page: 1 })),
    ),
  ]);
  const path = join(h.root, h.id, 'course.json');
  await finishReadings(h);
  const course = JSON.parse(readFileSync(path, 'utf8'));
  const chat = course.chapters[0].chat;
  const original = structuredClone(chat.messages);
  chat.phase = 'exam';
  delete chat.lessonRanges;
  delete chat.examTurnStart;
  const item = { objectives: ['1.1'], rubric: 'Private grading notes.', origin: 'Book exercise' };
  chat.exam = {
    index: 1,
    queue: [{ number: '3.1' }, { number: '3.2' }],
    ungraded: [],
    items: [
      { ...item, number: '3.1', question: 'First exercise', historyStart: original.length },
      { ...item, number: '3.2', question: 'Second exercise', historyStart: original.length + 3 },
    ],
  };
  chat.messages.push(
    ...[
      ['tutor', 'First exercise'],
      ['learner', 'My proof'],
      ['tutor', 'Correct'],
      ['tutor', 'Second exercise'],
      ['learner', 'I need help'],
    ].map(([role, text]) => ({ role, text })),
  );
  chat.pending = { action: 'answer', text: 'I need help' };
  chat.results.push({ number: '3.1', question: 'First exercise', assisted: false, objectives: ['1.1'] });
  writeFileSync(path, JSON.stringify(course));
  h.restart();
  const resumed = await h.call('chat');
  assert.deepEqual(resumed.messages, original);
  assert.deepEqual(resumed.lessonRanges[0], { start: 0, end: original.length });
  assert.deepEqual(
    resumed.exam.questions.map((q) => [q.status, q.messages.length]),
    [
      ['Done', 3],
      ['In progress', 2],
    ],
  );
  assert.ok(resumed.exam.current.pending);
  assert.doesNotMatch(JSON.stringify(resumed), /Private grading notes/);
  h.reply((input) => {
    assert.deepEqual(
      input.history.map((m) => m.text),
      ['Second exercise', 'I need help'],
    );
    return { reply: 'What quantity do you need?', solved: false, assisted: true };
  });
  const graded = await h.call('turn', { action: 'retry', questionId: 'book-3.2' });
  h.restart();
  assert.deepEqual(await h.call('chat'), graded);
  assert.equal(graded.results.length, 1);
  assert.equal(graded.exam.questions[1].messages.length, 3);
});

test('separate questions and printed sources when a book repeats a number', async (t) => {
  const printed = ['first argument', 'second argument'];
  const h = host(t, [
    chapter(
      solo,
      printed.map((text, i) => ({ id: '3.1', text, page: i + 1, endPage: i + 1 })),
    ),
  ]);
  await finishReadings(h);
  for (const [i, id] of [
    [1, 'book-3.1-2'],
    [0, 'book-3.1'],
  ]) {
    h.reply((input) => {
      assert.equal(input.exercise.text, printed[i]);
      assert.equal(input.sources[0].number, i + 1);
      return verification();
    });
    const opened = await h.call('exam', { questionId: id });
    assert.equal(opened.exam.current.label, 'Exercise 3.1 (' + (i + 1) + ' of 2)');
    assert.equal(opened.exam.current.messages[0].text, printed[i]);
    h.reply({ reply: 'Correct.', solved: true, assisted: false });
    await h.call('turn', { questionId: id, action: 'answer', text: 'Complete proof.' });
  }
  const complete = await h.call('chat');
  assert.equal(complete.phase, 'complete');
  assert.deepEqual(
    complete.exam.questions.map((q) => q.messages[0].text),
    printed,
  );
});

test('re-importing a changed list keeps queued sources and replaces removed or newly blocked exercises', async (t) => {
  const source = ['3.1', '3.1', '3.2'].map((id, i) => ({ id, text: 'Printed problem ' + i, page: i + 1 }));
  const h = host(t, [chapter(solo, source)]);
  await finishReadings(h);
  h.reply(verification());
  await h.call('exam', { questionId: 'book-3.2' });
  const updated = structuredClone(h.source);
  updated.chapters[0].exercises.shift();
  updated.chapters[0].exercises.push({ id: '3.3', text: 'Additional exercise', page: 3 });
  await h.call('import', { source: updated });
  const moved = await h.call('exam', { questionId: 'book-3.1-2' });
  assert.equal(moved.exam.current.question, 'Printed problem 1');
  assert.equal(moved.exam.current.sourceIndex, 0);
  assert.ok(moved.exam.questions.some((q) => q.id === 'book-3.1-replacement'));
  // The active transcript survives if a later extraction flags that exercise.
  updated.chapters[0].exercises[0].blocked = 'unresolved reference';
  await h.call('import', { source: updated });
  assert.equal((await h.call('chat')).exam.current.question, 'Printed problem 1');
  for (const id of ['book-3.1-2', 'book-3.2', 'book-3.1-replacement']) {
    h.reply(verification());
    const q = await h.call('exam', { questionId: id });
    if (id.endsWith('replacement')) assert.equal(q.exam.current.origin, 'Tutor-written');
    h.reply({ reply: 'Correct.', solved: true, assisted: false });
    await h.call('turn', { questionId: id, action: 'answer', text: 'A complete derivation.' });
  }
  assert.equal((await h.call('chat')).phase, 'complete');
});

test('a newly blocked unprepared exercise becomes a tutor-written replacement after re-import', async (t) => {
  const h = host(t, [
    chapter(
      solo,
      ['3.1', '3.2'].map((id) => ({ id, text: 'Original ' + id, page: 1 })),
    ),
  ]);
  await finishReadings(h);
  h.reply(verification());
  await h.call('exam');
  const updated = structuredClone(h.source);
  updated.chapters[0].exercises[1].blocked = 'unresolved reference';
  await h.call('import', { source: updated });
  const state = await h.call('chat');
  assert.match(state.exam.ungraded.at(-1), /Exercise 3.2/);
  assert.equal(state.exam.questions[1].id, 'book-3.2-replacement');
  h.reply((input) => {
    assert.equal(input.exercise, undefined);
    return verification();
  });
  const opened = await h.call('exam', { questionId: state.exam.questions[1].id });
  assert.equal(opened.exam.current.origin, 'Tutor-written');
});

test('optional offline lessons preserve live work, survive disconnection and advance without mastery credit', async (t) => {
  const h = host(t, [chapter(sections)]);
  h.reply(plan);
  await h.call('prepare');
  const make = (key) => h.call('offline-prepare', { key });
  h.reply({ explanation: 'Incomplete' });
  await assert.rejects(make('2.1'), /incomplete/);
  assert.deepEqual((await h.call('course')).chapters[0].offlineLessons, {});
  const lesson = {
    explanation: 'Compare the source quantities.',
    example: 'Double the input.',
    checks: ['Calculate the change.', 'Explain another case.'].map((question) => ({
      question,
      correct: 1,
      choices: [
        { label: 'Constant', feedback: 'The inputs changed.' },
        { label: 'Doubles', feedback: 'The ratio doubled.' },
      ],
    })),
  };
  h.reply((input) => {
    assert.equal(input.assigned.title, sections[1][0]);
    return lesson;
  });
  await make('2.1'); // choose an upcoming lesson before a trip
  h.reply(() => {
    throw Error('offline');
  });
  await make('2.1');
  const study = (key) => h.call('offline-study', { key });
  await assert.rejects(study('1.1'), /Prepare/);
  await assert.rejects(study('2.1'), /reading/);
  async function finish(key) {
    await h.call('offline-read', { key });
    assert.equal((await study(key)).checks[0].correct, undefined);
    await h.call('offline-answer', { key, check: 0, choice: 0 });
    h.restart();
    assert.equal((await study(key)).checks[0].feedback, 'The inputs changed.');
    await assert.rejects(h.call('offline-answer', { key, check: 0, choice: 1 }), /unanswered/);
    await assert.rejects(h.call('offline-finish', { key }), /both/);
    await h.call('offline-answer', { key, check: 1, choice: 1 });
    await h.call('offline-finish', { key });
  }
  await finish('2.1');
  assert.equal((await h.call('chat')).section, 0);
  h.reply(lesson);
  await make('1.1');
  await finish('1.1');
  assert.equal((await h.call('chat')).phase, 'exam-ready');
  const ch = (await h.call('course')).chapters[0];
  assert.equal(ch.teaching?.['1.1']?.done, undefined);
  assert.deepEqual(ch.offlineLessons['2.1'], { read: true, finished: true });
});

test('study the later section first without testing or crediting the earlier section', async (t) => {
  const sessions = [];
  const h = host(t, [chapter(sections)], sessions);
  h.reply((i) => plan(i));
  await h.call('prepare');
  const later = await h.call('teaching-start', { key: '2.1', wholeSection: true });
  assert.match(later.opening, /Teach me “Capacity”/);
  assert.doesNotMatch(later.opening, /short adaptive chapter diagnostic/);
  sessions.push({
    id: 'later',
    title: later.provisional,
    kind: 'teach',
    messages: [
      reasonedQuiz(
        'work',
        'Why does capacity decline?',
        'Impact rises',
        'Larger trades consume more of the spread.',
      ),
    ],
  });
  await h.call('teaching-bind', { key: '2.1', sessionId: 'later' });
  h.restart();
  assert.equal((await h.call('chat')).selectedPoint, '2.1');
  h.reply({ demonstrated: [{ point: '2.1', answerIds: ['work'], reason: 'Explained market impact.' }] });
  await h.call('teaching-check', { sessionId: 'later' });
  const ch = (await h.call('course')).chapters[0];
  assert.deepEqual(
    ch.sections.map((s) => s.done),
    [false, true],
  );
  assert.equal(ch.lessonsDone, 1);
  assert.ok(!ch.teaching['1.1']);
  assert.equal((await h.call('chat')).phase, 'reading');
  assert.equal((await h.call('chat')).readSection, undefined);
  assert.deepEqual((await h.call('chat')).readSections, { 1: true });
  assert.equal((await h.call('teaching-start', { key: '2.1' })).sessionId, 'later');
  assert.match((await h.call('teaching-start', { key: '1.1' })).opening, /Volatility/);
});
