---
name: configure
description: Walks the user through Cruise's settings in a short conversation (context warnings, progress band, effort steering and which judge, how high it may go, updates) and saves the answers, then explains how to change anything later. Use right after installing Cruise, or when the user says "configure Cruise", "change the Cruise settings", "turn effort steering on or off", "change the judge", or runs /cruise:configure.
---

# Configure Cruise

You are setting up the user's own copy of Cruise. Ask **one question at a time**, say in plain words what each option does, give a recommendation, and wait for the answer. Talk in the user's language. Never edit `~/.claude/settings.json`: settings are saved with the `claude plugin configure` command.

Cruise already works with its defaults, so make that clear first: "Everything below has a sensible default. We only change what you want different." Skip any question the user waves away.

## 1. Read the options

Run `claude plugin configure cruise@prestes --json` to see every option, its type and its current value. Use the names it prints. The defaults of version 1.5 are:

| Setting | Default | Meaning |
| --- | --- | --- |
| `context` | true | warn when the conversation fills up |
| `warnAt` / `urgentAt` | 60 / 80 | the two warning points, in % of the context |
| `contextAction` / `autoAt` | button / 80 | what the context warning offers: `button` (a row above the prompt with a button that does handoff, clear and pickup), `alert` (warnings only) or `auto` (does all three by itself at `autoAt`, kept between the first warning and 95) |
| `purser` | true | purser mode: a short standing instruction for clear, concise replies (result first, numbered steps, a Now | Done | Next line on multi-step work); turn off to keep Claude's default style |
| `progress` | false | the two-line band above the prompt (off by default: it takes screen space; the step line shows only when Claude keeps a task list) |
| `effort` | haiku | who judges the effort: `off`, `haiku`, `jev`, `laya` |
| `steer` | both | `both` = up or down from the app's effort, `down` = only lower |
| `topLevel` | max | the highest effort the judge may pick: `high`, `xhigh`, `max` |
| `judgeModel` | empty | the judge's model; empty = Haiku 5.5 (or the server's choice for jev/laya) |
| `updates` | check | `check`, `auto`, `off` |

## 2. Ask

1. **Context warnings** (on). "Cruise warns you when the conversation passes 60% of the context and again at 80%, and points you to `/handoff`, so you save the state before quality drops. Keep it on, with 60 and 80?" If they want other numbers, ask for both (`warnAt`, `urgentAt`; the urgent one never below the first).
1b. **When the context fills** (`contextAction`, `button`). "Besides the warning, Cruise can put a button above the prompt that does the whole routine for you: it writes the handoff, checks that the file exists, clears the conversation and picks the work up again in the fresh one. That is `button`, the default, and I recommend it. `alert` only warns, as before. `auto` does the same routine by itself when the context reaches a point you choose (`autoAt`, by default the urgent warning, 80%). Be honest about `auto`: it CLEARS your conversation without asking, so only choose it if you want that; if the handoff file is not written it stops before clearing. Which do you want?" 
1c. **Only if they chose `auto`: the automatic point** (`autoAt`, 80). "At what percent should Cruise save the handoff, clear and pick up by itself? 80 leaves room for the handoff itself; lower is safer for long answers." Keep it between the first warning and 95; never ask this for `button` or `alert`.
2. **Progress band** (off by default). "A two-line band above the prompt shows your latest request, then the plan step, the effort pick and what runs in the background. It takes screen space, so it is off unless you turn it on. Want it on?" Recommend off for people who keep several terminals open.
3. **Purser mode** (`purser`, on). "Cruise adds a short standing instruction so Claude's replies are easy to follow: the result or next action first, numbered steps, and on multi-step work one line saying what is happening now, what is done and what is next. It adds about 500 tokens to the cached system prompt and tends to shorten replies. Keep it, or do you prefer Claude's default style?" Recommend keeping it.
4. **Effort steering** (on, with Haiku). Explain: "For each prompt a small judge reads your message and picks the reasoning effort it needs: lower for a quick fix, higher for a hard job, relative to the effort your app normally uses (often `medium`). Today it is on, judged by Claude Haiku through your own Claude login: no key, no install, about 150 tokens per judged prompt, so the saving is smaller than with the other judges." Then offer the judge:
   - **haiku** (default, recommended): nothing to install.
   - **jev**: a hosted judge by TypeSafe. Needs the user's own API key, and the text of every prompt goes to that third party. Say this before they choose it.
   - **laya**: a small model on the user's own machine, nothing leaves it. About 1.5 GB of disk, weak until trained on the user's own sessions. If they want it, ask for a clear yes and run the `setup-laya` skill instead of configuring it here.
   - **off**: no steering. Their app's effort goes out untouched.
5. If effort is on: **direction** (`steer`, both). "Should it be allowed to raise the effort for a hard job, or only lower it? Raising is what makes it useful for hard problems, and it costs more tokens on those; lowering only saves." Recommend `both`.
6. If `steer` is both: **top level** (`topLevel`, max). "The judge picks among all five levels Claude Code offers: low, medium, high, xhigh and max. How high may it go on a hard job? `max` uses every level; `high` or `xhigh` cap the cost of the hardest jobs." Recommend leaving `max`, and say they can lower it later. Mention that Ultracode (the toggle under `/effort`) is not something Cruise can switch on.
7. **Updates** (`updates`, check). "Cruise looks on GitHub once a day for a new version and tells you; you decide when to install it with `/cruise:update`. Do you prefer it to install by itself (`auto`), or never look (`off`)?" Recommend `check`.
8. Only for **jev**: tell the user to run `/plugin configure cruise@prestes` themselves to paste the key, because that command keeps it in secure storage. Do not ask them to type the key into the chat.

## 3. Save

Collect only the options the user changed. Save them as a JSON object of single-line strings, for example:

```bash
echo '{"warnAt":"70","urgentAt":"85","topLevel":"xhigh"}' | claude plugin configure cruise@prestes --values-stdin
```

Options left out keep their values. Run `claude plugin configure cruise@prestes --json` again and check that the values stuck.

## 4. Close: how to change things later

Tell the user to type `/reload-plugins` (or open a new session) for the settings to take effect. Then, in a few short lines, explain how to change Cruise whenever they want:

- **`/cruise`** opens the panel: what is on, the context gauge, what the judge is choosing, the update status and the list of settings.
- **`/cruise:configure`** runs this conversation again. For one change, `/plugin configure cruise@prestes` opens the settings directly.
- To **switch things off**: `purser` false (Claude's default reply style), `context` false (no warnings), `progress` false (no band, the default), `effort` off (no steering), `updates` off (no update check).
- To **turn the band on**: `progress` true.
- To **change the judge or its model**: `effort` (haiku, jev, laya) and `judgeModel` (a model or checkpoint name).
- To **update**: `/cruise:update`. Cruise also checks once a day by itself and says when a new version is out.
- To **remove** Cruise: `claude plugin uninstall cruise@prestes`.

Finish with a friendly, colourful summary card (see the end of INSTALL.md for the shape) listing what is on, what is off and the two commands to remember.
