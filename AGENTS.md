# Dispatch: agent notes

University IT help-desk ticket routing for #BuildHybridAI 2026 (Firebase AI Logic hybrid inference, web/Chrome).
Chrome's built-in model routes every ticket on the staffer's computer; Gemini in the cloud is asked only for
tickets marked unsure, only on masked text, and only after the staffer approves.

## Layout

- `src/core/`: framework-free logic, unit tested.
  - `mask.ts`: personal-detail masking (student ID, email, phone, names). Runs before any model sees a ticket.
  - `retrieval.ts`: TF-IDF retrieval and kNN vote. Must stay identical to `eval/harness/src/retrieval.js`.
  - `prompts.ts`: routing prompt (must equal `buildPrompt` in `eval/harness/src/common.js`; a test checks this)
    and the cloud check prompt (routing prompt plus a short reason).
  - `policy.ts`: when a ticket is unsure. `pipeline.ts`: mask, retrieve, route, decide.
  - `ai.ts`: Firebase AI Logic models (`ONLY_ON_DEVICE` route, `ONLY_IN_CLOUD` check).
  - `firebase.ts`, `store.ts`, `config.ts`: App Check, anonymous Auth, Firestore, Remote Config.
- `src/state/desk.ts`: the app store (queue, routing loop, autopilot). Exposed as `globalThis.desk` in dev.
- `src/components/`: React UI ("Campus memo" design: Fraunces + Manrope, cream and green, Phosphor icons).
- `eval/`: the offline measurement. `eval/data` is synthetic; `eval/results/*.jsonl` are raw runs;
  `eval/RESULTS.md` is the write-up. Numbers in `src/state/stats.ts` (MEASURED) must match RESULTS.md.
- `scripts/drive.mjs`, `scripts/open-tab.mjs`: drive the debuggable Chrome Beta over CDP (port 9333).

## Commands

- `npm run dev`, `npm run build`, `npm test` (vitest, `src/**/*.test.ts`), `npm run e2e` (Playwright, fake on-device model), `npx tsc -b`.
- Eval: see `eval/RESULTS.md` for the exact commands.

## Rules

- Never commit or print `.env.development.local`, `eval/harness/.appcheck-debug-token`, or any service account key.
  The debug token is read only when `import.meta.env.DEV`; after any build, check `dist/` does not contain it.
- Raw ticket text never goes to the cloud. Anything sent to Gemini must come from `mask()` output.
- Keep the routing prompt and retrieval in step with the eval harness, or the measured numbers stop applying.
- Report measured numbers as measured: do not round up or mix runs with different bank sizes.
- Chrome 136+ refuses remote debugging on the default profile; use the copied profile in
  `~/.cache/chrome-beta-debug`. Never call `browser.close()` on that CDP connection.
- UI: Phosphor icons only, no gradients, plain English copy.
