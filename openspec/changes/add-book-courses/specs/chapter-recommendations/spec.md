## ADDED Requirements

### Requirement: Evidence for cover or skip
For every chapter the plan SHALL recommend Cover or Skip, identify the objectives behind the decision and show what evidence supports it.

#### Scenario: Independent evidence across all core objectives
- **WHEN** the learner’s own answers demonstrate every core objective
- **THEN** the chapter is recommended for Skip and the evidence can be inspected

#### Scenario: Known and new material in one chapter
- **WHEN** the learner knows volatility and Sharpe ratio but lacks evidence for capacity
- **THEN** Chapter 3 is recommended for Cover and the capacity section is identified for reading

#### Scenario: Exposure or mixed evidence
- **WHEN** a topic occurs in notes or a tutor explanation, or the learner has contradictory answers
- **THEN** the plan identifies the uncertainty and offers a short targeted diagnostic before recommending a skip

#### Scenario: Declined diagnostic
- **WHEN** a learner with no prior sessions declines the diagnostic
- **THEN** the plan recommends Cover for unassessed chapters, identifies missing evidence and allows study to begin

### Requirement: Learner control
The learner SHALL be able to revise a recommendation and reopen any chapter.

#### Scenario: Override survives restart
- **WHEN** the learner chooses to skip a recommended chapter and later reopens the course
- **THEN** the chosen plan is restored, the original rationale remains visible and the chapter can still be opened without awarding mastery

#### Scenario: Diagnostic supplies the missing evidence
- **WHEN** a learner independently solves the diagnostic covering the only outstanding objective
- **THEN** the chapter recommendation is updated and explains the new evidence
