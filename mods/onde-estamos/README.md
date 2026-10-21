# onde-estamos

A fixed band above the Claude Code prompt. In long sessions it answers at a glance: what I asked, which step we are on and what is still running.

```text
Request (12 min ago): integrate billing into the planning app using the existing connection
Step 3 of 5: Writing the integration tests
Running in background: 2 agents, 1 command
```

## What each line shows

| Line | Source | When it disappears |
| --- | --- | --- |
| `Request (x ago): ...` | Your latest real request | Until there is a request in the session |
| `Step N of M: ...` | Claude's task list (`TodoWrite`, `TaskCreate`, `TaskUpdate`) | When there is no plan. When finished it shows `Plan complete` |
| `Running in background: ...` | Running subagents, plus commands, monitors, workflows and schedules | When nothing is running |

## Rules worth knowing

- Only text of `minAskChars` characters or more (default 25), not starting with `/` or `<`, counts as a **request**. Short replies such as "go ahead" do not replace it. Change the minimum in `/config`.
- A new request clears the previous plan.
- Task lists from **subagents** are ignored: the step shown is always the main conversation's.
- The "x min ago" label refreshes by itself once a minute.
- Subagents, background commands, monitors, workflows and schedules are followed live: they appear when a tool reports them (also commands sent to the background with Ctrl+B or by a timeout) and leave when they end or are stopped. At the end of every turn the band is reset to Claude Code's own list.
- The band is informational only: if something inside it fails, the prompt and tools carry on normally.
- The band hides while Claude Code shows its satisfaction survey.

## Install

```text
/plugin marketplace add https://git.example.invalid/group/claude-code-mods.git
/plugin install onde-estamos@hub-de-ia-mods
```

Depends on no skills and no other plugins.

## Layout

- `hooks/register.tsx`: wires the band to Claude Code events.
- `hooks/helpers.ts`: pure functions (one-line text, age, plan summary).
- `hooks/tasks.ts`: pure functions that track background tasks.
- `types/index.d.ts`: shape of the data kept in the session.
