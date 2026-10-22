# Training a Laya effort judge on your own sessions

Laya without training is not a reliable judge (see the top-level README). This folder trains it on **your own work**: your real prompts, labelled in hindsight by a stronger model, so Laya learns what *your* prompts need.

**Privacy.** Your prompts can hold client names, code and other private text. Everything here writes only under `~/.local/share/cruise/laya-training` (mode 700), outside this repository. **Never commit, upload or share that folder, or a model trained on it** (a trained model can reproduce parts of its training text). The labelling step sends your prompts to Anthropic through your own `claude -p` login, exactly as using Claude Code does. Prompts that look like they hold a key, token or private key are dropped.

## The pipeline

```bash
python3 train/extract_prompts.py   # every prompt you typed, plus how much work it set off (tool calls, tokens, time)
python3 train/label_prompts.py     # a Claude model labels each one low / medium / high, seeing the work it caused
python3 train/build_dataset.py     # train.csv and eval.csv, split by session so nothing leaks
python3 train/haiku_baseline.py    # the Haiku judge on the same held-out prompts: the bar a trained Laya has to reach
```

Then train with `laya-train` (installed by the `/cruise:setup-laya` skill) and score the result on the held-out prompts and on `eval/judge-cases.json` / `eval/judge-cases-pt.json` with `eval/judge_eval.py`. The recipe and the exact command are in `skills/setup-laya/SKILL.md`.

## Training: the settings that worked

```bash
python3 train/build_dataset.py     # writes train.csv and eval.csv in the data folder
nice -n 15 laya-train --data ~/.local/share/cruise/laya-training/train.csv --eval ~/.local/share/cruise/laya-training/eval.csv \
  --out ~/.local/share/cruise/laya-training/model --base convaiinnovations/laya-multilingual --question-id effort \
  --instructions "Which reasoning effort fits the next message?" \
  --epochs 2 --micro-batch 2 --grad-accum 16 --max-len 256 --encoder-lr 2e-5 --head-lr 2e-4
```

About 10 minutes for 2,175 prompts on a 10-core Mac, and a modest amount of memory. **Do not train with the defaults on a laptop you are using**: a batch of 8 with texts up to 1,024 tokens filled 34 GB of memory and swap. `--freeze-encoder` (head only) is fast and light but did not learn here. Serve the result with `LAYA_EXTRA_MODELS='{"cruise-effort": "<model folder>"}'` and set Cruise's `judgeModel` to `cruise-effort`.

Then score it: `python3 train/score_laya.py --url <server> --model cruise-effort` (add `--eval-file sonnet-eval.csv` to score against another set of labels).

## Why hindsight labels

At inference a judge only sees the prompt text. At labelling time we also know what the prompt actually set off: a "fix this typo" that took 40 tool calls was not a low-effort job, and a long, scary-sounding question answered from memory was. Labelling with that evidence gives the student better answers than the text alone would, and Laya is then trained to guess them from the text alone.

## What the numbers mean

`haiku_baseline.py` is the honest comparison: the same held-out prompts, the same labels, the judge Cruise would use today. A trained Laya is worth running locally only if it gets close to that. On the data this was built on it did: both get about half of the noisy labels right, and Laya with Cruise's cautious rule makes far fewer "too low" mistakes (9% against 22%) while steering about half the prompts. "Too low" (a lower effort than the label) is the risky error.
