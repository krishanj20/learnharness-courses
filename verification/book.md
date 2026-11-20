# Book import verification

The expectations below were recorded on 20 November 2026 before inspecting the importer. They apply to the approved book-import requirements and the sample course in `openspec/changes/add-book-courses`.

| Source | Observation the importer must reproduce | Check |
| --- | --- | --- |
| EQI title page, outline and printed labels | The title is on PDF p. 3. Fourteen numbered chapters begin on PDF pp. 33, 57, 101, 109, 151, 179, 195, 241, 295, 337, 369, 391, 409 and 433. The Index appears twice in the bookmarks at p. 463. | Compare every chapter title and physical start and check that Chapter 14 ends before the index. |
| EQI PDF pp. 35–39 | §1.1 spans PDF pp. 35–37, printed pp. 7–9. Its final paragraph discusses trading and liquidity. §1.2 starts on the same page and discusses what economic agents want to buy or sell. | Compare both page ranges and check which section contains each paragraph. |
| EQI outline and body, PDF pp. 39 and 43 | The Sell Side and The Buy Side sit under §1.3, both within Chapter 1. | Find both subheadings and their page links in the hierarchy. |
| EQI Chapter 1 and PDF p. 99 | Chapter 1 has no numbered exercises. Exercise 2.1 asks for a proof. Exercise 2.4 prints an unresolved equation reference. Exercise 2.5 includes a hint. | Check exercise presence, source page and unresolved status. |
| EQI PDF pp. 355 and 361 | Chapter 10 has two embedded exercises. Exercise 10.2 asks for four proofs, ending with a statement about the Sharpe ratio. | Check both IDs, pages, and the final part of 10.2. |
| Synthetic text PDF | Contents appear before the body, two reading units share a page, and Chapter 2 has continuous prose. | Check body page numbers, the shared page, section contents and the single unit for Chapter 2. |
| Synthetic exercise appendix | Exercise 1.1 has two parts, its solution is in a separate key, Exercise 1.2 has a hint, and Exercise 1.3 has no supplied answer. | Check the source question, solution and page, and that a hint or neighbouring answer cannot become a published answer. |
| Scanned and damaged inputs | An image-only PDF and damaged bytes must surface an import error or an affected-page notice, with no invented readings. | Run both through the normal extraction API. |

## Independent source check

The sample was read locally with pypdf and inspected with pdfinfo. It is the 496-page draft of 14 August 2024, SHA-256 `0cd8b44956eb5ad2c6a4351421ff126ec2866651e2eae6e4c97766110bd7a124`. The PDF metadata title is empty. The relevant exercise text and page labels were checked directly against the body. The sample is external to the repository. Set `EQI_PDF` to its path to include it in a local acceptance run.

A second pass through the actual pages established these additional checks.

- Thirty body exercises have explicit labels. Their chapter counts are 5, 6, 13, 2 and 4 in Chapters 2, 4, 8, 10 and 12 respectively. The acceptance test matches all 30 IDs and physical pages.
- Exercise 4.1 appears before the exercises section on p. 140 and has three parts. Exercise 8.7 continues from p. 286 onto p. 287, Exercise 8.8 contains two individually hinted tasks, and Exercise 8.13 ends with equations on p. 290. Figures start on p. 291.
- Exercise 12.1 on p. 397 refers to a published proof beginning on p. 405 and continuing on p. 406. Exercise 12.4 precedes that proof. Its question must exclude the proof.
- The opening questions on p. 33 and the closing takeaways on p. 56 should reach the Chapter 1 planning input. Chapter 2 ends with takeaways on p. 100.
- The rendered p. 99 confirms the compounded-return inequality in 2.1, the printed unresolved equation in 2.4, and the Jensen hint in 2.5. Flattened mathematical text loses the vertical alignment of indices and exponents. The original page is the visual reference.
- The same page was rendered independently with Poppler and with the plugin's `openPdf` function, PDF.js and a native Node canvas at 857 × 1109 pixels. Both show the product and sum in 2.1, their bounds and superscripts, and the epsilon in 2.5 that the text layer decodes as a control character.
- A second bookmark-free fixture uses numbered chapter titles without the word “Chapter”. Its contents page gives both titles and destinations. Another fixture puts a scan between two readable pages to check that the notice identifies physical page 2.

## Run

Run `EQI_PDF="/path/to/EQI_20240814.pdf" node --test tests/book*.test.mjs` from the project directory. The synthetic PDFs and damaged bytes exercise the same extraction API as the real book. Tests run in memory and do not create a library entry or contact a model.

On 20 November 2026 at 11:04 UTC all 19 tests passed on macOS 26.6 arm64, Node v25.8.1 and PDF.js 6.3.289, with the original EQI draft present. The importer SHA-256 began `d0b1b42e954e` and the chapter-planning source began `280875e166b7`. No case was skipped.

Earlier runs caught appendix pages included in a chapter assignment, hints attached to the wrong question, duplicate exercise IDs created from numbered subparts, questions truncated when two hints were present, an overlooked published proof, and surrounding prose attached to an exercise. Repeating the same checks after the fixes confirmed that Exercise 4.2 resumes with its third part after the unrelated Figure 4.6, 4.3 keeps its plain-text hint, and 12.2 stops before the commentary beneath it.

## Remaining scope

The tests establish the observed IDs, ranges, readings, hints and proof pairings above. The actual desktop reader, saved chapter state, configured tutor and grading quality require separate end-to-end checks. The extraction tests cannot show whether a model correctly understands a rendered equation.
