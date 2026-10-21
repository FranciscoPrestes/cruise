# aviso-contexto

Warns before the session context fills up and answer quality drops ("context rot"), and leads you to `/handoff`.

## What happens

| Context used | Warning |
| --- | --- |
| 75% | On-screen notice: "When you finish this step, type /handoff" |
| 90% | On-screen notice **and** a system notification: "Type /handoff now, before compaction" |
| Anything above 75% | Status line: `Context 82% · type /handoff` |

Each band warns **once**. If the context drops below 50% (after a compaction, for example), warnings apply again.

The check runs before every model request, after every tool call and when a turn ends, so a long autonomous run is warned mid-turn, even a long stretch of steps with no tool call.

## Settings

In `/config`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `warnAt` | 75 | Context % of the first warning |
| `urgentAt` | 90 | Context % of the urgent warning (never below `warnAt`) |
| `resetBelow` | 50 | Warnings start over below this % (never above `warnAt`) |

## Bundled skills

The mod installs the skills the warning depends on:

- **`/handoff`**: saves the state of the work to `~/.local/state/handoffs/<folder>/<date>.md`, with goal, what is done, facts discovered, discarded paths, next steps and pending decisions. If the ai-memory tool `memory_handoff_begin` is connected it also saves there; without it, only the file.
- **`/pickup`**: in a new session in the same folder, reads the latest handoff, checks folder and branch, summarizes it in at most 5 lines and executes the first next step.

## Install

```text
/plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
/plugin install aviso-contexto@hub-de-ia-mods
```

## Limits

- It cannot see inside one model response: a reply that by itself jumps past a threshold is warned right after it, before the next request.
- Text is in English.

## Layout

- `hooks/register.ts`: checks the context and shows the warnings.
- `hooks/levels.ts`: pure rule for which warning to give, and the settings.
- `skills/handoff`, `skills/pickup`: the skills.
- `types/index.d.ts`: shape of the data kept in the session.
