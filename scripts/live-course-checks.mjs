import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';

export async function runCourseChecks({
  page,
  selected,
  source,
  data,
  scratch,
  learnerAnswer,
  fixture,
  api,
  click,
  see,
  observe,
  eventually,
  stop,
  launch,
}) {
  async function enterReasoning(reasoning) {
    const selector = '[data-testid="thinking-field"] [role="textbox"]';
    await page().focus(selector);
    await page().keyboard.sendCharacter(reasoning);
    await page().waitForFunction((s, text) => document.querySelector(s)?.textContent.includes(text), {}, selector, reasoning);
  }
  const call = async (operation, input) =>
    (await api('/api/plugins/book-courses/call', 'POST', { operation, input })).result;
  const id = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
  let title = 'The Elements of Quantitative Investing';
  const chapter = '1. The Map and the Territory';
  await click('Courses');
  await see('Create course', '.book-courses');
  await observe('Courses sidebar opened a new empty book library');
  const picker = page().waitForFileChooser();
  await click('Create course');
  await (await picker).accept([selected]);
  await page().waitForFunction(
    (t) => document.querySelector('.book-courses h1')?.innerText.toLowerCase() === t.toLowerCase(),
    { timeout: 120_000 },
    title,
  );
  const course = await call('course', { id });
  title = course.title;
  assert.equal(course.chapters.length, 14);
  assert.deepEqual(
    course.chapters[9].exercisePages.map((e) => [e.id, e.page]),
    [
      ['10.1', 355],
      ['10.2', 361],
    ],
  );
  assert.deepEqual(
    await readFile(path.join(data, 'plugins/book-courses/data', id, 'book.pdf')),
    await readFile(selected),
  );
  await rename(selected, path.join(scratch, 'picker-copy-moved.pdf'));
  await observe(
    '496-page file selected through Create course and stored byte-for-byte, with 14 chapters and Chapter 10 exercises on 355 and 361',
  );
  await click(chapter);
  await see('Printed pp. 5–9 · PDF pp. 33–37', '.bc-reading');
  await see('Modes of Exchange', '.bc-reading');
  assert.equal(await page().$('.bc-message'), null);
  await click('Open assigned pages');
  await page().waitForSelector('.bc-page[data-page="33"]');
  for (const number of [33, 34, 35, 36, 37]) {
    await page().$eval('[data-page="' + number + '"]', (slot) => slot.scrollIntoView({ block: 'center' }));
    await page().waitForSelector('canvas[aria-label="Original PDF page ' + number + '"]');
  }
  await click('Back to lesson');
  await see('Printed pp. 5–9 · PDF pp. 33–37', '.bc-reading');
  await observe(
    'Reader scrolled through PDF pages 33–37 with no tutor question before the reading acknowledgement',
  );
  await click('Prepare chapter plan');
  await see('I’ve read this section', '.bc-reading');
  await click('I’ve read this section · Start Teaching');
  await page().waitForFunction(() => location.pathname.startsWith('/chat/'));
  const sessionId = new URL(page().url()).pathname.split('/').at(-1);
  await see('Which feature lets a security change hands?');
  assert.ok(fixture.requests.some((r) => r.native && r.sourceRead));
  assert.ok(await page().$('[aria-label*="dictat" i], [title*="dictat" i]'));
  await click('Courses');
  await see(chapter, '.book-courses h1');
  await see('Resume Teaching', '.bc-reading');
  await click('Resume Teaching · The Securities');
  await page().waitForFunction((id) => location.pathname === '/chat/' + id, {}, sessionId);
  await see('Which feature lets a security change hands?');
  await click('Courses');
  await see(chapter, '.book-courses h1');
  await observe(
    'Assigned reading opened a regular Teaching session with its native quiz and dictation control. Courses returned to Chapter 1 and resumed the same session.',
  );
  // Exercise the upgrade path for discussions saved in an earlier version.
  await call('turn', { id, chapter: 0, action: 'read' });
  await click('Back to chapters');
  await click(chapter);
  await page().waitForSelector('.bc-message');
  await observe('Chapter 1 opening turn appeared after acknowledgement');
  assert.ok(fixture, 'This acceptance scenario requires the scripted fixture');
  const message = 'A standard contract concentrates buyers and sellers and makes transfer easier.';
  fixture.setConnected(false);
  await page().type('textarea[aria-label="Your answer"]', message);
  await click('Send answer');
  await see('Retry saved turn', '.book-courses');
  await stop();
  await launch(true);
  await click('Courses');
  await click(title);
  await click(chapter);
  await see('Retry saved turn', '.book-courses');
  await see(message, '.book-courses');
  await click('Open assigned pages');
  await page().waitForSelector('canvas[aria-label="Original PDF page 33"]');
  await observe(
    'Offline cold start reopened the saved answer, retry control and original page 33 after the selected file was moved',
  );
  await stop();
  await launch();
  fixture.setConnected(true);
  await click('Courses');
  await click(title);
  await click(chapter);
  await click('Retry saved turn');
  await see('Finish lesson and start next lesson', '.book-courses');
  let chat = await call('chat', { id, chapter: 0 });
  assert.equal(chat.messages.filter((m) => m.text === message).length, 1);
  await click('Finish lesson and start next lesson');
  await see('Modes of Exchange', '.bc-reading h2');
  await observe('Reconnect resumed the saved answer once and §1.2 reopened the reading gate');
  await see('§1.1 · The Securities · Done', '.bc-lessons');
  await see('§1.2 · Modes of Exchange · Current lesson', '.bc-lessons');
  await page().$eval('.bc-lessons summary', (summary) => summary.click());
  await see(message, '.bc-lessons');
  const reviewReading = 'Read §1.1 · The Securities · Printed pp. 5–9 · PDF pp. 33–37';
  await click(reviewReading);
  await page().waitForSelector('canvas[aria-label="Original PDF page 33"]');
  await click('Back to lesson');
  await see(message, '.bc-lessons details[open]');
  assert.equal(await page().evaluate(() => document.activeElement.textContent), reviewReading);
  const saved = await call('chat', { id, chapter: 0 });
  await click('Open assigned pages');
  await page().waitForSelector('canvas[aria-label="Original PDF page 37"]');
  // Check the navigation while the lower part of the PDF page is visible.
  await page().$eval('.book-courses canvas', (canvas) => canvas.scrollIntoView({ block: 'end' }));
  const back = await page().waitForFunction(() =>
    [...document.querySelectorAll('.bc-navigation button')].find((b) => b.textContent === 'Back to chapters'),
  );
  assert.ok(await back.isIntersectingViewport({ threshold: 1 }));
  await back.click();
  await see(chapter, '.bc-card');
  assert.equal(await page().evaluate(() => document.activeElement.textContent), chapter);
  await click('Back to all courses');
  await see('Create course', '.book-courses');
  assert.equal(await page().evaluate(() => document.activeElement.textContent), title);
  await click(title);
  await click(chapter);
  await see('Modes of Exchange', '.bc-reading h2');
  assert.deepEqual(await call('chat', { id, chapter: 0 }), saved);
  await click('Back to chapters');
  await see(chapter, '.bc-card');
  await observe(
    'Returned from scrolled PDF to chapters, then to all courses; reopening restored §1.2 and its transcript. The lesson also returned directly to chapters.',
  );
  await click('2. ' + course.chapters[1].title);
  await see('0 of 4 lessons done', '.book-courses');
  await see('Available after all 4 lessons are done.', '.bc-exam');
  await see('Book exercises: 2.1, 2.2, 2.3, 2.5.', '.bc-exam');
  await click('View book questions · PDF p. 99');
  await page().waitForSelector('canvas[aria-label="Original PDF page 99"]');
  await click('Back to exam');
  assert.equal((await call('chat', { id, chapter: 1 })).phase, 'reading');
  await see('§2.4 · Appendix · Upcoming', '.bc-lessons');
  await see('Start with the chapter introduction before §2.1.', '.bc-reading');
  await see('Stop at “Excess Returns”.', '.bc-reading');
  await click('Read whole section');
  await page().waitForSelector('.bc-page[data-page="69"]');
  await click('Back to lesson');
  await click('Open assigned pages');
  await page().waitForSelector('canvas[aria-label="Original PDF page 57"]');
  await page().$eval('[data-page="58"]', (el) => el.scrollIntoView({ block: 'start' }));
  await page().waitForSelector('canvas[aria-label="Original PDF page 58"]');
  assert.equal(await page().$$eval('.bc-page', (pages) => pages.at(-1).dataset.page), '59');
  await click('I’ve read Definitions · Start Teaching');
  await see(
    'On PDF p. 59, what is the simple return when the price rises from 100 to 110?',
    '[data-testid="question-dock"]',
  );
  assert.ok(
    fixture.requests.some((r) => r.definitions && r.sourceInOpening && r.pageRequested && r.pageVisible),
    'The configured native provider received Definitions text in the opening and an original-page image before its question',
  );
  const nativeId = new URL(page().url()).pathname.split('/').at(-1);
  await click('Ten percent');
  await enterReasoning(
    'Divide the price change by the initial price, so 10/100 gives ten percent.',
  );
  await click('Submit answer');
  await eventually(async () =>
    assert.ok(
      (await api('/api/chats/' + nativeId)).messages.some(
        (m) => m.role === 'toolResult' && m.details?.thinking?.includes('initial price'),
      ),
    ),
  );
  await click('Courses');
  await see('1 of 14 chapter subpoints demonstrated', '.bc-status');
  await page().$eval('.bc-lessons summary', (el) => el.click());
  await see('Definitions · Demonstrated', '.bc-lessons details[open]');
  await see('Stop at “Log Returns”.', '.bc-reading');
  await click('I’ve read Excess Returns · Start Teaching');
  await page().waitForFunction(
    (id) => location.pathname.startsWith('/chat/') && !location.pathname.endsWith(id),
    {},
    nativeId,
  );
  const nextId = new URL(page().url()).pathname.split('/').at(-1);
  await eventually(async () =>
    assert.match((await api('/api/chats/' + nextId)).messages[0]?.content || '', /Teach me “Excess Returns”/),
  );
  await see('How much did a portfolio earning 5%', '[data-testid="question-dock"]');
  await click('Two percentage points');
  await enterReasoning(
    'Subtract the benchmark from the portfolio return. The answer is two percentage points.',
  );
  await click('Submit answer');
  await eventually(async () =>
    assert.ok(
      (await api('/api/chats/' + nextId)).messages.some(
        (m) => m.role === 'toolResult' && m.details?.thinking?.includes('benchmark'),
      ),
    ),
  );
  await click('Courses');
  await see('1 of 14 chapter subpoints demonstrated', '.bc-status');
  await see('Resume Teaching · Excess Returns', '.bc-reading');
  await see('Available after all 4 lessons are done.', '.bc-exam');
  await click('Back to chapters');
  await observe(
    'Chapter 2 Definitions accepted a submitted native diagnostic answer and saved its evidence. The next Teaching opened separately for Excess Returns and the exam remained pending.',
  );
  await observe(
    'Definitions included the chapter introduction on PDF pp. 57–59. Read whole section reached p. 69. The native provider saw the actual text and page 59 image, and a copied hint in Excess Returns did not advance the learner.',
  );
  await call('prepare', { id, chapter: 2 });
  assert.ok(
    fixture.requests.some((r) =>
      r.priorAnswers?.some((a) => a.answer === learnerAnswer && a.id === 'course_test_teach/answer'),
    ),
  );
  await observe(
    'Stock public learning API supplied the staged learner answer and exact session/message ID for Chapter 3',
  );
  async function examReady(index) {
    const addr = { id, chapter: index };
    await call('prepare', addr);
    let state = await call('chat', addr);
    while (state.phase === 'reading' || state.phase === 'discussion') {
      if (state.phase === 'reading') state = await call('turn', { ...addr, action: 'read' });
      if (!state.ready)
        state = await call('turn', {
          ...addr,
          action: 'answer',
          text: 'My independent example varies one assumption and predicts its effect.',
        });
      state = await call('next', addr);
    }
    return addr;
  }
  for (const index of [0, 1]) {
    const addr = await examReady(index);
    let first;
    if (index === 1) {
      await click('2. ' + course.chapters[index].title);
      await click('Start chapter exam');
      await see('Book exercise 2.1', '.book-courses');
      first = await call('chat', addr);
      assert.ok(fixture.visualExamExercises.includes('2.1'), 'Exercise 2.1 sent a page image');
      await click('View source page');
      await page().waitForSelector('canvas[aria-label="Original PDF page 99"]');
    } else first = await call('exam', addr);
    assert.equal(first.exam.current.origin, index === 0 ? 'Tutor-written' : 'Book exercise');
    if (index === 1) assert.equal(first.exam.current.number, '2.1');
    let state = await call('turn', {
      ...addr,
      action: 'answer',
      text: 'My independent argument follows from the stated assumptions.',
    });
    while (index === 0 && state.phase === 'exam-next') {
      await call('exam', addr);
      state = await call('turn', {
        ...addr,
        action: 'answer',
        text: 'I apply the chapter assumption in a second worked example.',
      });
    }
    if (index === 0) {
      assert.equal(state.phase, 'complete');
      await click(chapter);
      await see('5 of 5 lessons done', '.book-courses');
      await click('Back to chapters');
      await see('Chapter done', '.bc-card');
    }
    await observe(
      index === 0
        ? 'Packaged backend completed Chapter 1’s generated exam using the scripted model'
        : 'Packaged backend assessed book exercise 2.1 on PDF p. 99 using the scripted model',
    );
  }
}

