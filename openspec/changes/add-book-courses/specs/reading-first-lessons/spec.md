## ADDED Requirements

### Requirement: Section lessons in each chapter
The tutor SHALL organise the chapter lesson in the book’s display order while allowing study in any order, with a page-linked reading assignment before questioning on each section.

#### Scenario: Before reading
- **WHEN** a learner opens §1.1 for the first time
- **THEN** the chat offers its exact pages and a reading acknowledgement and waits before posing any teaching question

#### Scenario: After reading
- **WHEN** the learner acknowledges §1.1
- **THEN** the tutor asks one question grounded in that section, responds to the learner’s reasoning and uses a smaller question when needed

#### Scenario: Next section
- **WHEN** the discussion advances to §1.2
- **THEN** §1.1 is marked Done in the chapter, §1.2 becomes the current lesson and the tutor waits for that section’s acknowledgement

#### Scenario: Chapter without sections
- **WHEN** the learner opens an unsectioned chapter
- **THEN** the tutor assigns the chapter’s pages and follows the same reading and discussion sequence

#### Scenario: Resume after acknowledgement
- **WHEN** the learner closes the app after answering the first question
- **THEN** reopening restores the section and conversation without restarting the reading gate

#### Scenario: Begin with the introduction
- **WHEN** a learner opens Chapter 2’s first assignment
- **THEN** the continuous reader starts on PDF page 57 and includes the introduction before §2.1
- **AND** the tutor receives the opening text, including the part above §2.1 on PDF page 58

#### Scenario: Review lesson and chapter progress
- **WHEN** a learner returns to the chapter
- **THEN** the chapter lists every section in order with its completion status and the learner can review finished lessons
- **AND** finishing the chapter exam marks the chapter Done in the chapter list

### Requirement: Adaptive native Teaching for each subpoint
Courses SHALL open a regular LearnHarness Teaching session for each book subheading after reading and reuse that session when resumed. A section without subheadings SHALL have one Teaching session.

#### Scenario: Opening diagnostic after reading
- **WHEN** the learner starts the first Teaching in a chapter
- **THEN** the tutor receives the assigned passages and chapter objectives and probes the learner’s understanding using native questions
- **AND** the learner can use the host’s normal answering and dictation controls

#### Scenario: Partial or complete prior understanding
- **WHEN** the learner returns to Courses from a linked Teaching
- **THEN** Courses opens that chapter and credits the subpoints demonstrated independently in saved answers
- **AND** the next Teaching addresses an outstanding subpoint, or the chapter exam opens for study if all subpoints are demonstrated
- **AND** an unanswered or incorrect question earns no mastery credit

### Requirement: Reading and evidence at subheading granularity
Courses SHALL assign the upcoming subheading with its physical and printed page boundaries and offer the entire section. Teaching SHALL receive page-labelled source text on opening and have access to original images of its assigned pages for notation and diagrams.

#### Scenario: Definitions in EQI
- **WHEN** the learner opens the first Chapter 2 subpoint
- **THEN** its assignment includes the introduction on PDF page 57 and stops at Excess Returns on page 59
- **AND** the entire section through page 69 remains available

#### Scenario: Independent evidence
- **WHEN** a learner selects a correct option without reasoning, or repeats a tutor-supplied solution
- **THEN** the tutor asks for a fresh unaided application before a skip
- **AND** an independently reasoned first response can earn immediate credit

### Requirement: Optional offline study for individual subpoints
A learner SHALL be able to prepare a selected course subpoint while connected, including one with an existing Teaching. Courses SHALL save its book-grounded explanation, example, checks and feedback locally.

#### Scenario: Work through a selected lesson after disconnecting
- **WHEN** the learner opens a prepared lesson after a restart without model access
- **THEN** its reading, checks, answer feedback and completion work locally and progress survives restart
- **AND** the original Teaching remains available and other lessons keep their chosen mode
- **AND** finishing the checks counts towards chapter progression independently of any demonstration of mastery

#### Scenario: Jump directly to a later section
- **WHEN** the learner starts a section or subheading before completing earlier lessons
- **THEN** Courses opens the selected reading and its regular Teaching, checks understanding of that topic, and resumes it on return
- **AND** progress counts the sections actually finished and leaves unvisited sections available

### Requirement: Include course Teachings in the host knowledge graph
With the knowledge graph enabled, Courses SHALL request host extraction of remaining tutor explanations when a linked Teaching finishes or its chapter is revisited. Graph provenance SHALL identify the original Teaching and message. Extracting a concept SHALL preserve the learner's course mastery record.

#### Scenario: Short completed Teaching
- **WHEN** a linked native Teaching finishes below the host's automatic extraction threshold
- **THEN** Courses requests extraction after the tutor's closing turn is saved

#### Scenario: Previously finished Teaching
- **WHEN** LearnHarness starts with a finished Teaching that has uncovered tutor explanations
- **THEN** Courses requests extraction through the host, and a fully processed lesson triggers no further request

#### Scenario: Graph switched off
- **WHEN** a Teaching finishes with graph extraction disabled
- **THEN** Courses retains the lesson and issues no extraction request

### Requirement: Read equations inside a Teaching
When a course tutor uses an equation in a question, the question SHALL supply the verified starting relation and define its notation. The tutor SHALL leave the requested derivation or answer for the learner.

#### Scenario: Consult the source alongside a Teaching
- **WHEN** the learner opens Book PDF in a linked Teaching
- **THEN** the session and its answer controls remain available alongside the original book, starting at the latest cited physical page in the assignment or its first page
- **AND** the learner can scroll, jump by page number, zoom, and close the reader with their answer draft intact

#### Scenario: Follow a citation while answering
- **WHEN** a learner activates a physical PDF page reference in a saved or newly rendered course Teaching
- **THEN** the book opens beside the same conversation at that page, or the existing reader scrolls there
- **AND** a page range opens at its first page and the learner’s answer draft is preserved

#### Scenario: Choose a lesson directly from a chapter
- **WHEN** the learner opens a chapter
- **THEN** every lesson row shows its Teaching action and, when Offline plans is active, its offline action without expanding a topic or action menu
- **AND** the Teaching action starts a new lesson, resumes an unfinished chat, or opens a completed lesson’s saved Teaching for review
- **AND** the offline action prepares that lesson or opens the copy already saved

#### Scenario: Change availability of the Offline plans plugin
- **WHEN** Offline plans is missing or disabled
- **THEN** Courses hides offline lesson actions in the chapter and Teaching, while retaining saved lessons and completion credit
- **AND** enabling Offline plans restores the applicable prepare or open actions
