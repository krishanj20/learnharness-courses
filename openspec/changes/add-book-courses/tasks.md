## 1. Prove the stock-plugin path

- [ ] 1.1 From a clean stock LearnHarness installation, open a plugin-owned book view from a Courses sidebar action. Read a synthetic saved learner answer through the public learning API and run one configured-model turn. Verify the host’s existing filter lists and the Offline plans action still work.
- [ ] 1.2 Demonstrate file selection, local byte storage and an exact-page reader on the packaged desktop host with the supplied 496-page file. Use a plugin-bundled PDF reader if needed. Verify a restart with the original import path unavailable. This slice establishes feasibility before building the planner.

## 2. Import and understand the book (after 1)

- [ ] 2.1 Implement page-aware local extraction and indexed source ranges, with nested headings, printed labels and numbered exercises and solutions. Verify the sample’s 14 chapters, §1.1 shared boundary, Chapter 10 exercises and repeated Index bookmark.
- [ ] 2.2 Build chapter-sized, resumable model jobs for objectives and prerequisite concepts. Validate their citations against extracted spans. Check rendered equation pages when text loses symbols. Exercise an interrupted import, a damaged PDF, absent bookmarks, an unsectioned chapter and unreadable scanned pages with synthetic fixtures.

## 3. Recommend a personal plan (after 2)

- [ ] 3.1 Match objectives to learner-authored evidence from saved sessions and course attempts. Check the graph-only, conflicting, assisted and fully demonstrated cases against fixtures with known outcomes.
- [ ] 3.2 Implement optional diagnostics, per-chapter reasons, section-level gaps and persistent learner overrides. Verify the Chapter 3 example with two profiles and a new learner who declines placement.

## 4. Build the library and reading-first chapter chat (after 1–3)

- [ ] 4.1 List books and chapter chats. Save stable chapter identities and restore the selected section, transcript and reading acknowledgement. Check two books with identical chapter names and simultaneous opens of one chapter.
- [ ] 4.2 Open assigned pages in the local reader, wait for acknowledgement, then run the chapter’s Socratic dialogue through host inference. Verify §1.1 through the start of §1.2, an unsectioned chapter and reopening a skipped chapter.
- [ ] 4.3 Disconnect after a saved turn, close the app and reopen the book. Read the assigned pages and transcript offline. Reconnect and resume at the same step without submitting an answer twice.

## 5. Assess mastery (after 2 and 4)

- [ ] 5.1 Build an exam from chapter exercises, resolving multipart questions, answer keys elsewhere, hints and missing keys. Generate questions for an exercise-free chapter. Test each combination of question and answer provenance, including a faulty cross-reference.
- [ ] 5.2 Save attempts, scaffold a wrong answer or “don’t know” one step at a time and revisit the full problem. Verify that an independently correct alternative derivation passes and that an assisted result needs independent evidence before mastery. Restart mid-derivation and resume at the same step.

## 6. Acceptance on the example book (after 1–5)

- [ ] 6.1 In the packaged plugin on the stock host, import the local EQI draft. Compare its library and page links to example-course.md. Run Chapter 1 through a generated exam, Chapter 2 through a book exercise and Chapter 10 through discovery of its embedded exercises.
- [ ] 6.2 Run the same plugin with a small synthetic book containing a back-of-book key and with no prior learner sessions. Check the key pairing, independent retry and local resume. Run the existing offline-plan smoke path on the same installation.

## Implementation notes and evidence

- **Stock plugin boundary.** The installed desktop app reports version 0.6.1. Its public SDK declares sidebar action placement, plugin views, saved-session reads, a plugin data directory and host-configured inference. The host owns the three native filters. Chapter chats therefore live inside the plugin view. Use the host’s teaching methodology to guide dialogue and judge the resulting transcripts during acceptance. [Sidebar source](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/components/sidebar.tsx) · [Public plugin contracts](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/src/core/plugins.ts) · [Teaching methodology](https://github.com/amosblomqvist/learnharness/blob/cb25c8e49b85eed9e78315584731cad73a0118a6/docs/teaching-methodology.md)
- **Import.** Keep the original PDF and map each reading span to one-based physical pages, optional printed labels and start/stop headings. Read bookmarks and body text, using contents entries to cross-check. Store section summaries, objectives and exercise IDs with their source spans. Analyse in chapter-sized batches so each call receives the relevant text and selected equation images. The public file-to-Markdown helper returns text and notices. The page map and local reader need a separate proof on the target host.
- **Progress.** Key each chapter by its course and stable outline identity. Store page references, reading confirmations, ordered learner/tutor turns, exam attempts and guidance received in plugin data. Checkpoint one transition at a time, using a stable turn ID to reconcile retries. Keep the learner’s decision separate from the placement recommendation and both separate from exam evidence.
- **Feedback quality.** Check generated derivations against the source assumptions and verify the result using a second derivation, substitution or worked case as appropriate. Allow valid alternatives. If the solution is still uncertain, withhold grading for that item and give the learner another assessable question. The exam summary groups evidence by objective so a correct short answer cannot conceal a gap in an unrelated skill.
- **Release precedent.** The separately packaged Offline plans plugin starts from a saved teaching plan and prepares content in advance. Courses starts from an imported book and offers live dialogue. It uses its own storage. [Offline plans repository](https://github.com/krishanj20/learnharness-offline-plans)
