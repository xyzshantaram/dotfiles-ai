# dsh-better-edit guidance (personal bundle)

This directory is the per-preset guidance override home for dsh-better-edit.
The plugin resolves each of its three prompt sections as
`$DSH_HOME/plugins/dsh-better-edit/<preset>/<section>.md`, falling back to the
compiled defaults when a file is absent. Layout and semantics verified against
the installed package README (~/.dsh/profiles/web/node_modules/dsh-better-edit/
README.md "Configuring Guidance per Preset") and lib/guidance.js.

## Sections

| File | Section | Default order |
| --- | --- | --- |
| `read.md` | `tool:read` | 130 |
| `edit.md` | `tool:edit` | 131 |
| `undo_last_edit.md` | `tool:undo_last_edit` | 133 |

Upstream removed the `batch_edit` section in 0.3.1 (its seam folded into
`edit`); the order number 132 stays retired.

## Personal preset overrides

`personal/read.md` and `personal/edit.md` are the personal preset's overrides,
authored in STE. A preset directory may hold only the sections it wants to
override; the rest fall through to the compiled defaults.

`personal/` must match the personal preset's id. The plugin reads the preset id
per agent from `agentPresets.composedPreset(agent.ctx)`; if the preset
directory is renamed, copy this directory to the new name (see the plugin
README's fallback note).

## Format

A file is pure prose unless it opens with a YAML front-matter fence carrying
only `order`:

```md
---
order: 131
---

<section text>
```

A malformed fence (missing closing `---`, non-integer `order`, unknown key)
degrades the whole file to prose. Files are read once per agent at
session-start, so edits apply to new sessions.

## Sync notes

The plugin seeds `standard/`, `code/`, `minimal/`, and `cordis/` on first boot
and never rewrites existing files, so `personal/` is safe from seeding. Add
`undo_last_edit.md` here to override that section for the personal preset.
