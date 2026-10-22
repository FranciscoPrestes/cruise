---
name: update
description: Checks GitHub for a newer version of Cruise and installs it when the user agrees. Use when the user says "update Cruise", "is there a new version of Cruise", "check for Cruise updates", or runs /cruise:update. Also offers to turn the automatic update on or off.
---

# Update Cruise

Plain words, short, one question at a time. Never edit `~/.claude/settings.json`.

## 1. Find out where things stand

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

Cruise looks for a new version once a day by itself, and by default only **tells** the user; installing is always their decision. Read the current setting with `claude plugin configure cruise@prestes --json` (the option is `updates`) and offer, one at a time and only if the user has not decided before:

- `check` (default): look once a day, tell me, I decide.
- `auto`: look once a day and install it for me (a restart is still needed to use it).
- `off`: never look; I run `/cruise:update` when I want to.

Save a change with `echo '{"updates":"auto"}' | claude plugin configure cruise@prestes --values-stdin`, and say it applies after `/reload-plugins` or a new session.
