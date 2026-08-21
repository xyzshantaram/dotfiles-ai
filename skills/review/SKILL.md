---
name: review
description: Review a code change (a coder subagent's diff, a specific commit, or a set of files) for code quality, convention adherence, and scope creep. Use when dispatched to review implementation work, or when the user asks to review a diff/PR/commit.
whenToUse: The user asks to review a diff, PR, or commit. Use it also when the orchestrator dispatches a review pass over a coder subagent's work.
---

# Review skill

This is a **code-quality and convention review**, not a functional or runtime check. It adds to the orchestrator's own independent verification (see the `plan` skill's review contract). It does not replace it. Always state in your report whether the changed code path was actually exercised (a test ran, someone clicked through it) or only read. A clean-looking diff must not imply correctness it was not checked for.

## Gathering the diff

- Read the actual changed lines yourself. Use `git diff`, `git diff --staged`, `git show <sha>`, `git log`, or read the specific files named in the brief. Never review a summary of a diff. Review the diff.
- If PLAN.md tracks the ticket this diff implements, read the ticket's stated scope and evaluation criteria directly. Do not rely on the brief's paraphrase of them.
- If the brief or the diff cites a spec or API claim (a NIP, TIP, or library doc) as justification, read that source directly. Do not trust the paraphrase.

## What to check

- **AI-slop patterns** (the most common failure mode): dead code, unused imports, code duplicated between files, code that is nearly identical to existing code with only a few parameters tweaked, duplicated type definitions, near-duplicate functions that should be one parameterized function.
- **Wheel reinvention**: custom code that reimplements something an existing dependency (or the language or framework's stdlib) already provides. Check what is in `package.json` or `Cargo.toml` before you accept a hand-rolled implementation of debouncing, deep-equality, date parsing, a QR/base32/hex codec, retry/backoff, and the like. Name the specific library and function that should have been used instead. If nothing in the manifest covers it, and a small, well-scoped dependency exists that would meaningfully reduce bug surface (the classic hand-rolled-bug categories: parsing, crypto, date/time, codecs), suggest adding it by name. Do not treat the hand-rolled version as the only option. That call belongs to the orchestrator or user.
- **Scope adherence**: does the diff stay within the ticket's stated scope? Flag anything unrelated that snuck in (opportunistic refactors, unrelated formatting churn) even if it is individually reasonable. That is a decision for the orchestrator or user, not something to wave through silently.
- **Convention adherence**: matches the surrounding file's naming, style, and structure. Use kebab-case for CSS class/id names (never camelCase) unless the project already uses camelCase. No manual `package.json` or `Cargo.toml` edits where a package-manager add command should have been used instead.
- **Claim-checking**: if the report cites a specific behavior, API, or spec section as justification, verify the citation actually says what it claims to say. This is exactly the kind of claim that slips through when only the report is read, not the source.
- **Claim-evidence separation.** Load the `verification` skill before you write a pass verdict on any diff. State plainly, in the report, what you actually read yourself versus what you inferred or took on trust from the description. Do not blend the two. If a claim in the diff's description, the linked issue, or the commit message has no evidence line you can point to (an `rg`/`grep` result, a `file:line`, a command you ran), strike it from the verdict as unproven instead of assuming it true.
- **Hedges survive verbatim.** If your own investigation turns up a hedge ("I could not confirm X", "this appears to work but I did not check Y"), that hedge must reach your final report in close to the same words. Never drop it or smooth it into a confident pass during your own summarizing.

## When intent is unclear

- Check PLAN.md's ticket entry (scope, evaluation criteria) first. The ambiguity is often already resolved there.
- If it is still genuinely unclear, ask the user one direct, specific question about that ambiguity. Do not guess. Do not silently flag it as an unresolved "finding". Do not block without saying why. A single targeted question is the right size for an in-review clarification.

## Reporting back

- Report pass or request-changes, with concrete `file:line` references for every finding. Never say "looks fine" or "some issues" without details.
- Do not edit the code yourself. Findings go back to the orchestrator, which either re-dispatches to `coder` for fixes or accepts the diff and proceeds with its own final verification step.
- If you could not actually exercise the changed behavior, say so explicitly. Do not imply the review covers correctness it did not check.
