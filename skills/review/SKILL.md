---
name: review
description: Review a code change (a coder subagent's diff, a specific commit, or a set of files) for code quality, convention adherence, and scope creep. Use when dispatched to review implementation work, or when the user asks to review a diff/PR/commit.
compatibility: opencode
---

# Review skill

This is a **code-quality and convention review**, not a functional/runtime check. It supplements — it does not replace — the orchestrator's own independent verification of at least one concrete, checkable claim before a ticket is marked done (see the `plan` skill's review contract). Always state explicitly in your report whether the changed code path was actually exercised (a test ran, someone clicked through it) or only read — don't let a clean-looking diff imply correctness it wasn't checked for.

## Gathering the diff

- Read the actual changed lines yourself — `git diff`, `git diff --staged`, `git show <sha>`, `git log`, or the specific files named in the brief. Never review a summary of a diff; review the diff.
- If PLAN.md tracks the ticket this diff implements, read the ticket's stated scope and evaluation criteria directly — don't rely on the brief's paraphrase of it.
- If the brief or the diff cites a spec/API claim (a NIP, TIP, or library doc) as justification, read that source directly rather than trusting the paraphrase.

## What to check

- **AI-slop patterns** (the most common failure mode): dead code, unused imports, code duplicated between files, code that's almost identical to existing code with only a few parameters tweaked, duplicated type definitions, near-duplicate functions that should be one parameterized function.
- **Wheel reinvention**: custom code that reimplements something an existing dependency (or the language/framework's stdlib) already provides. Check what's already in `package.json`/`Cargo.toml`/etc. before accepting a hand-rolled implementation of something like debouncing, deep-equality, date parsing, a QR/base32/hex codec, retry/backoff, and the like — name the specific library and function that should have been used instead. If nothing already in the manifest covers it, and a small, well-scoped dependency exists that would meaningfully reduce bug surface (the classic hand-rolled-bug categories: parsing, crypto, date/time, codecs), suggest adding it by name rather than treating the hand-rolled version as the only option — that's a call for the orchestrator/user to make, not something to add yourself.
- **Scope adherence**: does the diff stay within the ticket's stated scope? Flag anything unrelated that snuck in (opportunistic refactors, unrelated formatting churn) even if it's individually reasonable — that's a decision for the orchestrator/user, not something to wave through silently.
- **Convention adherence**: matches the surrounding file's naming, style, and structure; kebab-case for CSS class/id names (never camelCase) unless the project already uses camelCase; no manual `package.json`/`Cargo.toml` edits where a package-manager add command should have been used instead.
- **Claim-checking**: if the report cites a specific behavior, API, or spec section as justification, verify the citation actually says what it's claimed to say — this is exactly the kind of claim that slips through when only the report is read, not the source.

## When intent is unclear

- Check PLAN.md's ticket entry (scope, evaluation criteria) first — the ambiguity is often already resolved there.
- If it's still genuinely unclear, ask the user one direct, specific question about that ambiguity rather than guessing, silently flagging it as an unresolved "finding," or blocking without saying why. This doesn't require the `grilling` skill's sustained interview — that's for settling broad scope up front; a single targeted question is the right size for an in-review clarification.

## Reporting back

- Report pass / request-changes, with concrete `file:line` references for every finding — never a vague "looks fine" or "some issues."
- Do not edit the code yourself. Findings go back to the orchestrator, which either re-dispatches to `coder` for fixes or accepts the diff and proceeds with its own final verification step.
- If you could not actually exercise the changed behavior, say so explicitly rather than implying the review covers correctness it didn't check.
