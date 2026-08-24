# dotfiles-ai

This repo is a personal DeepSeek Harness (dsh) configuration bundle. It configures one AI workstation. It installs custom plugins, skills, a preset, and guard rules. It is highly opinionated. It is not a general template.

## Warning: sync.sh overwrites your config

Running `bash sync.sh` syncs and rewrites the default dsh config. It replaces the skills, `AGENTS.md`, guard rules, web profile patch, and `settings.yaml` in `$DSH_HOME` (default `~/.dsh`).

Back up `~/.dsh` before you run the script.

This is a personal config. The author's skills, model routes, and accounts will not apply to you. Some plugins need your own credentials (the MCP servers, the subscription panel). Fork this repo and remove the parts you do not need.

## What sync.sh does

- Builds the host plugins from `plugins/*.ts` into `plugins/*.js`.
- Copies skills, `AGENTS.md`, guard rules, and dsh-better-edit guidance into `$DSH_HOME`.
- Writes the web profile patch with host-plane plugin rows.
- Installs the plugin set on the web profile with `dsh plugin add`.
- Installs the aidos plugin and registers its agent preset.
- Regenerates `settings.yaml` from the repo template. It keeps the active profile.
- Adds `.dsh_better_edit/` to the machine-wide git ignore.
- Restart dsh web after the sync. Bundle rows load at boot. Skills and presets load on the next session.

## Plugins it installs

### Written in this repo

Host plane (mounted in the web patch):

- [`plugins/bash-guard.ts`](plugins/bash-guard.ts) — gates model bash calls. It parses the command, not a string. Read-only git verbs run, git mutations ask, everything else is denied. It rewrites `rg -r` to `rg`.
- [`plugins/manifest-guard.ts`](plugins/manifest-guard.ts) — denies direct edits to package manifests and lockfiles.
- [`plugins/package-tool.ts`](plugins/package-tool.ts) — the sanctioned way to change dependencies. It detects the package manager and runs the change.
- [`plugins/skill-gate.ts`](plugins/skill-gate.ts) — shows a gated tool only while its skill is loaded.
- [`plugins/see.ts`](plugins/see.ts) — runs an image and a question through a one-shot vision child. It hides itself when the active model already sees images.
- [`plugins/tmp-dsh-shared.ts`](plugins/tmp-dsh-shared.ts) — shares `/tmp/dsh` with sandboxed bash calls.
- [`plugins/grant.ts`](plugins/grant.ts) — gives one path a session-scoped write grant.
- [`plugins/ask-interrupt.ts`](plugins/ask-interrupt.ts) — turns a dismissed question into a stopped turn.
- [`plugins/profiles.ts`](plugins/profiles.ts) — routes subagents to per-role models and applies profile failover.

Client packages (each ships its own `cordis.patch.yml` and built bundle):

- [`plugins/approval-comment`](plugins/approval-comment) — lets you reject an approval with a comment.
- [`plugins/profiles-client`](plugins/profiles-client) — profile-aware model seat in the composer.
- [`plugins/session-archive`](plugins/session-archive) — cleanup panel for archived session logs.
- [`plugins/subscriptions`](plugins/subscriptions) — usage panel for Command Code, Claude, DeepSeek, and OpenCode.
- [`plugins/tool-render`](plugins/tool-render) — custom render cells for tool calls.

### Third-party

- aidos — the ticket board agent preset. It plans, tracks tickets, and gates tools by state. From [xyzshantaram/aidos](https://github.com/xyzshantaram/aidos).
- dsh-input-history — up and down arrow history in the composer. From [sunshaobei/dsh-input-history](https://github.com/sunshaobei/dsh-input-history).
- dsh-tool-calculator — a calculator tool. From [omdsh-dev/dsh-tool-calculator](https://github.com/omdsh-dev/dsh-tool-calculator).
- dsh-tool-diff — a diff tool. From [omdsh-dev/dsh-tool-diff](https://github.com/omdsh-dev/dsh-tool-diff).
- dsh-tool-time, dsh-tool-regex, dsh-tool-markdown, dsh-tool-encoding — the four tools the `util` skill gates. From [omdsh-dev](https://github.com/omdsh-dev).
- dsh-at-file — `@`-file mentions in the composer. It searches workspace files and attaches their contents to prompts. From [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file).
- dsh-session-search — cross-agent session search over dsh, Codex, Claude Code, pi, and OpenCode logs. From [Tieboyh/dsh-session-search](https://github.com/Tieboyh/dsh-session-search).
- dsh-remote — remote browser access to dsh web. Pinned to a fork. From [xyzshantaram/dsh-remote](https://github.com/xyzshantaram/dsh-remote).
- dsh-better-markdown — a streaming markdown renderer (Mermaid, KaTeX, Shiki). Client only. From npm.
- dsh-paste-to-path — pasted files land in `<workspace>/.dsh/pastes/`. The composer carries a path reference. From [Johnny-xuan/dsh-paste-to-path](https://github.com/Johnny-xuan/dsh-paste-to-path).

### Mounted by the web patch

These rows come from the harness install, not from git specs:

- MCP clients through `@deepseek-ai/dsh-mcp-client`: nostrbook, gitlab, swiggy-food, swiggy-instamart, and git. Each runs a third-party MCP server.
- `@deepseek-ai/dsh-tool-cordis` — the `cordis_*` tools, gated behind the cordis skills.
- `@deepseek-ai/dsh-compaction-basic` — instant compaction plus the recall tools.

## How to sync

From the repo root:

```bash
bash sync.sh
```

Set `DSH_HOME` to install into another home:

```bash
DSH_HOME=/path/to/home bash sync.sh
```

The script is idempotent. It only adds plugins. It prints removal commands for plugins on your web profile that are not in the bundle set.

## The guard model

Model bash commands go through bash-guard:

- Git read-only verbs (status, log, diff, show) run without a prompt.
- Git mutations (commit, push, checkout, reset) ask for approval first.
- Other git subcommands are denied.
- `find` and `grep` are denied. Use `rg` instead.
- `rg -r` is rewritten to plain `rg`. The `-r` flag is substitution, not recursion.

## Related docs

- [PLAN.md](PLAN.md) — the phased implementation record.
- [src/DESIGN.md](src/DESIGN.md) — the dark design system for the Settings panels.
