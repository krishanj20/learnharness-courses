import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openTeaching } from '../src/open-teaching.mjs';
import { registerTeaching } from '../src/native-teaching.mjs';
import { extractBook } from '../src/pdf.mjs';

const example = process.env.EQI_PDF;
for (const [title, pdf, chapterIndex, sectionIndex, requested] of [
  ['synthetic book', new URL('./fixtures/weighing-evidence.pdf', import.meta.url), 0, 0, null],
  ['EQI Chapter 2 GARCH', example, 1, 1, 70],
]) {
  test(
    'native opening provides source before tool use and restricts original PDF images: ' + title,
    { skip: !pdf && 'Set EQI_PDF to the local draft' },
    async (t) => {
      const dataDirectory = await mkdtemp(join(tmpdir(), 'teaching-page-'));
      t.after(() => rm(dataDirectory, { recursive: true, force: true }));
      const bytes = await readFile(pdf);
      const id = createHash('sha256').update(bytes).digest('hex');
      await mkdir(join(dataDirectory, id));
      await copyFile(pdf, join(dataDirectory, id, 'book.pdf'));
      const book = await extractBook(new Uint8Array(bytes), 'book.pdf');
      const chapter = book.chapters[chapterIndex];
      const sessionId = 'previous-teaching-session';
      const key = sectionIndex + 1 + '.1';
      const state = {
        title: book.title,
        chapters: book.chapters.map((ch) => ({
          ...ch,
          objectives: [],
          chat: { section: sectionIndex, phase: 'reading', rev: 0 },
        })),
      };
      state.chapters[chapterIndex].teaching = { [key]: { sessionId } };
      const handles = {};
      let factory;
      registerTeaching(
        {
          dataDirectory,
          signal: new AbortController().signal,
          learning: {
            getSession: (id) =>
              id === sessionId ? { id: sessionId, title: 'Previously linked session', messages: [] } : null,
            listSessions: () => [],
          },
          handle: (name, fn) => (handles[name] = fn),
          registerTools: (spec) => (factory = spec.create),
        },
        { state: () => state, book: () => book, save: () => {}, ids: () => [id], busy: new Set() },
      );
      const { opening } = handles['teaching-start']({ id, chapter: chapterIndex, key });
      const tools = factory({ chatId: sessionId, agent: 'teacher' });
      const read = tools.find((tool) => tool.name === 'course_reading');
      const view = tools.find((tool) => tool.name === 'course_page');
      const { assigned } = JSON.parse((await read.execute()).content[0].text);
      const { page, text } = assigned.pages.find(
        (p) => p.text.trim() && (!requested || p.page === requested),
      );
      // The first model turn contains book prose even if it never calls course_reading.
      assert.ok(opening.includes(assigned.pages.find((p) => p.text.trim()).text.slice(0, 100)));
      assert.match(opening, /Assigned book reading\n/);
      assert.deepEqual(factory({ chatId: 'unrelated', agent: 'teacher' }), []);
      await assert.rejects(view.execute('bad', { page: chapter.end + 1 }), /assigned reading/);
      const result = await view.execute('view', { page });
      assert.equal(result.details.page, page);
      const image = result.content.find((part) => part.type === 'image');
      assert.equal(image.mimeType, 'image/png');
      const png = Buffer.from(image.data, 'base64');
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(png.readUInt32BE(16) > 400 && png.readUInt32BE(20) > 600);
      if (requested) assert.match(text, /\(2\.5\)/);
    },
  );
}

test('an unstarted session adopts the page-grounded opener while host recovery drafts survive', async (t) => {
  const storage = new Map();
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks: { request: async (_key, fn) => fn() } },
  });
  t.after(() => {
    if (oldStorage) Object.defineProperty(globalThis, 'sessionStorage', oldStorage);
    else delete globalThis.sessionStorage;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  });
  const id = 'existing';
  const key = 'lh.openingPrompt.' + id;
  const opening = 'Assigned book reading\nPDF p. 1\nWorked example.';
  const ctx = {
    call: async () => ({ sessionId: id, started: false, opening }),
    app: { openSession: (session) => assert.equal(session, id) },
  };
  for (const previous of [
    null,
    JSON.stringify({ text: 'old opening', attempted: false }),
    JSON.stringify({ text: 'saved draft', attempted: true }),
    'legacy draft',
  ]) {
    storage.set(key, previous);
    await openTeaching(ctx, { id: 'course', chapter: 0, key: '1.1' });
    const preserved = previous === 'legacy draft' || previous?.includes('"attempted":true');
    assert.equal(
      storage.get(key),
      preserved ? previous : JSON.stringify({ text: opening, attempted: false }),
    );
  }
});
