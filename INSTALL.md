# Installing Cruise (instructions for an AI coding agent)

A user pasted this repository's address into Claude Code and asked you to install Cruise. Do the steps below, in order, talking to the user in their language. Keep it short: say what you are about to do, ask one question at a time, and give a recommendation with every question.

Rules:

- Cruise is **not** in Anthropic's official plugin directory. This repository is its own plugin marketplace, named `prestes`. Do not search the official directory for it.
- Never edit `~/.claude/settings.json` yourself. Use the `claude plugin` commands below.
- Ask before disabling or removing anything the user already has.
- You cannot run slash commands (`/plugin`, `/reload-plugins`, `/cruise`). Run the `claude plugin ...` commands from the shell instead, and tell the user to type the slash commands themselves when a step needs one.

## Steps

1. **Check the tool.** Run `claude --version` and `claude plugin marketplace list`. If the `prestes` marketplace is already there, skip to step 3.
2. **Look for plugins that do the same job.** Run `claude plugin list`. If `onde-estamos`, `aviso-contexto` or `context-rot` (or any other context-warning or progress-band plugin) is enabled, tell the user that the warnings and the band would appear twice, and ask whether to disable it (`claude plugin disable <name>`). Do not remove anything without a yes.
3. **Install.**
   ```bash
   claude plugin marketplace add FranciscoPrestes/cruise
   claude plugin install cruise@prestes
   ```
   If the second command fails, show the error and stop; do not retry blindly.
4. **Configure it with the user.** Read `~/.claude/plugins/marketplaces/prestes/skills/configure/SKILL.md` and follow it. It is a short conversation about the three features (context warnings, progress band, effort steering) and ends by saving the answers with `claude plugin configure`.
5. **Finish.** Ask the user to type `/reload-plugins` (or open a new session), then send any request of 25 characters or more and type `/cruise`. The band should appear above the prompt and `/cruise` should print what Cruise is doing.
6. **Report** in plain language: what was installed, what was configured, anything left off on purpose, and how to remove it: `claude plugin uninstall cruise@prestes`.

Read `README.md` for what each feature does if the user asks.
