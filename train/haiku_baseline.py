#!/usr/bin/env python3
"""Scores Cruise's Haiku judge (prompt text only, no hindsight) on the evaluation CSV, as a baseline for a trained Laya.

It asks the same instructions as judgeSystem() in hooks/effort-rules.ts (copied below: keep them in step) one prompt at
a time through your own `claude -p` login, offers all five levels with `medium` as the app's default, and compares the
answer with the labels in eval.csv.

    python3 train/haiku_baseline.py [--model claude-haiku-5-5] [--workers 6] [--limit N] [--eval-file eval.csv]
"""
import argparse
import csv
import json
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from levels import CRITERIA, EXAMPLES, LEVELS, line, summarize

APP_DEFAULT = "medium"
SYSTEM = (
    "You choose the reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Pick the effort the job needs: the lowest that will still do it well, and a higher one when the job is hard or a mistake would be costly. A wrong answer costs more than the saving.\n\n"
    "Levels you may choose:\n" + "\n".join(f"- {k}: {v}" for k, v in CRITERIA.items()) + "\n\n"
    'Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "review the whole repo" or "migrate everything" are big, tool-heavy jobs.\n'
    'A short follow-up ("yes", "go", "ok", or the same in any language) continues the current work: keep the current level.\n'
    "If the message answers a question the assistant just asked, judge the work that answer starts. If it corrects or adds to ongoing work, keep at least the current level.\n"
    'If the person asks for deep thought ("think hard", "be thorough"), pick the highest level you may choose; if they ask for a quick answer, pick low.\n\n'
    'Reply with JSON only: {"effort":"<level>","sure":0.0-1.0 how sure you are,"why":"at most 6 words, in the user\'s language"}'
)


def system_with_examples():
    listing = "\n".join(f'- "{text}" -> {level}' for level, text in EXAMPLES)
    return SYSTEM.replace("Reply with JSON only", f"Examples of the right level (the real messages are different, judge their scope the same way):\n{listing}\n\nReply with JSON only")


def ask(model, text, workdir, examples=False):
    match = re.match(r"last reply asked a question: (yes|no)\nmessage: ([\s\S]*)", text)
    after_question, message = match.group(1) == "yes", match.group(2)
    prompt = (
        f"Current level: none yet\nLevel the app uses by default: {APP_DEFAULT}\nHighest level allowed: {LEVELS[-1]}\n"
        f"The assistant's last reply ended with a question: {'yes' if after_question else 'no'}\n\nNext message:\n{message[:2000]}"
    )
    cmd = [
        "claude", "-p", "--model", model, "--no-session-persistence", "--disable-slash-commands", "--strict-mcp-config",
        "--tools", "", "--setting-sources", "", "--output-format", "json", "--system-prompt", system_with_examples() if examples else SYSTEM, prompt,
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
    parser.add_argument("--eval-file", default="eval.csv")
    parser.add_argument("--examples", action="store_true", help="add the made-up examples to the instructions")
    parser.add_argument("--save", default="", help="write the answers to this file in the data folder, to score them against other labels later")
    args = parser.parse_args()
    rows = list(csv.DictReader(open(Path(os.path.expanduser(args.dir)) / args.eval_file, encoding="utf-8")))
    if args.limit:
        rows = rows[: args.limit]
    workdir = tempfile.mkdtemp(prefix="cruise-baseline-")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        answers = list(pool.map(lambda r: ask(args.model, r["text"], workdir, args.examples), rows))
    if args.save:
        target = Path(os.path.expanduser(args.dir)) / args.save
        target.write_text(json.dumps([{"text": r["text"], "pick": a[0]} for r, a in zip(rows, answers)]))
        os.chmod(target, 0o600)
    answered = [(r, a[0]) for r, a in zip(rows, answers) if a[0]]
    tokens = sum(t for _, t in answers)
    print(f"{args.model} judge on {len(rows)} held-out prompts ({len(rows) - len(answered)} without an answer), {tokens / len(rows):.0f} tokens per judged prompt")
    print(line("haiku", summarize([r for r, _ in answered], [p for _, p in answered])))


if __name__ == "__main__":
    main()
