#!/usr/bin/env python3
"""Labels the prompts that extract_prompts.py wrote with the lowest reasoning effort that would have been enough.

The labeller is a Claude model run through your own `claude -p` login. It sees what a judge at inference time cannot:
how much work the prompt actually set off (model requests, tool calls, output tokens, seconds). That hindsight makes the
labels better than a judge could produce from the text alone, and the student (Laya) is then trained to guess them from
the text alone. Calls use --no-session-persistence, no tools, no plugins, so they leave no sessions behind.

Your prompts are sent to Anthropic exactly as when you use Claude Code. Output stays in the same private folder.

    python3 train/label_prompts.py [--model claude-haiku-5-5] [--levels 5] [--limit N] [--workers 6]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ALL_LEVELS = ["low", "medium", "high", "xhigh", "max"]
BATCH = 20
MESSAGE_CHARS = 900

# The levels as Anthropic describes them (platform.claude.com/docs/build-with-claude/effort): low for simple, fast work;
# medium for well-specified agentic work; high for complex reasoning and hard coding; xhigh for long-horizon work of
# 30 minutes or more; max for the deepest reasoning, not for size.
DEFINITIONS = {
    "low": "a simple, well-bounded request: a quick answer or lookup, a rename, a typo, a one-line or single-file edit, chit-chat, a thank-you, a plain yes/no/\"go\" that continues work already planned and easy. Nothing to verify.",
    "medium": "well-specified work with clear steps: read a few files and edit across them, write a function or its tests, explain a module, draft text, a bug with an obvious area, an ordinary question that needs a little digging.",
    "high": "complex reasoning or hard coding: debugging an unknown cause, a large refactor or migration, architecture or design, a security or full-repo review, a vague or open-ended ask that needs exploring, research across many sources, anything where a mistake is costly.",
    "xhigh": "long-horizon work: an investigation or a change across many files and systems that takes 30 minutes or more of real work, where the cause or the design is unclear and a wrong turn wastes hours.",
    "max": "the deepest reasoning: a novel or research-level problem with no known approach, where depth of thought, not length, is the bottleneck. Rare. Never for size alone: a long run of known steps is xhigh at most.",
}
HINTS = {
    3: [
        "- 0 to 2 tool calls and a short reply usually means low, unless the prompt itself plainly asked for something deep that was answered from memory.",
        "- Several tool calls (about 3 to 15) usually means medium.",
        "- Many tool calls (about 15 or more), a long run, or heavy output usually means high, unless the work was big only because of repetitive, mechanical steps (then medium).",
    ],
    5: [
        "- 0 to 2 tool calls and a short reply usually means low, unless the prompt itself plainly asked for something deep that was answered from memory.",
        "- Several tool calls (about 3 to 15) usually means medium.",
        "- About 15 to 40 tool calls, or a run of several minutes with real reasoning, usually means high.",
        "- About 40 or more tool calls over 30 minutes or more usually means xhigh, if the work really was hard and not just repetitive.",
        "- max is never earned by size or time: only when the problem itself needed the deepest reasoning (novel, research-level, no known approach). Repetitive, mechanical steps (renaming across files, bulk edits) count one level lower than their size suggests.",
    ],
}


def system(levels):
    listing = "\n".join(f"- {level}: {DEFINITIONS[level]}" for level in levels)
    hints = "\n".join(HINTS[len(levels)])
    names = "|".join(f'"{level}"' for level in levels)
    return f"""You label prompts that a person typed to an agentic coding assistant (it reads files, runs tools, edits things) with the LOWEST reasoning effort that would still have done the job well. You see the prompt and, in hindsight, how much work it set off. Labels train a small model that will later guess the effort from the prompt text alone, so label what the prompt itself calls for.

Levels:
{listing}

How to use the hindsight numbers. They are evidence, not a rule:
{hints}
- A prompt that is mostly pasted material (logs, a document, code) is judged by what is asked of it.
- A short reply to a question ("yes", "do it", "B", "go") is judged by the work it started.
- If the signals disagree, trust what the prompt asks for.

