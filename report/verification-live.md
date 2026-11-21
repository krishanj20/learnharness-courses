# Courses on the stock desktop app

On 20 November 2026, LearnHarness 0.6.1 on macOS 26.6 imported the 496-page EQI draft through the native file picker. Its signed-in ChatGPT provider prepared all 14 chapter plans and asked a question after the first reading acknowledgement. Separate disposable desktop profiles exercised the remaining scenarios with synthetic learning records and a scripted provider. The expected results came from the approved OpenSpec before the plugin implementation was available.

| Scenario | Stock-host observation |
| --- | --- |
| Sidebar and native sessions | Courses opened its own library. Teaching showed the staged teaching session, Practice showed the staged practice session, and All showed both. On the same installation, Offline plans 0.2.1 opened the completed three-lesson probability course and its review. |
| PDF import and navigation | The saved PDF matched all 4,004,683 selected bytes. The course contained 14 chapters. Chapter 1 assigned printed pp. 7–9 and stopped at Modes of Exchange. The reader rendered physical pages 35, 36 and 37 in sequence. The importer located both embedded Chapter 10 exercises on physical pages 355 and 361. |
| Configured model | In the normal app, the host usage ledger recorded ChatGPT gpt-6.1-sol at medium reasoning. The initial plan recommended Cover. The updated planner replaced its 53 objectives with seven cited reasoning tasks across five readings. After §1.1 was acknowledged, the tutor asked how owning a house illustrates ownership as a claim on future benefits. The UI offered an answer field. The opening question survived the intermediate update. For delivery, the test greeting and acknowledgement were cleared from Chapter 1, which had no learner submissions. The finished course displayed “Course plan ready” with 101 cited objectives across the 14 chapters. Each chapter recommended Cover. |
| Placement evidence | In a disposable profile, the Chapter 3 planning request received the staged learner’s exact answer about Sharpe ratio and volatility and its native session/message ID. The host API supplied it from the saved session. |
| Failed turn and offline restart | The scripted provider refused the submitted learner answer. Both the desktop app and its packaged server exited. The test moved the selected file, restarted under a macOS network policy allowing only loopback, and verified that a public IP was denied while the local host remained accessible. The saved answer, retry control and page 35 reopened. |
| Reconnect | Retrying after a second restart produced a tutor reply. The original answer appeared once. Continuing assigned §1.2 and required a fresh reading acknowledgement. |
| EQI exams | The packaged backend ran the generated Chapter 1 exam to completion, then assessed the book’s Exercise 2.1. The exam UI sent the original equation-page image to the provider and reopened its source on physical page 99. The scripted provider supplied the responses. |
| New learner and published solution | A second disposable profile had no native learner sessions. Its imported eight-page book paired multipart Exercise 1.1 with the published solution on page 8. The learner-facing item withheld the solution. A cold restart halfway through a guided derivation restored the item and exchange. Assisted completion prompted a fresh question, and an unaided answer received independent credit. |

## Live grading on Exercise 2.1

A disposable course used the plugin backend and a real gpt-6.1-sol model through a CLI test adapter. Given the book image on PDF p. 99, the tutor transcribed the compounded-return inequality. When the test learner said they did not know where to start, the tutor asked which returns make gross returns nonnegative. It accepted a complete arithmetic–geometric mean proof and recorded that attempt as assisted.

The follow-up asked for a sharp upper bound on the terminal value of £1,000 over four years with annual returns summing to 40%. The test learner proved the bound of £1,464.10 and stated when equality holds. The tutor credited independent application of that reasoning and left the remaining components of the broader learning objective open. This exchange took place outside the user's course.

## Final installation

On reopening the final installation, the stock library displayed **14 chapters · 14 planned**. Chapter 1 opened at **Read §1.1 · The Securities**, printed pp. 7–9, with the reading acknowledgement available and zero transcript messages. The five installed package files matched the files in the release ZIP and the tested build byte-for-byte. The ZIP SHA-256 is `10df87c5f93942daca3ec323c018ddb36463c72cf351a3c6bd17b4df1c2aadac`.

## Reproduce

Use macOS with LearnHarness 0.6.1 and Node 22.13 or later. Build the plugin with `npm ci` and `npm run build`. Set `COURSES_OFFLINE_DIST` to the Offline plans 0.2.1 package’s dist directory and `COURSES_PDF` to the local EQI draft. The supplied textbook stays outside the repository. Install `puppeteer-core` in your test environment or set `COURSES_PUPPETEER` to its JavaScript entry file.

```sh
node scripts/live-desktop.mjs --host-only
node scripts/live-desktop.mjs
node scripts/live-desktop.mjs --synthetic
```

`COURSES_APP` can override the default macOS application path. The scripts create a fresh temporary profile, verify that its plugin directory is isolated, and print the location of its observations. The default Offline plans fixture contains only synthetic probability lessons. No existing learner profile or authentication record is required for these three runs.

## Coverage limits

The signed-in desktop model check covered full-book planning and the first Socratic question. The separate live grading check sampled Exercise 2.1 and its follow-up. Scripted exam responses exercise provenance, retry, progression and persistence. They do not independently grade the mathematical correctness of model-authored solutions. The interactive reader checks sampled three pages of the EQI draft.

## Navigation in Courses 0.1.1

On 20 November 2026 the stock desktop test imported the same EQI PDF in a disposable profile. After moving on to §1.2, it scrolled the assigned PDF page and clicked the visible **Back to chapters** button. The chapter list focused Chapter 1. **Back to all courses** returned focus to the book. Reopening Chapter 1 restored §1.2 and the saved transcript. The test also returned from the PDF to the lesson and from the lesson to the chapter list.

## Section lessons and scrolling in Courses 0.1.2

