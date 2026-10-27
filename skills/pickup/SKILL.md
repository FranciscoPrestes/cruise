---
name: pickup
description: Resumes the previous session from the last handoff saved with /handoff (Claude Code, Codex, Cursor, Gemini, OpenCode...). Use right after clearing the session or opening a new one, or when asked to "pickup", "resume where we left off", "continue the handoff" or "where did we stop in the other session".
---

# Pickup

Resumes the work exactly where the previous session stopped.

## How to do it

1. If the user supplies a handoff file path, read that exact file, even when the current working directory differs. If it cannot be read, say so and stop; do not silently select another. Otherwise read the most recent file in `~/.local/state/handoffs/<folder-slug>/` for the current working directory. If there is none, say so and stop.
2. Check the recorded session folder and each involved project's path and, where recorded, checkout or worktree, branch, HEAD and uncommitted work against the current state without changing it. Warn about differences, missing paths or facts that cannot be verified before proceeding; preserve existing work. An explicit file can be used from a different session folder. Older handoffs without a projects list remain valid: check the information they do contain.
3. Show the user the session folder, involved project names, absolute paths and roles, goal, what is done, the next step and pending decisions. Then execute step 1 of "Next steps". Ignore "Other open items" unless the user asks for them.
