---
name: checklist
description: Build a verification checklist from the current work, run everything a machine can check first, and store the rest where the user chooses. Use when the user asks for a checklist, a list of things to verify, or what to check before or after a deploy, a restart, or a merge.
whenToUse: The user asks for a checklist, asks what they need to verify or test by hand, or asks what to check before shipping, deploying, restarting, or merging. Trigger phrases are "checklist", "what should I check", "what do I need to verify", "what to test", "before I deploy", "after the restart".
---

# checklist

Build a checklist of things the USER must verify, from the state of the current
work. Run everything a machine can answer first, so the list you hand over holds
only what a machine cannot.

The query drives everything. `checklist post-restart` and `checklist did the UI
work` are different jobs. Read the query first, then decide.

## 1. Decide what to read

Use judgment. Do not read everything by reflex, and do not guess when the query
is unclear. ASK the user instead.

Sources, and what each one is good for:

| Source | Holds |
| --- | --- |
| `PLAN.md` | Tickets, acceptance criteria, settled decisions, the existing Human review queue |
| `git log` | What shipped, and the reasoning in commit messages |
| `git diff` and `git status` | What changed but is not committed, and who else is mid-edit |
| The todo list | In-flight intent that may never have reached a file |
| The session | Requests and findings that exist nowhere else |

Two cautions:

- The session log is large. Read it only when the query is about this
  conversation, and prefer `rg` over a full read.
- Another session may hold files in the same repository. `git status` tells you.
  Never put someone else's in-flight work on the user's checklist as if it were
  theirs to verify.

## 2. Run what a machine can answer

Run the checks before writing anything. Report what passed. Then leave those
items OFF the list.

Typical checks: the test suite, a typecheck, a build, a lint pass, a formatter
check. Read the repository to find the real commands rather than assuming. In
this repository they are `pnpm test`, `pnpm exec tsc --noEmit`, `node build.mjs`,
and `pnpm exec prettier --check`.

Do not run anything that deploys, syncs, restarts, installs, or writes outside
the workspace. Those belong ON the checklist as steps for the user, never as
something you did on their behalf.

If a machine check FAILS, that is not a checklist item. That is a defect. Say so
plainly and stop, rather than asking the user to verify broken work.

## 3. Write the items

An item names the exact thing to look at or exercise. "Review the changes" is
not an item. "Open a bash-guard approval and confirm the heading is one line"
is an item.

Rules:

- Order them. Put anything that must happen first, first.
- Say where to stop. If step 3 failing makes steps 4 onward meaningless, say so.
- Include a rollback when the work can break the user's environment.
- Add a "what must NOT happen" section when a wrong outcome is silent. A thing
  that quietly works differently is worth more attention than a thing that
  errors.
- Mark anything you could not verify yourself, and say why.

Prefer items a machine genuinely cannot answer: rendering, layout, fonts,
whether a card reads well, whether a rewrite changed meaning, whether a
long-running job behaves, taste. A passing build is never evidence that a user
interface works.

## 4. Ask where to store it

Offer the targets that actually exist in this workspace. Check first, and do not
offer a target you cannot reach.

| Target | Notes |
| --- | --- |
| `PLAN.md` Human review queue | The `plan` skill already defines this section for exactly this purpose. Only the user clears an item from it. Prefer it when the work belongs to a live effort. |
| aidos board | Through `set_ticket`, `move_ticket`, `get_tickets`. Only when aidos is mounted. |
| A markdown file in the workspace | A point-in-time artifact. Good when the checklist outlives the plan. |
| `/tmp/dsh` | Sanctioned scratch. Good for a throwaway list. Does not survive a reboot. |
| GitLab | Through the `mcp__gitlab__*` tools, which are GATED behind the `working-with-soapbox` skill and must be loaded first. This repository has GitLab, NOT GitHub. Do not offer a GitHub target. |

Ask with real options. Do not pick for the user.

## 5. Running it again

When a checklist already exists at the chosen target, ASK which the user wants:

- **Update in place.** Keep every ticked item ticked. Drop items that a machine
  check now answers. Add what is new.
- **Replace it.** A clean snapshot.
- **Write alongside.** Keep both.

Never overwrite ticked items without asking. A tick is the user's work, not
yours.

## Worked example

`checklist create a post-restart checklist` on a harness change should produce
something shaped like the T5 checklist in this repository's `PLAN.md`: numbered
steps in order, a rollback before anything risky, the checks split into "before
restarting" and "after the restart", an explicit "what must NOT happen yet"
section, and a final step that only runs once everything above it passed.
