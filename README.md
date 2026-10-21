# Claude Code mods — the company

Two mods for people who use Claude Code all day and want to always know **what is being done** and **when the session is getting too full**.

| Mod | What it is for | Needs anything else? |
| --- | --- | --- |
| [`onde-estamos`](mods/onde-estamos/README.md) | A band above the prompt with the current request, the plan step and what runs in the background | No |
| [`aviso-contexto`](mods/aviso-contexto/README.md) | Warns when the context passes 75% and 90% and leads you to the handoff | Ships the `/handoff` and `/pickup` skills itself |

## Requirements

- A Claude Code version with mod support (plugins with TypeScript hooks). If `/plugin` does not exist, update Claude Code.
- Read access to this project on the internal GitLab (ask the owner of the **Hub de IA Experimentação** group for an invite).
- Git configured on your computer to clone from `git.example.invalid` (SSH key or HTTPS credential).

## Install

At the Claude Code prompt:

```text
/plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
/plugin install onde-estamos@hub-de-ia-mods
/plugin install aviso-contexto@hub-de-ia-mods
```

You can install just one of the two. After installing, run `/reload-plugins` or open a new session.

The installer may say some options are "not yet set". That is fine: every option has a default (see Settings), so nothing needs configuring unless you want to change it.

From a plain terminal the commands are the same with `claude plugin` in place of `/plugin`.

## Check that it works

1. `/plugin` should list `onde-estamos` and `aviso-contexto` as installed.
2. Send a request of 25 characters or more. A `Request (now): ...` line appears above the prompt.
3. The context warning only shows once usage passes 75%. To see it sooner, lower the threshold in the mod's settings (see below).

## Settings

Both mods have settings in `/config` (look for the plugin name).

| Mod | Setting | Default | What it does |
| --- | --- | --- | --- |
| `aviso-contexto` | `warnAt` | 75 | Context % of the first, gentle warning |
| `aviso-contexto` | `urgentAt` | 90 | Context % of the urgent warning and system notification |
| `aviso-contexto` | `resetBelow` | 50 | Warnings start over once the context drops below this % |
| `onde-estamos` | `minAskChars` | 25 | Messages shorter than this (such as "go ahead") do not replace the request shown |

## Bundled skills

`aviso-contexto` installs two skills. They exist because the warning says "type `/handoff`": without the skill that command would not exist.

| Skill | What it does |
| --- | --- |
| `/handoff` | Saves the state of the work (goal, what is done, next steps, pending decisions) to `~/.local/state/handoffs/<folder>/` so a later session can resume. It does not continue the task. |
| `/pickup` | In a new session, reads the latest handoff for that folder, checks folder and branch, and resumes from the first next step. |

Recommended flow when you get the warning:

1. Finish the step in progress.
2. Type `/handoff`.
3. Clear the session (`/clear`) or open a new one **in the same folder**.
4. Type `/pickup`.

If you already have a skill of your own called `handoff` or `pickup`, the names will collide. Use the plugin's by its full name (`/aviso-contexto:handoff`) or remove yours.

## Update and remove

```text
/plugin marketplace update hub-de-ia-mods
/plugin uninstall onde-estamos@hub-de-ia-mods
/plugin uninstall aviso-contexto@hub-de-ia-mods
```

## Known limitations

- All text is in English. Another language means editing the mod's code.
- A reply that by itself crosses a threshold is flagged the moment it completes, before any tool it asks for runs. It cannot be flagged earlier, because its size is only known once it exists.
- Background work is followed from the moment a tool reports it (including commands sent to the background with Ctrl+B or by a timeout). At the end of every turn the band is reset to Claude Code's own list, so anything it missed in between is corrected there.

## Develop and test

```bash
claude plugin validate .                    # marketplace and manifests
claude plugin test mods/onde-estamos        # mod tests
claude plugin test mods/aviso-contexto
claude --plugin-dir mods/onde-estamos       # runs the mod straight from the folder, no install
```

Changes go in through a merge request. When you change a mod, raise the `version` in its `plugin.json` so the update reaches your colleagues.
