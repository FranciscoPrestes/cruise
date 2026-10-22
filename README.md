<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img src="assets/logo-light.svg" alt="Cruise: cruise control for Claude Code" width="440">
  </picture>
</p>

<p align="center">
  <b>Context warnings, a progress band and per-prompt effort steering for Claude Code.</b><br>
  <a href="#install">Install</a> · <a href="#how-it-works">How it works</a> · <a href="#effort-steering">Effort steering</a> · <a href="#settings">Settings</a> · <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" align="top">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/cruise-bench-dark.svg">
    <img src="assets/cruise-bench-light.svg" alt="An isometric bench showing how Cruise works: messages pass under a small judge, which moves an effort fader up or down from your app's setting, never past a top stop; a context gauge lights its 60% and 80% warnings and raises a /handoff tag." width="860">
  </picture>
</p>

One plugin, three jobs, each of which you can switch off:

| | What it does | On by default |
| --- | --- | --- |
| **Context** | Warns when the context passes 60% and 80% and points you to `/handoff`, before quality drops | yes |
| **Progress** | A band above the prompt with your current request, the plan step and what runs in the background | yes |
| **Effort** | A small judge picks the reasoning effort for each prompt: lower for a button-colour change, higher for a hard job | yes, judged by Haiku on your own login |

```text
Request (12 min ago): change the colour of the save button on the settings page to blue
Step 3 of 5: Writing the integration tests
Effort low (app: medium) · tiny edit
Running in background: 2 agents, 1 command
```

## How it works

The animation above is the whole plugin, one stage at a time:

1. **You send a message.** It is the only thing Cruise looks at.
2. **A small judge reads that message**, never your conversation: just the text, whether the last reply ended with a question, and the effort now in use. The judge is `haiku` (your own Claude login), `jev` (a hosted API) or `laya` (a model on your machine).
3. **It sets the effort the job needs.** A typo fix goes down to `low`, a normal edit stays at `medium`, a repository-wide review goes up to `high`, and a genuinely huge or unclear job can go to `xhigh` or `max`. The effort you set in the app is the starting point (often `medium`), and the judge may move it either way; a judge that fails or is unsure leaves your setting alone.
4. **It watches the context.** At 60% and 80% it warns you and points to `/handoff`, so a long session ends with a clean hand-off rather than a quiet loss of quality. A progress band above the prompt keeps the current request and plan step in view.

## Install

Cruise is not in Anthropic's official plugin directory. This repository is its own plugin marketplace, so the install commands point at it.

**The easy way: let Claude Code do it.** Open Claude Code and paste this:

```text
Install Cruise from https://github.com/FranciscoPrestes/cruise and help me configure it.
```

Claude Code reads [`INSTALL.md`](INSTALL.md) in this repository, installs the plugin, and then asks you a few short questions (context warnings, progress band, effort steering and which judge) before saving your answers.

**By hand.** At the Claude Code prompt:

```text
/plugin marketplace add FranciscoPrestes/cruise
/plugin install cruise@prestes
```

or from a terminal:

```bash
claude plugin marketplace add FranciscoPrestes/cruise
claude plugin install cruise@prestes
```

Then run `/reload-plugins` or open a new session. The installer may say some options are "not yet set". That is fine: every option has a default. To change them later, run `/cruise:configure` (a short conversation) or `/plugin configure cruise@prestes`.

Check it works: `/cruise` prints what Cruise is doing, and sending a request of 25 characters or more makes the band appear.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `context` | on | Context warnings |
| `warnAt` / `urgentAt` / `resetBelow` | 60 / 80 / 40 | Context % of the first warning, the urgent one, and where warnings start over |
| `progress` | on | The progress band |
| `minAskChars` | 25 | Messages shorter than this ("go ahead") do not replace the request shown |
| `effort` | **haiku** | `off`, `haiku`, `jev` or `laya`: see below |
| `steer` | both | `both`: the judge may raise or lower the effort from your app's. `down`: only lower it |
| `topLevel` | max | The highest effort the judge may pick: `high`, `xhigh` or `max`. The judge chooses among all five levels Claude Code offers; lower this to cap the cost of the hardest jobs |
| `judgeUrl` | empty | Where a `jev` or `laya` judge listens. Empty means the hosted Jev, or `http://127.0.0.1:18787/v1/systemone` for Laya |
| `judgeKey` | empty | TypeSafe key for `jev`. Kept in Claude Code's secure storage. Laya needs none |
| `judgeModel` | empty | The judge's model. Empty: Haiku 5.5 for `haiku`, the server's choice for `jev` and `laya` (set it to `multilingual`, or to a checkpoint you trained) |
| `updates` | check | `check`: look on GitHub once a day and tell you when there is a new version, you decide when to install (`/cruise:update`). `auto`: install it for you. `off`: never look |

