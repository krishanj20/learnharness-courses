## Why

A learner with a textbook wants to spend time on the chapters that teach them something new. LearnHarness already offers Socratic teaching and can prepare an existing plan for offline study. Courses would start with the book, identify what the learner can already do and keep the reading, conversation and exam together.

## What Changes

Choose **Courses → Create course**, select a PDF and review a chapter-by-chapter reading plan. Open a book to see one resumable chat per chapter. Each chat assigns the next section before teaching it. At chapter end the tutor assesses mastery, starting with the book’s own exercises and using smaller questions when the learner gets stuck.

## Capabilities

### New Capabilities

- `book-import` extracts a page-linked outline, learning objectives and exercise locations.
- `chapter-recommendations` explains which chapters to cover or skip and lets the learner change the plan.
- `course-library` groups chapter chats under their book in Courses.
- `reading-first-lessons` teaches each chapter in the book’s section order.
- `chapter-exams` tests independent mastery, supports guided retries and records the outcome.

### Modified Capabilities

None. The learner opens Courses from a plugin action in the stock sidebar. Teaching, Practice and All keep their host-defined session lists.

## Impact

The agreed delivery is a standalone plugin for the stock desktop host. Imported pages and saved progress are available offline. Planning and live tutoring may use the configured model. Relevant learner answers and an optional short diagnostic inform chapter recommendations. See the [design](design.md), [example course](example-course.md) and [implementation checklist](tasks.md).
