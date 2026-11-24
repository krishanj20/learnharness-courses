// See report/verification-live.md for prerequisites and the three scenarios.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { startFixture } from './live-provider.mjs';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(import.meta.dirname, '..');
const env = process.env;
const app = env.COURSES_APP || '/Applications/LearnHarness.app';
const binary = path.join(app, 'Contents/MacOS/LearnHarness');
const offlineDist = env.COURSES_OFFLINE_DIST;
const offlineFixture = env.COURSES_OFFLINE_FIXTURE || path.join(repo, 'tests/live-offline-fixture');
const source = env.COURSES_PDF;
assert.ok(offlineDist, 'Set COURSES_OFFLINE_DIST to the Offline plans release dist directory.');
const resolve = createRequire(import.meta.url);
const puppeteerFile = env.COURSES_PUPPETEER || resolve.resolve('puppeteer-core', { paths: [repo] });
const { default: puppeteer } = await import(pathToFileURL(puppeteerFile));
const hostOnly = process.argv.includes('--host-only');
const syntheticOnly = process.argv.includes('--synthetic');
const reviewPilot = process.argv.includes('--review-pilot');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'courses-desktop-'));
const profile = path.join(scratch, 'profile');
const data = path.join(profile, 'data');
const selected = path.join(scratch, 'selected.pdf');
const result = { started: new Date().toISOString(), app, observations: [] };
const learnerAnswer =
  'The Sharpe ratio divides expected excess return by the standard deviation of excess returns. At equal expected excess returns higher volatility reduces the ratio.';
