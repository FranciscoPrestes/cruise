---
name: handoff
description: Prepares the session handoff (Claude Code, Codex, Cursor, Gemini, OpenCode...) before context rot - saves the state of the work so the next session can resume with /pickup. Use when the context is getting full, or when asked to "prepare the handoff", "write the handoff" or "give me a prompt to continue in another session".
---

# Handoff

Only prepares and saves. To resume, the next session uses `/pickup`.

## How to do it

Do not continue the task. Only record its state.

1. Identify only projects actually involved in the task from the session and verified workspace state. Distinguish the session working directory from each project and its actual checkout or worktree. For each relevant Git checkout, inspect branch, HEAD and uncommitted work without changing it; record unknown or unavailable facts as such. Never include secrets. Write the handoff in this format, with concrete facts (IDs, paths, values, commands), nothing generic:

```markdown
---
agent: <claude-code | codex | cursor | gemini | opencode | ...>
folder: <absolute working directory>
branch: <current branch, if it is a git repository>
date: <YYYY-MM-DDTHH:MM, local time>
---

## <short task title>

### Goal
One sentence: what we are trying to deliver.

### Summary for whoever arrives
Two or three sentences so an agent with no context can get oriented at once.

### Projects involved
- For each project: name, absolute project path, role in the task, actual checkout or worktree path, and, if Git applies, branch, HEAD and uncommitted work. State explicitly when a fact could not be verified.

### Intent of the next step
Why the next step is the one it is: the hypothesis being tested, what we expect to see.

### Done
- What is already finished and verified.

### Facts discovered
- IDs, values, states, paths found in this session.

### Discarded
- Paths tried and abandoned, and why.

### Next steps (this task)
1. The first step to execute.
2. ...

### Pending decisions
- What only the user can decide, with the options.

### Other open items
- Subjects outside this task. The next session must NOT jump to them.
```

2. Save the file to `~/.local/state/handoffs/<folder-slug>/<YYYY-MM-DD-HHMM>.md`, where the slug is the working directory path with `/` replaced by `-`. Create the folder if it does not exist.
3. Reply with the session working directory, every involved project and its absolute path and role, the objective, what is done and the next step, and the absolute handoff file path. Include a ready-to-copy continuation prompt telling the next agent to read that exact file, verify the listed projects and continue the next step. Say that `/pickup` can take the explicit file path, or can be run without a path after clearing or opening a session in the same working directory. Do not include secrets.