export async function runSyntheticChecks({
  page,
  selected,
  fixture,
  api,
  click,
  see,
  observe,
  stop,
  launch,
}) {
  const call = async (operation, input) =>
    (await api('/api/plugins/book-courses/call', 'POST', { operation, input })).result;
  await click('Courses');
  const picker = page().waitForFileChooser();
  await click('Create course');
  await (await picker).accept([selected]);
  await see('Prepare course plan', '.book-courses');
  const [{ id }] = await call('list', {});
  const course = await call('course', { id });
  assert.equal(course.chapters.length, 2);
  const addr = { id, chapter: 0 };
  await call('prepare', addr);
  assert.ok(fixture.requests.some((r) => Array.isArray(r.priorAnswers) && !r.priorAnswers.length));
  let state = await call('chat', addr);
  while (state.phase === 'reading') {
    await call('turn', { ...addr, action: 'read' });
    await call('turn', {
      ...addr,
      action: 'answer',
      text: 'I can explain the distinction in the source example.',
    });
    state = await call('next', addr);
  }
  const first = await call('exam', addr);
  assert.equal(first.exam.current.number, '1.1');
  assert.equal(first.exam.current.answerOrigin, 'Book solution · PDF p. 8');
  assert.equal(first.exam.current.solution, undefined);
  state = await call('turn', { ...addr, action: 'answer', text: 'I need a smaller step.' });
  assert.equal(state.phase, 'exam');
  await stop();
  await launch();
  const resume = await call('chat', addr);
  assert.deepEqual(resume, state);
  state = await call('turn', {
    ...addr,
    action: 'answer',
    text: 'I have now supplied both parts of the argument.',
  });
  assert.equal(state.results[0].assisted, true);
  state = await call('exam', addr);
  assert.equal(state.exam.current.transfer, true);
  state = await call('turn', {
    ...addr,
    action: 'answer',
    text: 'Here is my independent solution to the fresh example.',
  });
  assert.equal(state.results[1].assisted, false);
  assert.equal(state.results[1].transfer, true);
  await observe(
    'Synthetic PDF in a new learner profile paired exercise 1.1 with its hidden page 8 solution, resumed mid-derivation, then distinguished assisted and independent transfer attempts',
  );
}
