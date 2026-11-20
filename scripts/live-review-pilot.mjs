import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Stage only the prerequisite exam history and, for the second check, the elapsed
// interval inside the isolated profile. The learner completes both problems in the app.
export async function runReviewPilot({ page, api, click, see, selected, data, stop, launch, observe }) {
  const id = createHash('sha256')
    .update(await readFile(selected))
    .digest('hex');
  const addr = { id, chapter: 1 };
  const call = async (operation, input) =>
    (await api('/api/plugins/book-courses/call', 'POST', { operation, input })).result;
  await click('Courses');
  const picker = page().waitForFileChooser();
  await click('Create course');
  await (await picker).accept([selected]);
  await page().waitForFunction(
    () =>
      document
        .querySelector('.book-courses h1')
        ?.innerText.toLowerCase()
        .includes('elements of quantitative investing'),
    { timeout: 120000 },
  );
  await call('prepare', addr);
  await stop();
  const filename = path.join(data, 'plugins/book-courses/data', id, 'course.json');
  const saved = JSON.parse(await readFile(filename, 'utf8'));
  const ch = saved.chapters[1];
  assert.match(ch.title, /Returns/);
  const objective = ch.objectives[0];
  const now = Date.now();
  Object.assign(ch.chat, {
    phase: 'complete',
    examCompletedAt: now,
    exam: { index: 1, items: [], queue: [], ungraded: [] },
    results: [
      {
        question: 'Which gross returns must be multiplied?',
        answer: 'Both gross returns.',
        objectives: ch.objectives.map((o) => o.id),
        fullyTested: ch.objectives.slice(1).map((o) => o.id),
        assisted: false,
        origin: 'Tutor-written',
        answerOrigin: 'Tutor-derived solution',
      },
    ],
  });
  await writeFile(filename, JSON.stringify(saved));
  await launch();
  await click('Courses');
  await see(objective.skill, '.bc-review-offer');
  await click('Try one problem');
  const panel = '[data-review-objective="' + objective.id + '"]';
  await see('A fund rises 10%', panel);
  await see('Partly demonstrated independently', panel);
  await page().type(panel + ' textarea', '100 × 1.10 × 0.90 = 99. The loss applies to the larger base.');
  await click('Send answer');
  await see('Demonstrated independently in practice', panel);
  const after = await call('course', { id });
  assert.equal(after.chapters[1].phase, 'complete');
  assert.ok(after.chapters[1].practice[0].dueAt >= now + 7 * 86400000);
  assert.deepEqual((await call('chat', addr)).results, ch.chat.results);
  await observe(
    'EQI Chapter 2 with a staged partial exam result offered one fresh problem on return. The learner submitted an unaided calculation in the UI, preserved the exam result and established a one-week due date.',
  );
  await stop();
  const later = JSON.parse(await readFile(filename, 'utf8'));
  const baseline = later.chapters[1].reviews[objective.id][0];
  const elapsed = 7 * 86400000 + 10000;
  baseline.startedAt -= elapsed;
  baseline.finishedAt -= elapsed;
  later.chapters[1].chat.examCompletedAt -= elapsed;
  await writeFile(filename, JSON.stringify(later));
  await launch();
  await click('Courses');
  await see('One-week check', '.bc-review-offer');
  await click('Try one problem');
  await see('What gain restores', panel);
  await page().type(
    panel + ' textarea',
    '25%. The investment must grow from 80 to 100, so the gain is 20/80.',
  );
  await click('Send answer');
  await see('Demonstrated independently after a week', panel);
  assert.deepEqual((await call('chat', addr)).results, ch.chat.results);
  await observe(
    'With seven elapsed days staged in the disposable history, the stock UI offered a different problem, distinguished delayed independent success and retained Chapter done. Elapsed time was simulated.',
  );
}
