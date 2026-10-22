#!/usr/bin/env python3
"""Scores a Laya server on the held-out prompts of eval.csv (the same labels haiku_baseline.py is scored on).

    python3 train/score_laya.py --url http://127.0.0.1:18787/v1/systemone --model cruise-effort

Reports right / too low / too high / no answer for several "unsure" thresholds: below that probability the judge counts
as unsure and Cruise would leave the app's effort alone, which is never "too low".
"""
import argparse
import csv
import json
import os
import statistics
import time
import urllib.request
from collections import Counter
from pathlib import Path

LEVELS = ["low", "medium", "high"]
TOP_PLAUSIBLE = 0.25  # keep in step with hooks/effort-rules.ts
LOW_NEEDS = 0.6
CRITERIA = {
    "low": "quick answer, no tools, no planning",
    "medium": "normal work: a few tool calls or edits",
    "high": "hard or large multi-step job: many tool calls, costly mistakes",
}


def cautious_pick(probs):
    if probs.get("high", 0) >= TOP_PLAUSIBLE:
        return "high"
    return "low" if probs.get("low", 0) >= LOW_NEEDS else "medium"


def ask(url, model, text, timeout):
    body = {
        "model": model,
        "state": text,
        "questions": {"effort": {"type": "choice", "instructions": "Which reasoning effort fits the next message?", "criteria": CRITERIA}},
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"}, method="POST")
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as res:
        answer = json.loads(res.read().decode())["answers"]["effort"]
    ms = (time.perf_counter() - started) * 1000
    choice = answer.get("choice")
    p = answer.get("answer_confidence")
    if p is None:
        p = (answer.get("probabilities") or {}).get(choice)
    probs = answer.get("probabilities")
    return (choice if choice in LEVELS else None), p, ms, (cautious_pick(probs) if probs else None)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True)
    parser.add_argument("--model", default="")
    parser.add_argument("--dir", default="~/.local/share/cruise/laya-training")
    parser.add_argument("--eval-file", default="eval.csv", help="which CSV in the data folder to score (e.g. sonnet-eval.csv)")
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--thresholds", default="0,0.4,0.5,0.6,0.7")
    args = parser.parse_args()
    rows = list(csv.DictReader(open(Path(os.path.expanduser(args.dir)) / args.eval_file, encoding="utf-8")))
    rank = {e: i for i, e in enumerate(LEVELS)}
    got = [ask(args.url, args.model, r["text"], args.timeout) for r in rows]
    times = [g[2] for g in got]
    print(f"{len(rows)} held-out prompts, model={args.model or 'auto'}, median {statistics.median(times):.0f} ms")
    def report(label, pick_of):
        count = Counter()
        for row, g in zip(rows, got):
            pick = pick_of(g)
            if pick is None:
                count["none"] += 1
            elif pick == row["label"]:
                count["right"] += 1
            elif rank[pick] < rank[row["label"]]:
                count["too low"] += 1
            else:
                count["too high"] += 1
        n = len(rows)
        steered = sum(1 for g in got if pick_of(g) in ("low", "medium"))
        print(f"  {label:<26} right {count['right']} ({100 * count['right'] / n:.0f}%)  too low {count['too low']} ({100 * count['too low'] / n:.0f}%)  too high {count['too high']}  steered below the top: {100 * steered / n:.0f}%")

    report("Cruise's cautious rule", lambda g: g[3] if g[3] else g[0])
    for t in [float(x) for x in args.thresholds.split(",")]:
        count = Counter()
        for row, (choice, p, _, _c) in zip(rows, got):
            if choice is None:
                count["none"] += 1
                continue
            # unsure: Cruise would not steer, so the app's effort goes out; that is "high" here (the ceiling case)
            pick = "high" if (p is not None and p < t) else choice
            if pick == row["label"]:
                count["right"] += 1
            elif rank[pick] < rank[row["label"]]:
                count["too low"] += 1
            else:
                count["too high"] += 1
        n = len(rows)
        print(f"  unsure below p={t:<4} right {count['right']} ({100 * count['right'] / n:.0f}%)  too low {count['too low']} ({100 * count['too low'] / n:.0f}%)  too high {count['too high']}  none {count['none']}")


if __name__ == "__main__":
    main()
