# dotfiles-ai personal bundle: open work plan

The remaining open work for the dsh personal bundle, seeded for aidos. Full
context lives in PLAN.md; this file is the import-ready subset.

## Vision

Finish the bundle's open tickets: guard and sync friction, the remaining
tool-render cards and tooltips, the attachment-drop transport, the pending
browser-polish fixes, the screenshot gallery, and one fork-side fix. Every
ticket below is verified open against the tree as of 2026-09-05.

## Critical context

- The repo is a personal dsh bundle. `sync.sh` installs plugins, guards, skills,
  and the web profile patch. Client plugins live under `plugins/` and build via
  `node build.mjs`; typecheck is `npx tsc --noEmit`; tests run with
  `pnpm exec vitest run plugins/<name>/`.
- bash-guard identifies itself by a YAML reason payload with a string `summary`
  field, not a `bash-guard:` prefix. `plugins/tool-render/src/guard.ts` owns the
  one shared check.
- Two session projections already exist in `plugins/tool-render/src/`
  (`projection.ts`, `guarded-approvals.ts`) as the pattern for any new fold.
- `/tmp/dsh` is the sanctioned scratch root and is inside the sandbox and the
  file panel roots. The spill store now pins its root there.
- One ticket (TypeScript and tests across the whole repo, old Effort 11 T9) is
  deliberately absent: it is unscoped and needs a design pass before it can
  carry criteria.

## Phase 1: Harness and guard friction — `pending`

## Tickets

- [ ] **Ticket H1: Guard rules for podman and the npm/pnpm cache.** Add
  `guards/podman.json` and `guards/npm.json` so podman runs and npm installs
  stop paying avoidable approval friction.

  **Evaluate:**

  - `podman ps` under the default workspace policy runs without an approval
    prompt
  - `npm install` and `pnpm install` without an explicit cache flag gain
    `--cache /tmp/dsh/npm-cache`, and an explicit `--cache` call is untouched
  - after `./sync.sh` both files exist under `~/.dsh/plugins/guards`
- [ ] **Ticket H2: sync.sh applies the aidos dsh patches.** Run aidos's
  `apply-dsh-patches.sh` after aidos install and after any dsh version change,
  treating a non-zero exit as a sync failure.

  **Evaluate:**

  - a clean `./sync.sh` leaves the sandbox patch present in the installed
    dsh-sandbox package
  - a second consecutive `./sync.sh` run reports the patch as already applied
    and exits zero
- [ ] **Ticket H3: Remove the stale mcp-manager state file.** Delete
  `~/.dsh/mcp-manager.json` and add the removal to sync.sh so old installs
  converge.

  **Evaluate:**

  - the file is gone after sync, and a second sync run does not recreate it
- [ ] **Ticket H4: Clear stale dsh-better-edit references.** Remove or rewrite
  comments and doc text that still name dsh-better-edit after its retirement.

  **Evaluate:**

  - `rg better-edit` across the repo returns no hits outside git history
- [ ] **Ticket H5: manifest-guard documents the supported script route.** The
  deny message should name the sanctioned way to change a manifest, so the
  model stops retrying the blocked write.

  **Evaluate:**

  - a blocked package.json write returns a message that names the script route
  - the message text lives in one place in plugins/manifest-guard.ts

## Phase 2: tool-render cards and tooltips — `pending`

- [ ] **Ticket C1: A list_agents card.** The `list_agents` tool still renders
  through the generic row; give it a card consistent with the send_message and
  interrupt_agent cards.

  **Evaluate:**

  - a list_agents call renders the tool-render card, not the shipped generic row
- [ ] **Ticket C2: Finish the tooltip rollout.** job-viewer rows carry no
  `data-dsh-tip` tooltips yet.

  **Evaluate:**

  - hovering a truncated row label in the jobs panel shows the full text
- [ ] **Ticket C3: A resume_search card.** Render resume_search results as a
  structured card with one row per hit instead of raw text.

  **Evaluate:**

  - a resume_search call renders the card with hit source, seq, and teaser text
- [ ] **Ticket C4: resume_search excludes what is still in context.** Hits from
  nodes still on the live surface waste the reader's time; filter them.

  **Evaluate:**

  - a query that matches both compacted and live text returns only compacted
    hits
- [ ] **Ticket C5: skill-gate posts a notice when a skill loads.** After a
  skill load unmasks gated tools, inject a short notice so the model knows the
  tools land on the next step.

  **Evaluate:**

  - loading a gated skill by slash command produces a notice naming the tools
    that appear next step
  - the notice does not appear when the skill gates no tools

## Phase 3: Attachment transport — `pending`

- [ ] **Ticket A1: An attachment-drop plugin.** Replace dsh-paste-to-path with
  our own drop plugin that lands files under `/tmp/dsh`.

  **Evaluate:**

  - dragging an image onto the composer attaches it and the file lands under
    `/tmp/dsh`
- [ ] **Ticket A2: Retire dsh-paste-to-path.** Remove the old plugin from
  sync.sh once the replacement covers its behavior.

  **Evaluate:**

  - sync.sh no longer installs dsh-paste-to-path
  - image paste and drop both still work on a fresh session

## Phase 4: Browser polish — `pending`

- [ ] **Ticket B1: The todo panel header alignment.** The collapsed header row
  still misaligns; diagnose from live computed styles and fix.

  **Evaluate:**

  - chevron, title, and counts share one center line at all font sizes
- [ ] **Ticket B2: The profile selector pill alignment.** Pill and model text
  align on their bottoms, not their centers.

  **Evaluate:**

  - pill and label centers match within one pixel in computed geometry
- [ ] **Ticket B3: The context card's stray left border.** skill-catalog and
  system-reminder cards show an extra left border; find the drawing element and
  remove it.

  **Evaluate:**

  - no ancestor or descendant of the card draws an unexplained left border
- [ ] **Ticket B4: Browse old todo lists from the composer.** The todo panel
  gains history browsing and an insert action.

  **Evaluate:**

  - an older list can be opened and inserted into the composer

## Phase 5: Screenshot gallery — `pending`

- [ ] **Ticket G1: Derive the shot list from sync.sh.** Enumerate every UI
  surface the bundle changes so the gallery covers them.

  **Evaluate:**

  - the shot list names one entry per bundle plugin with a visible surface
- [ ] **Ticket G2: Capture the shots.** Screenshot each surface on a live
  session, before and after where it matters.

  **Evaluate:**

  - every surface from G1 has a saved screenshot in the repo
- [ ] **Ticket G3: Write the gallery README.** A README section shows the
  shots with captions.

  **Evaluate:**

  - the main README links the gallery and every image renders

## Phase 6: Fork-side fix — `pending`

- [ ] **Ticket F1: Translate the compaction fork's settings card.**
  dsh-compaction-instant still renders one Chinese settings title.

  **Evaluate:**

  - the compaction settings card renders in English on a live session

## User preferences and special rules

- Worktrees of outside repos go under `/tmp/dsh`; the user lands them.
- Never edit package.json with file tools; manifest-guard requires the script
  route.
- CSS class names are kebab-case. Shared chevron is IconChevronDownOutline14
  rotated by CSS.
