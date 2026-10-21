#!/usr/bin/env python3
"""Scores a Jev-compatible judge (TypeSafe Jev, or a local Laya server) on the labelled prompts in judge-cases.json.

It sends exactly what Cruise sends (see askHttp in hooks/effort.ts: the next message plus two small facts, never the
conversation) and applies Cruise's rules: the judge may only choose up to the effort the app is on, and an answer
with confidence below 0.5 keeps the current effort. Standard library only.

    python3 eval/judge_eval.py --url http://127.0.0.1:8787/v1/systemone --mode laya
    python3 eval/judge_eval.py --url https://api.typesafe.ai/v1/systemone --mode jev --key "$TYPESAFE_API_KEY"

The cases come from effortless (MIT), see NOTICE. A case is "right" when the chosen effort is one `ok` lists.
"""
import argparse
import json
import statistics
import sys
import time
import urllib.request
from pathlib import Path

EFFORTS = ["low", "medium", "high", "xhigh", "max"]
CRITERIA = {
    "low": "quick answer, no tools, no planning",
    "medium": "normal work: a few tool calls or edits",
    "high": "hard or large multi-step job: many tool calls, costly mistakes",
    "xhigh": "very hard: a long investigation",
    "max": "the hardest research-level work",
}
TASK = (
    "Choose the lowest reasoning effort an agentic assistant needs for the next user message. "
    "Judge scope and amount of work. A short follow-up keeps the current effort."
)
UNSURE_BELOW = 0.5
FOLLOW_UP_MAX_CHARS = 12
FOLLOW_UP_MAX_WORDS = 2


def ends_on_question(context):
    reply = context.split("assistant:")[-1] if "assistant:" in context else ""
    return "?" in reply.strip()[-400:]


def is_follow_up(text):
    t = text.strip()
    return 0 < len(t) <= FOLLOW_UP_MAX_CHARS and len(t.split()) <= FOLLOW_UP_MAX_WORDS


def ask(url, key, mode, model, message, top, current, after_question, timeout):
    # Jev and Laya heads offer at most low / medium / high; "high" then means "as hard as it gets".
    levels = EFFORTS[: min(EFFORTS.index(top), EFFORTS.index("high")) + 1]
    body = {
        "model": model or ("jev-1" if mode == "laya" else "jev-latest"),
        "state": {
            "task": TASK,
            "current_effort": current,
            "last_reply_ended_with_question": after_question,
            "next_message": message[:2000],
        },
        "questions": {
            "effort": {
                "type": "choice",
                "instructions": "Which effort fits the next message?",
                "criteria": {level: CRITERIA[level] for level in levels},
            }
        },
    }
    headers = {"content-type": "application/json"}
    if key:
        headers["authorization"] = f"Bearer {key}"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as res:
        answer = json.loads(res.read().decode())
    ms = (time.perf_counter() - started) * 1000
    effort = answer["answers"]["effort"]
    choice = effort.get("choice")
    if choice not in levels:
        return None, None, ms
    # Laya's `confidence` measures how concentrated the distribution is, not a probability; the probability of the
    # reported answer is `answer_confidence`. Jev's `confidence` is on a different scale again, so use a probability.
    p = effort.get("answer_confidence")
    if p is None:
        p = (effort.get("probabilities") or {}).get(choice, effort.get("confidence"))
    return choice, p, ms


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True)
    parser.add_argument("--mode", choices=["jev", "laya"], default="laya")
    parser.add_argument("--key", default="")
    parser.add_argument("--cases", default=str(Path(__file__).with_name("judge-cases.json")))
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--model", default="", help="checkpoint to ask for (Laya: english, multilingual, typed-decisions); default lets the server route")
    parser.add_argument("--thresholds", default="0,0.3,0.4,0.5,0.6", help="probabilities below which the judge counts as unsure and the app's effort is kept")
    args = parser.parse_args()

    cases = json.loads(Path(args.cases).read_text())["cases"]
    thresholds = [float(t) for t in args.thresholds.split(",")]
    rank = {e: i for i, e in enumerate(EFFORTS)}
    raw = []
    for case in cases:
        app = case["current"]["effort"]
        message = case["message"]
        after_question = ends_on_question(case.get("context", ""))
        # Cruise keeps the pick on a short follow-up without asking the judge; here the pick is the app's effort.
        if is_follow_up(message) and not after_question:
            raw.append((case, app, None, 0.0, True))
            continue
        try:
            choice, p, ms = ask(args.url, args.key, args.mode, args.model, message, app, app, after_question, args.timeout)
        except Exception as error:  # noqa: BLE001 - report every failure and go on
            print(f"{case['id']}: request failed: {error}", file=sys.stderr)
            choice, p, ms = None, None, 0.0
        raw.append((case, app, (choice, p), ms, False))

    def grade(case, app, choice):
        accepted = [e for e in case["ok"] if rank[e] <= rank[app]]
        capped = not accepted  # every acceptable effort is above the app's: the ceiling forces a lower one, by design
        if choice is None:
            return "none", capped
        if choice in case["ok"] or (capped and choice == app):
            return "right", capped
        return ("too low" if rank[choice] < min(rank[e] for e in case["ok"]) else "too high"), capped

    def rows_at(threshold):
        rows = []
        for case, app, got, ms, followup in raw:
            if followup:
                choice = app
            elif got is None or got[0] is None:
                choice = None
            else:
                choice = app if (got[1] is not None and got[1] < threshold) else got[0]  # unsure: keep the app's effort
                if choice == "high" and rank[app] > rank["high"]:
                    choice = app  # the highest label keeps a higher app effort
            verdict, capped = grade(case, app, choice)
            rows.append({"holdout": bool(case.get("holdout")), "capped": capped, "verdict": verdict, "ms": ms})
        return rows

    def line(label, subset):
        n = len(subset)
        count = lambda v: sum(r["verdict"] == v for r in subset)
        return f"{label} right {count('right')}/{n} ({100 * count('right') / n:.0f}%) too low {count('too low')} too high {count('too high')} none {count('none')}"

    base = rows_at(0.0)
    times = [r["ms"] for r in base if r["ms"] > 0]
    print(f"model={args.model or 'auto'}  median {statistics.median(times):.0f} ms  max {max(times):.0f} ms" if times else "no timings")
    for t in thresholds:
        rows = rows_at(t)
        print(f"  keep-current below p={t:<4} | {line('all', rows)} | {line('held out', [r for r in rows if r['holdout']])}")
    capped = sum(r["capped"] for r in base)
    print(f"{capped} case(s) accept only efforts above the app's own; counted right when the judge stays at the app's effort.")


if __name__ == "__main__":
    main()
