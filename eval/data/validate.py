#!/usr/bin/env python3
"""Validate the synthetic NSU help-desk seed data. Run: python3 -I validate.py

Add --table to print the rule x split markdown table used in README.md.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
errors = []
warnings = []


def err(msg):
    errors.append(msg)


def load(name):
    with open(HERE / name, encoding="utf-8") as f:
        return json.load(f)


def words(text):
    return set(re.findall(r"[a-z0-9']+", text.lower()))


def jaccard(a, b):
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


teams = load("teams.json")
rules = load("rules.json")
tickets = load("tickets.json")

# ---- teams
if len(teams) != 14:
    err(f"expected 14 teams, got {len(teams)}")
team_ids = [t.get("id") for t in teams]
if len(set(team_ids)) != len(team_ids):
    err("duplicate team ids")
for t in teams:
    if set(t) != {"id", "name", "description"}:
        err(f"team {t.get('id')} has wrong keys {sorted(t)}")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", str(t.get("id"))):
        err(f"team id not kebab-case: {t.get('id')}")
    if not t.get("description", "").strip().endswith("."):
        err(f"team {t.get('id')} description should be one sentence ending with a period")
    if t.get("description", "").count(". ") > 0:
        err(f"team {t.get('id')} description has more than one sentence")
team_set = set(team_ids)

# ---- rules
rule_ids = [r.get("id") for r in rules]
if len(set(rule_ids)) != len(rule_ids):
    err("duplicate rule ids")
if not (22 <= len(rules) <= 30):
    err(f"expected about 25 rules, got {len(rules)}")
rule_team = {}
for r in rules:
    if set(r) != {"id", "team", "text"}:
        err(f"rule {r.get('id')} has wrong keys {sorted(r)}")
    if not re.fullmatch(r"R\d{2}", str(r.get("id"))):
        err(f"bad rule id {r.get('id')}")
    if r.get("team") not in team_set:
        err(f"rule {r.get('id')} has unknown team {r.get('team')}")
    rule_team[r.get("id")] = r.get("team")
rule_set = set(rule_ids)

# ---- tickets: counts and ids
if len(tickets) != 200:
    err(f"expected 200 tickets, got {len(tickets)}")
ids = [t.get("id") for t in tickets]
if len(set(ids)) != len(ids):
    err("duplicate ticket ids")
expected_ids = [f"T{i:03d}" for i in range(1, 201)]
if sorted(ids) != expected_ids:
    err("ticket ids are not exactly T001..T200")
splits = Counter(t.get("split") for t in tickets)
if splits.get("bank") != 120 or splits.get("holdout") != 80 or sum(splits.values()) != 200:
    err(f"split counts wrong: {dict(splits)}")

for t in tickets:
    tid = t.get("id")
    if set(t) != {"id", "text", "team", "split", "rule", "ambiguous"}:
        err(f"{tid} has wrong keys {sorted(t)}")
        continue
    if not isinstance(t["text"], str) or not t["text"].strip():
        err(f"{tid} empty text")
    if t["team"] not in team_set:
        err(f"{tid} unknown team {t['team']}")
    if t["split"] not in ("bank", "holdout"):
        err(f"{tid} bad split {t['split']}")
    if t["rule"] is not None and t["rule"] not in rule_set:
        err(f"{tid} unknown rule {t['rule']}")
    if t["rule"] in rule_team and rule_team[t["rule"]] != t["team"]:
        err(f"{tid} team {t['team']} != rule {t['rule']} team {rule_team[t['rule']]}")
    if not isinstance(t["ambiguous"], bool):
        err(f"{tid} ambiguous must be boolean")

# ---- per-team coverage
team_bank = Counter(t["team"] for t in tickets if t["split"] == "bank")
team_hold = Counter(t["team"] for t in tickets if t["split"] == "holdout")
for tid_ in team_ids:
    if team_bank[tid_] < 4:
        err(f"team {tid_} has only {team_bank[tid_]} bank tickets (need >= 4)")
    if team_hold[tid_] < 3:
        err(f"team {tid_} has only {team_hold[tid_]} holdout tickets (need >= 3)")

# ---- per-rule coverage
rule_bank = Counter(t["rule"] for t in tickets if t["split"] == "bank" and t["rule"])
rule_hold = Counter(t["rule"] for t in tickets if t["split"] == "holdout" and t["rule"])
for rid in rule_ids:
    if rule_bank[rid] < 2:
        err(f"rule {rid} has only {rule_bank[rid]} bank tickets (need >= 2)")
    if rule_hold[rid] < 1:
        err(f"rule {rid} has no holdout ticket")

# ---- near duplicates: every holdout vs every bank
bank = [t for t in tickets if t["split"] == "bank"]
hold = [t for t in tickets if t["split"] == "holdout"]
bank_w = {t["id"]: words(t["text"]) for t in bank}
worst = (0.0, None, None)
for h in hold:
    hw = words(h["text"])
    for b in bank:
        j = jaccard(hw, bank_w[b["id"]])
        if j > worst[0]:
            worst = (j, h["id"], b["id"])
        if j >= 0.5:
            err(f"near-duplicate: holdout {h['id']} vs bank {b['id']} Jaccard {j:.2f}")

# ---- soft stats (warnings only)
n_rule = sum(1 for t in tickets if t["rule"])
n_amb = sum(1 for t in tickets if t["ambiguous"])
id_re = re.compile(r"\bN\d{8}\b")
pii_re = re.compile(r"\bN\d{8}\b|\bx\d{4}\b|@northfield-state\.example")
n_id = sum(1 for t in tickets if id_re.search(t["text"]))
lens = sorted(len(t["text"].split()) for t in tickets)
for label, val, lo, hi in (("rule-based share", n_rule / 200, 0.60, 0.72),
                           ("ambiguous share", n_amb / 200, 0.25, 0.35)):
    if not lo <= val <= hi:
        warnings.append(f"{label} {val:.0%} outside {lo:.0%}-{hi:.0%}")
for t in tickets:
    for m in re.findall(r"[\w.+-]+@[\w.-]+\w", t["text"]):
        if not m.endswith(".example"):
            err(f"{t['id']} has an email outside the .example domains: {m}")


if "--table" in sys.argv:
    print("| Rule | Team | Bank | Holdout |")
    print("|---|---|---|---|")
    for r in rules:
        print(f"| {r['id']} | {r['team']} | {rule_bank[r['id']]} | {rule_hold[r['id']]} |")
    print(f"| none | (straightforward) | {sum(1 for t in bank if not t['rule'])} | {sum(1 for t in hold if not t['rule'])} |")
    sys.exit(0)

print("== NSU seed data validation ==")
print(f"teams={len(teams)} rules={len(rules)} tickets={len(tickets)} bank={splits.get('bank')} holdout={splits.get('holdout')}")
print(f"rule-based tickets: {n_rule} ({n_rule/2:.1f}%)   ambiguous: {n_amb} ({n_amb/2:.1f}%)   with student ID: {n_id}")
print(f"words per ticket: min={lens[0]} median={lens[len(lens)//2]} max={lens[-1]}")
print(f"max holdout-vs-bank Jaccard: {worst[0]:.2f} ({worst[1]} vs {worst[2]})")
print("per team (bank/holdout): " + ", ".join(f"{i}={team_bank[i]}/{team_hold[i]}" for i in team_ids))
print(f"rules covered: {sum(1 for r in rule_ids if rule_bank[r] >= 2 and rule_hold[r] >= 1)}/{len(rule_ids)}")
for w in warnings:
    print("WARN:", w)
if errors:
    print(f"FAIL: {len(errors)} error(s)")
    for e in errors:
        print("  -", e)
    sys.exit(1)
print("OK: all checks passed")
