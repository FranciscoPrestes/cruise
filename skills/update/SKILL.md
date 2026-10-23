---
name: update
description: Checks GitHub for a newer version of Cruise and installs it when the user agrees. Use when the user says "update Cruise", "is there a new version of Cruise", "check for Cruise updates", or runs /cruise:update. Also offers to turn automatic update notices on or off.
---

# Update Cruise

Plain words, short, one question at a time. Never edit `~/.claude/settings.json`.

## 1. Find out where things stand

First check how the active Cruise was loaded. If its skill path is in a local source folder (loaded with `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`), do not install or update `cruise@prestes`: that is a different copy from GitHub. Explain that the local source is already loaded directly; use `/reload-plugins` after edits, or restart the session. Never pull or overwrite the local repository automatically. Skip to step 3 for update notices, using `cruise@inline` instead of `cruise@prestes` in its commands.

For a marketplace installation:

1. Run `claude plugin marketplace update prestes` to refresh the list from GitHub.
2. Run `claude plugin list` and read the installed version of `cruise@prestes`.
3. Read the newest version from the marketplace: `~/.claude/plugins/marketplaces/prestes/.claude-plugin/plugin.json` (its `version` field). Compare the two as numbers (`1.10.0` is newer than `1.9.0`).

If they are equal, say "Cruise is up to date (version X)" and go to step 3.

## 2. Offer the update

If a newer version exists, say what it is and ask: "Install Cruise X.Y.Z now?" On a yes:

```bash
claude plugin update cruise@prestes
```

Then tell the user to restart Claude Code (or open a new session) for the new version to load. If the command fails, show the error as it is and stop. To see what changed, point to the commit list at https://github.com/FranciscoPrestes/cruise/commits/main.

## 3. The automatic check

Cruise looks for a new version once a day by itself and only **tells** the user; it never installs automatically. Installing always requires their confirmation. Read the current setting with `claude plugin configure cruise@prestes --json` (the option is `updates`) and offer, one at a time and only if the user has not decided before:

- `check` (default): look once a day, tell me, I decide.
- `off`: never look; I run `/cruise:update` when I want to.

Save only if the user chooses a change. Write their selected value (`check` or `off`) as `updates` with `claude plugin configure <active-plugin-id> --values-stdin`; use `cruise@inline` for a local source and `cruise@prestes` for the marketplace installation. For example, disabling notices sends `{"updates":"off"}`. Say it applies after `/reload-plugins` or a new session.
