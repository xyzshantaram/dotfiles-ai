---
name: plan
description: Create and maintain a single self-contained PLAN.md that tracks phased implementation progress on a feature or effort. Use whenever the user mentions planning, a "phased implementation plan", "plan.md", asks to "update the plan", says "compaction", or when kicking off/continuing medium-to-large scope work that needs a living record of in-progress phases.
compatibility: opencode
---

# Plan skill

PLAN.md is a **living working document**, not permanent documentation. It exists only while a feature/effort is actively in progress, and is deleted once that work ships.

## Before creating a plan

- **Context-gathering phase, best-effort:** before writing anything, check the repo root for an existing living planning doc (`PLAN.md` or an equivalently-purposed file — `ROADMAP.md`, `TODO.md`, etc.), an agent-instructions file (`AGENTS.md`, `CLAUDE.md`), and `README.md`. This is a quick orientation pass, not an exhaustive audit — check the obvious root-level locations and give up easily if nothing is there.
- Use whatever is found: an existing `AGENTS.md`/`README.md` informs the repo's own conventions and terminology, which the new plan and its tickets should match rather than override.
- **Never clobber a pre-existing planning-style file that this skill didn't create.** If a `PLAN.md` (or an equivalently-purposed file) already exists — whether it's this session's own earlier work, an unrelated in-progress effort, or something belonging to the repo's own maintainers on a repo we don't otherwise know is entirely ours to restructure — ask the user how to proceed (a distinctly named file, a new section within it, or treating the efforts as sequential) before writing anything. Default to caution on any repo that isn't clearly our own.

## Creating a plan

