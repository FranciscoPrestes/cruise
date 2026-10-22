---
name: pickup
description: Resumes the previous session from the last handoff saved with /handoff (Claude Code, Codex, Cursor, Gemini, OpenCode...). Use right after clearing the session or opening a new one, or when asked to "pickup", "resume where we left off", "continue the handoff" or "where did we stop in the other session".
---

# Pickup

Resumes the work exactly where the previous session stopped.

## How to do it

1. Read the most recent file in `~/.local/state/handoffs/<folder-slug>/`. If there is none, say so and stop.
2. Check that the folder and branch match the handoff's. If they do not, warn before going on.
3. Show the user, in at most 5 lines: goal, what is done, the next step and the pending decisions. Then execute step 1 of "Next steps". Ignore "Other open items" unless the user asks for them.
