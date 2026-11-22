# Day-1 spike results (2026-11-22)

Question: does the on-device model (Chrome's built-in Gemma, CPU only, via Firebase AI Logic `ONLY_ON_DEVICE`) route university IT tickets better when it is shown past tickets that the cloud has labelled?

Setup: 14 teams, 26 hidden local routing rules, 200 synthetic tickets (120 example bank, 80 holdout). The model sees team descriptions plus the top-8 most similar past tickets (TF-IDF, plain JS). Holdout labels come from the written rules, not from a model. All data is synthetic.

| Condition (80 holdout tickets) | Accuracy | 95% CI | Tickets that hinge on a local rule |
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

Hybrid policy: keep the on-device answer, but ask the cloud when it disagrees with the kNN vote of its retrieved examples.

| Bank size | System accuracy | Share of tickets sent to cloud | On-device answers kept |
|---|---|---|---|
| 20 | 80% | 86% | 14% |
| 60 | 72% | 70% | 30% |
| 120 | 84% (same as all-cloud) | 61% | 39%, at 87% accuracy |

Latency on the dev laptop (CPU): about 5 s per ticket with no examples, about 7 s with 8 examples. Cloud Flash-Lite: about 1.5 s.

Pre-set pass rule: 0-shot <= 55% (pass, 36%), bank-120 >= 75% (FAIL, 62%), bank-120 >= 0-shot + 15 points (pass, +26), bank-60 >= 0-shot + 8 points (pass, +16), Gemini >= 85% (borderline, 84%).

Findings:
- Retrieved examples give a real lift on-device (+26 points; the intervals do not overlap).
- The small model caps out low on this task: even the true rules only reach 68%. Gemini-written rules did not beat raw examples.
- The disagreement check is a useful "unsure" flag: at bank 120 it catches 87% of on-device errors, and the hybrid matches all-cloud accuracy while 39% of tickets never leave the browser. That share grows with the bank (14% -> 30% -> 39%).
- Free tier: gemini-3.5-flash allows only 20 requests a day per project; Flash-Lite ran 160+ requests without hitting a limit.

Raw results: `results/*.jsonl`. Re-run the summary with `python3 -I harness/analyze.py results/device_full.jsonl results/cloud.jsonl results/device_rules.jsonl`.
