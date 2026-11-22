"""Summarise spike results: accuracy per bank size with 95% Wilson intervals.

Usage: python3 -I analyze.py <results.jsonl> [more.jsonl ...]
"""
import json
import math
import sys
from collections import defaultdict


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


items = {}
for path in sys.argv[1:]:
    for line in open(path):
        r = json.loads(line)
        if r.get("stage") == "item" and not r.get("err"):
            items[r["key"]] = r  # later runs overwrite earlier ones

by = defaultdict(list)
for r in items.values():
    by[(r["mode"], r["n"])].append(r)

W = max([7] + [len(m) for m, _ in by])
print(f"{'mode':{W}} {'n':>4} {'items':>5} {'model acc':>10} {'95% CI':>13} {'kNN acc':>8} {'local-rule acc':>15} {'avg ms':>7}")
for (mode, n), rs in sorted(by.items(), key=lambda x: (x[0][0], x[0][1])):
    k = sum(r["pred"] == r["gold"] for r in rs)
    lo, hi = wilson(k, len(rs))
    knn = [r for r in rs if r["knnPred"]]
    knn_acc = f"{100 * sum(r['knnPred'] == r['gold'] for r in knn) / len(knn):.0f}%" if knn else "-"
    rb = [r for r in rs if r.get("rule")]
    rb_acc = f"{100 * sum(r['pred'] == r['gold'] for r in rb) / len(rb):.0f}% ({len(rb)})" if rb else "-"
    ms = sum(r["ms"] for r in rs) / len(rs)
    print(f"{mode:{W}} {n:>4} {len(rs):>5} {100 * k / len(rs):>9.0f}% {f'{100 * lo:.0f}-{100 * hi:.0f}%':>13} {knn_acc:>8} {rb_acc:>15} {ms:>7.0f}")

# "Unsure" signal: model disagrees with the kNN vote. How well does it catch model errors?
print("\nUnsure signal (model label != kNN vote):")
for (mode, n), rs in sorted(by.items()):
    if n == 0:
        continue
    flagged = [r for r in rs if r["pred"] != r["knnPred"]]
    wrong = [r for r in rs if r["pred"] != r["gold"]]
    caught = [r for r in flagged if r["pred"] != r["gold"]]
    prec = f"{100 * len(caught) / len(flagged):.0f}%" if flagged else "-"
    rec = f"{100 * len(caught) / len(wrong):.0f}%" if wrong else "-"
    print(f"  {mode} n={n}: flagged {len(flagged)}/{len(rs)}, flagged-and-wrong {prec}, errors caught {rec}")

# Per-team accuracy at the smallest and largest bank size of each mode.
print("\nPer-team accuracy:")
modes = sorted({m for m, _ in by})
for mode in modes:
    sizes = sorted(n for m, n in by if m == mode)
    for n in (sizes[0], sizes[-1]) if len(sizes) > 1 else sizes:
        team = defaultdict(lambda: [0, 0])
        for r in by[(mode, n)]:
            team[r["gold"]][1] += 1
            team[r["gold"]][0] += r["pred"] == r["gold"]
        print(f"  {mode} n={n}: " + ", ".join(f"{t}={a}/{b}" for t, (a, b) in sorted(team.items())))

# Hybrid system: keep the on-device answer unless it disagrees with the kNN vote, then ask the cloud.
# The cloud answer must come from a run with the same bank size, so both see the same examples.
cloud_modes = sorted({m for m, _ in by if m.startswith(("cloud", "audit"))})
if cloud_modes:
    print("\nHybrid system (device answer; escalate to cloud when device != kNN; same bank size for both):")
    for cm in cloud_modes:
        for (mode, n), rs in sorted(by.items()):
            if mode.startswith(("cloud", "audit")) or n == 0 or (cm, n) not in by:
                continue
            cloud = {r["id"]: r for r in by[(cm, n)]}
            rs = [r for r in rs if r["id"] in cloud]
            if not rs:
                continue
            esc = [r for r in rs if r["pred"] != r["knnPred"]]
            kept = [r for r in rs if r["pred"] == r["knnPred"]]
            final = [(cloud[r["id"]]["pred"] if r["pred"] != r["knnPred"] else r["pred"]) == r["gold"] for r in rs]
            all_cloud = sum(cloud[r["id"]]["pred"] == r["gold"] for r in rs)
            kept_acc = f"{100 * sum(r['pred'] == r['gold'] for r in kept) / len(kept):.0f}%" if kept else "-"
            print(
                f"  {mode} n={n} + {cm}: accuracy {100 * sum(final) / len(rs):.0f}%"
                f" (all-cloud {100 * all_cloud / len(rs):.0f}%), cloud calls {100 * len(esc) / len(rs):.0f}%,"
                f" kept on device {100 * len(kept) / len(rs):.0f}% at {kept_acc} ({len(rs)} items)"
            )
