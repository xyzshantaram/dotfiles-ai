# Handoff prompt: move split-utils into dotfiles-ai

Paste the block below into a session that has `~/repos/dotfiles-ai` open. It names every file to add
and every entry to remove. Read the three warnings first. One of them deletes a tool that still
works, and one of them can lose work without saying so.

## Before you paste

**Commit split-utils first.** `git subtree add` reads committed state only. Anything left
uncommitted in `/home/sid/ai-scratch/split-utils` does not travel, and the last step of this handoff
deletes that directory. Run `git status` there and commit until it is clean.

**A retired skill survives deployment.** `sync.sh` copies skills and never deletes them. Line 87
runs `cp -r "$HERE/skills/." "$DSH_HOME/skills/"`. Removing a skill from the repository leaves the
deployed copy under `~/.dsh/skills/` in place, and an agent keeps finding it. The prompt deletes
both copies for that reason.

**Retiring `skills/expense-split` removes the Tk splitter.** `dashboard.py` works today. It gained
select all, select none, keyboard shortcuts, a Me button, a People editor, a shortcut hint bar and a
Repeat Last button on 2026-09-18. Do not run this handoff until split-utils replaces it for you in
real use.

## The prompt

```
Move the split-utils tool into this repository, with its history, and retire
the tools it replaces. Work in ~/repos/dotfiles-ai.

IMPORT:

1. Bring the repository in as a subtree, which keeps all of its commits:

     git subtree add --prefix=skills/split-utils \
       /home/sid/ai-scratch/split-utils main

   Check it worked before going further:
     git log --oneline skills/split-utils | wc -l
   That must print far more than 1. It reads about 41 today. If it prints 1,
   stop and report it, because the history did not come across.

2. The wizard skill rides inside that repository and must become its own
   skill. Move it with git, so its history follows the rename:

     git rm -r skills/wizard
     git mv skills/split-utils/wizard skills/wizard
     git commit -m "Retire the old wizard skill and promote the new one"

   The old skills/wizard held an older layout with agents/ and patterns.md.
   The new one holds SKILL.md, template.ts, deno.json, compile.ts and
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

CHECK, before the last step:

9.  Run ./sync.sh.
10. Confirm ~/.dsh/skills/split-utils/SKILL.md exists.
11. Confirm ~/.dsh/skills/wizard/SKILL.md names wizardkit.
12. Confirm ~/.dsh/skills/ecommerce and ~/.dsh/skills/expense-split are gone.
13. Confirm mcp-servers.json holds four entries and parses as JSON.
14. Confirm skills/split-utils/.gitignore came across.
15. Run the test suite from skills/split-utils:
      cd skills/split-utils
      deno test --no-lock --allow-read --allow-write --allow-env \
        --allow-sys --allow-run tests/
    Every test must pass. Add --min-dep-age=0 if Deno reports that the
    wizardkit version is too young.

RETIRE THE OLD COPY, only after every check above passes:

16. rm -rf /home/sid/ai-scratch/split-utils

    From this point the copy under skills/split-utils is the only one.
    Never edit the scratch path again. It no longer exists.

17. Commit and push this repository.
```

## After the move

The readme points at raw file URLs of the form
`https://raw.githubusercontent.com/xyzshantaram/dotfiles-ai/main/skills/split-utils/<path>`. Those
URLs work only once this repository holds the files and you push the branch. Fetch one of them
before you tell anyone the one-line install works.
