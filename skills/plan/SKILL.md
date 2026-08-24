---
name: plan
description: Create and maintain a self-contained PLAN.md that tracks phased implementation progress on a feature or effort. Use when the user mentions planning, a "phased implementation plan", "plan.md", asks to "update the plan", says "compaction", or when starting or continuing medium-to-large scope work that needs a living record of in-progress phases.
whenToUse: Starting or continuing medium-to-large scope work, or when the user mentions planning, a phased implementation plan, plan.md, updating the plan, or compaction.
---

# Plan skill

PLAN.md is a **living working document**, not permanent documentation. It exists only while a feature or effort is in progress. Delete it when the work ships.

PLAN.md is not an AGENTS.md file. Do not use it to record anything the repository already tells you. Before you write a line into PLAN.md, ask: can `git log`, `git diff`, `grep`, a README, or the code itself answer this? If yes, leave it out. PLAN.md exists only for what would otherwise be lost: intent, open questions, and where to pick up.

## Before you create a plan

- **Quick context check:** before you write anything, check the repo root for an existing planning doc (`PLAN.md` or a file with a similar role — `ROADMAP.md`, `TODO.md`). Also check for an agent-instructions file (`AGENTS.md`, `CLAUDE.md`) and `README.md`. Stop after the obvious root-level checks. Do not do an exhaustive audit.
- Use what you find. An existing `AGENTS.md` or `README.md` shows the repository's conventions and terms. Match those in the new plan and its tickets.
- **Never overwrite a planning file this skill did not create.** If a `PLAN.md` (or a file with the same role) already exists, ask the user how to proceed before you write anything. Use a distinct filename, add a new section inside it, or treat the efforts as sequential. Default to caution on repositories you do not clearly own.
- If the file is one this skill created in the same session, reuse it.

## The five sections

PLAN.md holds exactly these sections, in this order. Nothing else.

1. **Vision** — a few sentences on what this effort builds and why. Rewrite this only when the goal itself changes, not on every update.
2. **Checklist** — the ticket list for the whole effort. See "Tickets" below. This is the only place work items live. It holds every outstanding ticket, not only the very next one: long-horizon tickets and tickets blocked on other tickets belong here too. It never holds a ticket that is done.
3. **Critical context** — decisions, constraints, gotchas, and rejected approaches that are not obvious from the code and would cost real time to rediscover. Keep each entry to one or two sentences.
4. **User preferences and special rules** — project- or session-specific rules the user gave that are not already in AGENTS.md or README.md.
5. **Human review queue** — see its own section below. Present only when items exist.

An optional **Benchmarking** section can follow, gated behind `BENCHMARK_LEVER=true` (see below).

Do not start non-trivial work without a plan file on disk. Settle scope first (use the `grilling` skill if it is not yet settled), write the plan, then dispatch implementation.

## Tickets