## Effort steering

### What it does, and what it never does

For each prompt you type, a small judge reads the message and picks the lowest effort that still does the job. Cruise then sends the model requests of that work at that effort.

- **It moves the effort up or down.** The effort you set in the app is the starting point. A quick fix goes lower; a hard job goes higher, up to the `topLevel` setting (`max` by default, so all five levels are in play: `low`, `medium`, `high`, `xhigh`, `max`). If you would rather it never spent more than your own setting, set `steer` to `down`.
- **You stay in charge.** If you change the effort in the app, the new value becomes the starting point immediately. Every behaviour has a switch: see Settings.
- **It stops by itself if the prompt cache is ever rewritten** after an effort change. It says so once and leaves your effort alone for the rest of the session.
- **A failing, slow or unreachable judge never holds a prompt.** The request goes out at your own effort.
- **Only the models where this was measured** are steered: the Opus, Sonnet and Fable 5 families. Haiku takes no effort setting and is left alone. Subagents are left alone.
- A short follow-up ("yes", "go", "ok") keeps the current pick and asks no judge.

### Does changing the effort break the prompt cache?

This decides whether the whole idea pays, so it was measured, not assumed. Anthropic's documentation says that changing the top-level effort between requests invalidates the cache, and that a per-message effort change (beta) preserves it on models that support it. On Claude Code 2.1.306 we alternated `low` and `high` on every request of a six-request task:

| Model | Cache read grew from → to (tokens) | New tokens written per request |
| --- | --- | --- |
| Sonnet 5.5 | 45,432 → 46,376 | about 100 (one request 638) |
| Opus 5.5 | 45,033 → 45,882 | about 78 (one request 615) |
| Fable 5.1 | 45,974 → 46,936 | about 103 (one request 653) |

