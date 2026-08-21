# plugins-conflict-table

> **TEMPORARY WORKING ARTIFACT — DELETE ME.**
> This file exists so the E4 plugin-curation decision survives a session
> boundary. It is NOT a permanent reference document. Delete this file as soon
> as E4 is implemented (the approved plugins are wired into `sync.sh` and the
> bundle) and everything is verified working. Do not keep it in the repo.
>
> Source: `researcher` subagent findings, 2026-08-21 (read-only).
> Owned by Phase E ticket E4 in `PLAN.md`. Home: `docs/plugins-conflict-table.md`.

The DeepSeek Harness (dsh) personal bundle in this repo. This doc records the
plugin-curation decision for ticket E4: a conflict table, a per-plugin
summary, the install commands, the restart/config notes, and the caveats.

## Per-plugin summary

| Plugin | Plane | What it does | Install spec (`dsh plugin --profile web add ...`) | Restart | Config | Source |
|---|---|---|---|---|---|---|
| `dsh-any-background` (npm `dsh-any-background@0.1.9`) | host+browser (Web UI appearance) | Theme color, wallpaper, per-part opacity/blur. Has `dsh.bundle`. **NOTE: name is misleading — it is a THEMING plugin, not "run any command in background". Verify that is what E4 means.** | `github:Tkingxiao/dsh-any-background` (or `dsh-any-background`) | `dsh web` restart | Settings -> "Theme" section (client-side, keyed in web profile) | https://github.com/Tkingxiao/dsh-any-background |
| `dsh-ui-file-browser` (npm `@dsh-external/ui-file-browser@0.1.0`) | browser/client (host `lib/index.js`+client `lib/client.js`) | Workspace dir tree, open/edit/preview/rename/delete/move files; file nav view in session | `github:xiyue718/dsh-ui-file-browser` | `dsh --profile web` + refresh | none required (UI) | https://github.com/xiyue718/dsh-ui-file-browser |
| `dsh-input-history` (npm `dsh-input-history@0.2.0`) | browser/client + host fence (`/input-history/api`) | Global arrow-key input history ring per send, persists to `~/.dsh/input-history.json` | local path `dsh plugin --profile web add /path/to/dsh-input-history` (no git-tagged publish seen) | restart dsh web AND reload page | none required | https://github.com/sunshaobei/dsh-input-history |
| `dsh-tool-calculator` | host (agent tool `calculator`) | Zero-dep, no-eval recursive-descent math evaluator; safe vs eval | `github:omdsh-dev/dsh-tool-calculator` | restart | none (pure tool) | https://github.com/omdsh-dev/dsh-tool-calculator |
| `dsh-tool-diff` (row `tool-diff`) | host (agent tool `diff`) | Zero-dep read-only Myers/text/JSON/CSV/MD diff, unified diff + patch in-memory | `github:omdsh-dev/dsh-tool-diff` | restart | none (pure tool) | https://github.com/omdsh-dev/dsh-tool-diff |
| `dsh-worktree` (npm `dsh-worktree@0.1.0`) | browser/agent patch (Cordis); uses `subprocess` service | Codex-style permanent git worktrees at `<repo>/.dsh-worktrees/`; agent tools `worktree_create/list/remove` + `/worktree` cmd; deps pinned to `@deepseek-ai/* 0.1.0-rc.6` (other harness version -> build from source) | `dsh-worktree` THEN **manual patch row** `- insert: - id: worktree, name: 'dsh-worktree'` in `~/.dsh/profiles/web/cordis.patch.yml` | restart `dsh web` | `dirName` (default `.dsh-worktrees`) | https://github.com/FlashingChen/dsh-worktree |
| `dsh-git-plugin` (npm `dsh-git-plugin@0.1.0`) | host (agent; slash cmds `/status /diff /branch /commit /undo` + read-only tools `git-status/git-diff/git-log/git-show`); invokes `git` via `ctx.subprocess` argv (no shell) | Git workflow; `/commit` does `git add -A`+commit; injects git guidance into system prompt | `dsh-git-plugin` THEN manual patch row `- insert: - id: dsh-git-plugin, name: dsh-git-plugin` | restart | `maxBytes`,`stderrMaxBytes`,`graceMs`,`timeoutMs`,`preCommit` | https://github.com/MashedPotato817/dsh-git-plugin |
| `dsh-at-file` (v0.6.7) | browser/client (Host connection for settings) | Codex-style `@path` mention; emits `<workspace-reference path=... kind=file>`, does NOT inline content | `https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.6.7.tar.gz` (canonical repo FSMargoo/dsh-at-file; install points at omdsh-dev fork) | restart `dsh web` so Host+browser load | Settings -> "File mentions": global+workspace Exact/Regex `ignoreFiles` filters | https://github.com/FSMargoo/dsh-at-file |
| `dsh-session-search` | host (agent tools `agent_session_search`/`agent_session_read`) | Index-free cross-agent session search (dsh/codex/claude/pi/opencode); direct scan of `~/.dsh/sessions/**/session.jsonl.zstd`; read-only, no index | `github:Tieboyh/dsh-session-search` (dshx/manual patch variant in README) | next `dsh web` start (or HMR) | `sources` (per-source booleans), `roots`, `maxResults` (10), `readWindow` (10) | https://github.com/Tieboyh/dsh-session-search |

