# dotfiles-ai

This repo is the DeepSeek Harness (dsh) personal bundle.
It holds the personal configuration and tooling for the AI workstation.

## What the bundle contains

- `skills/` — the personal skills. Each skill is a markdown file with `name`,
  `description`, and `whenToUse` in frontmatter. Some skills gate tool groups
  through `tools-gated` names, enforced by the skill-gate plugin (E5).
- `plugins/*.ts` — the host-plane plugin sources. Examples are the bash guard,
  the manifest guard, the package tool, the see vision helper, skill gating,
  and the profile plugin. `build.mjs` bundles them into `plugins/*.js`.
- `plugins/{tool-render,profiles-client,approval-comment}/` — client plugin
  packages with their own `cordis.patch.yml` and built bundles.
- `guards/` — the bash-guard rule drop-ins for git, find, and grep.
- `home/` — the files that sync into `$DSH_HOME` (default `~/.dsh`), such as
  the personal skills and settings.
- `sync.sh` — the idempotent installer.

## Install and sync

Clone the repo, then run the sync script from the repo root.

```bash
./sync.sh
```

The script is idempotent.
It copies the bundle into `$DSH_HOME` (default `~/.dsh`).
It also builds the plugins and writes the web profile patch.
Set `DSH_HOME` to install into another home.

```bash
DSH_HOME=/path/to/home ./sync.sh
```

## Build the plugins

The plugins build into self-contained ESM bundles.
Run the build from the repo root.

```bash
node build.mjs
```

The bundles appear in `plugins/*.js`.
The `.ts` sources are tracked.
The `.js` outputs are not tracked.

## Regenerate the customize-setup skill

The skill reads the live installed dsh version.
Regenerate it whenever `dsh` upgrades.

```bash
pnpm run gen:customize-setup
```

This writes `skills/customize-setup/SKILL.md` from its template.
