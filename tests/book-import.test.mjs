import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it, before } from 'node:test';
import { extractBook } from '../src/pdf.mjs';

async function importFixture(filename) {
  const bytes = await readFile(new URL(`./fixtures/${filename}`, import.meta.url));
  return extractBook(new Uint8Array(bytes), filename);
}

describe('bookmark-free book with a separate answer key', () => {
  let book;
  before(async () => {
    book = await importFixture('weighing-evidence.pdf');
  });

  it('uses body heading destinations instead of the earlier contents entries', () => {
    assert.equal(book.title, 'Weighing Evidence');
    assert.deepEqual(
      book.pages.map((page) => page.number),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.deepEqual(
      book.chapters.map((chapter) => chapter.start),
      [3, 6],
    );
    assert.match(book.chapters[0].title, /Comparing Measurements/i);
    assert.match(book.chapters[1].title, /Recording Decisions/i);
    assert.equal(book.chapters[0].end, 5);
    assert.equal(book.chapters[1].end, 7);
  });

  it('includes the shared physical page in both units but splits their source text at the heading', () => {
    const baseline = book.chapters[0].sections.find((s) => /Baselines/i.test(s.title));
    const difference = book.chapters[0].sections.find((s) => /Differences/i.test(s.title));
    assert.ok(baseline && difference, 'Both numbered sections should be recovered');
    assert.deepEqual([baseline.start, baseline.end, difference.start], [3, 4, 4]);
    assert.match(baseline.text, /reference weight anchors/i);
    assert.doesNotMatch(baseline.text, /Subtract the baseline/i);
    assert.match(difference.text, /Subtract the baseline/i);
    assert.doesNotMatch(difference.text, /reference weight anchors/i);
  });

  it('assigns continuous prose to one unit named for its chapter and excludes the key pages', () => {
    const [section] = book.chapters[1].sections;
    assert.equal(book.chapters[1].sections.length, 1);
    assert.match(section.title, /Recording Decisions/i);
    assert.deepEqual([section.start, section.end], [6, 7]);
    assert.match(section.text, /same reasoning/i);
    assert.doesNotMatch(section.text, /Five grams/i);
    assert.deepEqual(book.chapters[1].exercises, []);
  });

  it('preserves exercise parts and pairs the exact number with the separate solution page', () => {
    const exercises = book.chapters[0].exercises;
    assert.deepEqual(
      exercises.map((exercise) => exercise.id),
      ['1.1', '1.2', '1.3'],
    );
    const [first, hintOnly, missing] = exercises;
    assert.equal(first.page, 5);
    assert.match(first.text, /Subtract four grams/i);
    assert.match(first.text, /State the units/i);
    assert.doesNotMatch(first.text, /Identify a sensible baseline|Five grams/i);
    assert.equal(first.answerPage, 8);
    assert.match(first.answer, /Five grams/i);
    assert.doesNotMatch(first.answer, /which observation came first/i);
    assert.ok(!hintOnly.answer, 'A hint alone cannot supply a published solution');
    assert.match(hintOnly.hint, /which observation came first/i);
    assert.equal(hintOnly.hintPage, 8);
    assert.ok(!missing.answer, 'The neighbouring key belongs only to 1.1');
  });
});

it('reports a damaged PDF', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\n2 0 obj\n<>broken');
  await assert.rejects(() => extractBook(bytes, 'damaged.pdf'), /PDF|damaged|invalid|unreadable|corrupt/i);
});

it('reports an all-image PDF and provides no invented readings', async () => {
  let result;
  try {
    result = await importFixture('image-only.pdf');
  } catch (error) {
    assert.match(error.message, /text|scan|readable|OCR/i);
    return;
  }
  assert.ok(!result.chapters?.length, 'An empty text layer cannot substantiate a reading');
  assert.match(JSON.stringify(result), /no (?:readable |extractable )?text|scanned|unreadable|OCR/i);
});

it('identifies the unreadable physical page in a book with mixed text and scans', async () => {
  const result = await importFixture('mixed-scan.pdf');
  assert.equal(result.pages.length, 3);
  assert.match(result.pages[0].text, /Comparing Measurements/i);
  assert.equal(result.pages[1].text.trim(), '');
  assert.match(result.pages[2].text, /Subtract the baseline/i);
  assert.match(result.warnings.join(' '), /page\s+2\b/i);
});

it('recovers simple numbered chapter titles by matching contents entries to body headings', async () => {
  const result = await importFixture('numbered-headings.pdf');
  assert.deepEqual(
    result.chapters.map((c) => [c.start, c.end]),
    [
      [2, 2],
      [3, 3],
    ],
  );
  assert.match(result.chapters[0].title, /Measuring a Trial/i);
  assert.match(result.chapters[1].title, /Interpreting a Trial/i);
});
