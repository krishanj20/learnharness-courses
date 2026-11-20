import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { before, describe, it } from 'node:test';
import { extractBook } from '../src/pdf.mjs';
import { planningSource, sectionContext } from '../src/model.mjs';

// The publisher's draft is a local acceptance input. Keep it outside the repository.
const path = process.env.EQI_PDF;
const expectedChapters = [
  ['The Map and the Territory', 33],
  ['Returns: Properties and Models', 57],
  ['What is Performance?', 101],
  ['Linear Models of Returns', 109],
  ['Evaluating Excess Returns', 151],
  ['Evaluating Risk', 179],
  ['Fundamental Factor Models', 195],
  ['Statistical Factor Models', 241],
  ['Portfolio Management: The Basics', 295],
  ['Beyond Simple Mean-Variance', 337],
  ['Market-Impact-Aware Portfolio Management', 369],
  ['Hedging', 391],
  ['Dynamic Risk Allocation', 409],
  ['Ex Post Performance Attribution', 433],
];

function titleWords(title) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^(chapter\s+)?\d+[.:\s-]+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function headings(nodes) {
  return nodes.flatMap((node) => [
    node,
    ...headings(node.children ?? node.subsections ?? node.sections ?? []),
  ]);
}

describe('14 August 2024 EQI draft', { skip: !path && 'Set EQI_PDF to the local draft' }, () => {
  let book;
  before(async () => {
    book = await extractBook(new Uint8Array(await readFile(path)), basename(path));
  });

  it('recovers the title from the title page and every numbered chapter exactly once', () => {
    assert.equal(titleWords(book.title), 'the elements of quantitative investing');
    assert.equal(book.pages.length, 496);
    assert.deepEqual(
      book.chapters.map((chapter) => [titleWords(chapter.title), chapter.start]),
      expectedChapters.map(([title, page]) => [titleWords(title), page]),
    );
    assert.ok(book.chapters.at(-1).end < 463, 'Both copies of the Index bookmark should be excluded');
  });

  it('assigns printed pp. 7–9 to §1.1 and stops where §1.2 begins on physical page 37', () => {
    const [securities, exchange] = book.chapters[0].sections;
    assert.match(securities.title, /the securities/i);
    assert.match(exchange.title, /modes of exchange/i);
    assert.deepEqual([securities.start, securities.end, exchange.start], [35, 37, 37]);
    assert.deepEqual(
      book.pages.slice(34, 37).map((p) => [p.number, String(p.label)]),
      [
        [35, '7'],
        [36, '8'],
        [37, '9'],
      ],
    );
    assert.match(securities.text, /Trading and liquidity are at the core/i);
    assert.doesNotMatch(securities.text, /At any given time, economic agents/i);
    assert.match(exchange.text, /At any given time, economic agents/i);
    assert.doesNotMatch(exchange.text, /Trading and liquidity are at the core/i);
  });

  it('locates both nested market-participant headings within Chapter 1', () => {
    const parent = book.chapters[0].sections.find((s) => /Who Are the Market Participants/i.test(s.title));
    assert.ok(parent);
    const [, ...nested] = headings([parent]);
    assert.deepEqual(
      nested.map((s) => [titleWords(s.title), s.start]),
      [
        ['the sell side', 39],
        ['the buy side', 43],
      ],
    );
  });

  it('reproduces every labelled exercise and its source page across the 14 chapters', () => {
    const exercisePages = new Map([
      [2, [99, 99, 99, 99, 99]],
      [4, [140, 147, 148, 148, 149, 149]],
      [8, [286, 286, 286, 286, 286, 286, 286, 287, 287, 287, 288, 289, 289]],
      [10, [355, 361]],
      [12, [397, 397, 398, 405]],
    ]);
    for (const [index, chapter] of book.chapters.entries()) {
      const number = index + 1;
      const expected = (exercisePages.get(number) ?? []).map((page, i) => [number + '.' + (i + 1), page]);
      assert.deepEqual(
        chapter.exercises.map((e) => [e.id, e.page]),
        expected,
        'Chapter ' + number,
      );
    }
  });

  it('distinguishes exercise-free Chapter 1 and an unresolved reference in Chapter 2', () => {
    assert.deepEqual(book.chapters[0].exercises, []);
    const exercises = book.chapters[1].exercises;
    const proof = exercises.find((e) => e.id === '2.1');
    assert.equal(proof?.page, 99);
    assert.match(proof.text, /prove that/i);
    assert.ok(!proof.answer, 'An unpaired exercise has no published answer');
    assert.ok(exercises.find((e) => e.id === '2.4')?.blocked, 'Equation (??) needs clarification');
    const jensen = exercises.find((e) => e.id === '2.5');
    assert.match(jensen.hint, /Jensen/i);
    assert.equal(jensen.hintPage, 99);
    assert.ok(!jensen.answer, 'The inline Jensen hint is not a solution');
  });

  it('retains chapter opening questions and closing takeaways on their source pages', () => {
    const [first, second] = book.chapters;
    assert.match(book.pages[first.start - 1].text, /What are the sources of excess returns/i);
    assert.match(book.pages[first.end - 1].text, /The Takeaways/i);
    assert.match(book.pages[second.end - 1].text, /Security returns exhibit heavy tails/i);
    const planning = planningSource(book, first);
    assert.match(planning.opening, /What are the sources of excess returns/i);
    assert.match(planning.closing, /The Takeaways/i);
  });

  it('teaches the entire Chapter 2 introduction before §2.1, including the shared heading page', () => {
    const ch = book.chapters[1];
    const context = sectionContext(book, ch, 0);
    assert.match(context.reading, /How do we define returns for equities/i);
    assert.match(context.reading, /These models will be your friends for life/i);
    assert.match(context.reading, /2\.1\.1\. Definitions/);
    assert.doesNotMatch(sectionContext(book, ch, 1).reading, /These models will be your friends for life/i);
  });

  it('finds embedded Exercise 4.1 and retains its third part without the following subsection', () => {
    const [question] = book.chapters[3].exercises;
    assert.equal(question.id, '4.1');
    assert.equal(question.page, 140);
    assert.match(question.text, /3\.\s*From this, show/i);
    assert.doesNotMatch(question.text, /Linear Regression Decomposition/i);
  });

  it('retains the third part of 4.2 across its page break and separates the plain-text hint in 4.3', () => {
    const [, multipart, hinted] = book.chapters[3].exercises;
    assert.deepEqual([multipart.page, multipart.endPage], [147, 148]);
    assert.match(multipart.text, /3\.\s*\(10\)\s*Say that a random vector/i);
    assert.doesNotMatch(multipart.text, /Figure 4\.6/i);
    assert.match(hinted.hint, /one-factor model/i);
    assert.equal(hinted.hintPage, 148);
  });

  it('keeps numbered instructions within the 13 Chapter 8 exercises and follows continuations', () => {
    const exercises = book.chapters[7].exercises;
    assert.deepEqual(
      exercises.map((e) => e.id),
      Array.from({ length: 13 }, (_, i) => '8.' + (i + 1)),
    );
    assert.deepEqual([exercises[6].page, exercises[6].endPage], [286, 287]);
    assert.match(exercises[6].text, /all the eigenvalues/i);
    assert.match(exercises[7].text, /How would you extend it to find the SVD of R/i);
    assert.doesNotMatch(exercises[7].hint ?? '', /How would you extend it/i);
    assert.deepEqual([exercises[12].page, exercises[12].endPage], [289, 290]);
    assert.doesNotMatch(exercises[12].text, /Figure 8\.8|During The Trade/i);
  });

  it('retains both embedded Chapter 10 exercises and the end of the fourth proof', () => {
    const exercises = book.chapters[9].exercises;
    assert.deepEqual(
      exercises.map((e) => [e.id, e.page]),
      [
        ['10.1', 355],
        ['10.2', 361],
      ],
    );
    assert.match(exercises[0].text, /applicability to real-world/i);
    assert.match(exercises[1].text, /trivially bounded by/i);
    assert.doesNotMatch(exercises[0].text, /Insight 10\.3/);
    assert.doesNotMatch(exercises[1].text, /Theorems on Sharpe|This exercise shows/i);
  });

  it('links the published proof of 12.1 in the chapter appendix without disclosing it in 12.4', () => {
    const exercises = book.chapters[11].exercises;
    const proof = exercises.find((e) => e.id === '12.1');
    assert.equal(proof.page, 397);
    assert.equal(proof.answerPage, 405);
    assert.match(proof.answer, /replace the decision variable/i);
    assert.match(proof.answer, /function becomes/i, 'The proof continues on page 406');
    assert.doesNotMatch(proof.answer, /After the Trade|Chapter 13/i);
    const hedge = exercises.find((e) => e.id === '12.4');
    assert.equal(hedge.page, 405);
    assert.doesNotMatch(hedge.text, /Proof of Exercise 12\.1|replace the decision variable/i);
    const oneFactor = exercises.find((e) => e.id === '12.2');
    assert.equal(oneFactor.endPage, 397);
    assert.match(oneFactor.text, /exposure of the core portfolio to that factor\./i);
    assert.doesNotMatch(oneFactor.text, /In the simplistic hedging procedures/i);
  });
});