- One PLAN.md per project, at the repo root, covering the current effort.
- Structure it in **phases**: each phase is a self-contained unit of work with a goal, a task checklist, and a status (`pending` / `in_progress` / `done`). See "Breaking phases into tickets" below for how the checklist itself should be structured.
- Keep it self-contained: someone with no other context should be able to read PLAN.md and understand what's being built, why, and what's left.
- Do not start implementing non-trivial work without a plan on file first. Nail down scope (via the `grilling` skill if it isn't already settled), write the plan, then dispatch implementation.

## Breaking phases into tickets

- A phase's task checklist is not a list of vague to-dos — it is a list of **tickets**. Use the `grilling` skill to decompose a non-trivial phase into tickets before recording it, rather than writing loose bullet points and refining them later.
- The point of narrow tickets is **accountability and interruptibility, not parallel throughput**. A ticket is a checkpoint: a clear boundary where work stops, gets reviewed, and can be discussed, redirected, or interrupted by the user without the model having drifted through a sprawling, undifferentiated task and lost track of what's actually been done versus assumed. Optimize ticket boundaries for "can this be checked in on and closed out cleanly," not for "can several of these run at once."
- Each ticket must be **narrow enough to close out on its own**: scoped to one coherent unit of work that can be completed and reviewed as a standalone checkpoint (e.g. "add the BIP21 receive QR to the bitcoin-wallet tile", not "redesign the bitcoin wallet tile" and not "add a QR library import"). If a ticket needs its own sub-checklist to be understood, it is really a phase and should be split out as one.
- **Exception — one large ticket, phased internally:** a change that's genuinely one cohesive unit of work (the same mechanical treatment applied uniformly across many files, e.g. a repo-wide restyle sweep) doesn't always benefit from being split by an arbitrary boundary like "one ticket per file." Splitting like that multiplies overhead without adding real accountability if every piece is the same decision applied repeatedly. In that case it's fine to keep it as a single ticket with explicit internal phases instead — typically **research** (survey the full scope, propose the concrete mapping/plan, dispatched to `researcher`) → **implement** (apply it, dispatched to `coder`) → **review** (dispatched to `researcher` via the `review` skill). Each phase is still its own checkpoint; the accountability the narrow-ticket rule protects isn't lost, it's just structured around phases instead of file boundaries. This is a deliberate call to make with the user (via `grilling` or a direct confirmation), not a default — most tickets should still default to narrow-and-many.
- Each ticket must state explicit **evaluation criteria** alongside its description — how to verify it was actually done correctly, not just "looks done." Prefer concrete, checkable criteria: a test/build command that must pass, a specific behavior to exercise manually, a file or output artifact to inspect. **Arrive at these criteria with the user, via the `grilling` skill** — do not author them unilaterally and present them as a fait accompli. Static checks (typecheck, build, cargo check) are rarely sufficient on their own for anything with a UI or runtime surface; ask what manual/runtime behavior the user will actually check before calling the ticket done. A ticket without evaluation criteria the user has actually weighed in on is not ready to dispatch.
- Tickets are what gets recorded in PLAN.md as the phase's checklist — there is no separate ticket document. Keep the same compaction rules: once a ticket is done, it collapses into the phase's eventual summary like everything else.
- A ticket is the unit of work, not automatically the unit of dispatch. Implement it with the appropriate subagent (`coder`, `tester`, `researcher`) per the primary dispatch rule — but a genuinely trivial ticket (small, low-risk diff) may fall under that rule's existing carve-out for direct edits in the primary session. Ticketing exists for the accountability and evaluation structure; it does not mandate a subagent round-trip for every single one.
- **Review contract, non-negotiable:** before checking a ticket off as done in PLAN.md, independently verify at least one concrete, checkable claim from the implementation against the real artifact — re-run a cited command yourself, read the actual diff, or cross-check a cited API/spec claim against the real spec. Never mark a ticket done purely on a subagent's self-report of success. Record what was actually, independently checked in the ticket's done-note, not just what was claimed. This is a floor, scaled to the ticket's risk (see AGENTS.md) — stop once that one check passes rather than re-verifying repeatedly or dispatching extra review passes that don't add information.

## Benchmarking (opt-in via `BENCHMARK_LEVER`)

Check once when creating a new PLAN.md: run `echo "$BENCHMARK_LEVER"` (bash tool). Treat anything other than exactly `true` (unset, empty, `false`, etc.) as disabled and skip this section entirely — this flag defaults to off and is only turned on in specific environments (e.g. via `server.env`).

If enabled, append a `## Benchmarking` section to PLAN.md. It is a running log, not a phase checklist — it is exempt from the "Keeping it compact" budget and survives phase compaction:

```markdown
## Benchmarking

| Metric | Count / Value | Notes |
|---|---|---|
| Verification catch rate | 0 / 0 | independent checks (per the review contract) that caught a real discrepancy, vs. total checks performed |
| Escaped defect rate | 0 / 0 | bugs/regressions found after a ticket was marked `done`, vs. tickets closed |
| Rework/reopen rate | 0 / 0 | tickets reopened or rescoped after grilling had already settled them, vs. tickets grilled |
| Rough cost | — | approximate turns/tokens spent on grilling + planning + dispatch + review per ticket, vs. a rough estimate of direct-implementation cost |
```

- Update these numbers after every commit that closes or touches a ticket — not just at phase boundaries — so they reflect what actually happened rather than an end-of-phase guess.
- This section does not survive PLAN.md's own deletion at the end of an effort (see "Finishing"). If the user wants tallies preserved across efforts rather than resetting with each new PLAN.md, ask where they'd like a running total kept instead of silently discarding it.

## Session cleanup

- At the end of a working session, and immediately whenever the user says "compaction" (or an equivalent explicit request), run a compaction pass over PLAN.md without being asked for anything more specific: re-verify every phase's status still matches reality, apply "Updating the plan"'s rule to any phase that's newly complete, and re-check the file against the budget in "Keeping it compact". Don't wait for a separate request to do this once the trigger word is said.

## Updating the plan

- Update PLAN.md after every project milestone (not after every trivial edit), and commit it so the plan's evolution is tracked in git history alongside the code changes it describes.
- As a phase completes: mark it `done`, then **replace its detailed checklist with a compact summary** — a few lines covering what was built, key decisions made, and any follow-ups. Do not leave finished phases as sprawling task lists; compact them immediately, in the same update where they're marked done.
- Only the phase(s) currently `in_progress` or `pending` should carry a detailed task breakdown. Completed phases are historical summary only.

## Keeping it compact

- The plan must stay proportional to the codebase, not grow unboundedly. Rule of thumb: **~750 lines of plan for a ~20,000-line project (~3.75%)** is the accepted upper limit. Scale that ratio for other project sizes, but always compact aggressively rather than relying on having room to grow.
- If PLAN.md is approaching or exceeding that budget, compact finished phases further (shorter summaries) before adding new content.

## Finishing

- Once the feature/effort is fully implemented, tested, and shipped, **delete PLAN.md** in the same commit (or an immediate follow-up commit) that finishes the work. It should not linger as stale documentation.
- If the user wants a permanent record of what was built, that belongs in real docs/README/CHANGELOG — not in PLAN.md.