In all three the cache kept being read and nothing was rewritten. Limits: one trivial task per model, one run each, Claude Code 2.1.306 only; Opus before the 5 family and Amazon Bedrock were not measured (Anthropic's documentation says per-message effort is not available for Opus 5 on Bedrock). The built-in guard exists for exactly the cases we did not measure. The probe that produced these numbers is in `eval/cache-probe/`: run it on your own setup before relying on them.

### Pick your judge

| `effort` | Judge | Needs | Costs | What leaves your machine |
| --- | --- | --- | --- | --- |
| `off` | none | nothing | nothing | nothing |
| `haiku` | Claude Haiku 5.5, on your own Claude login | nothing | the judge's tokens, on your account | the next message and two small facts, to Anthropic |
| `jev` | TypeSafe Jev (hosted) | a TypeSafe API key | what TypeSafe charges | the next message and two small facts, **to TypeSafe** |
| `laya` | Laya, a model that runs on your machine | the setup below | disk, memory and a little CPU | nothing |

"Two small facts" means the effort you are on and whether the assistant's last reply ended with a question. **Cruise never sends the conversation to any judge.** This is a deliberate difference from effortless, which sends recent conversation to its judge. The trade-off is a little less context for follow-ups, which the follow-up rule covers.

### Will it actually save money?

Be honest with the numbers, because this depends on how you work:

- The effortless project (the idea this builds on) measured, on 4 easy coding tasks run through the API, 21% less cost than Opus at medium, 29% less than high and 42% less than xhigh. On Sonnet it came out even against medium and saved 10% against high and 35% against xhigh. These are their numbers: few tasks, mostly easy ones, and plan usage was not measured. We have not reproduced them.
- **If you already work at `medium`, expect little or nothing on Sonnet and a modest saving on Opus.** If you work at `high` or `xhigh`, there is much more to save.
- **Raising the effort costs tokens.** With `steer: both` a hard prompt can run at `high` (or higher) even when your app is on `medium`: that is the point, and it is where the extra quality comes from. If you want pure savings, set `steer` to `down`.
- **With the `haiku` judge the saving is smaller than those figures.** Haiku is very cheap, effortless puts it at roughly $0.001 to $0.002 per prompt, but it is not free, and that figure was not included in their numbers. On easy prompts it is a small part of the cost; if you send many tiny prompts it adds up. `jev` costs a key; `laya` costs only local resources.
- **A judge that is wrong is the real cost.** An effort that is too low can mean a worse answer or more retries. Judge accuracy, from the effortless project's labelled prompts: Haiku 93%, Jev 99% (their figures). Laya without training, measured here on the same prompts (below): 75% in English and 60% to 65% in Portuguese.
- Run `/cruise` after a day of real work: it shows how many prompts were judged, how many requests were sent at a lower effort than yours, and the judge's tokens. Decide with your own numbers.

### Laya on your machine

Laya is a small open-source model (Apache 2.0) that answers typed decisions in one pass, in tens of milliseconds, and speaks the same protocol as Jev. Cruise talks to it through `judgeUrl`.

**The easiest way: let your own Claude Code do it.** Install Cruise, then paste this into Claude Code:

```text
Run the cruise:setup-laya skill. Tell me what it will download and how much disk and memory it needs, wait for my OK, and then install and configure everything.
```

If the plugin is not installed yet, paste this instead and it will install the plugin first:

```text
Install the Cruise plugin: run `claude plugin marketplace add FranciscoPrestes/cruise` and then `claude plugin install cruise@prestes`. Then run the cruise:setup-laya skill: tell me what it will download and how much disk and memory it needs, wait for my OK, and then install and configure everything.
```

**What to expect (measured on a Mac with 10 cores and 34 GB of memory):**

| | |
| --- | --- |
| Python | **3.10 or newer is required.** macOS ships 3.9, which silently installs an old Laya (0.3.4). The skill uses `uv` with Python 3.12 |
| Install | about 20 seconds for the packages, **757 MB** on disk (mostly PyTorch) |
| Model download | the multilingual checkpoint (322M parameters), **about 650 MB**, from huggingface.co on first use. The English one (421M) is optional, about 800 MB more |
| Total disk | about **1.5 GB** (multilingual only) or 2.2 GB with both; keep 3 GB free |
| Memory | **about 0.5 GB** while loading and answering (multilingual only); **0.8 GB** with both checkpoints loaded |
| Speed | **23 to 38 ms** per decision after warm-up, which is below what you notice. The first request after starting is slower |
| CPU | a short burst per prompt, then idle. Nothing runs between prompts |
| Network | none after the download, if you keep the server on `127.0.0.1` |
| Port | `18787` by default. The skill picks a free one if it is taken |

Things the skill takes care of, and why:

- **Bind to `127.0.0.1` only.** Laya's own server listens on all network interfaces by default. Cruise needs it on your machine alone, with no key.
- A port such as 8787 was already used on the machine this was tested on, so the default is unusual and the skill checks for a free one.
- Models are kept under `~/.local/share/cruise/laya` so uninstalling is one command.
- On Linux and Windows the skill installs the CPU build of PyTorch, so it does not pull gigabytes of GPU libraries you do not need.
- Starting at login is optional and asked about. A launcher script is provided; a macOS LaunchAgent and a systemd user unit are described but **not tested**.
- It asks before every download and before touching any setting.

To remove everything: stop the server, delete `~/.local/share/cruise/laya`, remove the login item if you created one, and set `effort` back to `off`.

**How accurate is Laya? Measured, not promised.** `eval/judge_eval.py` sends the effortless project's 75 labelled prompts to any Jev-compatible judge, exactly as Cruise does, and applies Cruise's rules. `eval/judge-cases.json` is the original (English); `eval/judge-cases-pt.json` is our Portuguese translation of the same prompts (made by Claude and not reviewed by a native speaker, so a first check, not a benchmark). Laya 0.4.13 with no training, on that machine:

| Prompts | Checkpoint | Right (all 75) | Right (20 held out) | Too low | Too high |
| --- | --- | --- | --- | --- | --- |
| English | automatic routing | 75% | 80% | 7 | 12 |
| English | multilingual | 60% | 65% | 19 | 11 |
| Portuguese | automatic routing | 60% | 55% | **22** | 8 |
| Portuguese | multilingual | 61% | 60% | **21** | 8 |
| Portuguese | English | 65% | 65% | 9 | 17 |

"Right" means the effort is one the labels accept; "too low" is the risky error, because it can mean a worse answer. For comparison the effortless project reports 93% for Haiku and 99% for Jev on the English set. **Without training, Laya is not a judge to trust, least of all in Portuguese:** about three prompts in ten would be sent at too low an effort. Laya's own documentation says to treat it as a fast base to specialise, not as a zero-shot decision engine, and this agrees. More to know:

- Laya's `confidence` field is how concentrated its distribution is, not a probability. Cruise reads the probability of the answer instead; a threshold copied from Jev would misfire (it reads 0.23 for a 51% pick). With the probability, the threshold barely changes the result up to 0.4.
- Training on the effortless examples works mechanically but is not enough on its own. We trained on the 55 non-held-out cases for 12 epochs (about 3.4 minutes on that Mac, a 1.6 GB checkpoint) and tested on the 20 held-out: exact-match accuracy went from 40% to 60%, but the model became overconfident (mean confidence 0.62 to 0.97, calibration error up). Fifty-five examples overfit. A useful Laya needs hundreds of examples, ideally from your own work, in Portuguese, and labelled by a stronger judge. The recipe is in `skills/setup-laya/SKILL.md`.

#### After training on your own sessions, with all five levels

Claude Code offers five efforts (`low`, `medium`, `high`, `xhigh`, `max`), so the judges choose among five, not three. `train/` turns your own Claude Code sessions into a training set (see `train/README.md`): every prompt you typed, labelled in hindsight by a Claude model that also sees how much work the prompt set off. We ran it on 401 sessions of one person: 3,025 prompts, 2,796 labelled by Haiku 5.5 for under US$ 0.30 and again by Sonnet 5.5 for about US$ 4. We fine-tuned `laya-multilingual` on 2,177 of them and tested on 619 prompts from 71 sessions it never saw (the split is by session, so nothing leaks).

**The data is the limit.** Of the 2,796 prompts Haiku labelled, 1,173 were `low`, 985 `medium`, 569 `high`, **59 `xhigh` and 10 `max`**: people rarely type a prompt that needs the top levels, and in the held-out prompts there were 10 `xhigh` and one `max`. Nothing below says how well any judge picks those two levels; it only says how well it separates easy from ordinary from hard.

Scored against Haiku's labels on the 619 held-out prompts (Sonnet's labels give the same picture):

