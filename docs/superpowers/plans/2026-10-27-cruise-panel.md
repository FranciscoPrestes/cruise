# Cruise compact status panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the approved Git, handoff, agents, model and timing information in a compact expandable `/cruise` panel.

**Architecture:** Extend existing workspace, progress and relay facts; gather model and session usage from the engine. Render summaries and paginated details in the existing dashboard, preserving its text fallback and existing uncommitted work.

**Tech Stack:** TypeScript, Claude Code plugin engine and its testing harness; Git CLI.

**Spec:** `docs/superpowers/specs/2026-10-27-cruise-panel-design.md`

## Global Constraints

- New information appears only in `/cruise`; the prompt band remains one row.
- Preserve existing local work; no new dependencies, push or release.
- Report unavailable data explicitly; never infer a completed pickup or a stalled session.
- Details are keyboard-accessible, closed initially and fully reachable in a height-limited pane; preserve textual fallback.

## Review Focus

- Git filenames with spaces, renames and mixed staged/unstaged changes: parse `--porcelain=v1 -z` correctly (Task 1).
- Missing or unreadable handoff versus empty directory: show distinct states without reporting a successful pickup (Task 2).
- Agent query failure: report unavailable rather than zero active agents (Task 3).
- Unknown model, start time or last activity: retain an explicit unavailable state (Task 3).
- Small terminals and long lists: keyboard pagination reaches every item without truncating state (Task 4).

### Task 1: Git workspace facts

**Files:** Modify `hooks/workspace.ts`, `hooks/workspace.test.ts`.

**Interfaces:** Extend `workspace($)` with Git status availability, per-file staged/unstaged states and aggregate counts. Keep its existing cwd, branch and worktree fields.

- [ ] Add failing tests for clean, dirty, staged plus unstaged on one file, untracked, renamed paths with spaces, Git failure and non-repository.
- [ ] Run `claude plugin test .`; confirm the new tests fail for the missing behavior.
- [ ] Read Git using `git status --porcelain=v1 -z` in the existing checkout; parse NUL-separated entries and rename source/destination without shell interpolation. Do not mutate files.
- [ ] Run `claude plugin test .` and confirm workspace cases pass.

### Task 2: Handoff facts and relay stages

**Files:** Modify `hooks/relay.ts`, `hooks/relay.test.ts`; create `hooks/handoff-info.ts`, `hooks/handoff-info.test.ts`.

**Interfaces:** `handoffInfo($)` returns the latest handoff for the current folder with its path, date and optional goal, or absent/unavailable; relay state exposes observed stages without claiming pickup completion.

- [ ] Add failing tests for empty/missing folder, unreadable latest file, latest-by-mtime selection, goal extraction, and relay stages for saved, cleared, pickup started and failure.
- [ ] Run `claude plugin test .`; verify new assertions fail.
- [ ] Implement read-only lookup and record actual relay stages, preserving the exact-path concurrent handoff behavior and no-clear-on-failure rule.
- [ ] Run `claude plugin test .`; verify all relay and handoff tests pass.

### Task 3: Session, agents and activity facts

**Files:** Modify `hooks/progress.ts`, `hooks/progress.test.ts` or its existing tests, `hooks/register.ts`; create `hooks/session-info.ts`, `hooks/session-info.test.ts` if separation is needed.

**Interfaces:** Expose live agent descriptions/status and tracked background type/id, with explicit query failure; expose model, session startedAt and most recent observed activity timestamp, each optional when unavailable.

- [ ] Add failing tests for multiple active agents, background task details, agent API error, unavailable model/usage, session start and activity updates; do not count refresh ticks as activity.
- [ ] Run `claude plugin test .`; verify new assertions fail.
- [ ] Reuse `agent.list`, tracked task state, `session.model`, `session.usage`, and observed session events; isolate timing across session starts and label observed activity precisely.
- [ ] Run `claude plugin test .`; verify all new facts and existing progress behavior pass.

### Task 4: Panel summaries, accessible details and fallback

**Files:** Modify `hooks/dash-view.tsx`, `hooks/dash-view.test.ts`, `hooks/panel.ts`; update `README.md` to describe new panel information.

**Interfaces:** Consume Tasks 1–3 facts through the existing snapshot and textual panel; keep the current band unchanged.

- [ ] Add failing rendering tests for summary states, expandable Git/handoff/agents details, keyboard controls and paging across a list longer than the pane, at 40 and 80 columns; test unknown values and textual fallback.
- [ ] Run `claude plugin test .`; verify new tests fail.
- [ ] Render compact summaries and closed-by-default details using the existing UI primitives. Provide keyboard-operated pages or scrolling so all items can be reached within the pane. Show session and inactivity ages without diagnosing a hang.
- [ ] Run `claude plugin test .`, `claude plugin validate .`, and `git diff --check`; require passing tests and validation. Inspect the real `/cruise` panel in Claude Code if feasible, reporting any unverified interaction.
- [ ] Review changes, existing local work and scope; document test results. Do not commit unrelated changes or publish.
