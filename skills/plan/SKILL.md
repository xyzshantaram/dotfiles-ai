---
name: plan
description: Create and maintain a self-contained PLAN.md that tracks phased implementation progress on a feature or effort. Use when the user mentions planning, a "phased implementation plan", "plan.md", asks to "update the plan", says "compaction", or when starting or continuing medium-to-large scope work that needs a living record of in-progress phases.
compatibility: opencode
---

# Plan skill

PLAN.md is a **living working document**, not permanent documentation. It exists only while a feature or effort is in progress. Delete it when the work ships.

## Before you create a plan

- **Quick context check:** before you write anything, check the repo root for an existing planning doc (`PLAN.md` or a file with a similar role — `ROADMAP.md`, `TODO.md`). Also check for an agent-instructions file (`AGENTS.md`, `CLAUDE.md`) and `README.md`. Stop after the obvious root-level checks. Do not do an exhaustive audit.
- Use what you find: an existing `AGENTS.md` or `README.md` shows the repo's conventions and terms. Match those in the new plan and its tickets.
- **Never overwrite a planning file this skill did not create.** If a `PLAN.md` (or a file with the same role) already exists, ask the user how to proceed before you write anything. Use a distinct filename, add a new section inside it, or treat the efforts as sequential. Default to caution on repos you do not clearly own.
- If the file is one this skill created in the same session, reuse it.

## Creating a plan

- One PLAN.md per project, at the repo root, for the current effort.
- Structure it in **phases**: each phase holds a goal, a task checklist, and a status (`pending` / `in_progress` / `done`). See "Breaking phases into tickets" below for checklist structure.
- Keep it self-contained: someone with no other context must be able to read PLAN.md and learn what you build, why, and what work remains.
- Do not start implementing non-trivial work without a plan on file. Settle scope (use the `grilling` skill if it is not yet settled). Write the plan. Then dispatch implementation.

## Breaking phases into tickets

- A phase checklist is a list of **tickets**, not a list of loose to-dos. Use the `grilling` skill to decompose a non-trivial phase into tickets before you record it. Do not write loose bullet points and refine them later.
- Narrow tickets exist for **accountability and interruptibility**, not for parallel throughput. A ticket is a checkpoint: a clear boundary where work stops, gets reviewed, and can be discussed, redirected, or interrupted by the user. Without this, the model drifts through a large undifferentiated task and loses track of what it did versus what it assumed. Optimize ticket boundaries for "can I check in on this and close it out cleanly", not for "can several of these run at once."
- Each ticket must be **narrow enough to close out on its own**: scoped to one unit of work you can complete and review as a standalone checkpoint (for example "add the BIP21 receive QR to the bitcoin-wallet tile", not "redesign the bitcoin wallet tile" and not "add a QR library import"). If a ticket needs its own sub-checklist to be understood, it is really a phase. Split it out as one.
- **Exception — one large ticket, phased internally:** a change that is genuinely one cohesive unit of work (the same mechanical treatment applied uniformly across many files, for example a repo-wide restyle sweep) does not always benefit from a split by an arbitrary boundary like "one ticket per file." Splitting that way multiplies overhead without adding real accountability. In that case keep it as a single ticket with explicit internal phases: **research** (survey the full scope, propose the mapping — dispatch to `researcher`), then **implement** (apply it — dispatch to `coder`), then **review** (dispatch to `researcher` via the `review` skill). Each phase is still its own checkpoint. The accountability protection is not lost. Most tickets should still default to narrow-and-many.
- Each ticket must state explicit **evaluation criteria** alongside its description. State how to verify it was done correctly, not just "looks done." Prefer concrete, checkable criteria: a test or build command that must pass, a specific behavior to exercise manually, a file or output artifact to inspect. **Arrive at these criteria with the user, via the `grilling` skill.** Do not author them alone and present them as final. Static checks (typecheck, build, cargo check) are rarely enough for anything with a UI or runtime surface. Ask the user what manual or runtime behavior they will check before they call the ticket done. A ticket without evaluation criteria the user has actually weighed in on is not ready to dispatch.
- Tickets are what gets recorded in PLAN.md as the phase checklist. There is no separate ticket document. Keep the same compaction rules: once a ticket is done, it collapses into the phase's eventual summary.
- A ticket is the unit of work, not automatically the unit of dispatch. Implement it with the appropriate subagent (`coder`, `tester`, `researcher`) per the primary dispatch rule. A genuinely trivial ticket (small, low-risk diff) may fall under the existing carve-out for direct edits in the primary session. Ticketing exists for the accountability and evaluation structure. It does not mandate a subagent round-trip for every ticket.
- **Review contract, non-negotiable:** before you check a ticket off as done in PLAN.md, independently verify at least one concrete, checkable claim from the implementation against the real artifact. Re-run a cited command yourself. Read the actual diff. Cross-check a cited API or spec claim against the real spec. Never mark a ticket done purely on a subagent's self-report of success. Record what you actually checked in the ticket's done-note, not just what was claimed. This is a floor, scaled to the ticket's risk (see AGENTS.md). Stop once that one check passes. Do not re-verify repeatedly or dispatch extra review passes that add no information.

