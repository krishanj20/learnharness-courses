## ADDED Requirements

### Requirement: Source-first assessment
At the end of each chapter the tutor SHALL offer an exam, prefer chapter exercises, and use verified matching book answers where available. It SHALL distinguish the origins of questions and answers.

#### Scenario: Find the exam before finishing the lessons
- **WHEN** the learner opens a chapter
- **THEN** the lesson list is followed by a Chapter exam overview with its availability and question source
- **AND** the learner can preview the original exercise pages without starting the exam or changing progress

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

### Requirement: Follow-up practice and retention
Courses SHALL offer a fresh problem on a weak or unassessed objective after the exam and on a returning course visit. It SHALL preserve exam results, unfinished practice and timing of independent work.

#### Scenario: One-week check
- **WHEN** at least seven days have passed after an independently solved objective
- **THEN** the learner can take a fresh unaided check for that objective
- **AND** delayed independent success is distinguished from guided work and immediate practice

### Requirement: A conversation for each exam question
After the lessons, Courses SHALL let the learner open an eligible book exercise by number, ask for one smaller step, and return to the list to work on another question. Each question SHALL keep its own transcript, saved reply awaiting grading, and completion state. The tutor SHALL use only the selected question’s dialogue when responding.

#### Scenario: Switch questions midway through a derivation
- **WHEN** the learner asks for help on Exercise 2.1 and then opens Exercise 2.2
- **THEN** Exercise 2.2 opens with its own problem and conversation
- **AND** returning to 2.1 after restarting restores the original problem, attempts and most recent hint
- **AND** completing one exercise leaves other unfinished questions available

#### Scenario: Resume an exam begun in an earlier version
- **WHEN** a saved chapter has a sequential exam transcript
- **THEN** its submitted work, hints and results remain attached to the corresponding question, including a pending answer that needs a retry

#### Scenario: Work through the exam one question at a time
- **WHEN** the learner starts or resumes an exam from the chapter
- **THEN** the current exercise opens with its own conversation and one task to answer
- **AND** for a multipart book exercise the tutor presents each outstanding part in turn, with the full exercise available for reference
- **AND** completing an exercise offers the next question or the chapter results