Reply with JSON only: an array with one object per prompt, in the same order, {{"id": <number>, "effort": {names}}}. No other text."""


def describe(i, row):
    tools = ", ".join(f"{k} x{v}" for k, v in sorted(row["tools"].items(), key=lambda kv: -kv[1])[:3]) or "none"
    flags = "the assistant's last reply ended with a question; " if row["after_question"] else ""
    text = row["text"][:MESSAGE_CHARS].replace("\r", "")
    suffix = " [message cut]" if len(row["text"]) > MESSAGE_CHARS or row["full_length"] > len(row["text"]) else ""
    return (
        f"### {i}\n{flags}work that followed: {row['requests']} model request(s), {row['tool_calls']} tool call(s) ({tools}), "
        f"{row['output_tokens']} output tokens, {row['seconds']} s\nmessage: {text}{suffix}\n"
    )


def ask(model, batch, workdir, levels):
    prompt = "\n".join(describe(i, row) for i, row in enumerate(batch))
    cmd = [
        "claude", "-p", "--model", model, "--no-session-persistence", "--disable-slash-commands", "--strict-mcp-config",
        "--tools", "", "--setting-sources", "", "--output-format", "json", "--system-prompt", system(levels), prompt,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=workdir, timeout=300)
    events = json.loads(out.stdout)
    result = [e for e in events if e.get("type") == "result"][-1]
    text = result.get("result", "")
    match = re.search(r"\[[\s\S]*\]", text)
    answers = json.loads(match.group(0)) if match else []
    labels = {int(a["id"]): a["effort"] for a in answers if isinstance(a, dict) and a.get("effort") in levels}
    return labels, float(result.get("total_cost_usd") or 0.0)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="~/.local/share/cruise/laya-training")
    parser.add_argument("--model", default="claude-haiku-5-5")
    parser.add_argument("--out", default="")
    parser.add_argument("--levels", type=int, choices=(3, 5), default=5, help="3 = low/medium/high, 5 = every level Claude Code offers")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    folder = Path(os.path.expanduser(args.dir))
    rows = [json.loads(line) for line in open(folder / "prompts.jsonl", encoding="utf-8")]
    seen, unique = set(), []
    for row in rows:  # identical texts (the same request pasted twice) are labelled once
        key = (row["text"], row["after_question"])
        if key not in seen:
            seen.add(key)
            unique.append(row)
    if args.limit:
        import random

        random.Random(args.seed).shuffle(unique)
        unique = unique[: args.limit]
    levels = ALL_LEVELS[: 3 if args.levels == 3 else 5]
    target = folder / (args.out or f"labels{args.levels}-{args.model}.jsonl")
    done = set()
    if target.exists():
        done = {json.loads(line)["key"] for line in open(target, encoding="utf-8")}
    todo = [r for r in unique if f"{r['session']}|{r['at']}" not in done]
    print(f"{len(unique)} unique prompts, {len(done)} already labelled, {len(todo)} to do with {args.model}", flush=True)

    batches = [todo[i : i + BATCH] for i in range(0, len(todo), BATCH)]
    workdir = tempfile.mkdtemp(prefix="cruise-label-")
    spent, failed, written = 0.0, 0, 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool, open(target, "a", encoding="utf-8") as sink:
        futures = {pool.submit(ask, args.model, batch, workdir, levels): batch for batch in batches}
        for n, future in enumerate(as_completed(futures), 1):
            batch = futures[future]
            try:
                labels, cost = future.result()
            except Exception as error:  # noqa: BLE001 - a bad batch is retried on the next run, not fatal
                failed += 1
                print(f"batch failed: {type(error).__name__}: {str(error)[:120]}", file=sys.stderr, flush=True)
                continue
            spent += cost
            for i, row in enumerate(batch):
                if i in labels:
                    sink.write(json.dumps({"key": f"{row['session']}|{row['at']}", "effort": labels[i]}) + "\n")
                    written += 1
            sink.flush()
            if n % 10 == 0 or n == len(batches):
                print(f"{n}/{len(batches)} batches, {written} labels, ${spent:.2f}", flush=True)
    os.chmod(target, 0o600)
    print(f"done: {written} labels written to {target} (${spent:.2f}); {failed} batch(es) failed, rerun to retry them")


if __name__ == "__main__":
    main()
