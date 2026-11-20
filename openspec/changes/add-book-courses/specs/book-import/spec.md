## ADDED Requirements

### Requirement: Page-linked book structure
Import SHALL preserve the selected PDF locally, recover its title and ordered chapter/section hierarchy, and attach verifiable reading spans to proposed objectives.

#### Scenario: Nested headings and shared pages
- **WHEN** the EQI draft is imported
- **THEN** its 14 numbered chapters are offered once each, and §1.1 opens PDF pages 35–37 with printed labels 7–9 and stops at the §1.2 heading

#### Scenario: No bookmarks
- **WHEN** a text PDF has a contents page and body headings but no bookmarks
- **THEN** the outline is reconstructed against body pages and uncertain boundaries are flagged for review

#### Scenario: No subheadings
- **WHEN** a chapter has continuous prose
- **THEN** one reading unit covers the chapter with its original title and a valid page range

#### Scenario: Misleading document text
- **WHEN** a PDF contains a request to contact the author
- **THEN** the text is treated as source material and importing the book triggers no correspondence or external action

### Requirement: Reliable chapter analysis
The importer SHALL build a source-cited account of each chapter’s objectives and locate exercises, hints and candidate solutions in the text.

#### Scenario: Exercises outside the outline
- **WHEN** the sample’s Chapter 10 is analysed
- **THEN** Exercises 10.1 and 10.2 are linked to their body pages even though the chapter has no Exercises bookmark

#### Scenario: Unusable input
- **WHEN** a PDF cannot be opened or its content cannot be reliably read
- **THEN** the learner sees the affected file or pages and can choose a readable copy without receiving invented objectives

#### Scenario: Interrupted analysis
- **WHEN** chapter processing stops and the learner resumes the same import
- **THEN** completed chapter results are reused and each chapter appears once
