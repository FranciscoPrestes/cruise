---
name: setup-laya
description: Installs and configures Laya, a small local model, as Cruise's effort judge on this machine (Python environment, model download, local server on 127.0.0.1, optional start at login), then points Cruise at it. Use when the user wants Cruise's `laya` effort judge, says "set up Laya", "install Laya for Cruise", or runs /cruise:setup-laya. Also covers training Laya on more examples and removing everything.
---

# Set up Laya for Cruise

You are installing software on the user's own machine. **Tell the user the plan and the sizes first, wait for a clear yes, and ask again before anything optional** (start at login, extra checkpoints, training). Never edit `~/.claude/settings.json` yourself: settings change through `/plugin configure cruise@prestes`.

Be straight with the user about what they get: Laya without training is a weak judge (see "How good is it", below). Offer `effort: haiku` as the working alternative and make sure they still want Laya.

## What gets installed, and what it costs

Measured on a Mac with 10 cores and 34 GB of memory:

| | |
| --- | --- |
| Python environment (PyTorch, transformers, FastAPI) | about 760 MB, in about 20 seconds |
| `laya-multilingual` checkpoint (322M parameters), downloaded from huggingface.co | about 650 MB. The default here, because the team writes Portuguese |
| `laya` English checkpoint (421M), optional | about 800 MB more |
| Disk in total | about 1.5 GB (multilingual only), 2.2 GB with both. Ask for 3 GB free |
| Memory while running | about 0.5 GB (multilingual only), 0.8 GB with both |
| Speed | 23 to 40 ms per decision once warm. Idle between prompts, no background work |
| Network | only for the download. The server listens on `127.0.0.1` and sends nothing out |

Everything lives under one folder, `~/.local/share/cruise/laya`, so removing it is one command.

## Steps

