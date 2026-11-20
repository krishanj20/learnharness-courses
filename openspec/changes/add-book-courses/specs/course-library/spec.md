## ADDED Requirements

### Requirement: Library on the stock desktop host
Courses SHALL open as a sidebar action and present books by title with one distinct, resumable chapter conversation for each chapter.

#### Scenario: Open a course
- **WHEN** the user opens Courses and selects a book
- **THEN** the book shows the ordered chapters and opens the selected chapter’s conversation, creating it on first use

#### Scenario: Existing filters
- **WHEN** the plugin is enabled on the stock host
- **THEN** Teaching, Practice and All continue to show native sessions and the Courses action opens the plugin library

#### Scenario: Chat identity
- **WHEN** two books have a chapter with the same title or a chapter is opened twice
- **THEN** each book’s chapter has its own history and repeat opens return to the same chat

### Requirement: Local course continuity
The plugin SHALL retain imported pages, saved conversations and progress across restarts, including offline.

#### Scenario: Offline after import
- **WHEN** the original PDF is moved and the app is reopened without a network connection
- **THEN** the saved PDF can be read in the course, the saved chat and progress are visible, and live model actions indicate that model access is needed

#### Scenario: Reconnect
- **WHEN** a model turn fails after the learner submits an answer
- **THEN** the pending turn can be retried with the saved learner answer once and the tutor resumes at the saved step
