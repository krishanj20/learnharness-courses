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
  await see('Printed pp. 7–9 · PDF pp. 35–37', '.bc-reading');
  await see('Modes of Exchange', '.bc-reading');
  assert.equal(await page().$('.bc-message'), null);
  await click('Open assigned pages');
  for (const number of [35, 36, 37]) {
    await page().waitForSelector('canvas[aria-label="Original PDF page ' + number + '"]');
    if (number < 37) await click('Next page');
  }
  await click('Back to chapter');
  await observe(
    'Reader rendered PDF pages 35, 36 and 37 with no tutor question before the reading acknowledgement',
  );
  await click('Prepare chapter plan');
  await see('I’ve read this section', '.bc-reading');
  await click('I’ve read this section');
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
  await page().waitForSelector('canvas[aria-label="Original PDF page 35"]');
  await observe(
    'Offline cold start reopened the saved answer, retry control and original page 35 after the selected file was moved',
  );
  await stop();
  await launch();
  fixture.setConnected(true);
  await click('Courses');
  await click(title);
  await click(chapter);
  await click('Retry saved turn');
  await see('Continue to next reading', '.book-courses');
  let chat = await call('chat', { id, chapter: 0 });
  assert.equal(chat.messages.filter((m) => m.text === message).length, 1);
  await click('Continue to next reading');
  await see('Modes of Exchange', '.bc-reading h2');
  await observe('Reconnect resumed the saved answer once and §1.2 reopened the reading gate');
  await call('prepare', { id, chapter: 2 });
  assert.ok(
    fixture.requests.some((r) =>
      r.priorAnswers?.some(
        (a) => a.answer === learnerAnswer && a.id === 'course_test_teach/answer',
      ),
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
      await click(title);
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
    if (index === 0) assert.equal(state.phase, 'complete');
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