1. **Check the machine.** Report OS and CPU (`uname -sm`), free disk (`df -h ~`), memory. Stop and say so if there is less than 3 GB free disk or less than 2 GB free memory. Note if the machine is a company laptop with a software policy: the download comes from huggingface.co and PyPI, and the user may want IT's OK.
2. **Python 3.10 or newer is required.** macOS ships 3.9, and with it pip silently installs an old Laya (0.3.4), which is not what Cruise talks to. Use `uv` with Python 3.12: check `uv --version`; if it is missing, ask before installing it (https://docs.astral.sh/uv/).
3. **Create the environment** (ask first, then run):
   ```bash
   BASE="$HOME/.local/share/cruise/laya"
   mkdir -p "$BASE" && uv venv --python 3.12 "$BASE/venv"
   ```
4. **Install Laya.** On macOS the default PyTorch build is already the right one:
   ```bash
   uv pip install --python "$BASE/venv/bin/python" "laya[serve]"
   ```
   On Linux and Windows add `--torch-backend=cpu` so it does not pull gigabytes of GPU libraries (use a GPU build only if the user has one and wants it). Confirm the version: `"$BASE/venv/bin/python" -c "import laya; print(laya.__version__)"` should print 0.4 or newer.
5. **Pick a free port.** Start at 18787 and move up until `lsof -nP -iTCP:$PORT -sTCP:LISTEN` is empty (port 8787, for one, was already taken on the machine this was tested on). Never stop a process that is not yours.
6. **Write the launcher** `$BASE/start.sh`, always bound to the loopback address. Laya's server listens on all interfaces by default, which must not happen here:
   ```bash
   #!/bin/sh
   BASE="$HOME/.local/share/cruise/laya"
   export HF_HOME="$BASE/hf" LAYA_HOST=127.0.0.1 LAYA_PORT=<PORT> LAYA_MODELS=multilingual LAYA_PRELOAD=1
   exec "$BASE/venv/bin/laya-serve"
   ```
   `chmod +x` it. If the user also wants the English checkpoint, use `LAYA_MODELS=english,multilingual`.
7. **Start it and wait.** Run `nohup "$BASE/start.sh" > "$BASE/server.log" 2>&1 &` and poll `curl -s http://127.0.0.1:<PORT>/openapi.json` until it answers (the first start downloads the checkpoint, about a minute). If it does not come up, read `server.log` and fix the cause; do not retry blindly.
8. **Test one decision:**
   ```bash
   curl -s http://127.0.0.1:<PORT>/v1/systemone -H 'content-type: application/json' -d '{"model":"multilingual","state":{"next_message":"change the button colour to blue"},"questions":{"effort":{"type":"choice","instructions":"Which effort fits?","criteria":{"low":"quick","medium":"normal","high":"hard"}}}}'
   ```
   The reply must contain `answers.effort.choice`.
9. **Start at login (ask first).** On macOS a LaunchAgent in `~/Library/LaunchAgents/com.franciscoprestes.cruise.laya.plist` running `$BASE/start.sh` with `RunAtLoad`; on Linux a systemd user unit. Both are **untested**: say so, and offer to skip it and let the user start the server by hand with `$BASE/start.sh`. Without it, Cruise just falls back to the app's own effort whenever the server is down.
10. **Point Cruise at it.** Tell the user to run `/plugin configure cruise@prestes` and set `effort` = `laya`, `judgeUrl` = `http://127.0.0.1:<PORT>/v1/systemone`, `judgeModel` = `multilingual`. Then `/reload-plugins`.
11. **Check.** After a few prompts, `/cruise` should show verdicts and no judge failures.
12. **Report** in plain language: what was installed and where, how much disk it uses (`du -sh "$BASE"`), how to start, stop (`pkill -f laya-serve` only for the process on that port) and remove it, and the accuracy warning below.

## How good is it

Measured with `eval/judge_eval.py` (in this plugin's folder; find it under `~/.claude/plugins/cache/cruise/cruise/*/eval/`) on the effortless project's 75 labelled prompts, Laya 0.4.13, no training:

| Prompts | Checkpoint | Right | "Too low" (the risky error) |
| --- | --- | --- | --- |
| English, `judge-cases.json` | automatic / English / multilingual | 75% / 73% / 60% | 7 / 7 / 19 of 75 |
| Portuguese, `judge-cases-pt.json` | automatic / English / multilingual | 60% / 65% / 61% | 22 / 9 / 21 of 75 |

For comparison the effortless project reports 93% for Haiku and 99% for Jev on its set. **Without training, Laya is not good enough to trust**, in Portuguese least of all. Say this to the user, and offer the training below. Run the evaluation yourself to confirm on their machine:
```bash
python3 eval/judge_eval.py --url http://127.0.0.1:<PORT>/v1/systemone --mode laya --model multilingual --cases eval/judge-cases-pt.json
```

## Training Laya on the user's own sessions (optional, ask first)

Untrained Laya is weak; trained on the person's own sessions it matched the Haiku judge on accuracy in our test and, with Cruise's cautious rule, made far fewer "too low" mistakes (see the README). The pipeline is in this plugin's `train/` folder (find it under `~/.claude/plugins/cache/cruise/cruise/*/train/`; read `train/README.md` first). Be explicit with the user about three things before starting:

1. **Privacy.** It reads every prompt they typed in `~/.claude/projects`. The data and the trained model are written only under `~/.local/share/cruise/laya-training` (mode 700), never into a repository, and must never be shared. The labelling step sends the prompts to Anthropic through the user's own `claude -p` login, as normal use does (about US$ 0.30 for 3,000 prompts with Haiku). Prompts that look like they hold a key or token are dropped.
2. **Memory.** Do not train with the defaults on a laptop in use: a batch of 8 with long texts filled a 34 GB Mac's memory and swap. Use the lean settings below, at low priority, and watch `sysctl vm.swapusage`; stop if swap grows.
3. **Honesty about the result.** The labels are a model's opinion of the effort a prompt needs, not a measurement of answer quality. Say what the held-out numbers show and that real savings are only known after a few days of `/cruise`.

Steps: `extract_prompts.py`, `label_prompts.py`, `build_dataset.py`, `haiku_baseline.py` (the bar to reach), then:

```bash
nice -n 15 "$BASE/venv/bin/laya-train" --data ~/.local/share/cruise/laya-training/train.csv --eval ~/.local/share/cruise/laya-training/eval.csv \
  --out ~/.local/share/cruise/laya-training/model --base convaiinnovations/laya-multilingual --question-id effort \
  --instructions "Which reasoning effort fits the next message?" \
  --epochs 2 --micro-batch 2 --grad-accum 16 --max-len 256 --encoder-lr 2e-5 --head-lr 2e-4
```

Serve it by adding `LAYA_EXTRA_MODELS='{"cruise-effort": "<HOME>/.local/share/cruise/laya-training/model"}'` to `start.sh`, restart, and set Cruise's `judgeModel` = `cruise-effort`. Score it with `train/score_laya.py` and `eval/judge_eval.py` before trusting it. What we measured: held-out accuracy 41% to 54%, calibration error 0.23 to 0.04, about 25 ms per decision.

## Remove everything

1. Stop the server (the process listening on the chosen port, which should be `laya-serve`).
2. Remove the login item if one was created.
3. `rm -rf ~/.local/share/cruise/laya`.
4. `/plugin configure cruise@prestes` and set `effort` back to `off` (or `haiku`).
