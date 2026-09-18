# Task: move split-utils into dotfiles-ai

You are reading this because someone gave you this file path and nothing else. This file is your
whole brief. Read all of it before you run anything, because the last step deletes the directory
this file sits in.

## What you are moving

`split-utils` is a Deno app. It gathers food and grocery orders from Zepto, Blinkit, Zomato and
Swiggy, splits the cost between people, and pushes the result to Splitwise. It works and it is in
daily use.

- Source right now: `/home/sid/ai-scratch/split-utils`, a git repository on branch `main`.
- Destination: `~/repos/dotfiles-ai`, at the path `skills/split-utils`.
- It carries 44 commits going back to 2026-09-12, and 334 passing tests.

The repository also holds a second skill inside it, at `wizard/`. That one becomes `skills/wizard`
and replaces an older skill of the same name.

## Three things that will bite you

**Uncommitted work does not travel.** `git subtree add` reads committed state only. Check
`git status` in the source repository first. If anything is dirty, stop and tell the user rather
than committing their work for them.

**A retired skill survives deployment.** `sync.sh` copies skills and never deletes them. Line 87
runs `cp -r "$HERE/skills/." "$DSH_HOME/skills/"`. Deleting a skill from the repository leaves the
deployed copy under `~/.dsh/skills/` in place, and agents keep finding it. That is why the steps
below delete both copies.

**Step 8 removes a working tool.** `skills/expense-split` holds `dashboard.py`, a Tk splitter the
user still relies on. split-utils replaces it. Before you run step 8, ask the user to confirm they
have stopped using the Tk dashboard. Do not decide that for them.

## Steps

### 1. Check the source is clean

```sh
cd /home/sid/ai-scratch/split-utils && git status --porcelain
```

Empty output means you may continue. Anything else, stop and report it.

### 2. Import with history

```sh
cd ~/repos/dotfiles-ai
git subtree add --prefix=skills/split-utils /home/sid/ai-scratch/split-utils main
```

### 3. Prove the history came across

```sh
git log --oneline skills/split-utils | wc -l
```

This must print about 44. If it prints 1, the history did not travel. Stop and report it, because
step 12 deletes the only other copy.

### 4. Promote the wizard skill

The wizard skill arrived inside the import, at `skills/split-utils/wizard`. It must become its own
skill, and it replaces an older one. Move it with git so its history follows the rename.

```sh
git rm -r skills/wizard
git mv skills/split-utils/wizard skills/wizard
git commit -m "Retire the old wizard skill and promote the new one"
```

The old `skills/wizard` held an older layout with `agents/` and `patterns.md`. The new one holds
`SKILL.md`, `template.ts`, `deno.json`, `compile.ts` and `INSTALLING.md`.

### 5. Retire the ecommerce skill

Delete `skills/ecommerce` in full. split-utils gathers orders now.

### 6. Retire the four shop MCP servers

Edit `mcp-servers.json` and delete these four entries:

- `blinkit`
- `swiggy-food`
- `swiggy-instamart`
- `zepto`

Keep `nostrbook`, `podman`, `gitlab` and `easyeda`. split-utils reads those shops through a real
browser, so the servers have no caller left. Four entries should remain.

### 7. Clear the deployed copies

`sync.sh` never deletes, so these survive on their own:

```sh
rm -rf ~/.dsh/skills/ecommerce
rm -rf ~/.dsh/skills/wizard/agents ~/.dsh/skills/wizard/patterns.md
```

### 8. Retire the old expense-split skill

Ask the user first. See the warning above. With their go-ahead:

```sh
rm -rf ~/.dsh/skills/expense-split
```

Then delete `skills/expense-split` from the repository.

### 9. Deploy

```sh
cd ~/repos/dotfiles-ai && ./sync.sh
```

### 10. Check the deployment

- `~/.dsh/skills/split-utils/SKILL.md` exists.
- `~/.dsh/skills/wizard/SKILL.md` mentions wizardkit.
- `~/.dsh/skills/ecommerce` is gone.
- `~/.dsh/skills/expense-split` is gone, if the user approved step 8.
- `mcp-servers.json` parses as JSON and holds four entries.
- `skills/split-utils/.gitignore` came across.

### 11. Run the suite from its new home

```sh
cd ~/repos/dotfiles-ai/skills/split-utils
deno test --no-lock --allow-read --allow-write --allow-env --allow-sys --allow-run tests/
```

All 334 tests must pass. Add `--min-dep-age=0` if Deno says the `@xyzshantaram/wizardkit` version is
too young. That is a Deno policy about packages under 24 hours old, not a fault.

### 12. Retire the old copy

Only after every check above passes:

```sh
rm -rf /home/sid/ai-scratch/split-utils
```

From here the copy under `skills/split-utils` is the only one. Never edit the old path again.

### 13. Commit and push

Commit the deletions and the `mcp-servers.json` edit, then push.

## After you finish

The readme inside the skill points at raw file URLs shaped like
`https://raw.githubusercontent.com/xyzshantaram/dotfiles-ai/main/skills/split-utils/<path>`. Those
work only once this repository holds the files and the branch is pushed. Fetch one and confirm it
returns the file before telling the user the one-line install works.

## What to report

- The commit count from step 3.
- Whether the user approved step 8.
- The result of each check in step 10.
- The test count from step 11.
- Anything you stopped on.
