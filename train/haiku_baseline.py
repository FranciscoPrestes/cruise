#!/usr/bin/env python3
"""Scores Cruise's Haiku judge (prompt text only, no hindsight) on the evaluation CSV, as a baseline for a trained Laya.

It asks the same instructions as judgeSystem() in hooks/effort-rules.ts (copied below: keep them in step) one prompt at
a time through your own `claude -p` login, and compares the answer with the labels in eval.csv. Use it to see whether a
trained Laya is as good as the judge it is meant to replace.

    python3 train/haiku_baseline.py [--model claude-haiku-5-5] [--workers 6] [--limit N]
"""
import argparse
import csv
import json
import os
import re
import subprocess
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LEVELS = ["low", "medium", "high"]
CRITERIA = {
    "low": "quick answer, no tools, no planning",
    "medium": "normal work: a few tool calls or edits",
    "high": "hard or large multi-step job: many tool calls, costly mistakes",
}
SYSTEM = (
    "You choose the reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Pick the lowest effort that will still do the job well; a wrong answer costs more than the saving.\n\n"
    "Levels you may choose:\n" + "\n".join(f"- {k}: {v}" for k, v in CRITERIA.items()) + "\n\n"
    'Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "review the whole repo" or "migrate everything" are big, tool-heavy jobs.\n'
    'A short follow-up ("yes", "go", "ok", or the same in any language) continues the current work: keep the current level.\n'
    "If the message answers a question the assistant just asked, judge the work that answer starts. If it corrects or adds to ongoing work, keep at least the current level.\n"
    'If the person asks for deep thought ("think hard", "be thorough"), pick the highest level you may choose; if they ask for a quick answer, pick low.\n\n'
    'Reply with JSON only: {"effort":"<level>","sure":0.0-1.0 how sure you are,"why":"at most 6 words, in the user\'s language"}'
)


def ask(model, text, workdir):
    match = re.match(r"last reply asked a question: (yes|no)\nmessage: ([\s\S]*)", text)
    after_question, message = match.group(1) == "yes", match.group(2)
    prompt = (
        f"Current level: none yet\nHighest level allowed: high\nThe assistant's last reply ended with a question: {'yes' if after_question else 'no'}\n\n"
        f"Next message:\n{message[:2000]}"
    )
    cmd = [
        "claude", "-p", "--model", model, "--no-session-persistence", "--disable-slash-commands", "--strict-mcp-config",
        "--tools", "", "--setting-sources", "", "--output-format", "json", "--system-prompt", SYSTEM, prompt,
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, cwd=workdir, timeout=120)
        result = [e for e in json.loads(out.stdout) if e.get("type") == "result"][-1]
        usage = result.get("usage", {})
        tokens = (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0)
        # Haiku sometimes closes the object badly ("why":"...","}); read the field by itself, as Cruise does
        found = re.search(r'"effort"\s*:\s*"([a-z]+)"', result.get("result", ""))
        effort = found.group(1) if found else None
        return (effort if effort in LEVELS else None), tokens
    except Exception:  # noqa: BLE001 - a failed call counts as no answer
        return None, 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="~/.local/share/cruise/laya-training")
    parser.add_argument("--model", default="claude-haiku-5-5")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    rows = list(csv.DictReader(open(Path(os.path.expanduser(args.dir)) / "eval.csv", encoding="utf-8")))
    if args.limit:
        rows = rows[: args.limit]
    workdir = tempfile.mkdtemp(prefix="cruise-baseline-")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        answers = list(pool.map(lambda r: ask(args.model, r["text"], workdir), rows))
    rank = {e: i for i, e in enumerate(LEVELS)}
    count = Counter()
    for row, (got, _) in zip(rows, answers):
        if got is None:
            count["none"] += 1
        elif got == row["label"]:
            count["right"] += 1
        elif rank[got] < rank[row["label"]]:
            count["too low"] += 1
        else:
            count["too high"] += 1
    n = len(rows)
    tokens = sum(t for _, t in answers)
    print(f"{args.model} judge on {n} held-out prompts: right {count['right']} ({100 * count['right'] / n:.0f}%), too low {count['too low']}, too high {count['too high']}, no answer {count['none']}; {tokens / n:.0f} tokens per judged prompt")


if __name__ == "__main__":
    main()
