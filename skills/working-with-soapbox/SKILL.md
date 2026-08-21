---
name: working-with-soapbox
description: Find and prioritize real work in the soapbox-pub/ditto project from the GitLab issue tracker, instead of from bugs the agent notices itself while reading code. Use when the user asks what to work on in ditto, or asks you to pick up a ditto issue or merge request.
whenToUse: The user asks "what should I work on" in soapbox-pub/ditto, or asks you to start work on ditto with no specific issue named yet.
metadata:
  confirmed_against_live_repo: 2026-08-21
---

# Working with soapbox-pub/ditto

This skill governs how to pick work in the `soapbox-pub/ditto` project on
gitlab.com. Its core rule: pull work from the real issue tracker, in a fixed
priority order. Do not start with a bug you noticed yourself while reading
code. A real incident shows why this matters (see "Why this order" below).

## The project

`soapbox-pub/ditto` is a Nostr client on gitlab.com, in the `soapbox-pub`
group. It uses merge requests (MRs), not pull requests. The project uses a
stacked-MR workflow: a feature branch can target another open MR's branch
instead of `main`, so later MRs build on earlier ones before any of them
land. Merges squash to one commit per MR (`squash: true` is confirmed on
real MRs, for example !255).

## Where to pull work from, in this order

Follow this order every time. Do not skip ahead to a later tier while an
earlier tier has open items.

1. **Unassigned P1 issues, first.** Confirmed open P1 issues in the tracker
   today include #321 ("Write a threat model for Canvas tile capability
   chaining"), #320 (the checkbox-rule change request, see below), and #316
   (an MR-description validator gap). Check the current P1 list before you
   start, since it changes over time. Pick an unassigned one.
2. **Human-reported bug clusters, second.** A cluster is two or more issues,
   filed by real users, that describe the same underlying problem from
   different angles. Issue #229 is the worked example: the DevRel lead
   reported it in April from a real iPhone 12. Treat a cluster like this as
   higher priority than an unclustered backlog item, because multiple
   independent reports are stronger evidence of real user impact than one
   report or zero reports.
3. **Everything else in the tracker, third.** Any other open issue, once
   tiers 1 and 2 have no unclaimed work.
4. **Self-discovered work, last.** A bug you notice yourself while reading
   code, with no tracker issue behind it, ranks below every tracked item.
   File it as a new issue if it is real. Do not treat it as your next task
   just because you found it first.

### Why this order

MR !249 fixed a cosmetic gap the agent found itself while reading code. The
fix landed in the same function where issue #229 already described the real
bug, reported in April by the DevRel lead from a real iPhone 12. The
self-discovered fix missed the priority that was already sitting in the
tracker. Checking the tracker first would have surfaced #229 instead.

## Contribution workflow

`CONTRIBUTING.md` in `soapbox-pub/ditto` documents an 11-step contribution
workflow starting at line 67, and seven close-without-review triggers
starting at line 166. *These two line numbers come from the project plan,
not from a live read of the file in this session (the GitLab MCP tools
stopped responding partway through research). Confirm both against the
current file before you cite them to someone else.* Read `CONTRIBUTING.md`
directly before you open an MR, since the exact steps and triggers may have
shifted.

## Commit and MR conventions

- **One bug, one MR.** Do not bundle two unrelated fixes into one MR.
- **`Regression-of:` trailer.** Commits that fix a regression carry a
  `Regression-of:` trailer pointing at the commit or MR that introduced it.
  *This convention is plan-sourced. Confirm the exact trailer format against
  a real recent commit before you rely on it.*
- **Reviewer.** `dirkrost` (Dirk Rost) is a real, active reviewer on this
  project. Confirmed directly: he filed issue #320 and issue #321, and
  authored MR !255. Expect his review on process and template compliance
  specifically, since both #320 and #321 are process-and-scope issues he
  raised himself.
- **Colleagues whose work lanes need a heads-up before related work starts**
  change over time and need manual upkeep in this skill. At the time of
  writing, `xyzshantaram` (Siddharth Singh) authored MR !245 and issue #320.
  Check recent MR and issue activity for who is currently active in the area
  you plan to touch.

## The checkbox rule

Never edit, reword, or negate a merge-request-template checklist item to
make it appear satisfied when the real work does not satisfy it. Leave the
box unchecked instead. State why in the MR description. Link the open issue
that requests a change to the rule, if one exists.

**Worked example.** `CONTRIBUTING.md:63` (line number plan-sourced, confirm
before citing) states a required-model line. Two real MRs, !248 and !249,
checked that box while citing a benchmark argument for why a different model
still satisfied the line's intent. Issue #320 (confirmed real and open) is
Dirk Rost's objection to that: a required checklist item should not be
reinterpreted per-MR. If the rule should change, it changes in
`CONTRIBUTING.md` itself, through a decision recorded there, not by
rewriting the checkbox's meaning inside one MR's description.

**Issue #320 is already open.** Do not open a duplicate. If you hit the same
kind of checkbox tension, link #320 instead of filing a new issue.

## What this skill does not cover

This skill does not replace reading `CONTRIBUTING.md` itself. Read it before
your first MR. Line numbers and exact trigger lists in this skill came from
prior research and may drift; the file is the source of truth.
