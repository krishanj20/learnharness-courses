## ADDED Requirements

### Requirement: Section lessons in each chapter
The tutor SHALL organise the chapter lesson around the book’s sections in order, with a page-linked reading assignment before questioning on each section.

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
