#!/usr/bin/env python3
"""Builds the training and evaluation CSVs for laya-train from the extracted prompts and their labels.

Each row is `text,label`, where `text` is exactly what Cruise sends a Laya judge (see layaState in hooks/effort-rules.ts)
and `label` is the lowest effort that would have been enough. The split is by SESSION, never by prompt: prompts of one
session share vocabulary and projects, so a random split would leak and flatter the model. Texts that appear on both
sides are removed from the training side. Everything stays under the private data folder.

    python3 train/build_dataset.py [--labels labels-claude-haiku-5-5.jsonl] [--eval-share 5]
"""
import argparse
import csv
import hashlib
import json
import os
from collections import Counter
from pathlib import Path


def laya_state(text, after_question):  # keep identical to layaState() in hooks/effort-rules.ts
    return f"last reply asked a question: {'yes' if after_question else 'no'}\nmessage: {text[:2000]}"


def in_eval(session, share):
    return int(hashlib.sha1(session.encode()).hexdigest(), 16) % share == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="~/.local/share/cruise/laya-training")
    parser.add_argument("--labels", default="labels-claude-haiku-5-5.jsonl")
    parser.add_argument("--prefix", default="", help="prefix for the output files, to keep several label sets side by side")
    parser.add_argument("--eval-share", type=int, default=5, help="1 session in N goes to the evaluation side")
    args = parser.parse_args()

    folder = Path(os.path.expanduser(args.dir))
    prompts = {f"{r['session']}|{r['at']}": r for r in map(json.loads, open(folder / "prompts.jsonl", encoding="utf-8"))}
    labels = {}
    for line in open(folder / args.labels, encoding="utf-8"):
        item = json.loads(line)
        labels[item["key"]] = item["effort"]

    train, held = [], []
    for key, effort in labels.items():
        row = prompts[key]
        item = (laya_state(row["text"], row["after_question"]), effort, row["session"])
        (held if in_eval(row["session"], args.eval_share) else train).append(item)
    held_texts = {t for t, _, _ in held}
    train = [t for t in train if t[0] not in held_texts]
    # one row per distinct text: a prompt typed twenty times would otherwise weigh twenty times
    train = list({t[0]: t for t in train}.values())
    held = list({t[0]: t for t in held}.values())

    for name, rows in (("train", train), ("eval", held)):
        path = folder / f"{args.prefix}{name}.csv"
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["text", "label"])
            writer.writerows((t, label) for t, label, _ in rows)
        os.chmod(path, 0o600)
        print(f"{name}: {len(rows)} rows, sessions {len({s for _, _, s in rows})}, labels {dict(Counter(l for _, l, _ in rows))}")


if __name__ == "__main__":
    main()
