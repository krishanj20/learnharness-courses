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
