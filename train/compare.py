#!/usr/bin/env python3
"""Puts Haiku, a trained Laya and the do-nothing baseline on the same ruler, on one set of labels.

    python3 train/compare.py --eval-file h5-eval.csv --probs probs5-h5-eval.csv.json --haiku haiku5-picks.json

Needs the files written by score_laya.py --save and haiku_baseline.py --save.
"""
import argparse
import csv
import json
import os
from pathlib import Path

from levels import cost, line, quantile_pick, summarize


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="~/.local/share/cruise/laya-training")
    parser.add_argument("--eval-file", required=True)
    parser.add_argument("--probs", required=True)
    parser.add_argument("--haiku", required=True)
    parser.add_argument("--taus", default="0.45,0.5,0.55,0.6")
    args = parser.parse_args()
    folder = Path(os.path.expanduser(args.dir))
    rows = list(csv.DictReader(open(folder / args.eval_file, encoding="utf-8")))
    laya = json.load(open(folder / args.probs))
    haiku = {x["text"]: x["pick"] for x in json.load(open(folder / args.haiku))}
    keep = [i for i, r in enumerate(rows) if haiku.get(r["text"])]
    rows = [rows[i] for i in keep]
    laya = [laya[i] for i in keep]
    labels = [{"label": r["label"]} for r in rows]
    entries = [("always medium", ["medium"] * len(rows)), ("haiku", [haiku[r["text"]] for r in rows]),
               ("laya, best guess", [x["choice"] or "medium" for x in laya])]
    entries += [(f"laya, quantile {t}", [quantile_pick(x["probs"], float(t)) for x in laya]) for t in args.taus.split(",")]
    print(f"{len(rows)} prompts, labels from {args.eval_file}")
    for name, picks in entries:
        print(line(name, summarize(labels, picks)) + f"  cost(3:1) {cost(labels, picks):.2f}  cost(2:1) {cost(labels, picks, 2.0):.2f}")


if __name__ == "__main__":
    main()
