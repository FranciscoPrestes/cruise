#!/usr/bin/env python3
"""Extracts the prompts you typed in your Claude Code sessions, plus how much work each one set off.

The output is the raw material for training a Laya effort judge on your own work. It contains your prompts, which can hold
client names, code and other private text, so it is written ONLY under a folder outside this repository
(default ~/.local/share/cruise/laya-training, mode 700) and must never be committed or shared.

For every prompt typed by a person it records the session, the time, the text (cut to 2000 characters, as Cruise sends
it), whether the assistant's previous reply ended with a question, and what followed until the next typed prompt: how
many model requests, how many tool calls, the tools used, the output tokens and the time. Prompts that look like they
hold a secret (a key, token or private key) are dropped, not redacted.

    python3 train/extract_prompts.py [--projects ~/.claude/projects] [--out ~/.local/share/cruise/laya-training]
"""
import argparse
import glob
import json
import os
import re
from datetime import datetime
from pathlib import Path

MAX_CHARS = 2000
SECRET = re.compile(
    r"(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.|"
    r"(?i:(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{8,}))"
)
SYSTEM_START = ("<", "[Request interrupted", "Caveat:", "[Image")


def text_of(content):
    """The typed text of a user message, or None when it is a tool result, an attachment or a system note."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        if any(b.get("type") == "tool_result" for b in content if isinstance(b, dict)):
            return None
        parts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        return "\n".join(p for p in parts if p) or None
    return None


def is_typed(o, text):
    if o.get("type") != "user" or o.get("isMeta") or o.get("isSidechain"):
        return False
    t = (text or "").strip()
    return bool(t) and not t.startswith(SYSTEM_START)


def parse_time(stamp):
    try:
        return datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    except Exception:  # noqa: BLE001
        return None


def ends_on_question(reply):
    return "?" in reply.strip()[-400:]


def assistant_text(o):
    content = (o.get("message") or {}).get("content")
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return content if isinstance(content, str) else ""


def new_work():
    return {"requests": set(), "tool_calls": 0, "tools": {}, "output_tokens": 0, "first": None, "last": None, "model": None}


def finish(prompt, work):
    if prompt is None:
        return None
    seconds = round(work["last"] - work["first"], 1) if work["first"] and work["last"] else 0.0
    prompt.update(
        requests=len(work["requests"]),
        tool_calls=work["tool_calls"],
        tools=work["tools"],
        output_tokens=work["output_tokens"],
        seconds=seconds,
        model=work["model"],
    )
    return prompt


def extract(path):
    rows, prompt, work, last_reply = [], None, new_work(), ""
    session = Path(path).stem
    for line in open(path, encoding="utf-8", errors="replace"):
        try:
            o = json.loads(line)
        except Exception:  # noqa: BLE001
            continue
        stamp = parse_time(o.get("timestamp", "")) if o.get("timestamp") else None
        if o.get("type") == "user":
            text = text_of((o.get("message") or {}).get("content"))
            if is_typed(o, text):
                done = finish(prompt, work)
                if done:
                    rows.append(done)
                clean = text.strip()
                prompt = {
                    "session": session,
                    "cwd_name": Path(o.get("cwd", "")).name,
                    "at": o.get("timestamp"),
                    "text": clean[:MAX_CHARS],
                    "full_length": len(clean),
                    "after_question": ends_on_question(last_reply),
                    "secret": bool(SECRET.search(clean)),
                }
                work = new_work()
                work["first"] = stamp
        elif o.get("type") == "assistant" and prompt is not None:
            message = o.get("message") or {}
            work["requests"].add(message.get("id") or o.get("uuid"))
            work["output_tokens"] += (message.get("usage") or {}).get("output_tokens", 0) or 0
            work["model"] = message.get("model") or work["model"]
            for block in message.get("content") or []:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    work["tool_calls"] += 1
                    name = block.get("name", "?")
                    work["tools"][name] = work["tools"].get(name, 0) + 1
            reply = assistant_text(o)
            if reply.strip():
                last_reply = reply
            work["last"] = stamp or work["last"]
    done = finish(prompt, work)
    if done:
        rows.append(done)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--projects", default="~/.claude/projects")
    parser.add_argument("--out", default="~/.local/share/cruise/laya-training")
    args = parser.parse_args()
    out = Path(os.path.expanduser(args.out))
    out.mkdir(parents=True, exist_ok=True)
    os.chmod(out, 0o700)

    files = sorted(glob.glob(os.path.expanduser(args.projects) + "/*/*.jsonl"))
    kept, dropped_secret, dropped_empty = [], 0, 0
    for path in files:
        for row in extract(path):
            if row["secret"]:
                dropped_secret += 1
                continue
            if row["requests"] == 0:
                dropped_empty += 1  # the session ended or was interrupted before the assistant answered
                continue
            row.pop("secret")
            kept.append(row)
    target = out / "prompts.jsonl"
    with open(target, "w", encoding="utf-8") as f:
        for row in kept:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.chmod(target, 0o600)
    print(f"{len(files)} transcripts -> {len(kept)} prompts kept ({dropped_secret} dropped for looking like they hold a secret, {dropped_empty} with no answer)")
    print(f"written to {target}")


if __name__ == "__main__":
    main()
