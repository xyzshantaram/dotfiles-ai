---
name: customize-setup
description: Explain how this dsh workstation is put together — the two components (host plane and agent plane), the bundle layout, and the skill / plugin / preset model. Use when the user asks how the setup is structured, how a skill, plugin, or preset works, or how to add one. Load this first before you write a new skill or plugin or preset, so the new piece fits the existing model.
whenToUse: The user asks how this workstation is set up, how a skill, plugin, or preset works, or how to add or change one. Load this skill before authoring any new skill, plugin, or preset. Trigger phrases are "how is this set up", "how do skills work", "how do plugins work", "what is a preset", "add a skill", "add a plugin", and "customize your setup".
metadata:
  dshVersion: "0.1.0-rc.7"
---

# customize-setup

This workstation runs DeepSeek Harness (dsh) version `0.1.0-rc.7`. It is
configured through one personal bundle that lives in this repo and syncs to
`$DSH_HOME`. This skill explains the model so a fresh agent can fit new work
into it instead of inventing a parallel structure.

Write all prose in STE-flavored Simplified Technical English.

## The two components

dsh splits into two planes. Every capability is a plugin row in one of the two
compositions. There is no separate configuration language. Changing what an
agent can do means changing which rows are composed for it.

1. **The host plane.** This is the process-wide composition, `base.cordis.yml`
   plus `web.cordis.yml`. It keeps everything a preset must not own: the tool,
   busy, skill, and session registries, the sandbox and approval stack,
   persistence, the model route, the jobs and subagent registries, and the
   tool-fs executors. It runs once for the whole process. Host-plane patch rows
   are static per boot. Adding or removing one needs a `dsh web` restart.

2. **The agent plane.** This is the per-session composition, one per preset
   under `config/agent-presets/<name>/agent.cordis.yml`. It owns the persona
   text, plan mode, compaction, the delegation tools (subagent, workflow,
   ralph), the model-facing tools (ask-user, todo, web, bash, fs), and the
   skills layer. A session joins a preset by scope parentage.

The `dsh` command is only the launcher. It boots a profile and stitches the
two compositions. `dsh web` is the web profile, not a separate binary.

A preset service must sit inside a group carrying an `isolate` realm. Without
it the service publishes into the root realm and becomes process-global, which
the preset loader refuses.

## The bundle layout

The personal bundle lives in this repo at the repo root. Its parts are:

- `skills/<name>/SKILL.md` — the instruction-only skills. Each is a single file
  with `name`, `description`, and `whenToUse` in frontmatter.
- `plugins/*.ts` with bundled `*.js` — the personal host-plane plugins and
  their esbuild bundles.
- `guards/*.json` — the bash-guard deny rule drop-ins (git, find, grep).
- `home/` — files that sync verbatim into `$DSH_HOME` (`AGENTS.md`, the
  dsh-better-edit guidance overrides).
- `build.mjs` — bundles the host-plane plugins into self-contained ESM.
- `sync.sh` — the idempotent installer. It copies skills to `$DSH_HOME/skills`
  and guards to `$DSH_HOME/plugins/guards`, writes the web-profile
  `cordis.patch.yml`, registers the agent presets, and sets the defaults in
  `settings.yaml`.

`sync.sh` is a floor, not a ceiling. Re-running it converges to the same state,
so it is safe after a clone, a rebase, or an edit to the bundle source.

## The skill / plugin / preset model

These are three different things. Do not mix them.

- **A skill** is instructions only. It teaches the agent how to do something.
  It does not mount tools by itself. If a skill needs tools, gate them with a
  top-level `tools-gated` frontmatter list, and the skill-gate plugin hides
  those tools until the agent loads the skill.

- **A plugin** registers capabilities into a scope layer. A host-plane plugin
  registers tools through `ctx.tools.register()`. A guard refuses an action by
  throwing and denying the rest of the chain. So a plugin is the compiled `.js`
  mounted as a row in the composition.

- **A preset** is an agent-plane composition. It lives under
  `config/agent-presets/<name>/` as a `preset.yml` (name, description, order)
  plus an `agent.cordis.yml` (the plugin-row list for that agent). Presets ship
  under the global CLI install, and the personal bundle adds its own under
  `$DSH_HOME/.agent-presets/`.

## How to add something new

1. Decide what it is. A teaching doc is a skill. A tool or a guard is a
   plugin. A named agent composition is a preset.
2. Load the matching authoring guidance: the `cordis-plugin-development` skill
   for plugins, and `editing-cordis-compositions` for preset composition rows.
3. Wire the new piece into the bundle: add the skill under `skills/`, the
   plugin source under `plugins/` plus its `build.mjs` entry, the guard under
   `guards/`, or the preset under the agent-presets tree.
4. Re-run `sync.sh` so the live `$DSH_HOME` matches the bundle, then restart
   `dsh web` for host-plane changes.
