# Training a Laya effort judge on your own sessions

Laya without training is not a reliable judge (see the top-level README). This folder trains it on **your own work**: your real prompts, labelled in hindsight by a stronger model, so Laya learns what *your* prompts need.

**Privacy.** Your prompts can hold client names, code and other private text. Everything here writes only under `~/.local/share/cruise/laya-training` (mode 700), outside this repository. **Never commit, upload or share that folder, or a model trained on it** (a trained model can reproduce parts of its training text). The labelling step sends your prompts to Anthropic through your own `claude -p` login, exactly as using Claude Code does. Prompts that look like they hold a key, token or private key are dropped.

## The pipeline

```bash
python3 train/extract_prompts.py   # every prompt you typed, plus how much work it set off (tool calls, tokens, time)
python3 train/label_prompts.py     # a Claude model labels each one with one of the five levels (low, medium, high, xhigh, max), seeing the work it caused
python3 train/build_dataset.py     # train.csv and eval.csv, split by session so nothing leaks
python3 train/haiku_baseline.py --save haiku-picks.json   # Cruise's exact Haiku judge (through eval/judge-runner, needs bun) on the same held-out prompts: the bar a trained Laya has to reach
```

Then train with `laya-train` (the five levels are in the `label` column; repeat the rare `xhigh` and `max` rows three times in the training file, since there are few) (installed by the `/cruise:setup-laya` skill) and score the result on the held-out prompts and on `eval/judge-cases.json` / `eval/judge-cases-pt.json` with `eval/judge_eval.py`. The recipe and the exact command are in `skills/setup-laya/SKILL.md`.

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

`haiku_baseline.py` is the honest comparison: the same held-out prompts, the same labels, the judge Cruise would use today. `score_laya.py --save` scores a Laya server and keeps its probabilities, and `compare.py` puts Haiku, Laya and "always `medium`" on one ruler (exact, easy found, hard found, false alarms, mean level and a cost where a level too low counts three times a level too high). On the data this was built on, with all five levels, both judges get about half of the noisy labels right (50% against 37% for always `medium`); Haiku also finds about half of the hard prompts, Laya about one in ten, because `xhigh` and `max` are rare in anyone's sessions (59 and 10 prompts out of 2,796 here). See the README for the table.

## The invented set in `data/`

`make_synthetic.py` asks a Claude model for prompts it **makes up** (about 1,550 in English and Brazilian Portuguese, five writing styles, twelve topics, each written to need one of the five efforts) and writes `data/synthetic-train.csv` and `data/synthetic-eval.csv`. Nothing in them comes from anyone's sessions, so, unlike everything the pipeline above produces, they can be shared. It costs about US$ 3 on your own login.

It does **not** make a good judge: trained on these rows only, Laya scored 30% exact on 619 real held-out prompts (Haiku with examples: 52%, always `medium`: 37%) and asked for `high` or more on 58% of prompts that did not need it, because invented hard prompts sound more obviously hard than real ones. The training side is already cut to a realistic mix (mostly easy; without that the false alarms were 53% at best guess). Use the set to try the pipeline end to end, or as extra rows next to your own sessions (untested), not on its own.