## Human review queue

The model's own independent check (the review contract above) does not replace the user's own hands-on check, per AGENTS.md. This matters most for anything with a UI or runtime surface. Track that separately in PLAN.md:

- When you close out a ticket that needs the user's own hands-on check, add a line to a `## Human review queue` section:
  ```markdown
  ## Human review queue
  - [ ] Ticket 2.3 (BIP21 QR code) — scan with a wallet app, confirm amount/address decode correctly
  - [ ] Ticket 2.5 (dark mode toggle) — visually check both themes for contrast issues
  ```
- Each line names the ticket and states concretely what to check. Not "review this", but the actual thing to look at or exercise.
- This section persists across phase compaction. It is exempt from the "Keeping it compact" line budget (same as Benchmarking). It can outlive the phase that added an item.
- Only the user clears an item, by checking it off or explicitly saying to drop it. Never remove a queued item on your own.

## Benchmarking (opt-in via `BENCHMARK_LEVER`)

Check once when you create a new PLAN.md: run `echo "$BENCHMARK_LEVER"` (bash tool). Treat anything other than exactly `true` (unset, empty, `false`, etc.) as disabled. Skip this whole section if disabled.

If enabled, append a `## Benchmarking` section to PLAN.md. It is a running log, not a phase checklist. It is exempt from the "Keeping it compact" budget and survives phase compaction:

```markdown
## Benchmarking

| Metric | Count / Value | Notes |
|---|---|---|
| Verification catch rate | 0 / 0 | independent checks (per the review contract) that caught a real discrepancy, vs. total checks performed |
| Escaped defect rate | 0 / 0 | bugs/regressions found after a ticket was marked `done`, vs. tickets closed |
| Rework/reopen rate | 0 / 0 | tickets reopened or rescoped after grilling had already settled them, vs. tickets grilled |
| Rough cost | — | approximate turns/tokens spent on grilling + planning + dispatch + review per ticket, vs. a rough estimate of direct-implementation cost |
```

- Update these numbers after every commit that closes or touches a ticket. Do not wait for phase boundaries. This way they show what actually happened.
- This section does not survive PLAN.md's own deletion at the end of an effort (see "Finishing").

## Session cleanup

- At the end of a working session, and immediately when the user says "compaction" (or an equivalent request), run a compaction pass over PLAN.md. Re-verify every phase's status still matches reality. Apply "Updating the plan"'s rule to any phase that is newly complete. Re-check the file against the budget in "Keeping it compact". Do not wait for a separate request once the trigger word is said.

## Updating the plan

- Update PLAN.md after every project milestone (not after every trivial edit). Commit its changes together with the related code commit rather than as a separate `Plan: ...` commit, so the plan's evolution rides alongside the code it describes instead of filling the log with plan-only commits. A standalone plan commit is fine only when no related code change exists yet to attach it to, such as the initial PLAN.md creation before implementation starts.
- As a phase completes: mark it `done`, then **replace its detailed checklist with a compact summary**. A few lines covering what you built, key decisions made, and any follow-ups. Do not leave finished phases as large task lists. Compact them right away, in the same update where you mark them done.
- Only the phases currently `in_progress` or `pending` should carry a detailed task breakdown. Completed phases are historical summary only.

## Keeping it compact

- The plan must stay proportional to the codebase. Rule of thumb: **~750 lines of plan for a ~20,000-line project (~3.75%)** is the upper limit. Scale that ratio for other project sizes. Compact aggressively rather than relying on having room to grow.
- If PLAN.md approaches or exceeds that budget, compact finished phases further (shorter summaries) before you add new content.

## Finishing

- When the feature or effort is fully implemented, tested, and shipped, **delete PLAN.md** in the same commit (or an immediate follow-up commit) that finishes the work. It must not linger as stale documentation.
- If the human review queue still has unchecked items at that point, surface them to the user explicitly before you delete the file. Do not let them silently vanish.
- If the user wants a permanent record of what you built, that belongs in real docs, README, or CHANGELOG, not in PLAN.md.
