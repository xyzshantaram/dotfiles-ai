# Handoff prompt: move split-utils into dotfiles-ai

Paste the block below into a session that has `~/repos/dotfiles-ai` open. It names every file to add
and every entry to remove. Read the two warnings under it first, because one of them deletes a tool
that still works.

## Before you paste

`sync.sh` copies skills and never deletes them. Line 87 runs
`cp -r "$HERE/skills/." "$DSH_HOME/skills/"`. So removing a skill from the repository leaves the
deployed copy under `~/.dsh/skills/` in place, and an agent keeps finding it. The prompt below
deletes both copies for that reason.

Retiring `skills/expense-split` removes `dashboard.py`, the Tk splitter. That tool works today. It
gained select all, select none, keyboard shortcuts, a Me button, a People editor, a shortcut hint
bar and a Repeat Last button on 2026-09-18. Do not run this handoff until split-utils replaces it
for you in real use.

## The prompt

```
Move the split-utils tool into this repository and retire the tools it replaces.

ADD, from /home/sid/ai-scratch/split-utils:

1. Copy the whole repository to skills/split-utils, except for these:
   - .git
   - wizard  (it becomes skills/wizard instead, see item 2)
   - out, tests/actual  (build output and test scratch, skip if present)
   The result holds SKILL.md, README.md, deno.json, install.sh, install.ps1,
   src/, app/, scripts/, docs/ and tests/.

2. Replace skills/wizard with /home/sid/ai-scratch/split-utils/wizard.
   Delete the existing skills/wizard first. It holds an older layout with
   agents/ and patterns.md, which the new skill does not use.
   The new skill holds SKILL.md, template.ts, deno.json, compile.ts and
   INSTALLING.md.

REMOVE from this repository:

3. Delete skills/ecommerce in full. split-utils gathers orders now.
4. Delete skills/expense-split in full. It holds dashboard.py,
   push_to_splitwise.py and SKILL.md. split-utils replaces all three.
5. Edit mcp-servers.json and delete these four entries:
   - blinkit
   - swiggy-food
   - swiggy-instamart
   - zepto
   Keep nostrbook, podman, gitlab and easyeda. split-utils reads these
   platforms through a browser, so the servers have no caller left.

REMOVE from the deployed copy, because sync.sh only copies and never deletes:

6. rm -rf ~/.dsh/skills/ecommerce
7. rm -rf ~/.dsh/skills/expense-split
8. rm -rf ~/.dsh/skills/wizard/agents ~/.dsh/skills/wizard/patterns.md

CHECK:

9. Run ./sync.sh.
10. Confirm ~/.dsh/skills/split-utils/SKILL.md exists.
11. Confirm ~/.dsh/skills/wizard/SKILL.md names wizardkit.
12. Confirm ~/.dsh/skills/ecommerce and ~/.dsh/skills/expense-split are gone.
13. Confirm mcp-servers.json holds four entries and parses as JSON.
```

## After the move

The readme points at raw file URLs of the form
`https://raw.githubusercontent.com/xyzshantaram/dotfiles-ai/main/skills/split-utils/<path>`. Those
URLs work only once this repository holds the files and you push the branch. Test one of them before
you tell anyone the one-line install works.