| Judge | Exact | Easy found (picks `low` when labelled `low`) | Hard found (`high` or more when labelled `high` or more) | False alarms (`high` or more when labelled `low` or `medium`) | Mean level (labels 0.73) |
| --- | --- | --- | --- | --- | --- |
| Always `medium` (do nothing) | 37% | 0% | 0% | 0% | 1.00 |
| **Haiku 5.5**, with Cruise's made-up examples (what `effort: haiku` runs) | 52% | 53% | 48% | 12% | 0.83 |
| Haiku 5.5, without the examples | 51% | 46% | 55% | 16% | 0.95 |
| **Laya after training**, Cruise's rule (the median of its probabilities) | 48% | 44% | 11% | 6% | 0.78 |
| Laya after training, plain best guess | 54% | 71% | 2% | 2% | 0.53 |

"Mean level" counts `low` as 0 and `max` as 4: lower means cheaper, and `medium` is the baseline of 1.00.

What this says, and does not say:

- **Both judges beat doing nothing at exact accuracy (50% against 37%) and find about half of the easy prompts. Haiku also finds about half of the hard ones; the trained Laya almost never does** (11%), because the hard levels are rare in what it learned. Laya's strength is the cheap, private, offline side: it picks `low` correctly for about 44% of the easy prompts in 25 ms, with nothing leaving your machine.
- **If a level too low is three times as bad as a level too high, neither judge clearly beats always `medium`** on these labels (cost 1.00 for Haiku with examples, 1.03 for always `medium`, 1.12 for Laya). If it is only twice as bad, Haiku with examples comes out ahead (0.77 against 0.84). The labels are noisy: Haiku and Sonnet, labelling the same prompts, agree on 68% (96% within one level), so a judge cannot do much better than half exact. Treat these as a first, honest measurement and watch `/cruise` on real work before drawing conclusions. Nothing here measures the quality of the answers or the tokens saved.
- **Tuning the rule.** A judge returns a probability for every level. Cruise picks the lowest level whose cumulative probability reaches 0.5 (`QUANTILE`). Asking for more (0.6, 0.7) made Laya demand more effort than the work needed: at 0.7 its mean level was 1.56 against 0.79 in the labels. A hybrid (Laya for the easy ones, Haiku for the rest) did not beat Haiku alone. Re-tune with `train/score_laya.py`, `train/compare.py` and your own sessions.
- **The Haiku examples are made up** (13 sentences written for this project, none from anyone's sessions): they moved Haiku from asking for more effort than the labels to matching them, at about 50 extra tokens per judged prompt (236 against 188).
- **Training is cheap but easy to get wrong on a busy laptop.** Fine-tuning with the defaults (batch of 8, up to 1,024 tokens) filled the 34 GB Mac's memory and swap and had to be killed. Training only the head left the model at chance. The settings that worked: `--micro-batch 2 --grad-accum 16 --max-len 256 --encoder-lr 2e-5 --head-lr 2e-4 --epochs 2`, at low priority (`nice -n 15`), about 15 minutes. The rare levels were repeated three times in the training file so the model sees them at all.
- **The data and the model are private.** They contain your prompts. They live under `~/.local/share/cruise/laya-training` (mode 700), never in this repository, and must not be shared.
- **A bug the real prompts exposed.** Haiku sometimes closes its answer badly (`"why":"...","}`), and Cruise used to throw such answers away: on real prompts about one verdict in five was lost. The reader now takes the fields one by one.

**Ultracode** (the toggle you see under `/effort`) is not something Cruise can switch on: a plugin cannot change it. It stays your call for the hardest jobs.

**Recommendation today:** `haiku` is the best way to start and the default. `laya` is worth it if you want effort steering offline and private **and** you are willing to train it on your own sessions first; expect it to lower the effort of easy prompts well and to miss most of the hard ones. Either way, watch `/cruise` for a few days.

## Context warnings and the progress band

- **Context.** Warns once per band at 60% (a notice) and 80% (a notice and a system notification), and shows `Context 82% · type /handoff` in the status line. Bands start over if the context drops below 40% (after a compaction). The check runs before every model request, the moment each response completes, after every tool call and when a turn ends. A reply that by itself crosses a threshold is flagged the moment it completes, not before: its size is only known once it exists.
- **Progress.** The current request, `Step N of M` from Claude's task list (a subagent's list is ignored), the effort pick when steering is on, and what runs in the background: subagents, commands, monitors, workflows and schedules, followed as they start and end, and reset to Claude Code's own list at the end of every turn. The "x min ago" label refreshes by itself every minute.

