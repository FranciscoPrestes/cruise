---
name: pickup
description: Resumes the previous session from the last handoff saved with /handoff (Claude Code, Codex, Cursor, Gemini, OpenCode...). Use right after clearing the session or opening a new one, or when asked to "pickup", "resume where we left off", "continue the handoff" or "where did we stop in the other session".
---

# Pickup

Resumes the work exactly where the previous session stopped.

## How to do it

1. If an explicit handoff file path is supplied by the user or by the Cruise relay, read that exact file, even when the current working directory differs. If it cannot be read, say so and stop; do not silently select another.
   Otherwise list the Markdown handoffs in `~/.local/state/handoffs/<folder-slug>/` for the current working directory, newest first by modification time. If at least two were modified within the last two hours, read up to the three most recent of those candidates and show their date, goal, projects and paths (mark unavailable details as unknown). Suggest the most recent and ask the user to choose; wait for an explicit choice before continuing. If fewer than two are recent, read the most recent handoff, even if older than two hours. If none exist, say so and stop.
2. Check the recorded session folder and each involved project's path and, where recorded, checkout or worktree, branch, HEAD and uncommitted work against the current state without changing it. Warn about differences, missing paths or facts that cannot be verified before proceeding; preserve existing work. An explicit file can be used from a different session folder. Older handoffs without a projects list remain valid: check the information they do contain.
3. Show the user the previous harness and model if recorded, session folder, involved project names, absolute paths and roles, goal, what is done, the next step and pending decisions. Then start at step 1 of "Next steps" and continue the authorized task autonomously, respecting pending decisions. Ignore "Other open items" unless the user asks for them.
