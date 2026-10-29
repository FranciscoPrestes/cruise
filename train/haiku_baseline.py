#!/usr/bin/env python3
"""Scores Cruise's Haiku judge (prompt text only, no hindsight) on the evaluation CSV, as a baseline for a trained Laya.

It asks exactly what Cruise asks: the system prompt and questions come from hooks/effort-rules.ts (through
train/judge_text.ts, which needs bun), through eval/judge-runner (a plugin calling $.model.complete on your own login, as
Cruise does), at the judge's own effort (`low`) and cap (160 tokens), and compares the answer with the labels in the CSV.

    python3 train/haiku_baseline.py [--model claude-haiku-5-5] [--judge-effort low] [--app medium] [--top xhigh]
                                    [--workers 6] [--limit N] [--offset N] [--eval-file eval.csv] [--save picks.json]
"""
import argparse
import time
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import csv
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from levels import LEVELS, cost, line, summarize

HERE = Path(__file__).resolve().parent


def judge_texts(rows, top, app, script=HERE / "judge_text.ts"):
    """The system prompt and one question per row, built by the same code Cruise runs."""
    parsed = []
    for row in rows:
        match = re.match(r"last reply asked a question: (yes|no)\nmessage: ([\s\S]*)", row["text"])
        parsed.append({"afterQuestion": match.group(1) == "yes", "text": match.group(2)})
    out = subprocess.run(["bun", str(Path(script).resolve())], input=json.dumps({"top": top, "app": app, "rows": parsed}),
                         capture_output=True, text=True, check=True, cwd=HERE.parent)
    data = json.loads(out.stdout)
    return data["system"], data["prompts"]


def run_judge(model, effort, max_tokens, workers, system, prompts):
    """Every prompt through eval/judge-runner, a plugin that calls $.model.complete exactly as Cruise does (no thinking, the
    same cap). Plain `claude -p` thinks before it answers, so it measured a different judge."""
    workdir = Path(tempfile.mkdtemp(prefix="cruise-baseline-"))
    job = workdir / "job.json"
    job.write_text(json.dumps({"model": model, "effort": effort, "maxTokens": max_tokens, "workers": workers, "system": system, "prompts": prompts}))
    subprocess.run(["claude", "-p", "--plugin-dir", str(HERE.parent / "eval" / "judge-runner"), "--model", model, "--tools", "",
                    "--no-session-persistence", "--strict-mcp-config", "reply OK"], cwd=workdir, env={**os.environ, "JUDGE_JOB": str(job)},
                   capture_output=True, text=True, check=True, timeout=3600)
    return [read_reply(reply) for reply in json.loads((workdir / "job.json.out.json").read_text())]


def read_reply(reply):
    # Haiku sometimes closes the object badly ("why":"...","}); read the field by itself, as Cruise does
    found = re.search(r'"effort"\s*:\s*"([a-z]+)"', reply["text"])
    sure = re.search(r'"sure"\s*:\s*([0-9]*\.?[0-9]+)', reply["text"])
    pick = found.group(1) if found and found.group(1) in LEVELS else None
    return pick, float(sure.group(1)) if sure else None, reply["out"], reply.get("ms", 0), reply.get("cost", 0.0), reply.get("served", "")


def ask_openrouter(model, max_tokens, system, prompt):
    """One judge call to an OpenRouter model (such as typesafe/jev-router) with the same instructions, on OPENROUTER_API_KEY."""
    body = json.dumps({"model": model, "max_tokens": max_tokens, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}).encode()
    request = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=body, method="POST",
                                     headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"})
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read())
        usage = data.get("usage") or {}
        text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        return {"text": text, "out": usage.get("completion_tokens") or 0, "ms": int((time.time() - started) * 1000), "cost": usage.get("cost") or 0.0, "served": data.get("model", "")}
    except Exception:  # noqa: BLE001 - a failed call counts as no answer
        return {"text": "", "out": 0, "ms": int((time.time() - started) * 1000)}


def run_openrouter(model, max_tokens, workers, system, prompts):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return [read_reply(r) for r in pool.map(lambda p: ask_openrouter(model, max_tokens, system, p), prompts)]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="~/.local/share/cruise/laya-training")
    parser.add_argument("--model", default="claude-haiku-5-5", help="a model with a / (typesafe/jev-router) is asked through OpenRouter on OPENROUTER_API_KEY")
    parser.add_argument("--judge-effort", default="low", choices=LEVELS, help="the judge's own effort (Cruise sends low)")
    parser.add_argument("--app", default="medium", choices=LEVELS, help="the effort the app is on")
    parser.add_argument("--top", default="max", choices=LEVELS, help="the highest level the judge may pick (Cruise's topLevel)")
    parser.add_argument("--max-tokens", type=int, default=160, help="the reply cap (Cruise's JUDGE_MAX_TOKENS)")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--eval-file", default="eval.csv")
    parser.add_argument("--judge-text", default=str(HERE / "judge_text.ts"), help="another copy of judge_text.ts, to score another version of the instructions")
    parser.add_argument("--save", default="", help="write the answers to this file in the data folder, to score them against other labels later")
    args = parser.parse_args()
    rows = list(csv.DictReader(open(Path(os.path.expanduser(args.dir)) / args.eval_file, encoding="utf-8")))
    rows = rows[args.offset : args.offset + args.limit] if args.limit else rows[args.offset :]
    system, prompts = judge_texts(rows, args.top, args.app, args.judge_text)
    if "/" in args.model:
        answers = run_openrouter(args.model, args.max_tokens, args.workers, system, prompts)
        served = Counter(a[5] for a in answers if a[5])
        print(f"OpenRouter: US$ {sum(a[4] for a in answers):.4f} in all; served by {dict(served.most_common(6))}")
    else:
        answers = run_judge(args.model, args.judge_effort, args.max_tokens, args.workers, system, prompts)
    answered = [(r, a[0]) for r, a in zip(rows, answers) if a[0]]
    out_tokens = sorted(a[2] for a in answers if a[0])
    print(f"{args.model} at {args.judge_effort}, app {args.app}, top {args.top}, on {len(rows)} prompts ({len(rows) - len(answered)} without an answer), output tokens median {out_tokens[len(out_tokens) // 2] if out_tokens else 0} max {out_tokens[-1] if out_tokens else 0}")
    ms = sorted(a[3] for a in answers)
    print(f"  latency ms: median {ms[len(ms) // 2]}, p90 {ms[int(len(ms) * 0.9)]}, max {ms[-1]}, over Cruise's 6 s timeout: {sum(m > 6000 for m in ms)}")
    picked = [p for _, p in answered]
    labelled = [r for r, _ in answered]
    print(line("haiku", summarize(labelled, picked)) + f"  cost {cost(labelled, picked):.2f}")
    print("  picks:", {level: picked.count(level) for level in LEVELS})
    if args.save:  # an absolute path is written where it says
        target = Path(os.path.expanduser(args.dir)) / args.save
        target.write_text(json.dumps([{"text": r["text"], "pick": a[0], "sure": a[1], "out": a[2]} for r, a in zip(rows, answers)]))
        os.chmod(target, 0o600)


if __name__ == "__main__":
    main()