## The panel and updates

- **`/cruise`** opens the panel: what is on, the context gauge, what the judge is choosing right now, the update status and the list of settings you can change.
- **Updates.** Once a day Cruise reads the version published on GitHub and, if there is a newer one, tells you: `Cruise 1.4.0 is available (you have 1.3.0). Type /cruise:update to install it.` Installing is always your call, unless you set `updates` to `auto`. `/cruise:update` checks right now and installs on your yes. Set `updates` to `off` and nothing is ever checked.

## Bundled skills

| Skill | What it does |
| --- | --- |
| `/handoff` | Saves the state of the work (goal, what is done, next steps, pending decisions) to `~/.local/state/handoffs/<folder>/` so a later session can resume. Does not continue the task |
| `/pickup` | In a new session, reads the latest handoff for that folder, checks folder and branch, and resumes from the first next step |
| `/cruise:update` | Checks GitHub for a newer version of Cruise and installs it when you agree; also offers to turn the daily automatic check on, off, or to install by itself |
| `/cruise:configure` | A short conversation that sets Cruise up: context warnings, progress band, effort steering and which judge. Saves the answers for you |
| `/cruise:setup-laya` | Installs and configures Laya on your machine, step by step, asking before each download |

Recommended flow when the context warning appears: finish the step, `/handoff`, `/clear` (or open a new session in the same folder), `/pickup`. If you already have your own skills called `handoff` or `pickup`, the names collide: use the plugin's by its full name (`/cruise:handoff`) or remove yours.

## Update and remove

```text
/cruise:update                      # check for a new version and install it
/plugin uninstall cruise@prestes    # remove
```

## Known limitations

- All text is in English.
- Effort steering covers the main conversation only; subagents run at their own effort.
- The cache guard needs a request that follows an effort change to notice a rewrite, so at most one request pays for it before steering stops.
- Background work is followed from the moment a tool reports it (including commands sent to the background with Ctrl+B or by a timeout); at the end of every turn the band is reset to Claude Code's own list.
- Laya: see above. Without training it is not reliable, in Portuguese least of all.

## Develop and test

```bash
claude plugin validate .      # manifest, marketplace and hooks
claude plugin test .          # 86 tests
claude --plugin-dir .         # run the plugin straight from this folder
node scripts/check-version.mjs # the version in hooks/version.ts must equal plugin.json (the update check reads it)
python3 eval/judge_eval.py --url <judge url> --mode laya   # score a judge on the labelled prompts
# train/ turns your own sessions into a training set for Laya: see train/README.md
```

Pull requests are welcome. Raise `version` in `.claude-plugin/plugin.json` when you change behaviour, so the update reaches everyone who installed it.

## Credits

The idea of an effort judge, its prompt wording and the labelled prompts in `eval/judge-cases.json` come from [effortless](https://github.com/HeyCubit/effortless) by HeyCubit (MIT). Laya is [NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) (Apache 2.0) and is installed separately, never bundled. Jev is a hosted service by TypeSafe. See `NOTICE`.

## License

MIT, see `LICENSE`. Third-party credits in `NOTICE`.