let desktop, browser, page, fixture;
async function observe(label, value = true) {
  result.observations.push({ label, value });
  await writeFile(path.join(scratch, 'observations.json'), JSON.stringify(result, null, 2));
  console.log(label, value);
}
async function eventually(operation, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let failure;
  while (Date.now() < deadline) {
    try {
      return await operation();
    } catch (error) {
      failure = error;
      await delay(250);
    }
  }
  throw failure;
}
async function launch(offline = false) {
  const args = [
    '--user-data-dir=' + profile,
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
  ];
  const seatbelt =
    '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
  const command = offline ? '/usr/bin/sandbox-exec' : binary;
  if (offline) args.unshift('-p', seatbelt, binary, '--no-sandbox');
  desktop = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [desktop.stderr, desktop.stdout])
    stream.on('data', (chunk) => {
      output = (output + chunk).slice(-24000);
    });
  browser = await eventually(async () => {
    if (desktop.exitCode !== null) throw Error('Desktop exited. ' + output.slice(-500));
    const port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    return await puppeteer.connect({
      browserURL: 'http://127.0.0.1:' + port,
      defaultViewport: null,
    });
  });
  page = await eventually(async () => {
    const target = (await browser.pages()).find((p) => /^http:\/\/127\.0\.0\.1:/.test(p.url()));
    assert.ok(target, 'Waiting for stock renderer: ' + output.slice(-500));
    return target;
  });
  page.setDefaultTimeout(20_000);
  // The desktop-scoped API is only accessible inside a host-owned window.
  const inventory = await api('/api/plugins');
  assert.equal(
    await realpath(inventory.directory),
    await realpath(path.join(data, 'plugins')),
    'Refuse a non-disposable profile',
  );
  if (offline) {
    const check = spawn('/usr/bin/sandbox-exec', [
      '-p',
      seatbelt,
      process.execPath,
      '-e',
      'const n=require("node:net");const out=n.connect(443,"1.1.1.1");out.on("connect",()=>process.exit(3));out.on("error",e=>{if(!["EPERM","EACCES"].includes(e.code))process.exit(4);const local=n.connect(Number(process.argv[1]),"127.0.0.1");local.on("connect",()=>local.end());});',
      new URL(page.url()).port,
    ]);
    assert.equal((await once(check, 'exit'))[0], 0, 'Network isolation preflight');
  }
}
async function stop() {
  if (browser) await browser.disconnect();
  browser = undefined;
  if (desktop && desktop.exitCode === null && desktop.signalCode === null) {
    const done = once(desktop, 'exit');
    desktop.kill('SIGTERM');
    await done;
  }
  desktop = undefined;
}
async function api(endpoint, method = 'GET', payload) {
  return page.evaluate(
    async (endpoint, method, payload) => {
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      const value = await response.json();
      if (!response.ok)
        throw Error(endpoint + ': ' + response.status + ' ' + JSON.stringify(value).slice(0, 220));
      return value;
    },
    endpoint,
    method,
    payload,
  );
}
async function click(name) {
  if (['Book PDF', 'Offline course lesson'].includes(name)) {
    const more = await page.evaluate(name => {
      const visible = [...document.querySelectorAll('header button')].some(b => b.innerText.trim() === name);
      return !visible && !!document.querySelector('button[aria-label="More plugin actions"][aria-expanded="false"]');
    }, name);
    if (more) await page.click('button[aria-label="More plugin actions"]');
  }
  const found = await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('button')].find(
        (button) =>
          !button.disabled && !button.closest('[aria-busy="true"]') &&
          (button.textContent.trim() === name || button.getAttribute('aria-label') === name ||
            (button.closest('[data-testid="question-dock"]') && button.innerText.trim().split(/\n+/).at(-1) === name)),
      ),
    {},
    name,
  );
  await found.evaluate((button) => button.click());
  await found.dispose();
}
async function see(text, selector = 'body') {
  await page.waitForFunction(
    (selector, text) => document.querySelector(selector)?.innerText.includes(text),
    {},
    selector,
    text,
  );
}
async function prepare() {
  await mkdir(path.join(data, 'chats'), { recursive: true });
  const time = new Date().toISOString();
  for (const kind of syntheticOnly ? [] : ['teach', 'practice']) {
    const record = {
      version: 2,
      id: 'course_test_' + kind,
      title: 'Test ' + kind,
      kind,
      createdAt: time,
      updatedAt: time,
      messages: [
        {
          id: 'prompt',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'How do volatility, excess returns and the Sharpe ratio affect performance?',
            },
          ],
          timestamp: Date.now() - 1,
        },
        { id: 'answer', role: 'user', content: learnerAnswer, timestamp: Date.now() },
      ],
    };
    await writeFile(path.join(data, 'chats', record.id + '.json'), JSON.stringify(record));
  }
  await cp(offlineDist, path.join(data, 'plugins/offline-plans/dist'), { recursive: true });
  await cp(offlineFixture, path.join(data, 'plugins/offline-plans/data/courses'), {
    recursive: true,
  });
  if (!hostOnly) {
    const installed = path.join(data, 'plugins/book-courses/dist');
    await cp(path.join(repo, 'dist'), installed, {
      recursive: true,
    });
    result.packageSHA256 = {};
    for (const name of ['main.js', 'backend.cjs']) {
      result.packageSHA256[name] = createHash('sha256')
        .update(await readFile(path.join(installed, name)))
        .digest('hex');
    }
    const book = syntheticOnly ? path.join(repo, 'tests/fixtures/weighing-evidence.pdf') : source;
    assert.ok(book, 'Set COURSES_PDF to the local EQI draft');
    await cp(book, selected);
  }
  if (!hostOnly) fixture = await startFixture();
}
async function enableAndCheckHost() {
  for (const id of hostOnly ? ['offline-plans'] : ['book-courses', 'offline-plans']) {
    await api('/api/plugins/' + id, 'PUT', { enabled: true });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (syntheticOnly || process.argv.includes('--offline-availability')) return;
  await see('Test practice');
  for (const kind of ['teach', 'practice', 'all']) {
    const filter = await page.waitForSelector('[data-testid="kind-filter-' + kind + '"]');
    await filter.evaluate((el) => el.click());
    const expected = kind === 'all' ? ['Test practice', 'Test teach'] : ['Test ' + kind];
    console.log('Checking filter', kind);
    await page.waitForFunction(
      (expected) => {
        const lines = document.body.innerText.split('\n').map(s => s.trim());
        return ['Test practice', 'Test teach'].every(title => lines.includes(title) === expected.includes(title));
      },
      {},
      expected,
    );
  }
  await observe('Native filters showed only the selected kinds');
  await click('Offline plans');
  await click('Probability for offline study');
  await see('3 of 3 lessons completed', '.offline-plans');
  await observe('Offline plans opened its saved three-lesson probability course');
}
try {
  console.log('Isolated profile and observations:', scratch);
  await prepare();
  await launch();
  if (fixture) {
    await page.evaluate(async (settings) => {
      const cfg = await fetch('/api/custom-provider');
      const connected = await fetch('/api/custom-provider', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'if-match': cfg.headers.get('etag') },
        body: JSON.stringify({ baseUrl: settings.customProvider.baseUrl, authMode: 'keyless' }),
      });
      if (!connected.ok) throw Error('Fixture connection: ' + (await connected.text()));
      const changed = await fetch('/api/settings/models', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings.models),
      });
      if (!changed.ok) throw Error('Fixture model: ' + (await changed.text()));
    }, fixture.settings);
  }
  await enableAndCheckHost();
  if (!hostOnly) {
    const { runCourseChecks, runSyntheticChecks } = await import('./live-course-checks.mjs');
    const run = reviewPilot ? (await import('./live-review-pilot.mjs')).runReviewPilot : syntheticOnly ? runSyntheticChecks : runCourseChecks;
    await run({
      page: () => page,
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
    });
  }
} catch (error) {
  const visible = await page
    ?.evaluate(() => document.body.innerText.slice(0, 2000))
    .catch(() => '');
  console.error(visible || '');
  throw error;
} finally {
  await stop();
  fixture?.close();
}
