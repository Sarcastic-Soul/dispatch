# Northfield State University (NSU) help-desk routing: seed data

Everything here is synthetic. Northfield State University, its buildings, people,
student IDs (`N` plus 8 digits), phone extensions and emails (`@northfield-state.example`
and other `.example` domains) are made up. Each ticket was written one at a time for this
project (by the Claude Code agent that built it) and labelled from `rules.json`. None of them were
produced or labelled by the models under test (Chrome's on-device model or Gemini).

## Purpose

Day-1 experiment: does a small on-device model (Chrome built-in Gemma, CPU only) route tickets to the
right team more accurately when the prompt includes retrieved past examples (few-shot, top-k=8 by TF-IDF
over the `bank` split) than with none? The model sees only team names and descriptions
(`teams.json`) plus retrieved bank tickets with their correct team. It never sees `rules.json`; the
rules only exist so each ticket has a gold team. Many rules are chosen so that a guess from the team
descriptions alone is wrong.

## Files

- `teams.json`: array of 14 `{id, name, description}`. Ids are kebab-case. Descriptions are generic and reveal no local rule.
- `rules.json`: 26 `{id, team, text}` local routing rules (`R01`..`R26`). For labelling only. Never put in a prompt.
- `tickets.json`: 200 `{id, text, team, split, rule, ambiguous}`.
  - `id`: `T001`..`T200` (order is shuffled, not grouped by team or split).
  - `team`: gold team id.
  - `split`: `bank` (120, used as retrieval examples) or `holdout` (80, used for scoring).
  - `rule`: id of the rule that decides the gold team, or `null` for a straightforward ticket.
  - `ambiguous`: true when a reasonable person could pick another team (vague, or two issues in one ticket). The gold label is the primary issue under the rules.
- `validate.py`: run `python3 -I validate.py` from this folder. Exits non-zero on failure. `--table` prints the table below.

## Design notes

- About 67% of tickets (134) hinge on a rule; the rest (66) are straightforward.
- About 30% (59) are `ambiguous`. About 29% contain a fake student ID and/or a name or extension, so masking can be tested later.
- Holdout tickets are not near-copies of bank tickets: `validate.py` requires lowercase word-set Jaccard < 0.5 against every bank ticket (current max is 0.24). They differ in wording, building, symptom and user type.
- The two Lab Desktop teams are told apart only by which side of College Ave the building is on, so a no-example guess between them is a coin flip by design.
- Class sizes are uneven on purpose (for example Identity & Access has many rules). Report per-team accuracy as well as the overall number.

## Rule coverage (tickets per rule)

| Rule | Team | Bank | Holdout |
|---|---|---|---|
| R01 | print-services | 3 | 2 |
| R02 | lab-desktop-east | 4 | 3 |
| R03 | lab-desktop-west | 4 | 3 |
| R04 | registrar-systems | 3 | 2 |
| R05 | resnet | 3 | 2 |
| R06 | telecom-network | 3 | 3 |
| R07 | identity-access | 3 | 2 |
| R08 | classroom-av | 3 | 2 |
| R09 | lms-canvas | 3 | 2 |
| R10 | research-computing | 3 | 2 |
| R11 | security-phishing | 4 | 2 |
| R12 | telecom-network | 3 | 2 |
| R13 | financial-aid-systems | 3 | 2 |
| R14 | accessibility-tech | 3 | 2 |
| R15 | identity-access | 3 | 2 |
| R16 | telecom-network | 3 | 2 |
| R17 | service-desk | 3 | 2 |
| R18 | identity-access | 3 | 2 |
| R19 | lms-canvas | 3 | 2 |
| R20 | financial-aid-systems | 3 | 2 |
| R21 | registrar-systems | 3 | 2 |
| R22 | research-computing | 3 | 2 |
| R23 | accessibility-tech | 3 | 2 |
| R24 | classroom-av | 3 | 2 |
| R25 | security-phishing | 3 | 2 |
| R26 | identity-access | 2 | 1 |
| none | (straightforward) | 40 | 26 |
