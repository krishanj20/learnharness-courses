# Courses on the stock desktop app

On 20 November 2026, LearnHarness 0.6.1 on macOS 26.6 imported the 496-page EQI draft through the native file picker. Its signed-in ChatGPT provider prepared Chapter 1 and asked a question after the reading acknowledgement. Separate disposable desktop profiles exercised the remaining scenarios with synthetic learning records and a scripted provider. The expected results came from the approved OpenSpec before the plugin implementation was available.

| Scenario | Stock-host observation |
| --- | --- |
| Sidebar and native sessions | Courses opened its own library. Teaching showed the staged teaching session, Practice showed the staged practice session, and All showed both. On the same installation, Offline plans 0.2.1 opened the completed three-lesson probability course and its review. |
| PDF import and navigation | The saved PDF matched all 4,004,683 selected bytes. The course contained 14 chapters. Chapter 1 assigned printed pp. 7–9 and stopped at Modes of Exchange. The reader rendered physical pages 35, 36 and 37 in sequence. The importer located both embedded Chapter 10 exercises on physical pages 355 and 361. |
| Configured model | In the normal app, the host usage ledger recorded ChatGPT gpt-6.1-sol at medium reasoning. Chapter 1 saved 53 cited objectives across five readings and recommended Cover. After §1.1 was acknowledged, the tutor asked how owning a house illustrates ownership as a claim on future benefits. The UI offered an answer field. Verification ended that exchange at the learner’s turn. |
| Placement evidence | In a disposable profile, the Chapter 3 planning request received the staged learner’s exact answer about Sharpe ratio and volatility and its native session/message ID. The host API supplied it from the saved session. |
| Failed turn and offline restart | The scripted provider refused the submitted learner answer. Both the desktop app and its packaged server exited. The test moved the selected file, restarted under a macOS network policy allowing only loopback, and verified that a public IP was denied while the local host remained accessible. The saved answer, retry control and page 35 reopened. |
| Reconnect | Retrying after a second restart produced a tutor reply. The original answer appeared once. Continuing assigned §1.2 and required a fresh reading acknowledgement. |
| EQI exams | The packaged backend ran the generated Chapter 1 exam to completion, then assessed the book’s Exercise 2.1 on physical page 99. The scripted provider supplied the responses. |
| New learner and published solution | A second disposable profile had no native learner sessions. Its imported eight-page book paired multipart Exercise 1.1 with the published solution on page 8. The learner-facing item withheld the solution. A cold restart halfway through a guided derivation restored the item and exchange. Assisted completion prompted a fresh question, and an unaided answer received independent credit. |

## Reproduce

Use macOS with LearnHarness 0.6.1 and Node 22.13 or later. Build the plugin with `npm ci` and `npm run build`. Set `COURSES_OFFLINE_DIST` to the Offline plans 0.2.1 package’s dist directory and `COURSES_PDF` to the local EQI draft. The supplied textbook stays outside the repository. Install `puppeteer-core` in your test environment or set `COURSES_PUPPETEER` to its JavaScript entry file.

```sh
node scripts/live-desktop.mjs --host-only
node scripts/live-desktop.mjs
node scripts/live-desktop.mjs --synthetic
```

`COURSES_APP` can override the default macOS application path. The scripts create a fresh temporary profile, verify that its plugin directory is isolated, and print the location of its observations. The default Offline plans fixture contains only synthetic probability lessons. No existing learner profile or authentication record is required for these three runs.

## Coverage limits

The signed-in model check covered Chapter 1 planning and the first Socratic question. Scripted exam responses exercise provenance, retry, progression and persistence. They do not independently grade the mathematical correctness of model-authored solutions. The interactive reader checks sampled three pages of the EQI draft.
