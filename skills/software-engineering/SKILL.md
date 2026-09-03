---
name: software-engineering
description: Use for any non-trivial software engineering request — implementing a feature, building something, fixing a bug, refactoring, or any multi-step coding task. Governs when to plan vs. just do it, when to delegate to coder/tester/researcher subagents instead of doing all the legwork directly, and when to dispatch code review. Skip for a one-line fix, a quick question, or a single obvious edit — those get handled directly without invoking this.
whenToUse: Any non-trivial software engineering request. Trigger phrases are "implement", "build", "fix", "refactor", and any multi-step coding task. Skip for a one-line fix or a single obvious edit.
---

# Software engineering workflow

Think, plan, review, and dispatch. Do not grind through every line of implementation yourself. Subagents (`coder`, `tester`, `researcher`) typically run on a cheaper, faster model tier than the primary conversation. Use that asymmetry deliberately.

## Workflow

1. **Trivial requests** (a one-line fix, a quick question, a single obvious edit): just do it directly. Do not add process for things that do not need it. If it is this simple, you likely did not need to load this skill at all.

2. **Medium or large feature requests**: before you write any code,
   - Use the `grilling` skill to interview the user and settle scope, contract, UI/UX, and testing expectations. Do not proceed until you and the user share understanding.
   - Use the `plan` skill to create (or update) PLAN.md with a phased breakdown of the work. Include the context-gathering phase, which runs before anything is written to disk.
   - Before any implementation edits land, check `git status` and `git diff`. If pre-existing uncommitted work exists, propose how to group it into one or more commits (following the AGENTS.md grouping guidance). Get the user's explicit approval before you run any `git add` or `git commit`. Never commit without that approval. This keeps the implementation diff isolated and easy to review.

