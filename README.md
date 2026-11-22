# Dispatch

**A university IT help desk that routes tickets with the model built into Chrome, asks Gemini only when it is
unsure, and learns from every decision a person makes.**

Built for #BuildHybridAI 2026 with Firebase AI Logic hybrid inference (web, Chrome).

- Live demo: https://dispatch-hybridai-2026.web.app (desktop Chrome)
- Video (3 min): _link added at upload_

## The problem

A university help desk gets hundreds of tickets a day ("wifi keeps dropping in Halvorsen", "Banner shows my forms as
read-only"). Someone has to read each one and send it to the right team out of a dozen or more. The hard part is local
knowledge: which lab is on which side of College Ave, which office owns the student-worker forms. New staff take weeks to
learn it, and a misrouted ticket can sit in the wrong queue for a day.

Large models in the cloud route well, but help-desk tickets are full of student IDs, names, emails and phone numbers.
At most universities those are protected (FERPA in the US), and sending every ticket to an outside service is a hard
sell. A small model on the staffer's own computer keeps the data local, but on its own it gets too many tickets wrong.

## What Dispatch does

Every ticket goes through five steps:

1. **Mask, on this computer.** Student IDs, emails, phone numbers and names are replaced with `[STUDENT_ID]`, `[EMAIL]`,
   `[PHONE]`, `[NAME]` before any model sees the ticket.
2. **Route on device.** Chrome's built-in model picks a team. Its prompt holds the team list and the 8 most similar past
   tickets from this desk (TF-IDF retrieval, plain TypeScript, no server).
3. **Check.** If the on-device answer disagrees with the vote of those similar past tickets, the ticket is marked
   _unsure_. If they agree, the ticket is routed and nothing about it leaves the browser.
4. **Ask Gemini, with the staffer's OK.** For an unsure ticket the staffer sees exactly what would be sent: the masked
   text, the team list and the masked similar tickets. They can mask more words with a click. Only then does Gemini
   suggest a team and a one-line reason a new staffer could reuse.
5. **Learn.** The staffer confirms or changes the team. The masked ticket is saved as a new example for this desk, so
   the next similar ticket is more likely to stay on the computer.

The share of tickets that never leave the browser grows as the desk learns. The app shows this live, next to the numbers
measured offline.

## How it uses Firebase

| Product | Where | What for |
|---|---|---|
| Firebase AI Logic, `InferenceMode.ONLY_ON_DEVICE` | `src/core/ai.ts` | Routes every ticket with Chrome's built-in model. JSON output is held to the team list with `responseConstraint`. `initializeDeviceModel()` downloads the model on a click. |
| Firebase AI Logic, `InferenceMode.ONLY_IN_CLOUD` | `src/core/ai.ts` | Gemini 3.5 Flash-Lite for unsure tickets only, with a response schema (team enum plus reason). |
| Firebase AI Logic, `InferenceMode.PREFER_ON_DEVICE` | `src/core/ai.ts` | Fallback for browsers without the on-device model: routes the masked text in the cloud through the same call. `response.inferenceSource` tells the UI where each answer came from. |
| App Check | `src/core/firebase.ts` | Guards the Gemini calls and Firestore. reCAPTCHA Enterprise (score based, invisible) in the deployed app; a debug token, never committed or built in, in development. |
| Authentication (anonymous) | `src/core/firebase.ts` | Each visitor gets a private desk without signing up. |
| Cloud Firestore | `src/core/store.ts`, `firestore.rules` | The desk's examples and routing log, per user. Rules allow only the owner, and only the expected fields. A persistent local cache keeps examples available offline, so on-device routing works without a network. |
| Remote Config | `src/core/config.ts`, `remoteconfig.template.json` | Admin switches: cloud model, spot-check rate, how many examples go into the prompt, whether to escalate on disagreement, cloud fallback routing, starter bank size. |

## What we measured

On 80 held-out synthetic tickets, using the app's own prompts and masking (full write-up, raw results and how to
re-run them: [`eval/RESULTS.md`](eval/RESULTS.md)):

