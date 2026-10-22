#!/usr/bin/env python3
"""Scores a Laya server on the held-out prompts of eval.csv (the same labels haiku_baseline.py is scored on).

    python3 train/score_laya.py --url http://127.0.0.1:18787/v1/systemone --model cruise-effort

Asks for all five levels. Reports the judge's own best guess and the quantile rule at several carefulness settings (tau):
the lowest level whose cumulative probability reaches tau. Cruise uses one of these; pick it from this table.
"""
import argparse
import csv
import json
import os
import statistics
import time
import urllib.request
from pathlib import Path

from levels import CRITERIA, LEVELS, line, quantile_pick, summarize


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
    return (choice if choice in LEVELS else None), answer.get("probabilities") or {}, ms


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True)
    parser.add_argument("--model", default="")
    parser.add_argument("--dir", default="~/.local/share/cruise/laya-training")
    parser.add_argument("--eval-file", default="eval.csv", help="which CSV in the data folder to score (e.g. sonnet-eval.csv)")
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--taus", default="0.5,0.6,0.7,0.8,0.9")
    parser.add_argument("--save", default="", help="write the probabilities per row to this file in the data folder, to retune without asking again")
    args = parser.parse_args()
    folder = Path(os.path.expanduser(args.dir))
    rows = list(csv.DictReader(open(folder / args.eval_file, encoding="utf-8")))
    got = [ask(args.url, args.model, r["text"], args.timeout) for r in rows]
    if args.save:
        with open(folder / args.save, "w", encoding="utf-8") as f:
            json.dump([{"label": r["label"], "choice": g[0], "probs": g[1]} for r, g in zip(rows, got)], f)
        os.chmod(folder / args.save, 0o600)
    print(f"{len(rows)} held-out prompts, model={args.model or 'auto'}, median {statistics.median(g[2] for g in got):.0f} ms")
    print(line("best guess", summarize([{"label": r["label"]} for r in rows], [g[0] or "medium" for g in got])))
    for tau in [float(x) for x in args.taus.split(",")]:
        picks = [quantile_pick(g[1], tau) if g[1] else (g[0] or "medium") for g in got]
        print(line(f"quantile tau={tau}", summarize([{"label": r["label"]} for r in rows], picks)))


if __name__ == "__main__":
    main()
