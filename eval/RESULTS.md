# Results (2026-11-22)

Question: can Chrome's built-in model (via Firebase AI Logic `ONLY_ON_DEVICE`, running on the laptop's CPU) route
university IT tickets well enough that a help desk only needs the cloud for the tickets it is unsure about?

Setup: 14 teams, 26 local routing rules, 200 synthetic tickets (a bank of 120 past tickets, 80 held-out test
tickets). Each test ticket is labelled from the written rules, not by a model (see `data/README.md`). The on-device
model sees the team list plus the 8 most similar past tickets (TF-IDF retrieval in plain JS). Every number below is
on the same 80 held-out tickets, so the 95% intervals are wide (about ±10 points).

## What the app does: masked text, same bank size for both models

This is the measurement the app's numbers come from (`src/state/stats.ts`). It matches the app exactly:

- every ticket and every past ticket is masked first (`src/core/mask.ts`: IDs, emails, phones, names);
- the on-device model gets the routing prompt from `src/core/prompts.ts`;
- a ticket is _unsure_ when the on-device answer differs from the vote of its 8 similar past tickets;
- unsure tickets get the app's cloud check prompt (`buildAuditPrompt`: team plus a short reason) on Gemini 3.5
  Flash-Lite, with the **same** examples the on-device model saw.

| Past tickets in the bank | 0 | 20 | 60 | 120 |
|---|---|---|---|---|
| On-device model alone | 39% (29-50) | 51% (40-62) | 50% (39-61) | 55% (44-65) |
| Vote of the 8 similar past tickets alone | - | 21% | 26% | 45% |
| Gemini on every ticket (all-cloud) | | 69% (58-78) | 75% (65-83) | 85% (76-91) |
| **Hybrid: on device, Gemini only when unsure** | | **68%** | **68%** | **80%** |
| Tickets sent to Gemini | | 86% | 75% | 60% |
| Tickets that never left the browser | | 14% | 25% | 40% |
| Accuracy on the tickets kept on device | | 82% | 55% | 78% |
| On-device errors caught by the unsure check | | 95% | 78% | 81% |

What this shows:

- **The share of tickets that never leave the browser grows with the bank: 14%, 25%, 40%.** That is the point of
  the design. Each ticket a person confirms becomes a new example.
- **Hybrid costs a few points against all-cloud: 1 point at 20 examples, 7 at 60, 5 at 120.** At 120 examples the
  desk keeps 40% of tickets on the laptop and is right 80% of the time, against 85% if every ticket went to Gemini.
  Whether that trade is worth it is a policy choice for the desk. Remote Config can turn the unsure check off
  (`escalate_on_disagreement`) or send a random share of confident tickets to the cloud as well
  (`audit_sample_rate`, default 10%), so accuracy keeps being measured.
- **The on-device model alone stays near 50-55% on masked text.** The gain comes from the agreement check, not from
  the small model getting much smarter: when the model and the similar past tickets agree, they are usually right.
- **Gemini also gets better with the desk's own examples: 69%, 75%, 85%.** The examples teach it local rules it
  cannot know (which lab is on which side of campus, which office owns which form).
- Gemini's reasons are short (11 words on average, 15 at most) and specific, e.g. "Route billing and fee disputes
  related to campus printing to print-services."

Latency on the dev laptop (CPU only, no supported GPU): about 4.9 s per ticket with no examples and about 7 s with
8 examples (median). Gemini 3.5 Flash-Lite on the free tier: median 1.3-1.6 s, but 1 call in 10 took 19-22 s.

### Does masking cost accuracy?

Paired comparison with the same model on raw text (the spike below), same tickets:

| Bank | Raw text | Masked text | Right only raw / only masked |
|---|---|---|---|
| 0 | 36% | 39% | 3 / 5 |
| 20 | 49% | 51% | 4 / 6 |
| 60 | 52% | 50% | 7 / 5 |
| 120 | 62% | 55% | 10 / 4 |

With 0, 20 and 60 examples masking makes no real difference. At 120 masked text scored 7 points lower; the paired difference
(10 tickets against 4) is not significant on 80 tickets (McNemar exact test, p ≈ 0.18), but it may be a real
cost: masking changes which past tickets are retrieved (the vote of the similar tickets changed for 14 of 80). We report
the masked numbers, because that is what the app does.

## Correction to an earlier version of this file

An earlier version reported a hybrid accuracy of 80% at 20 examples and 72% at 60. Those rows paired on-device
answers from a small bank with cloud answers from a run that had seen all 120 examples, which made them look
better than they are. `harness/analyze.py` now only pairs runs with the same bank size, and the table above uses
the app's own cloud prompt and masked text. The earlier 120-example row (84% hybrid, same as all-cloud, 39% kept)
was correctly paired, but on raw text; on masked text it is 80% against 85%, with 40% kept.

## The day-1 spike (raw text)

Run first, on raw (unmasked) text, to decide whether the idea works at all.

| Condition (80 held-out tickets) | Accuracy | 95% CI | Tickets that hinge on a local rule |
|---|---|---|---|
| On-device, no examples | 36% | 27-47% | 19% |
| On-device, bank of 20 | 49% | 38-60% | 33% |
| On-device, bank of 60 | 52% | 42-63% | 39% |
| On-device, bank of 120 | 62% | 52-72% | 48% |
| On-device, Gemini-written rule list (from 120) | 54% | 43-64% | 46% |
| On-device, rule list + examples (120) | 60% | 49-70% | 46% |
| On-device, the true hidden rules (upper bound) | 68% | 57-77% | 65% |
| Plain kNN vote, bank of 120 (no model) | 46% | | |
| Cloud Gemini 3.5 Flash-Lite, no examples | 66% | 55-76% | 52% |
| Cloud Gemini 3.5 Flash-Lite, bank of 120 | 84% | 74-90% | 78% |

Findings from the spike:

- Retrieved examples lift the on-device model (36% to 62% on raw text; the intervals do not overlap).
- The small model caps out low on this task: even the true rules only reach 68%. Gemini-written rule lists did not
  beat raw examples, so the app uses examples.
- Free tier: gemini-3.5-flash allows only 20 requests a day per project, so the app uses Flash-Lite, which allows
  15 requests a minute.

## Re-running

Raw results are in `results/*.jsonl` (one line per ticket and condition; error rows are ignored).

```
# summary of the app measurement
python3 -I harness/analyze.py results/device_masked.jsonl results/audit.jsonl
# the spike
python3 -I harness/analyze.py results/device_full.jsonl results/cloud.jsonl results/device_rules.jsonl
```

To produce them again:

- `node harness/mask_data.mjs` writes `data_masked/` from `data/` with the app's `mask()`.
- On-device runs use a page in Chrome with the built-in model: `python3 -I harness/server.py <out.jsonl> 8766 7200
  data_masked`, then open `http://127.0.0.1:8766/?mode=device&n=0,20,60,120&label=device-masked`.
- Cloud check runs: `node harness/audit_eval.mjs results/audit.jsonl gemini-3.5-flash-lite 20,60,120 80` (needs an
  App Check debug token in `harness/.appcheck-debug-token`; paced for the free tier's 15 requests a minute).