## Conflict/overlap analysis (C1–C11)

Currently mounted on the web profile (from `sync.sh` + `mcp/*.yaml`): MCP
servers `nostrbook`, `gitlab`, `swiggy-food`, `swiggy-instamart`, `git`
(`uvx mcp-server-git`); plugins `bash-guard`, `manifest-guard`, `package-tool`,
`see`.

| # | Conflict / overlap | Finding | Recommended resolution |
|---|---|---|---|
| C1 | `dsh-git-plugin` vs git MCP vs `dsh-worktree` vs `bash-guard` git deny | **bash-guard only gates the `bash` tool.** Verified in `plugins/bash-guard.ts`: it hooks `tools/pre-execute` and returns `next()` when `exec.name !== 'bash'`. So the "raw git denied, use mcp__git__*" rule applies ONLY to the model calling the bash tool. Plugin git via `ctx.subprocess` (dsh-git-plugin, dsh-worktree) and MCP `mcp__git__*` both BYPASS bash-guard. So dsh-git-plugin does NOT conflict with bash-guard mechanically — it operates on a separate invocation surface. | Keep bash-guard as the raw-bash git deny. Accept that it cannot cover plugin subprocess git. Optional: add a subprocess-level guard if policy must cover `/commit` writes. |
| C2 | `dsh-git-plugin` (mutating `/commit`,`/undo`) vs the policy "git MCP is the sanctioned path" | git MCP (`mcp-server-git` via uvx) is read+write; dsh-git-plugin adds a UI-only/agent git workflow with `/commit` (`git add -A`), `git switch -c`, `git stash` undo. `git` is executed outside the bash tool, so the bash-guard reason string is not enforced here. | Coherent combo: **do NOT install dsh-git-plugin as an auto-committer.** Its read-only tools (`git-status/diff/log/show`) duplicate what the git MCP provides and what dsh-worktree offers. If installed, gate its mutating side behind the `git` skill (E6) — the conflict is about commit authority, not tool existence. |
| C3 | `dsh-worktree` vs git MCP / git-plugin / bash worktree | `dsh-worktree` creates real `git worktree add --detach` at `<repo>/.dsh-worktrees/<name>`, tracks a per-repo manifest, and registers the worktree as a DSH workspace. The git MCP exposes generic git operations (including `git worktree`) but has no worktree lifecycle/workspace-registration concept. bash-guard denies `git` in bash but dsh-worktree uses `subprocess`, so no bash-guard block. Worktrees live inside the session `workspace-write` sandbox when the session root is the repo — no new git surface. | **dsh-worktree is the winner for the "worktree" use case.** It does NOT duplicate the git MCP — it adds durable per-repo worktree lifecycle + workspace registration that MCP lacks. Install dsh-worktree in preference to an "own git plugin" for worktree logic. Add its `- insert` patch row manually (its `dsh.bundle` is FALSE so `dsh plugin add` only installs the dep, not auto-mount — verified npm metadata). |
| C4 | `dsh-worktree` vs "bash whitelist vs own git plugin" (plan's open question) | Options: (a) bash whitelist of `git worktree` — weak, bash-guard parses real commands and per-rule allow could work but loses durability/workspace registration; (b) own git plugin — reimplements what dsh-worktree already ships; (c) dsh-worktree — purpose-built, tested, workspace-aware. | Choose (c) `dsh-worktree`. Do not build an own git plugin. Use bash for one-off `git worktree` only after a guard-allow rule if ever needed; prefer the plugin's `worktree_*` tools. |
| C5 | `dsh-at-file` vs native `read_image` vs `see` | Confirmed dsh-at-file emits `<workspace-reference path=... kind=file>` (path only, no base64 inline) and does NOT conflict with `plugins/see.ts`. A visionless model gets a path, then calls `see`, which dispatches a vision subagent whose keep-set includes `read_image`/`read`. Native `read_image` stays route-gated to image-capable models. This matches E7's settled verdict: install dsh-at-file, do NOT modify see.ts. | Install `dsh-at-file`. No conflict. This is confirmed by the E7 settlement already in PLAN.md. |
| C6 | `dsh-session-search` vs native `dsh-session-query`/`session.search` | DSH natively ships `dsh-session-query` + `dsh-session-query-sqlite` exposing `ctx.sessionQuery` and a bounded `session.search` projection. `dsh-session-search` (Tieboyh) is an index-free direct-scan alternative over dsh/other tools' session logs. Overlap on dsh sessions; difference is design (index-free scan vs SQLite-backed service) and source breadth. | **Gate it** behind the `session-search` skill (per E4/E5 settled decisions, `session-search` is already a gated skill). E5's `skill-gate` plugin (reads `tools-gated` from skill frontmatter, `ctx.tools.restrict({deny})`) is the mechanism. Only install if cross-agent search beyond native `session.search` is needed; otherwise native sessionQuery suffices. |
| C7 | `dsh-any-background` vs existing installs | Pure appearance (theme/wallpaper/opacity). No overlap with MCP servers, guards, tools, or `see`. Low risk. | Install now per E4. Restart after. This is cosmetic only — confirm intent since the name suggests "background jobs", which it is NOT. |
| C8 | `dsh-ui-file-browser` vs native file tools / `read` | Client UI for browsing/editing files in the workspace. Complements (not replaces) model `read`/`edit` tools; gives the human a GUI file view. No tool-surface conflict. | Install now. Reversible uninstall expected by E4 (client plugin, `dsh plugin --profile web remove`). |
| C9 | `dsh-input-history` vs composer / anything installed | Standalone arrow-key history; global ring in `~/.dsh/input-history.json` via a host `/input-history/api` fence. No overlap with installed MCP/guards/tools. Independent feature. | Install now. Restart + page refresh. |
| C10 | `dsh-tool-calculator` + `dsh-tool-diff` vs installed tools | Both are host agent tools (`calculator`, `diff`), zero-dep, read-only. No overlap with bash, MCP, guards, `see`, or `package-tool`. The E4 ticket wraps time/regex/markdown/encoding into a `util` SKILL — calculator/diff are tool plugins, orthogonal to that wrapping. | Install both now (always-on per E4). Gate nothing; they register globally on web profile. |
| C11 | `dsh-git-plugin` vs `dsh-worktree` (both git-facing) | Both use `ctx.subprocess` git. dsh-git-plugin = repo status/branch/commit workflow; dsh-worktree = durable parallel worktree lifecycle. Overlapping only on read-only git-status/diff. | If both are wanted, keep dsh-worktree (adds unique value) and prefer git MCP for read/commit over dsh-git-plugin. Simplest coherent set: **git MCP (existing) + dsh-worktree (new)**, skip dsh-git-plugin unless a slash-command UI is explicitly wanted. |

## Recommended install commands (best-effort, from READMEs)

```sh
# Appearance (client) — verify the ticket means the theming plugin, not background jobs
dsh plugin --profile web add github:Tkingxiao/dsh-any-background

# File browser (client) — reversible uninstall
dsh plugin --profile web add github:xiyue718/dsh-ui-file-browser

# Input history (client + host fence)
dsh plugin --profile web add /path/to/dsh-input-history   # local-path install per README

# Calculator (host agent tool) — always-on
dsh plugin --profile web add github:omdsh-dev/dsh-tool-calculator

# Diff (host agent tool) — always-on
dsh plugin --profile web add github:omdsh-dev/dsh-tool-diff

# At-file (client) — from the omdsh-dev fork tarball per README
dsh plugin --profile web add https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.6.7.tar.gz

# Analysis-set, only if the conflict resolutions above are accepted:
dsh plugin --profile web add dsh-worktree          # then MANUAL patch row, see note
dsh plugin --profile web add github:Tieboyh/dsh-session-search   # then gate behind session-search skill
# dsh-git-plugin — recommend SKIP unless a slash-command UI is required:
dsh plugin --profile web add dsh-git-plugin        # then MANUAL patch row
```

## Restart / config notes

- ALL plugins need a `dsh web` restart (or at least a page reload) to load.
  New plugins install into the profile layer, so the running server must be
  restarted.
- `dsh-worktree` and `dsh-git-plugin` do NOT self-mount: their npm `dsh.bundle`
  is FALSE. After `dsh plugin add` you must manually add the
  `- insert: - id: <name>, name: <name>` row to
  `~/.dsh/profiles/web/cordis.patch.yml`, then restart.
  `dsh-tool-calculator`, `dsh-tool-diff`, `dsh-at-file`, `dsh-any-background`,
  `dsh-input-history` DO ship `dsh.bundle` patches and auto-mount.
- `dsh-worktree` deps are pinned to `@deepseek-ai/* 0.1.0-rc.6`. The installed
  dsh is `0.1.0-rc.7`. If loading fails, install from source and bump the
  pinned versions, or accept the mismatch.
- `dsh-session-search` peers are supplied by the host (`cordis`,
  `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-system-prompt`); it must be
  gated behind the `session-search` skill via `tools-gated` in frontmatter.
- git policy nuance: bash-guard's git deny in `guards/git.json` (reason "use
  mcp__git__* tools") only binds the model bash tool. Neither the MCP nor
  plugin subprocess git is covered, so the E6 `guards/git.json` reason update
  should point at the `git` skill AND note the MCP/worktree plugin paths.
- **Critical E4 blocker:** `dsh plugin --profile web ...` currently errors
  with a SQLite "unable to open database file" while the live GUI holds the
  profile's pnpm store. Defer the installs until a `dsh web` restart.

## Key caveats (verify before install)

- `dsh-any-background` is a THEMING plugin, not a background-process plugin.
  Confirm the E4 intent matches the package before installing.
- `dsh-ui-file-browser`, `dsh-tool-calculator`, `dsh-tool-diff`,
  `dsh-session-search` are NOT on npm under those exact names; they are
  git-hosted. `dsh-ui-file-browser`'s npm name is `@dsh-external/ui-file-browser`.
  Install by git URL.
- The install spec/version numbers are best-effort from each README as of this
  research pass; a `dsh plugin add` may resolve a newer tag.

> **REMINDER — DELETE THIS FILE** once E4 is implemented (the approved plugins
> are wired into `sync.sh` and the bundle) and everything is verified working.
