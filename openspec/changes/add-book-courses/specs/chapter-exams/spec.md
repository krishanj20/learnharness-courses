## ADDED Requirements

### Requirement: Source-first assessment
At the end of each chapter the tutor SHALL offer an exam, prefer chapter exercises, and use verified matching book answers where available. It SHALL distinguish the origins of questions and answers.

#### Scenario: Back-of-book key
- **WHEN** a chapter exercise has a numbered solution in a separate appendix
- **THEN** the original problem and its parts are used, its solution cites the matching page, and the answer stays hidden before the learner’s attempt

#### Scenario: Exercise without a published answer
- **WHEN** the book has an exercise but only a hint, or no answer
- **THEN** the exam retains the exercise and uses a checked, labelled tutor-derived solution with the book’s hint separately identified

#### Scenario: Chapter without exercises
- **WHEN** the book has objectives and takeaways but no chapter exercises
- **THEN** the tutor generates chapter-grounded questions and checked solutions, with their origin identified

#### Scenario: Ambiguous equation reference
- **WHEN** a referenced equation remains unresolved after checking the source page and surrounding text
- **THEN** the item is flagged and excluded from grading until resolved

### Requirement: Socratic help and mastery
The tutor SHALL capture each attempt, support smaller steps on request or after an error, and distinguish assisted work from independent evidence when reporting chapter mastery.

#### Scenario: Stuck on a derivation
- **WHEN** the learner gives a wrong step or says they do not know
- **THEN** the tutor asks one smaller question, adapts to the reply and returns to the original problem without immediately giving the solution

#### Scenario: Valid alternative reasoning
- **WHEN** the learner supplies an independently correct derivation different from the reference
- **THEN** the tutor accepts it against the objective and explains the assessment

#### Scenario: Assisted completion
- **WHEN** the learner solves a derivation with hints
- **THEN** the exam records assisted completion and offers an unaided transfer question before crediting independent mastery for that objective

#### Scenario: Finish and resume
- **WHEN** the learner exits midway through an exam and later finishes
- **THEN** the original item, submitted work and hint position resume, and the summary identifies independently demonstrated objectives and objectives to revisit