On 20 November 2026 the stock desktop test scrolled the original EQI pages in a continuous reader. Chapter 2 displayed four lesson entries before any teaching, with §2.1 current and §2.2–2.4 upcoming. The first assignment spanned printed pp. 29–41 (PDF pp. 57–69), starting with the opening questions. The tutor-input test located both those questions and the introduction that continues above the §2.1 heading on p. 58. The first assignment also reopened offline.

Finishing Chapter 1’s first lesson marked §1.1 Done, kept its discussion available in its lesson entry and opened §1.2 at the reading gate. The backend restart check preserved the active section and prior transcript boundary. After the test completed the chapter exam, the chapter list showed Chapter done. These progression checks used a disposable profile and scripted answers.

## Native Teaching in Courses 0.1.4

On 20 November 2026, a disposable LearnHarness 0.6.1 desktop profile opened EQI §1.1 in a normal Teaching from its reading acknowledgement. The stock question dock displayed a multiple-choice probe and the Dictate control. Courses returned to Chapter 1, and Resume Teaching restored the same session and outstanding question.

For EQI Chapter 2, the reader opened at the chapter introduction on PDF p. 57. In the Definitions Teaching, the test learner selected a return and entered the calculation behind it. The local scripted provider credited that saved answer. Courses reported one of 14 subpoints demonstrated, offered Excess Returns in a separate Teaching, and kept the exam pending. The exam regression subsequently opened the book’s Exercise 2.1 and its source on PDF p. 99. These checks exercised the stock UI, tools, transcript and progress storage with a scripted model. They did not record microphone audio or measure live-model grading quality.

## EQI learning pilot in Courses 0.1.5

On 20 November 2026 the normal desktop and the stock LearnHarness model service ran against separate disposable learner profiles. Only the supplied book, book-derived objectives and synthetic learner answers were used for the pilot. The signed-in model service used ChatGPT gpt-6.1-sol.

| Chapter 2 scenario | Observation |
| --- | --- |
| Read the current subpoint | Definitions opened from the chapter introduction on physical p. 57 and stopped at Excess Returns on p. 59. Read whole section offered pp. 57–69. |
| Grade a correct option alone | The live model and Courses awarded zero of 14 subpoints and requested a fresh, unaided explanation. |
| Repeat a tutor’s explanation | The same learner selected the right option and repeated the tutor’s explanation. The count stayed at zero. A second live run reproduced the stock host’s side-chat ordering, with a pre-submission helper reply saved after the quiz result. The three cases still scored 0, 0 and 1 respectively. |
| Solve an unfamiliar dividend problem | The learner explained why buying at 80, selling at 78 and collecting 6 gives a price return of −2.5% and a total return of 5%. Courses credited only Definitions and cited that answer. |
| Teach an equation from the printed page | In a separate native GARCH Teaching, the live model fetched the reading, inspected the original image on p. 70 and asked a native multiple-choice question citing that page and stating its innovation and stationarity assumptions. |
| Practise after the exam | With a staged partial exam result, the desktop offered a fresh compounding problem on return. After independent work the app recorded a one-week due date. Advancing the disposable timestamps by seven days produced a different recovery-return problem and a separate delayed result. The exam record survived both attempts. This part used a scripted provider. |

The one-week scenario tests the timing and recording of a follow-up. Measuring retention requires the learner to return and attempt it after a real week. The three controlled grading examples do not estimate accuracy across all chapters or learners.

All 48 automated checks passed with the supplied EQI and Fixed Income Relative Value Analysis PDFs. The second import recovered the eight Mean Reversion lessons. A multi-day exam regression dated the one-week check from the independent answer on the individual objective.

## Individual exam chats in Courses 0.1.6

On 20 November 2026 a disposable LearnHarness 0.6.1 desktop profile opened EQI Exercise 2.1, inspected its source on PDF page 99 and selected **I don’t know**. The scripted tutor asked a smaller question. Exercise 2.2 opened with its own conversation. After a desktop restart, reopening 2.1 restored the original exercise, the learner’s request and the same hint.

In a separate disposable profile the configured ChatGPT model responded to the same request on 2.1 by introducing the gross return for each period and asking the learner to write the arithmetic–geometric mean inequality for those returns. The exercise remained in progress. Opening 2.2 and returning to 2.1 preserved the hint. In a second live run the learner stated the inequality and asked how to translate it to net returns. The tutor prompted that substitution. It recorded guided completion after the learner supplied the full proof and left Exercise 2.2 open. The pilots used staged chapter progress.

## Optional offline lessons in Courses 0.1.7

On 21 November 2026, a disposable stock LearnHarness desktop profile converted EQI’s **The Securities** from the regular Teaching toolbar. With outside network traffic blocked and the scripted model disconnected, the desktop reopened the assigned PDF, displayed feedback for a wrong choice, and recovered that answer after a second cold launch. Finishing the second check advanced the chapter by one lesson. The original Teaching session ID survived. Only the chosen lesson was prepared, and completing its checks added no independent mastery evidence.

In a separate disposable profile, the configured LearnHarness model prepared **Definitions** from EQI Chapter 2 with the source text and page images. Its two saved checks tested dividend-adjusted return and portfolio dollar profit. The answer keys matched the calculations of 2.5% and $16.

## Study sections in any order in Courses 0.1.8

On 21 November 2026 the stock desktop app imported EQI into a disposable profile. With zero Chapter 2 lessons completed, **Study this section** under §2.2 opened PDF page 69. The reading acknowledgement launched the GARCH Teaching. Returning to Courses restored §2.2 and the original session. Definitions had no session or credit. The desktop exercise used a scripted tutor. In a separate fresh profile the configured model opened the assigned GARCH reading and asked the learner what they wanted to be able to do with that subpoint.
