import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import { extractBook } from '../src/pdf.mjs';

// Expectations from the second edition's contents and Chapter 2 page headings.
it(
  'imports numbered chapters across part dividers and the eight Mean Reversion lessons',
  {
    skip: !process.env.FIXED_INCOME_PDF && 'Set FIXED_INCOME_PDF to the 2024 second edition',
  },
  async () => {
    const book = await extractBook(await readFile(process.env.FIXED_INCOME_PDF));
    assert.equal(book.pages.length, 430);
    assert.match(book.title, /^Fixed Income Relative Value Analysis/);
    assert.deepEqual(
      book.chapters.map((c) => c.start),
      [14, 30, 64, 124, 150, 156, 162, 180, 196, 200, 206, 226, 246, 278, 284, 300, 320, 334, 348, 398],
    );
    assert.equal(book.chapters[2].title, 'Principal Component Analysis');
    assert.equal(book.chapters[11].title, 'Asset Swaps');
    assert.equal(book.chapters[0].end, 27);
    assert.equal(book.chapters[3].end, 147);
    assert.equal(book.chapters.at(-1).end, 405);
    const chapter = book.chapters[1];
    assert.equal(chapter.title, 'Mean Reversion');
    assert.equal(chapter.end, 63);
    assert.equal(book.pages[chapter.start - 1].label, '17');
    assert.deepEqual(
      chapter.sections.map((s) => s.start),
      [30, 37, 43, 46, 50, 55, 56, 63],
    );
    assert.match(chapter.sections[3].title, /CONDITIONAL EXPECTATIONS AND PROBABILITY DENSITIES/);
    assert.ok(
      chapter.sections.some((s) => s.subsections.some((sub) => sub.title === 'Mathematical Definitions')),
    );
    assert.equal(chapter.exercises.length, 0);
  },
);
