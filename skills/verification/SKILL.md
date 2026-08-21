---
name: verification
description: Verify that a code change actually does what its description, linked issue, and commit message claim. Use before any TRUE or PASS verdict on a diff, a merge request, or a subagent's completion report. Forces three checks — revert impact, claim evidence, and test tautology — and forbids a passing verdict without an evidence line for each.
whenToUse: A reviewer, orchestrator, or the primary session is about to accept a diff as correct, close a ticket, or trust a subagent's self-report of success. Use it also before merging or approving a merge request, and before treating an "I verified X" claim as fact.
---

# Verification skill

An existence check is not a verification. "Does X exist in the codebase" answers a
different question than "does X change what the program does." A pre-merge review
that asks only existence questions returns false assurance. It says TRUE when the
honest answer is UNTESTED or FALSE.

This skill forces three questions on any diff, issue, or commit message you review.
A TRUE or PASS verdict needs an explicit evidence line for each question. No
evidence line means no verdict. Write "unproven" instead.

## The three questions

### 1. Revert impact

State this: if this diff is reverted, what observable behavior changes.

Name the exact file and the exact mechanism. "The bug is fixed" is not an answer.
"`src/lib/publicAssetUrl.ts:19` no longer exists, so `DittoLogo.tsx:129`'s
`maskImage` reads a bare `/logo.svg` again, which 404s under a `/ditto/` base
path" is an answer.

A change with no answer to this question is a no-op. Flag it as a no-op. Do not
pass it. A no-op diff is not a bug in the code changed. It is a diff that touches
files without touching behavior, often because a change upstream of it (a config
flag, a build step, an already-correct default) already produced the claimed
effect before this diff ran.

Check this even when the diff looks large. A twelve-file diff can still be a
no-op if none of the twelve files reach a code path that runs differently as a
result.

### 2. Claim evidence

Take every factual claim in the diff's description, the linked issue, and the
commit message. For each one, paste the exact `rg` or `grep` result, or the exact
`file:line` reference, that proves it.

A claim with no evidence line does not go into the verdict as true. Strike it.
Mark it unproven. Do not assume a claim is true because it reads plausibly, cites
a real file name, or matches what a competent engineer would have said.

This applies to claims inside the code change too, not only the prose around it.
A comment that says "this is the only call site" needs a search across the
codebase that confirms it, not a read of the one file the comment sits in.

### 3. Test tautology

For every new test in the diff, name the specific code change that would make
that test fail if reverted.

A test with no such change is tautological. It cannot fail no matter what the
code under test does, because it does not exercise the changed path, or it
asserts something the old code already satisfied. Flag a tautological test. Do
not count it as coverage.

A concrete way to run this check without guessing: read the test, then read the
diff's code change line by line, and confirm at least one assertion in the test
would break if that specific line reverted to its old form.

## What counts as evidence

Evidence is one of:

- A pasted `rg`/`grep` output block, with the search term and the result shown,
  including a zero-result search (a zero result is evidence a claim is false,
  not evidence of nothing).
- A `file:line` citation you can point to in the diff or in the target repository.
- A command output from actually running the change (a test run, a build, a
  manual reproduction), pasted or summarized with the pass/fail line quoted.

Evidence is not a paraphrase of what the description already says. Restating the
MR text in your own words is not a check. It is the same unverified claim in
different sentences.

## Hedges survive verbatim

A subagent, a reviewer, or a research pass may report a hedge: "I could not
confirm X," "this appears to work but I did not check Y," "the test passes but
I did not verify it exercises the new branch." That hedge must reach the final
review prose in the same words, or close to them. It must never be dropped
during summarization, and it must never be smoothed into confident language
("X works," "Y is fine") because the surrounding text reads more confidently.

A summarizer that turns a hedge into an unqualified pass is the exact failure
mode this skill exists to catch. If you are the one compressing a longer report
into a summary, grep your own summary for the hedge's substance before you send
it. If it is gone, put it back.

## Applying this to a merge request review

1. Pull the actual diff. Read the changed lines, not a description of them.
2. Answer question 1 for the diff as a whole, and again for any file inside it
   that looks like it might be inert (a file touched only for an import, a
   comment-only change, a test that does not assert anything new).
3. List every factual claim in the description, the linked issue, and the
   commit messages. Run a search or read the file for each one. Paste the
   result next to the claim.
4. List every new test file and every new test case. Name the line that test
   would catch if it reverted.
5. Write the verdict. Every TRUE or PASS line carries its evidence line right
   next to it. Every claim with no evidence is marked unproven and excluded
   from the verdict, not silently assumed.

## Relationship to the review skill

The `review` skill covers code quality, convention adherence, and scope creep.
This skill covers whether the change and its claims are actually true. Run both
when they apply. Neither replaces the other. A diff can pass code review and
still be a no-op, and a diff can follow every convention while resting on a
false claim about what problem it solves.
