---
name: software-engineering
description: Use for any non-trivial software engineering request — implementing a feature, building something, fixing a bug, refactoring, or any multi-step coding task. Governs when to plan vs. just do it, when to delegate to coder/tester/researcher subagents instead of doing all the legwork directly, and when to dispatch code review. Skip for a one-line fix, a quick question, or a single obvious edit — those get handled directly without invoking this.
compatibility: opencode
---

# Software engineering workflow

Think, plan, review, and dispatch — don't grind through every line of implementation yourself. Subagents (`coder`, `tester`, `researcher`) typically run on a cheaper, faster model tier than the primary conversation. Use that asymmetry deliberately.

## Workflow

1. **Trivial requests** (a one-line fix, a quick question, a single obvious edit): just do it directly. Don't manufacture process for things that don't need it. If it's this simple, you likely didn't need to load this skill at all.

2. **Medium/large feature requests**: before writing any code,
   - Use the `grilling` skill to interview the user and nail down scope, contract, UI/UX, and testing expectations. Do not proceed until you and the user share understanding.
   - Use the `plan` skill to create (or update) PLAN.md with a phased breakdown of the work — including its context-gathering phase, which runs before anything is written to disk.
   - Before any implementation edits land, check `git status`/`git diff`. If there's pre-existing uncommitted work, propose how to group it into one or more commits (following the AGENTS.md grouping guidance) and get the user's explicit approval before running any `git add`/`git commit`. Never commit without that approval. This keeps the upcoming implementation diff isolated and easy to review.

3. **Delegate execution**, via the Task tool:
   - Hand well-scoped implementation units to `coder`. Give it a specific, self-contained brief (files/areas involved, the exact change, constraints) — not "implement the whole feature."
   - Hand test/lint/build verification to `tester` after `coder` reports a unit of work done. `tester` only runs and reports; it does not fix things.
   - Hand open-ended investigation (unfamiliar library/API behavior, codebase archaeology, spec/NIP lookups, "how does X currently work") to `researcher` instead of doing broad multi-round searches yourself.
   - Never ask a subagent to return entire file contents verbatim — read files yourself if you need their contents. Subagents report conclusions/diffs/summaries, not raw dumps.

4. **Dispatch code review, then verify yourself — scaled to risk.** After `coder` reports a unit of work done, dispatch a review pass to `researcher` (which follows the `review` skill) for anything with real risk (runtime/UI-facing behavior, money/crypto/signing, public API, spec conformance); a low-risk diff (docs, pure CSS, a trivial refactor) can skip the dispatch and get a quick read from you instead. When you do dispatch, it checks for AI-slop patterns (dead code, unused imports, duplicated logic, near-duplicate functions, duplicated type definitions, wheel reinvention), convention adherence, and scope creep, and reports back concrete findings. Push back and re-dispatch to `coder` if the work doesn't meet the bar. This dispatched review is a code-quality check, not a substitute for your own verification: before marking a ticket done, you still independently verify at least one concrete, checkable claim yourself, per the `plan` skill's review contract — a review report is still a subagent's report. That verification is a floor, not a target to exceed: stop once one real check passes rather than re-running suites or re-reading files repeatedly out of caution. Token/turn budget is a real constraint — don't spend it reflexively.

5. **Keep PLAN.md current.** After each milestone, mark completed phases `done` and compact them to a short summary. When the whole effort is implemented and verified, delete PLAN.md.

You still have full edit/bash access yourself — use it for genuinely trivial work, for reviewing diffs, and for anything not worth the round-trip of a subagent dispatch. The point is judgment, not blanket delegation.

## Example session

**User:** “Add a CSV export button to the invoices page.”

**Agent:** “Which invoice fields and filters should the export include, and should it export the current filtered view or every invoice?”

**User:** “Export the current filtered view with invoice number, customer, issue date, due date, and total.”

**Agent:** “Should I generate the CSV in the browser or through a server endpoint, and what automated coverage do you expect?”

**User:** “Generate it in the browser and add a test for the filtered export.”

**Agent:** “I’ll record that as a ticket in `PLAN.md` before implementation:”

```markdown
## Ticket: Add invoice CSV export

**Status:** in_progress
**Acceptance criteria:** Export respects active filters, has the agreed columns, and is covered by the requested test.
```

**Agent:** “Before I start, your working tree has uncommitted changes: edits to `InvoiceFilters.tsx` (filter UI tweak) and a new `formatCurrency` util. I'd like to commit these separately as `fix: correct invoice filter label` and `feat: add formatCurrency helper` so they don't get tangled up with the CSV export diff. OK to commit those two now?”

**User:** “Yes, go ahead.”

**Agent:** *(runs `git add` / `git commit` for the two approved commits)* “Done — working tree is clean. I’m dispatching a `coder` with the invoices page, its filter state, the browser-side CSV constraint, the agreed columns, and the required filtered-export test as a self-contained ticket.”

**Coder:** “Implemented the ticket and added the requested test.”

**Agent:** “I’m now dispatching a `researcher` to review the diff with the `review` skill, focusing on correctness, conventions, duplication, dead code, unused imports, and scope creep.”

**Researcher:** “Review complete; no blocking findings.”

**Agent:** “I independently verified that the filtered-export test passes and marked the ticket done. Please also try the export in the invoices UI to confirm the downloaded CSV meets your expectations.”
