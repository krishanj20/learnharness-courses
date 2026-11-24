import test from 'node:test';
import assert from 'node:assert/strict';
import { pageReferences } from '../src/page-references.mjs';

test('only physical PDF references link, and a range opens its first page', () => {
  const text =
    'Printed p. 240 (PDF p. 244), PDF pp. 243–245, PDF page 8, pdf pages 7-9; PDF p. 0 and PDF p. 999.';
  assert.deepEqual(
    pageReferences(text, 496).map(({ start, end, page }) => [text.slice(start, end), page]),
    [
      ['PDF p. 244', 244],
      ['PDF pp. 243–245', 243],
      ['PDF page 8', 8],
      ['pdf pages 7-9', 7],
    ],
  );
});
