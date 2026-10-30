---
name: flight-check
description: Gives a structured, read-only status check of the current work. Use for /flight-check, a flight check-up, or when asked what has been done, what is happening now, and what comes next. An optional topic focuses the report.
---

# Flight check

Give the user a concise, actionable snapshot without resuming or changing the work. Reply in the user's language.

## How to do it

1. Without an argument, cover the current task and its related workstreams in the session. With a topic, such as `/flight-check LightRAG`, focus on that topic and dependencies needed to understand it; do not include unrelated work.
2. Review the conversation and available relevant sources, such as the current plan, task list, background activity, logs, and project files. Use read-only checks when useful and available; do not start jobs, change files or external state, or interrupt work. Do not wait for background work to finish. Identify the source and observation time when this helps distinguish current state from an older report.
3. Separate verified outcomes, reported but unverified status, and planned work. A started job is not completed work; a plan is not proof of execution. If a source is unavailable, stale, incomplete or contradictory, say so rather than guessing. Do not claim no blockers or no user action is needed unless the available evidence supports it.
4. Report in this order, keeping every section even when information is missing:

   - **Flight check · time** — use the local time only if known; otherwise omit it.
   - **Done** — meaningful completed results; if a previous check exists, highlight what has changed since then without implying a comparison that cannot be verified.
   - **In progress** — current work, stage, and blockers, if known.
   - **Next** — planned steps in order, with relevant dependencies; mark uncertain order as such.
   - **Attention** — risks, delays, or open decisions; say “none identified” only if supported, otherwise “unknown”.
   - **Needs you** — decisions or actions required from the user; say “nothing now” only if supported, otherwise “unknown”.
   - **Forecast** — time and cost only when there is a basis, with assumptions and uncertainty; otherwise say “no reliable forecast yet”.

For other empty or unknown sections, say so plainly. Use concrete names and numbers where supported, and avoid exposing secrets.