- The checklist is a ticket list, not a list of loose to-dos. Use the `grilling` skill to decompose non-trivial work into tickets before you record it. Do not write loose bullet points and refine them later.
- Narrow tickets exist for **accountability and interruptibility**, not for parallel throughput. A ticket is a checkpoint: a clear boundary where work stops, gets reviewed, and can be discussed, redirected, or interrupted by the user. Without this, the model drifts through a large undifferentiated task and loses track of what it did versus what it assumed. Optimize ticket boundaries for "can I check in on this and close it out cleanly", not for "can several of these run at once."
- Each ticket must be **narrow enough to close out on its own**: scoped to one unit of work you can complete and review as a standalone checkpoint (for example "add the BIP21 receive QR to the bitcoin-wallet tile", not "redesign the bitcoin wallet tile" and not "add a QR library import"). If a ticket needs its own sub-checklist to be understood, split it into two tickets. Ticket scope is also the dispatch scope: a ticket that would cost a subagent millions of tokens (see the software-engineering skill's narrow-dispatch rule) is too big — split it until one dispatch touches one file (or a few closely related files) with a decided design.
- **Exception — one large ticket, staged internally:** a change that is genuinely one cohesive unit of work (the same mechanical treatment applied uniformly across many files, for example a repository-wide restyle sweep) does not always benefit from a split by an arbitrary boundary like "one ticket per file." Splitting that way multiplies overhead without adding real accountability. In that case keep it as a single ticket with explicit internal stages: **research** (survey the full scope, propose the mapping — dispatch to `researcher`), then **implement** (apply it — dispatch to `coder`), then **review** (dispatch to `researcher` via the `review` skill). Each stage is still its own checkpoint. Most tickets should still default to narrow-and-many.
- Each ticket must state explicit **evaluation criteria** next to its description. State how to verify it was done correctly, not just "looks done." Prefer concrete, checkable criteria: a test or build command that must pass, a specific behavior to exercise manually, a file or output artifact to inspect. **Arrive at these criteria with the user, via the `grilling` skill.** Do not author them alone and present them as final. Static checks (typecheck, build, `cargo check`) rarely cover anything with a UI or runtime surface. Ask the user what manual or runtime behavior they will check before they call the ticket done. A ticket without evaluation criteria the user has weighed in on is not ready to dispatch.
- A ticket is the unit of work, not automatically the unit of dispatch. Implement it with the appropriate subagent (`coder`, `tester`, `researcher`) per the primary dispatch rule. A genuinely trivial ticket (small, low-risk diff) may fall under the existing carve-out for direct edits in the primary session.
- **Review contract, non-negotiable:** before you check a ticket off, independently verify at least one concrete, checkable claim from the implementation against the real artifact. Re-run a cited command yourself. Read the actual diff. Cross-check a cited API or spec claim against the real spec. Never mark a ticket done purely on a subagent's self-report of success. This is a floor, scaled to the ticket's risk (see AGENTS.md). Stop once that one check passes. Do not re-verify repeatedly or dispatch extra review passes that add no information.
- **When a ticket completes, remove it.** Do not compact it into a summary and keep it in PLAN.md. `git log` already holds that history. If the ticket surfaced a decision, gotcha, or rejected approach worth remembering, add one line to "Critical context." Otherwise the ticket leaves no trace in PLAN.md at all.
- **Orphan-ticket rule.** A ticket that builds something without wiring it into the app must create a paired wire-up ticket before it can close. Do not close a ticket while a new exported symbol has no non-test caller. Check with a command like `grep -rn "exportedSymbolName" --include="*.ts" --include="*.tsx" src/ | grep -v '\.test\.'` (adjust the glob to the project's language). A single match (the export line itself) with no other hit means the symbol is orphaned. Do not close the ticket until either a caller exists or a wire-up ticket is on the checklist.
- Before you check a ticket off, before you close a diff review with a passing verdict, and before you write "verified" anywhere in this document, load the `verification` skill and apply its three checks to the diff and its stated claims.
- **Pre-push plan-artifact check.** No `PLAN.md`, ticket file, or `Plan: ...` commit may enter a product repo (see AGENTS.md). Before pushing a branch to a target repository, run `git diff <target-default-branch>...HEAD --stat | grep -iE '(^|/)(PLAN|TODO|ROADMAP)\.md$|^Plan:'` against that repo's history and refuse to push if it matches. This is a pre-push check, run against the target repo, not against this bundle repo, since PLAN.md belongs here and nowhere else.

## Human review queue

The model's own independent check (the review contract above) does not replace the user's own hands-on check, per AGENTS.md. This matters most for anything with a UI or runtime surface. Track that separately:

- When you close out a ticket that needs the user's own hands-on check, add a line to the `## Human review queue` section:
  ```markdown
  ## Human review queue

  - [ ] BIP21 QR code — scan with a wallet app, confirm amount and address decode correctly
  - [ ] Dark mode toggle — check both themes for contrast issues
  ```
- Each line states concretely what to check. Not "review this," but the actual thing to look at or exercise.
- This section persists independent of the ticket that produced it. It is exempt from "Keeping it compact" below.
- Only the user clears an item, by checking it off or explicitly saying to drop it. Never remove a queued item on your own.

## Benchmarking (opt-in via `BENCHMARK_LEVER`)

Check once when you create a new PLAN.md: run `echo "$BENCHMARK_LEVER"` (bash tool). Treat anything other than exactly `true` (unset, empty, `false`, and so on) as disabled. Skip this whole section if disabled.

If enabled, append a `## Benchmarking` section to PLAN.md. It is a running log, not a ticket list. It is exempt from the "Keeping it compact" budget:

```markdown
## Benchmarking

| Metric                  | Count / Value | Notes                                                                                                                                    |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Verification catch rate | 0 / 0         | independent checks (per the review contract) that caught a real discrepancy, vs. total checks performed                                  |
| Escaped defect rate     | 0 / 0         | bugs/regressions found after a ticket was marked `done`, vs. tickets closed                                                              |
| Rework/reopen rate      | 0 / 0         | tickets reopened or rescoped after grilling had already settled them, vs. tickets grilled                                                |
| Rough cost              | —             | approximate turns/tokens spent on grilling + planning + dispatch + review per ticket, vs. a rough estimate of direct-implementation cost |
```

- Update these numbers after every commit that closes or touches a ticket. Do not wait for a milestone. This way they show what actually happened.
- This section does not survive PLAN.md's own deletion at the end of an effort (see "Finishing").

## Session cleanup

- At the end of a working session, and immediately when the user says "compaction" (or an equivalent request), run a compaction pass over PLAN.md. Remove any ticket that has already shipped. Re-check "Critical context" for entries that no longer apply, for example a gotcha about code that has since been rewritten. Re-check the file against the budget in "Keeping it compact." Do not wait for a separate request once the trigger word is said.

## Updating the plan

- Update PLAN.md after every project milestone, not after every trivial edit. Commit its changes together with the related code commit rather than as a separate `Plan: ...` commit, so the plan's evolution rides alongside the code it describes instead of filling the log with plan-only commits. A standalone plan commit is fine only when no related code change exists yet to attach it to, such as the initial PLAN.md creation before implementation starts.
- As a ticket completes, remove it from the checklist per the rule above. Do not leave a compacted summary in its place.

## Keeping it compact

- PLAN.md holds only currently relevant context, not history, so it must still stay proportional to the codebase. Rule of thumb: **roughly 500 lines of plan for a 10,000–15,000 line project (about 3–5%)**. Scale that ratio for other project sizes.
- If PLAN.md is pushing past that budget, look for the cause before you trim blindly: content that is rederivable from git or the code (delete it), tickets that duplicate what a linked issue tracker already holds (link it instead), or critical-context entries that have gone stale (remove them).

## Finishing

- When the feature or effort is fully implemented, tested, and shipped, **delete PLAN.md** in the same commit (or an immediate follow-up commit) that finishes the work. It must not linger as stale documentation.
- If the human review queue still has unchecked items at that point, surface them to the user explicitly before you delete the file. Do not let them silently vanish.
- If the user wants a permanent record of what you built, that belongs in real docs, README, or CHANGELOG, not in PLAN.md.
