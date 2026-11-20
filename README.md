# LearnHarness Courses

Turn a searchable PDF into a personal course in stock LearnHarness. Open **Courses** in the sidebar, choose a book and see a chapter-by-chapter recommendation based on what you’ve already demonstrated.

## Install

Download the [Courses plugin ZIP](downloads/book-courses-0.1.3.zip). Extract the **book-courses** folder into the directory shown in **Settings → Community plugins**, choose **Refresh plugins**, then enable **Courses**. The plugin targets LearnHarness 0.6.1 and plugin API 1.

## Study a book

1. Choose **Courses → Create course** and select the PDF. Check the chapter outline and any page warnings. The plugin saves a local copy so you can move the original.
2. Choose **Prepare course plan** for the whole book, or open a chapter and prepare just that chapter. Each section has a lesson in its chapter. The plan shows its section objectives, supporting topics, source passages and placement evidence. You can change **Cover** or **Skip**, or try a diagnostic.
3. Open the assigned pages and scroll. The first lesson starts with the chapter introduction. Each reading shows printed and physical PDF page numbers, plus the heading where you should stop. Confirm the reading to start a Socratic dialogue. Choose **Finish lesson and start next lesson** after demonstrating the current material. The completed lesson is marked **Done** and keeps its discussion for review. Choose **Back to chapters** from a lesson or PDF page to switch chapters. From the chapter list, **Back to all courses** opens your library.
4. Find **Chapter exam** beneath the chapter’s lesson list. You can preview the original question pages immediately. **Start chapter exam** appears when all lessons are done. Finishing it marks the chapter **Done** in the chapter list. It uses the book’s exercises when available, including exercises embedded in the chapter. The tutor uses a matched book solution or derives and checks a solution. Chapters without exercises receive original questions. After a guided solution, a fresh question tests whether you can apply the idea independently.

The PDF, imported outline, chat and progress are stored in the plugin’s local data directory. Preparing a plan and using the live tutor send the relevant book material, including selected page images, to the model configured in LearnHarness. Placement can also use relevant prior learner answers. With no connection you can read saved pages and transcripts. An interrupted answer can be retried from its saved position.

## Book support

The importer uses bookmarks, contents and visible headings to recover the chapter structure. A chapter without section headings gets one reading. Image-only PDFs need a searchable text layer. Inspect the original page when a formula depends on layout. The app marks unresolved equation references and unverified questions for review.

## Build and test

Use Node 22.13 or later. From the repository root, run:

```sh
npm ci
npm test
npm run build
python3 scripts/package.py
```

The public fixtures include small synthetic books with a shared section page, a separate answer key and scanned pages. To also run the example-book acceptance checks, set `EQI_PDF` to your own copy of the 14 August 2024 draft of *The Elements of Quantitative Investing*:

```sh
EQI_PDF="/path/to/EQI_20240814.pdf" npm test
```

Set `FIXED_INCOME_PDF` to a local copy of the 2024 second edition of *Fixed Income Relative Value Analysis* to include the alternative-book test in the same run. It checks all 20 chapter starts and the unnumbered lessons in *Mean Reversion*.

The [book verification](verification/book.md) documents comparisons with the original PDF. The [curriculum audit](verification/curriculum.md) maps the saved example course to all 14 chapters. The [stock desktop checks](report/verification-live.md) distinguish scripted model tests from live tutor observations. See the [OpenSpec proposal](openspec/changes/add-book-courses/proposal.md) for the feature requirements.
