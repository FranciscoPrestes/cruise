#!/usr/bin/env python3
"""Writes a synthetic training set for the Laya effort judge: prompts INVENTED by a Claude model, none taken from anyone's sessions.

    python3 train/make_synthetic.py            # writes train/data/synthetic-train.csv and synthetic-eval.csv

This is what makes a shared, ready-to-train Laya possible: the rows hold no private text, so they can live in this repository.
It costs roughly US$ 2 on your own `claude -p` login. The labels are the effort each prompt was *written to need*, which is a
model's opinion, like the hindsight labels of the other pipeline (and weaker than them: there is no record of the work done).
The generator runs in an empty folder with no tools, no settings and no session saved, so it sees nothing of yours.
"""
import argparse
import concurrent.futures
import getpass
import csv
import json
import random
import re
import subprocess
import tempfile
from pathlib import Path

from build_dataset import laya_state
from levels import LEVELS

MODEL = "claude-sonnet-5-5"
BATCH = 20
# (calls per language) per level: the mix follows what real sessions look like (mostly easy, the top levels rare)
CALLS = {"low": 16, "medium": 14, "high": 9, "xhigh": 4, "max": 3}
LANGS = {"en": "English", "pt": "Brazilian Portuguese"}
DOMAINS = [
    "a React/Next.js web front end", "a Python or Node back-end API", "SQL, data pipelines and spreadsheets",
    "cloud, Docker, CI/CD and infrastructure", "an iOS/Android or desktop app", "machine learning and data science code",
    "small shell and automation scripts on a personal computer", "writing, documentation and e-mails about technical work",
    "security review and incident work", "migrating or understanding a large legacy code base", "writing and fixing tests",
    "configuring tools, editors, the terminal and the operating system",
]
STYLES = [
    "terse, lowercase, typed fast, a few typos", "full polite sentences from a manager who is not a programmer",
    "voice-dictated: run-on, no punctuation", "a pasted error or log line followed by a short ask",
    "a precise engineer's request naming files, functions and constraints",
]
MEANING = {
    "low": "a tiny or quick job: a one-line edit, a question answered from memory, renaming, a command to remember, a small factual or yes/no answer. No planning, at most one tool call.",
    "medium": "ordinary work: a clear feature or bug in one or two files, a short script, explaining a piece of code, a few tool calls and edits.",
    "high": "a hard or large multi-step job: a change across many files, a tricky bug with an unknown cause, a design with trade-offs, a refactor where mistakes are costly.",
    "xhigh": "very hard: a long investigation or a big design, such as tracing a rare production bug across services, migrating a subsystem, a performance hunt with measurements.",
    "max": "the hardest, research-level work: an open-ended problem with no known answer, a whole-system rewrite plan, proving or inventing an algorithm, an audit of a whole code base.",
}


def own_names():
    """Fragments of the local user's name. The generator can see the account it runs under and sometimes writes it into an
    'invented' prompt (a launchd label, a username in a log); such rows are dropped so the shared set holds no real name."""
    git = subprocess.run(["git", "config", "user.name"], capture_output=True, text=True).stdout
    words = re.findall(r"[a-z]{4,}", (git + " " + getpass.getuser()).lower())
    return {w[:4] for w in words if len(w) >= 5} | set(words)


def ask(prompt):
    with tempfile.TemporaryDirectory() as empty:
        done = subprocess.run(
            ["claude", "-p", prompt, "--model", MODEL, "--no-session-persistence", "--tools", "", "--setting-sources", "",
             "--output-format", "text"],
            cwd=empty, capture_output=True, text=True, timeout=300,
        )
    return done.stdout


def batch(level, lang, domain, style):
    prompt = f"""Invent {BATCH} different messages that a developer or a manager might type to a coding assistant (like Claude Code).

Language: {LANGS[lang]}. Topic area: {domain}. Writing style: {style}.
Every message must be one that needs this reasoning effort from the assistant: {level}, meaning {MEANING[level]}

Rules: make everything up (names, files, errors, companies); never use real people or real secrets; vary length (some a few words, some a paragraph); do not number them; do not mention the effort level; each message must be able to stand alone, or be a short reply to a question the assistant just asked (then set "after_question" to true).
Answer with ONLY a JSON array of {BATCH} objects: {{"text": "...", "after_question": false}}."""
    out = ask(prompt)
    match = re.search(r"\[.*\]", out, re.S)
    rows = json.loads(match.group(0)) if match else []
    # a home-folder path or the local user's name could be a real person's, so such rows are dropped
    avoid = own_names()
    return [(r["text"].strip(), bool(r.get("after_question")), level) for r in rows
            if isinstance(r, dict) and r.get("text", "").strip() and "/Users/" not in r["text"] and "/home/" not in r["text"]
            and not any(w in r["text"].lower() for w in avoid)]


# Rows per 100 `low` rows. Real sessions are mostly easy and rarely hard; a judge trained on a flat mix asks for far too much effort
# (measured: 53% false alarms), so the training side is cut to this mix (xhigh and max stay a little above their real share).
MIX = {"low": 100, "medium": 85, "high": 45, "xhigh": 12, "max": 5}


def realistic_mix(rows, rng):
    low = sum(1 for _, level in rows if level == "low")
    kept = []
    for level in LEVELS:
        same = [r for r in rows if r[1] == level]
        rng.shuffle(same)
        kept += same[: round(low * MIX[level] / 100)]
    return kept


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(Path(__file__).parent / "data"))
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    rng = random.Random(args.seed)
    jobs = []
    for level, n in CALLS.items():
        for lang in LANGS:
            for i in range(n):
                jobs.append((level, lang, DOMAINS[(i * 5 + rng.randrange(len(DOMAINS))) % len(DOMAINS)], rng.choice(STYLES)))
    train, held, seen = [], [], set()
    with concurrent.futures.ThreadPoolExecutor(args.workers) as pool:
        futures = {pool.submit(batch, *job): (n, job) for n, job in enumerate(jobs)}
        for future in concurrent.futures.as_completed(futures):
            n, job = futures[future]
            try:
                rows = future.result()
            except Exception as err:  # a failed batch is only a smaller set; say so and go on
                print(f"batch {job} failed: {err}")
                continue
            for text, after_question, level in rows:
                if text in seen:
                    continue
                seen.add(text)
                # the split is by batch, so an eval row never shares a topic/style batch with a training row
                (held if n % 5 == 0 else train).append((laya_state(text, after_question), level))
    train = realistic_mix(train, rng)
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    for name, rows in (("synthetic-train", train), ("synthetic-eval", held)):
        rng.shuffle(rows)
        with open(out / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["text", "label"])
            writer.writerows(rows)
        counts = {level: sum(1 for _, l in rows if l == level) for level in LEVELS}
        print(f"{name}: {len(rows)} rows {counts}")


if __name__ == "__main__":
    main()