3. **Delegate execution**, via the subagent tools:
   - Hand well-scoped implementation units to `coder`. Give it a specific, self-contained brief (files and areas involved, the exact change, constraints). Do not say "implement the whole feature."
   - **Split test-writing and implementation into two separate `coder` dispatches when a ticket calls for new tests.** First dispatch a `coder` with only the test-writing brief (the contract and evaluation criteria settled during grilling, not the intended implementation approach). It produces the test module. Name the exact command that runs it. Then dispatch a second, fresh `coder` — deliberately _not_ reusing the first dispatch's child session — handed the finished test file and the implementation brief, to write code that satisfies it. The two stay independent on purpose: a single coder session writing both can quietly loosen a test to fit its own implementation, or shape tests around an approach it has already settled on. That defeats the point of having tests. `coder` never chooses what tests to run. The orchestrator always names the exact test or command in the brief.
   - Hand test, lint, and build verification to `tester` after `coder` reports a unit of work done. `tester` only runs and reports. It does not fix things.
   - **Trust subagent reports at each handoff. Do not re-run what another step already checked.** If `coder` already ran build, typecheck, and lint locally and reported the result, do not automatically dispatch `tester` to redo the same checks. Dispatch it only for coverage `coder` did not run (the fuller test suite, a broader scope, an environment `coder` does not have). The one place trust does not extend is the implementation-review boundary: before you mark a ticket done, you still independently verify at least one concrete claim yourself, per the `plan` skill's review contract. No other subagent's report satisfies that check, however credible. Everything upstream of it (coder-to-tester, coder-to-researcher) should assume good faith and skip duplicate work.
   - Hand open-ended investigation (unfamiliar library or API behavior, codebase archaeology, spec or NIP lookups, "how does X currently work") to `researcher`. Do not do broad multi-round searches yourself.
   - Never ask a subagent to return entire file contents verbatim. Read files yourself if you need their contents. Subagents report conclusions, diffs, and summaries, not raw dumps.
   - **Cut redundant context across dispatches.** A subagent invocation without a continued child session starts from a blank context. It re-reads files and re-derives conventions that an earlier subagent (or you, in the orchestrating session) already established. That is real token cost across the whole system, not just wall-clock. Continue the same child session (the continuable subagent id, via `send_message`) for related work touching the same area. Do not spin up a fresh subagent per ticket. Front-load concrete file paths in the dispatch prompt when you already know them. Do not make the subagent grep or glob to rediscover them. Batch a ticket's related changes into one dispatch instead of splitting it across several small subagent calls. Skipping delegation entirely for small tasks (step 1) remains the single biggest lever. Exception: the test-writing to implementation handoff above is deliberately kept as two independent dispatches, never joined into one continued session. The isolation there is the safeguard, not overhead to cut.
   - **Isolate a dispatch in a git worktree when its files might overlap another concurrent dispatch, or with your own edits.** A subagent shares its parent's working directory: there is no per-subagent cwd override, and a subagent's tool-call arguments are frozen before any listener could rewrite them, so a worktree path only ever reaches a subagent through its dispatch prompt — you set it up first, then tell the subagent to work only inside it. Also isolate a dispatch whose build or test step writes shared output (this repo's `node build.mjs` rebuilds every plugin bundle on each invocation, not just the changed one), so two concurrent builds do not race on the same output tree. Create it yourself before dispatching (`git worktree add <path> -b <branch>`), name the exact path in the brief, and after you review the diff, merge or cherry-pick the change back into the main tree and remove the worktree (`git worktree remove <path>`). These are plain `git` commands through the normal `bash` tool, gated by the normal bash-guard approval prompt for `worktree` (an `ask` rule) — no guard bypass, no extra dependency.
   - **Location.** Put worktrees under `/tmp/dsh/worktrees/<name>`, the already-sanctioned scratch space — whether the task is small and the worktree is removed within the same turn, or the task spans several dispatch rounds and the worktree needs to persist across them. There is no separate "durable" location; the only difference is how long you keep it before removing it. If it is unclear whether a dispatch needs this isolation at all, ask the user rather than guessing.

### Narrow dispatch: scope and token budget (hard rule)

Subagent sessions that run 2–3M tokens are a failure of dispatch scope, not of the subagent. Enforce these limits on every dispatch:

- **A dispatch brief must be one narrow unit of work.** One file, or a few closely related files, one behavior change, one defect. If the brief needs its own sub-checklist, it is too big — split it. A coder must not "redesign X" or "implement the whole feature"; it changes one thing and reports.
- **Budget the subagent's reads.** A subagent should not need to read more than a few thousand lines of context to do its job. If your brief forces it to survey a large codebase to figure out what to change, you have not scoped the work — you did the survey lazily. Do the archaeology yourself (or via `researcher`) and hand the subagent the finished map: exact file paths, exact function names, line numbers, the target shape.
- **Tell the subagent exactly what to change, not what to figure out.** "In `plugins/foo/src/client.ts`, function `makePanel` (line ~740), replace the freeform input at line 812 with a `<select>` whose options come from `config.chains`" is a good brief. "Fix the profiles panel" is not.
- **Cap the subagent's own exploration.** In the brief, forbid open-ended exploration: "Do not grep for other usages. Do not read files outside `plugins/foo/`. If an assumption is wrong, stop and report, do not explore."
- **Cap its verification.** Name the exact commands: "Run `node build.mjs` and `pnpm exec tsc --noEmit`; report exit codes." Do not let it run a test suite, a linter sweep, or repeated rebuilds on its own judgment.
- **Do not hand a subagent a giant diff to review or a giant file to rewrite.** If the change spans many hunks, split it into sequential narrow dispatches (each building on the prior via `send_message` on the same child), not one mega-brief.
- **Reasoning-effort is part of the budget.** A narrow brief with a decided design needs low reasoning effort — the subagent executes, it does not architect. Reserve high reasoning for the orchestrator's own planning and for `researcher` investigations. If a coder is "reasoning too high," the brief was too open.
- **Target: hundreds of thousands of tokens per subagent session at most, not millions.** A well-scoped coder ticket (one file, decided design, exact verify commands) should cost well under that. If a session blows past it, the dispatch was too fuzzy — fix the brief, not the subagent.
- **Hand the subagent the verified APIs; it must not read library code.** When the brief needs a library, service, or harness API, the orchestrator verifies the shape once (read the `.d.ts`/source in the main session, or dispatch `researcher` for it) and pastes the exact facts into the brief: the type/interface shape, the field names, the method signatures, the return shapes, with file/line citations. The subagent then never greps `node_modules` or the installed dsh packages. In the brief, say explicitly: "API facts verified, do not re-research; if you need a fact not in this brief, report the gap instead of reading library code." Reading lots of library code is how a subagent's context bloats — the API knowledge belongs to the orchestrator, not the leaf worker.

4. **Dispatch code review for risky work, then always review the diff yourself before committing.** After `coder` reports a unit of work done, dispatch a review pass to `researcher` (which follows the `review` skill) for anything with real risk (runtime or UI-facing behavior, money/crypto/signing, public API, spec conformance). A low-risk diff (docs, pure CSS, a trivial refactor) can skip that dispatch. When you do dispatch, it checks for AI-slop patterns (dead code, unused imports, duplicated logic, near-duplicate functions, duplicated type definitions, wheel reinvention), convention adherence, and scope creep, and reports back concrete findings. Push back and re-dispatch to `coder` if the work does not meet the bar. Regardless of whether you dispatched that pass, read the actual diff yourself in the main session (`git diff` / `git diff --staged`) before you run `git commit` on any subagent-authored change, every time, for every risk tier. A dispatched review is a code-quality check on top of this, not a replacement for it. This is also separate from the `plan` skill's review contract of verifying one concrete claim before you mark a ticket done. Do both. Because this reads real file content in the main session, it carries a genuine context cost. Once you finish reviewing a non-trivial diff this way, tell the user and suggest they compact (or start a fresh session) before you continue. That verification is a floor, not a target to exceed: stop once one real check passes rather than re-running suites or re-reading files repeatedly out of caution. Token and turn budget is a real constraint. Do not spend it automatically.

5. **Keep PLAN.md current.** After each milestone, mark completed phases `done` and compact them to a short summary. When the whole effort is implemented and verified, delete PLAN.md.

You still have full edit and bash access yourself. Use it for genuinely trivial work, for reviewing diffs, and for anything not worth the round-trip of a subagent dispatch. The point is judgment, not blanket delegation.

## Example session

**User:** "Add a CSV export button to the invoices page."

**Agent:** "Which invoice fields and filters should the export include, and should it export the current filtered view or every invoice?"

**User:** "Export the current filtered view with invoice number, customer, issue date, due date, and total."

**Agent:** "Should I generate the CSV in the browser or through a server endpoint, and what automated coverage do you expect?"

**User:** "Generate it in the browser and add a test for the filtered export."

**Agent:** "I will record that as a ticket in `PLAN.md` before implementation:"

```markdown
## Ticket: Add invoice CSV export

**Status:** in_progress
**Acceptance criteria:** Export respects active filters, has the agreed columns, and is covered by the requested test.
```

**Agent:** "Before I start, your working tree has uncommitted changes: edits to `InvoiceFilters.tsx` (filter UI tweak) and a new `formatCurrency` util. I would like to commit these separately as `fix: correct invoice filter label` and `feat: add formatCurrency helper` so they do not get tangled up with the CSV export diff. OK to commit those two now?"

**User:** "Yes, go ahead."

**Agent:** _(runs `git add` / `git commit` for the two approved commits)_ "Done — working tree is clean. I am dispatching a `coder` with just the filtered-export test brief: the agreed columns, the filter-respecting requirement, and the command it should be checkable against."

**Coder (test):** "Wrote the filtered-export test in `Invoices.test.tsx`. It currently fails since there is no export button yet."

**Agent:** "Dispatching a second, fresh `coder` — not continuing that session — with the invoices page, its filter state, the browser-side CSV constraint, and the new test file, to implement against it."

**Coder (impl):** "Implemented the CSV export button. The test now passes."

**Agent:** "I am now dispatching a `researcher` to review the diff with the `review` skill, focusing on correctness, conventions, duplication, dead code, unused imports, and scope creep."

**Researcher:** "Review complete. No blocking findings."

**Agent:** "I independently ran the filtered-export test myself and confirmed it passes, then marked the ticket done. Please also try the export in the invoices UI to confirm the downloaded CSV meets your expectations."
