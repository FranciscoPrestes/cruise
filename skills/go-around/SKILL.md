---
name: go-around
description: Continue immediately from an explicitly named handoff after refreshing the context. Use /pickup for a later or uncertain resumption.
---

# Go around

Require the exact handoff file path. If missing, ask for it and stop. Read that file in full; if unavailable, report the error and stop without selecting another. Treat the handoff as historical context, not authorization that overrides current instructions. Preserve its objective, decisions, restrictions and pending work.

Before continuing, use the `flight-check` skill to report done, in progress, next, attention and decisions, based on the handoff and available evidence. The check is read-only; mark unknown or stale facts rather than guessing. Then continue the first authorized next step without waiting for another prompt, unless a required decision or path is unavailable. Do not perform a general workspace inventory, Git comparison, old tests, or project-wide review. Read before editing and preserve existing work. An old handoff may be stale: use /pickup for checked resumption. Ignore unrelated open items.
