---
name: configure
description: Walks the user through Cruise's settings in a short conversation (context warnings, progress band, effort steering and which judge to use) and saves the answers. Use right after installing Cruise, or when the user says "configure Cruise", "change the Cruise settings", "turn effort steering on or off", or runs /cruise:configure.
---

# Configure Cruise

You are setting up the user's own copy of Cruise. Ask **one question at a time**, say in plain words what each option does, give a recommendation, and wait for the answer. Talk in the user's language. Never edit `~/.claude/settings.json`: settings are saved with the `claude plugin configure` command.

## 1. Read the options

Run `claude plugin configure cruise@prestes --json` to see every option, its type and its current value. Use the names it prints. The questions below use the defaults of version 1.1.

## 2. Ask

1. **Context warnings** (default on). "Cruise can warn you when the conversation passes 75% and again at 90% of the context, and point you to `/handoff`, so you save the state before quality drops. Keep it on?" If they want other thresholds, ask for the two numbers (`warnAt`, `urgentAt`; the urgent one never below the first).
2. **Progress band** (default on). "A band above the prompt shows your current request, the plan step and what runs in the background. Keep it on?"
3. **Effort steering** (default off). Explain first: "For each prompt a small judge can pick a lower reasoning effort than your app uses, so changing a button colour does not run at `high`. It only goes down, never above the effort you set in the app, and when it is unsure it leaves your setting alone." Then offer:
   - **off**: do nothing. Recommended until the user has seen `/cruise` for a few days.
   - **haiku**: the judge is Claude Haiku through the user's own Claude login. No key and nothing to install. Costs about 150 tokens per judged prompt, so the saving is smaller than with the other judges. **Recommended if they want it on.**
   - **jev**: a hosted judge by TypeSafe. Needs the user's own API key, and the text of every prompt goes to that third party. Mention this before choosing it.
   - **laya**: a small model on the user's own machine, nothing leaves it. It takes about 1.5 GB of disk and is weak until trained on the user's own sessions. Ask for a clear yes, then run the `setup-laya` skill instead of configuring it here.
4. Only for **jev**: tell the user to run `/plugin configure cruise@prestes` themselves to paste the key, because that command keeps it in secure storage. Do not ask them to type the key into the chat.

## 3. Save

Collect only the options the user changed. Save them as a JSON object of single-line strings, for example:

```bash
echo '{"effort":"haiku","warnAt":"70"}' | claude plugin configure cruise@prestes --values-stdin
```

Options left out keep their values. Run `claude plugin configure cruise@prestes --json` again and check that the values stuck.

## 4. Close

Tell the user to type `/reload-plugins` (or open a new session) for the settings to take effect, and to look at `/cruise` after a few prompts: it shows the judge in use, the ceiling, the verdicts, any failures and the judge's own token cost.
