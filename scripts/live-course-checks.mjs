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
    await page().waitForFunction(
      (s, text) => document.querySelector(s)?.textContent.includes(text),
      {},
      selector,
      reasoning,
    );
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
  if (process.argv.includes('--companion')) {
    const i = course.chapters.findIndex((ch) =>
      ch.sections.some((s) => s.readings.some((p) => /\bPCA\b/.test(p.title))),
    );
    assert.ok(i >= 0);
    await click(i + 1 + '. ' + course.chapters[i].title);
    await click('Open assigned pages');
    await page().waitForSelector('.bc-reader canvas');
    await page().click('.bc-navigation .bc-primary');
    const dock = '[data-testid="question-dock"]';
    await see('B contains asset loadings', dock);
    assert.ok(fixture.requests.some((r) => r.formulaInstructions && r.pageRequested && r.pageVisible));
    await page().waitForSelector(dock + ' .katex');
    const chatUrl = page().url();
    await page().setViewport({ width: 1440, height: 900 });
    const citation = (page) => dock + ' button[aria-label="Open PDF page ' + page + '"]';
    await page().waitForSelector(citation(244), { visible: true });
    await page().click(citation(244));
    await page().waitForSelector('.bc-companion canvas[aria-label="Original PDF page 244"]');
    const opened = await page().$('.bc-companion');
    const atPage = (n) =>
      page().waitForFunction(
        (n) => {
          const scroller = document.querySelector('.bc-companion-pages');
          const article = scroller?.querySelector('[data-page="' + n + '"]')?.closest('article');
          return (
            article &&
            Math.abs(article.getBoundingClientRect().top - scroller.getBoundingClientRect().top) < 3 &&
            Number(document.querySelector('.bc-companion input').value) === n
          );
        },
        {},
        n,
      );
    await atPage(244);
    await page().focus(citation(243));
    await page().keyboard.press('Enter');
    await atPage(243);
    assert.ok(await opened.evaluate((node) => node === document.querySelector('.bc-companion')));
    assert.equal(page().url(), chatUrl);
    for (const width of [1440, 760]) {
      await page().setViewport({ width, height: 900 });
      const fits = await page().evaluate((d) => {
        const chat = document.querySelector(d).getBoundingClientRect();
        const book = document.querySelector('.bc-companion').getBoundingClientRect();
        return chat.width > 200 && (chat.right <= book.left + 2 || chat.bottom <= book.top + 2);
      }, dock);
      assert.ok(fits, 'Both panes fit at width ' + width);
      await page().screenshot({ path: path.join(scratch, 'companion-' + width + '.png') });
    }
    await page().$eval('.bc-companion input', (input) => {
      input.value = '245';
      input.form.requestSubmit();
    });
    await page().waitForSelector('.bc-companion canvas[aria-label="Original PDF page 245"]');
    await page().select('.bc-companion select', '150');
    assert.ok(await page().$eval('.bc-companion-pages', (e) => e.scrollWidth > e.clientWidth));
    await enterReasoning('The shared dimension is the number of factors.');
    await page().click('.bc-companion [aria-label="Close book PDF"]');
    assert.ok(
      await page().$eval('[data-testid="thinking-field"] [role="textbox"]', (e) =>
        e.textContent.includes('shared dimension'),
      ),
    );

    assert.equal(await page().$('.bc-companion'), null);
    assert.equal(page().url(), chatUrl);
    await page().reload();
    await page().waitForSelector(citation(244), { visible: true });
    await page().click(citation(244));
    await atPage(244);
    await observe(
      'Clicked PDF p. 244 in a PCA question, followed the page range to 243 by keyboard in the same pane, kept a draft on close, and reopened page 244 from the saved Teaching after reload.',
    );
    return;
  }
  if (process.argv.includes('--exam-pages')) {
    for (const [number, expected] of [
      [1, []],
      [2, [99]],
      [8, [286, 287, 288, 289, 290]],
      [10, [355, 361]],
    ]) {
      await click(number + '. ' + course.chapters[number - 1].title);
      await page().waitForSelector('.bc-exam');
      const links = await page().$$eval('.bc-exam button', (buttons) => buttons.map((b) => b.textContent));
      assert.deepEqual(links, expected.length ? ['View exercise pages'] : []);
      if (expected.length) {
        await click('View exercise pages');
        await page().waitForSelector('.bc-reader canvas');
        assert.deepEqual(
          await page().$$eval('.bc-reader [data-page]', (nodes) => nodes.map((n) => Number(n.dataset.page))),
          expected,
        );
        const last = expected.at(-1);
        await page().$eval('[data-page="' + last + '"]', (n) => n.scrollIntoView({ block: 'center' }));
        await page().waitForSelector('canvas[aria-label="Original PDF page ' + last + '"]');
        await click('Back to exam');
        await page().waitForSelector('.bc-exam');
      }
      await click('Back to chapters');
    }
    await observe(
      'Exam preview handled absent, shared, overlapping and separated exercise pages in EQI Chapters 1, 2, 8 and 10. Each preview showed exactly the original exercise pages in book order.',
    );
    return;
  }
  if (process.argv.includes('--exam-sequence')) {
    const addr = await examReady(1);
    const chapterName = '2. ' + course.chapters[1].title;
    await click(chapterName);
    await click('Start chapter exam');
    await see('Exercise 2.1', '.book-courses h1');
    await click('I don’t know');
    await see('What does the first observation tell you?', '.bc-thread');
    assert.equal(await page().$$eval('.bc-thread', (nodes) => nodes.length), 1);
    await stop();
    await launch();
    await click('Courses');
    await click(title);
    await click(chapterName);
    await click('Resume Exercise 2.1');
    await see('What does the first observation tell you?', '.bc-thread');
    await page().type(
      'textarea[aria-label="Your answer"]',
      'The arithmetic mean bounds the geometric mean for positive gross returns.',
    );
    await click('Send answer');
    await click('Next exam question');
    await see('Follow-up to Exercise 2.1', '.book-courses h1');
    assert.ok(!(await page().$eval('.bc-thread', (e) => e.innerText)).includes('first observation'));
    await page().type(
      'textarea[aria-label="Your answer"]',
      'For positive gross returns their product cannot exceed the arithmetic mean raised to the number of observations.',
    );
    await click('Send answer');
    await click('Next exam question');
    await see('Exercise 2.2', '.book-courses h1');
    assert.equal((await call('chat', addr)).exam.current.messages.length, 1);
    await observe(
      'Resumed EQI Exercise 2.1 at its hint after restarting, completed it and the independent follow-up, then opened Exercise 2.2 with a fresh conversation.',
    );
    return;
  }
  if (process.argv.includes('--lesson-actions')) {
    const chapter = course.chapters[1];
    const row = '.bc-subpoint[aria-label="Definitions"]';
    const rowButton = async (label) => {
      const button = await page().waitForFunction(
        (selector, text) =>
          [...document.querySelectorAll(selector + ' button')].find(
            (b) => !b.disabled && b.textContent === text && !b.closest('[aria-busy="true"]'),
          ),
        {},
        row,
        label,
      );
      await button.asElement().click();
      await button.dispose();
    };
    await click('2. ' + chapter.title);
    await page().waitForSelector(row);
    for (const width of [680, 1280]) {
      await page().setViewport({ width, height: 900 });
      const rows = await page().$$eval('.bc-subpoint', (rows) =>
        rows.map((row) =>
          [...row.querySelectorAll('button')]
            .filter((b) => b.checkVisibility() && !b.closest('details'))
            .map((b) => b.textContent),
        ),
      );
      assert.equal(rows.length, chapter.sections.flatMap((s) => s.readings).length);
      assert.ok(
        rows.every(
          (labels) => labels.includes('Start Teaching') && labels.includes('Make available offline'),
        ),
      );
      assert.ok(await page().$eval('.bc-lessons', (e) => e.scrollWidth <= e.clientWidth + 1));
    }
    await rowButton('Start Teaching');
    await page().waitForSelector('canvas[aria-label="Original PDF page 57"]');
    await click('I’ve read Definitions · Start Teaching');
    await see('On PDF p. 59', '[data-testid="question-dock"]');
    const teaching = page().url();
    await click('Courses');
    await see('Resume Teaching', row);
    await rowButton('Mark lesson complete');
    await see('Definitions · Completed', row);
    await see('Review Teaching', row);
    assert.ok(!(await page().$eval(row, (e) => e.innerText)).includes('Resume Teaching'));
    await rowButton('Review Teaching');
    await see('On PDF p. 59', '[data-testid="question-dock"]');
    assert.equal(page().url(), teaching);
    await click('Courses');
    await see('Review Teaching', row);
    await rowButton('Make available offline');
    await see('Ready offline', '.book-courses');
    await click('Back to chapter');
    await see('Open offline lesson', row);
    await rowButton('Open offline lesson');
    await see('Ready offline', '.book-courses');
    await observe(
      'All 14 Chapter 2 lessons exposed both actions at two window widths. Definitions opened at PDF page 57, changed from Resume to Review on completion, reopened the same chat, and prepared and reopened its offline copy directly.',
    );
    return;
  }
  if (process.argv.includes('--chapter-ui')) {
    const addr = { id, chapter: 1, key: course.chapters[1].sections[0].readings[0].key };
    await call('prepare', addr);
    await call('offline-prepare', addr);
    await call('offline-read', addr);
    for (const check of [0, 1]) await call('offline-answer', { ...addr, check, choice: 1 });
    await call('offline-finish', addr);
    await click('2. ' + course.chapters[1].title);
    await see(course.chapters[1].sections[0].readings[1].title, '.bc-reading h2');
    const pickerSelector = '.bc-jump select';
    const meterValues = () =>
      page().$$eval('.bc-topic progress', (meters) => meters.map((m) => [m.value, m.max]));
    const expectedMeters = (await call('course', { id })).chapters[1].sections.map((s) => [
      s.completedPoints,
      s.readings.length,
    ]);
    assert.deepEqual(await meterValues(), expectedMeters);
    assert.deepEqual(expectedMeters[0], [1, 5]);
    const savedChapter = await call('chat', { id, chapter: 1 });
    assert.equal(
      await page().$$eval('.bc-jump option', (opts) => opts.filter((o) => !o.disabled).length),
      course.chapters.length,
    );
    await page().select(pickerSelector, String(course.chapters.length - 1));
    await see(course.chapters.at(-1).title, '.book-courses h1');
    await click('Open assigned pages');
    await page().waitForSelector('.bc-reader');
    await page().select(pickerSelector, '1');
    await see(course.chapters[1].sections[0].readings[1].title, '.bc-reading h2');
    assert.deepEqual(await meterValues(), expectedMeters);
    assert.deepEqual(await call('chat', { id, chapter: 1 }), savedChapter);
    for (const width of [1280, 680]) {
      await page().setViewport({ width, height: 900 });
      assert.ok(await page().$eval('.bc-lessons', (e) => e.scrollWidth <= e.clientWidth + 1));
      await page().screenshot({ path: path.join(scratch, 'chapter-' + width + '.png') });
    }
    await page().setViewport({ width: 1280, height: 900 });
    await observe(
      'Selected the final unprepared chapter, returned to the original chapter from its PDF reader, and verified every topic bar and the saved conversation.',
    );
    await see('Completed offline', '.bc-subpoint');
    await page().$eval('.bc-subpoint', (row) =>
      [...row.querySelectorAll('button')].find((b) => b.textContent === 'Read pages').click(),
    );
    await page().waitForSelector('.bc-reader canvas');
    await observe('Opened a subpart reading directly from its row.');
    await click('Back to lesson');
    await call('turn', { ...addr, action: 'read' });
    await call('turn', {
      ...addr,
      action: 'answer',
      text: 'I would compare both observations using the same baseline and the same measurement units. Changing the reference between observations would change the interpretation of the difference.',
    });
    await click('Back to chapters');
    await click('2. ' + course.chapters[1].title);
    const thread = await page().waitForSelector('.bc-thread:has(.bc-learner)');
    await thread.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    for (const width of [1280, 680]) {
      await page().setViewport({ width, height: 900 });
      assert.ok(
        await thread.evaluate((t) => {
          const boxes = [...t.querySelectorAll('.bc-bubble')].map((el) => el.getBoundingClientRect());
          return (
            boxes.length >= 3 &&
            boxes.every((r, i) => !i || r.top - boxes[i - 1].bottom >= 12) &&
            t.scrollWidth <= t.clientWidth + 1
          );
        }),
      );
      await page().screenshot({ path: path.join(scratch, 'conversation-' + width + '.png') });
    }
    await observe('Checked tutor and learner bubble spacing with a multi-line reply in two desktop widths.');

    return;
  }
  if (process.argv.includes('--jump-section')) {
    await click('2. ' + course.chapters[1].title);
    await see('0 of 4 sections complete', '.book-courses');
    await page().$eval('.bc-lessons li:nth-child(2)', (el) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent === 'Study this section').click(),
    );
    await page().waitForSelector('canvas[aria-label="Original PDF page 69"]');
    const point = 'GARCH(1, 1) and Return Stylized Facts';
    await click('I’ve read ' + point + ' · Start Teaching');
    await see('Which information determines next period', '[data-testid="question-dock"]');
    const sessionId = new URL(page().url()).pathname.split('/').at(-1);
    const opening = (await api('/api/chats/' + sessionId)).messages[0].content;
    assert.ok(
      opening.includes('Teach me “' + point + '”') &&
        opening.includes('PDF p. 69') &&
        !opening.includes('short adaptive chapter diagnostic'),
    );
    await click('Courses');
    await see('§2.2 · ' + point, '.bc-reading h2');
    await see('0 of 4 sections complete', '.book-courses');
    const saved = await call('course', { id });
    assert.equal(saved.chapters[1].teaching['2.1'].sessionId, sessionId);
    assert.ok(!saved.chapters[1].teaching['1.1']);
    await observe(
      'Fresh EQI Chapter 2 started §2.2 at PDF p. 69 and opened the GARCH Teaching. Returning to Courses selected the same lesson and Definitions remained untouched.',
    );
    return;
  }
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
  await see('I’ve read it', '.bc-reading');
  await click('I’ve read it · Start Teaching');
  await page().waitForFunction(() => location.pathname.startsWith('/chat/'));
  const sessionId = new URL(page().url()).pathname.split('/').at(-1);
  await see('Which feature lets a security change hands?');
  assert.ok(fixture.requests.some((r) => r.native && r.sourceRead));
  assert.ok(await page().$('[aria-label*="dictat" i], [title*="dictat" i]'));
  if (process.argv.includes('--offline-lesson')) {
    await click('Offline course lesson');
    await see('Ready offline', '.book-courses');
    assert.ok(
      fixture.requests.some((r) => r.assigned?.title === 'The Securities' && r.assigned.pages.length),
    );
    fixture.setConnected(false);
    await stop();
    await launch(true);
    await click('Courses');
    await click(title);
    await click(chapter);
    await click('Open offline lesson');
    await click('Open assigned pages');
    await page().waitForSelector('canvas[aria-label="Original PDF page 33"]');
    await click('Back to offline lesson');
    await click('I’ve read the pages · Start offline lesson');
    await click('Bespoke terms');
    await see('Bespoke terms require negotiation.', '.book-courses');
    await stop();
    await launch(true);
    await click('Courses');
    await click(title);
    await click(chapter);
    await click('Open offline lesson');
    await see('Your answer · Bespoke terms', '.book-courses');
    await click('Standard terms');
    await click('Finish offline lesson');
    await see('1 of 5 sections complete', '.book-courses');
    const result = await call('course', { id });
    assert.equal(result.chapters[0].teaching['1.1'].sessionId, sessionId);
    assert.deepEqual(Object.keys(result.chapters[0].offlineLessons), ['1.1']);
    assert.ok(!result.chapters[0].teaching['1.1'].done);
    await observe(
      'Converted The Securities from its live Teaching, reopened its PDF and completed two checks across two network-blocked launches. The original session survived and only the selected lesson was saved.',
    );
    return;
  }
  await click('Courses');
  await see(chapter, '.book-courses h1');
  await see('Resume Teaching', '.bc-reading');
  await click('Resume Teaching');
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
  await see('Done', '.bc-lessons li:nth-child(1) .bc-topic-name small');
  await see('Current lesson', '.bc-lessons li:nth-child(2) .bc-topic-name small');
  await page().$eval('.bc-lessons summary', (summary) => summary.click());
  await see(message, '.bc-lessons');
  const reviewReading = 'Read pages · §1.1 · The Securities · Printed pp. 5–9 · PDF pp. 33–37';
  await click(reviewReading);
  await page().waitForSelector('canvas[aria-label="Original PDF page 33"]');
  await click('Back to lesson');
  await see(message, '.bc-lessons details[open]');
  assert.equal(await page().evaluate(() => document.activeElement.getAttribute('aria-label')), reviewReading);
  const saved = await call('chat', { id, chapter: 0 });
  await click('Open assigned pages');
  await page().waitForSelector('canvas[aria-label="Original PDF page 37"]');
  // Check the navigation while the lower part of the PDF page is visible.
  await page().$eval('.book-courses canvas', (canvas) => canvas.scrollIntoView({ block: 'end' }));
  const back = await page().waitForFunction(() =>
    [...document.querySelectorAll('.bc-navigation button')].find((b) => b.textContent === 'Back to chapters'),
  );
  assert.ok(await back.isIntersectingViewport({ threshold: 1 }));
  // A stock-host announcement can arrive after reconnecting the disposable profile.
  const announcement = await page().$('button[aria-label="Close announcement"]');
  if (announcement) {
    await announcement.click();
    await page().waitForSelector('button[aria-label="Close announcement"]', { hidden: true });
  }
  const hit = await back.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { clickable: b.contains(at), hits: at?.outerHTML.slice(0, 180), top: r.top, height: r.height };
  });
  assert.ok(hit.clickable, JSON.stringify(hit));
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
  await see('0 of 4 sections complete', '.book-courses');
  await see('Available after all 4 lessons are done.', '.bc-exam');
  await see('Book exercises: 2.1, 2.2, 2.3, 2.5.', '.bc-exam');
  await click('View exercise pages');
  await page().waitForSelector('canvas[aria-label="Original PDF page 99"]');
  await click('Back to exam');
  assert.equal((await call('chat', { id, chapter: 1 })).phase, 'reading');
  await see('Available', '.bc-lessons li:nth-child(4) .bc-topic-name small');
  await see('Start with the chapter introduction before §2.1.', '.bc-reading');
  await see('Stop at “Excess Returns”.', '.bc-reading');
  await page().click('.bc-reading .bc-options summary');
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
  await enterReasoning('Divide the price change by the initial price, so 10/100 gives ten percent.');
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
  await see('Definitions · Demonstrated', '.bc-subpoint');
  await see('Stop at “Log Returns”.', '.bc-reading');
  await click('I’ve read it · Start Teaching');
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
  await see('Resume Teaching', '.bc-reading');
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
      await click('Back to question');
      await click('I don’t know');
      await see('What does the first observation tell you?', '.book-courses');
      await click('Back to exam questions');
      await click('Exercise 2.2 · Available');
      await see('Book exercise 2.2', '.book-courses');
      assert.ok(!(await page().$eval('.book-courses', (el) => el.innerText)).includes('first observation'));
      await stop();
      await launch();
      await click('Courses');
      await click(title);
      await click('2. ' + course.chapters[index].title);
      await click('Exercise 2.1 · In progress');
      await see('What does the first observation tell you?', '.book-courses');
      await observe(
        'EQI 2.1 responded to I don’t know with a smaller question. Opening 2.2 showed a separate chat. Restarting restored the 2.1 hint.',
      );
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
      await see('5 of 5 sections complete', '.book-courses');
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
  if (process.argv.includes('--graph-pilot')) {
    const catchup = process.argv.includes('--graph-catchup');
    if (catchup) await api('/api/settings/graph', 'PUT', { enabled: false });
    await click('1. ' + course.chapters[0].title);
    await click('I’ve read it · Start Teaching');
    await click('Reference measurement');
    await click('Submit answer');
    const chatId = new URL(page().url()).pathname.split('/').at(-1);
    if (catchup) {
      await page().waitForFunction(
        async (id) => {
          const c = await (await fetch('/api/chats/' + id)).json();
          return c.coverage?.uncoveredCount > 0 && !c.turnInFlight;
        },
        {},
        chatId,
      );
      await click('Courses');
      await page().click('.book-courses > div > .bc-options summary');
      await click('Update knowledge graph');
      await see('off in Settings', '.bc-status');
      assert.equal((await api('/api/graph')).nodes.length, 0);
      await api('/api/settings/graph', 'PUT', { enabled: true });
      await stop();
      await launch();
    }
    await page().waitForFunction(
      async (id) => {
        const c = await (await fetch('/api/chats/' + id)).json();
        return c.coverage?.coveredCount > 0 && c.coverage.uncoveredCount === 0;
      },
      { timeout: 60000 },
      chatId,
    );
    const graph = await api('/api/graph');
    const node = graph.nodes.find((n) => n.name === 'Measurement baseline');
    assert.ok(node?.provenance.some((p) => p.chatId === chatId && p.messageId));
    const before = (await api('/api/chats/' + chatId)).extractions.length;
    if (catchup) {
      await click('Courses');
      await click('Continue learning');
    } else await click('Courses');
    await page().click('.book-courses > div > .bc-options summary');
    await click('Update knowledge graph');
    await see('up to date', '.bc-status');
    assert.equal((await api('/api/chats/' + chatId)).extractions.length, before);
    await observe(
      'Short native course Teaching produced a graph proposition linked to its tutor message; returning and checking again left extraction count unchanged.',
    );
    return;
  }
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