| Past tickets on the desk | 20 | 60 | 120 |
|---|---|---|---|
| Tickets that never left the browser | 14% | 25% | 40% |
| Accuracy, hybrid (on device, Gemini only when unsure) | 68% | 68% | 80% |
| Accuracy, Gemini on every ticket | 69% | 75% | 85% |
| Accuracy, on-device model alone | 51% | 50% | 55% |

- The share of tickets kept on the computer grows as the desk learns. With 120 examples, 4 in 10 tickets never
  leave the browser, for a cost of 5 points of accuracy against sending every ticket to Gemini.
- The unsure check (the on-device answer against the vote of the similar past tickets) catches 81% of the
  on-device model's mistakes at 120 examples.
- Gemini gets better with the desk's examples too (69% to 85%): they teach it local rules it cannot know.
- On the dev laptop the on-device model runs on the CPU, about 7 s per ticket. Gemini 3.5 Flash-Lite answers in
  about 1.5 s (median).
- An earlier draft overstated the hybrid accuracy at 20 and 60 examples; `eval/RESULTS.md` explains the mistake.

## Try it

Open the live demo in desktop Chrome. Your desk starts with 20 example tickets and six new ones arrive.

- If Chrome's on-device model is available, tickets start routing on your computer. If it is downloadable, click
  **Download model** (a few GB, once). If your browser has no on-device model, click **Route in the cloud instead**;
  tickets are still masked first.
- Pick an _unsure_ ticket. Read what would leave the computer, mask a word if you like, then **Send masked text to
  Gemini** or **Route it myself**.
- Confirm or change the team. The ticket becomes example #21, #22, ... for your desk.
- Turn on **Autopilot** to let the demo accept Gemini's answers and watch the share of on-device routing climb in the
  chart at the bottom. **Reset my desk** starts over.

All tickets are synthetic (a made-up university, see `eval/data/README.md`). You can also type your own.

Chrome's on-device model needs desktop Chrome with enough memory and disk space; see Chrome's
[built-in AI requirements](https://developer.chrome.com/docs/ai/get-started). It was developed on a laptop
without a supported GPU, running the model on the CPU.

## Run it yourself

Requirements: Node 22 or newer, a Firebase project, desktop Chrome with the built-in model.

1. In the Firebase console: add a web app, enable **Firebase AI Logic** with the Gemini Developer API, **Anonymous**
   sign-in and **Cloud Firestore**.
2. Put your web config in `src/firebase-config.ts` and your project id in `.firebaserc`.
3. App Check:
   - For `npm run dev`, register a debug token in App Check and put it in `.env.development.local` (gitignored, and
     only read by the dev server, so it never ends up in a build):
     ```
     VITE_APPCHECK_DEBUG_TOKEN=<debug token>
     ```
   - For a deployed build, create a reCAPTCHA Enterprise score key for your domains, register it in App Check, and
     put the site key in `src/firebase-config.ts`.
4. Deploy the rules and the Remote Config template, then run the app:
   ```
   npm install
   npx firebase-tools deploy --only firestore,remoteconfig,auth
   npm run dev
   ```
5. `npm test` runs the unit tests (masking, retrieval, prompts, policy, error handling). `npm run e2e` runs Playwright
   tests against the dev server with a stand-in for Chrome's model; they check, among other things, that no
   personal detail ever reaches a prompt.

## Privacy, and what it does not do

- Raw ticket text never leaves the browser. The cloud only sees `mask()` output, and only after the staffer approves
  (or turns on Autopilot in the demo).
- Masking is rule-based. It catches IDs, emails and phone numbers well, and names in common positions (sign-offs,
  "my name is", titles like Dr or Prof). It can miss a name written in lower case in the middle of a sentence. That is
  why the staffer sees the masked text first and can mask any word with one click.
- Examples are stored per anonymous user in Firestore. A real deployment would share one bank per help desk.
- The test set is small (80 held-out tickets) and synthetic. The numbers above show the approach works on this data,
  not on any real university's tickets.

## Repository

- `src/core/`: masking, retrieval, prompts, unsure policy, Firebase AI Logic calls, Firestore, Remote Config.
- `src/state/desk.ts`: the queue and routing loop. `src/components/`: the UI.
- `eval/`: synthetic data, the measurement harness and raw results (`eval/RESULTS.md`).
- `design-options/`: the three design directions considered before building.

Apache 2.0, see `LICENSE`.
