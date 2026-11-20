## ADDED Requirements

### Requirement: One mini-lesson per chapter
The tutor SHALL organise the chapter lesson around the book’s sections in order, with a page-linked reading assignment before questioning on each section.

#### Scenario: Before reading
- **WHEN** a learner opens §1.1 for the first time
- **THEN** the chat offers its exact pages and a reading acknowledgement and waits before posing any teaching question

#### Scenario: After reading
- **WHEN** the learner acknowledges §1.1
- **THEN** the tutor asks one question grounded in that section, responds to the learner’s reasoning and uses a smaller question when needed

#### Scenario: Next section
- **WHEN** the discussion advances to §1.2
- **THEN** the new reading assignment appears in the existing chapter chat and the tutor waits for that section’s acknowledgement

#### Scenario: Chapter without sections
- **WHEN** the learner opens an unsectioned chapter
- **THEN** the tutor assigns the chapter’s pages and follows the same reading and discussion sequence

#### Scenario: Resume after acknowledgement
- **WHEN** the learner closes the app after answering the first question
- **THEN** reopening restores the section and conversation without restarting the reading gate
