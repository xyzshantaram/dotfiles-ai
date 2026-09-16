# Wizard skill: ship a desktop wizard from one script

Build interactive wizards (forms, splitters, dashboards, small apps) on wizardkit. One dependency
only: Deno. The browser pulls HTMX from CDN.

## Layout

Copy three files into a fresh dir: `template.ts`, `deno.json`, and `compile.ts` (from `desktop/`).
Rename the title, steps, and the desktop block. That dir is the whole wizard.

- `template.ts` imports everything from `"wizardkit"`: node builders, `createWizard`, plus
  re-exported shell (`$`).
- `deno.json` maps `"wizardkit"` to `jsr:@sid/wizardkit`. Local development against a checkout maps
  it at `../wizardkit/mod.ts`.
- `compile.ts` builds the binary plus the Linux shortcut. It reads the local `deno.json`, so it
  works unchanged per wizard.

## Steps as data

A step is `{ id, title, nodes }`, built with `step(id, title, nodes)` or hand-written as JSON. Node
kinds: `menu`, `tree`, `progress`, `radio`, `checkbox`, `textEntry`, `numberEntry`, `buttons`,
`markdown` (info panels only), `stages` (clickable `1/3` rows posting `goto:N`), `spoiler` (native
details), `tabs` (CSS-only, radio-driven), `action` (runs a server command, output swaps inline),
`answers` (review lists).

```ts
const handle = createWizard({
  title: "My wizard",
  steps: [askStep, reviewStep], // Step or (answers) => Step
  actions: { date: { command: ["date"] } }, // run:"now" default
  files: { root: "./assets" }, // optional read-only file proxy
});
Deno.serve({ port: 8471 }, handle);
```

## Rules that matter

- State is an event log. Every post appends `{ action, step, fields }`; answers fold from it.
  Restart clears it. Nothing is permanent until Done: mark side-effecting actions `run: "onConfirm"`
  and they execute in order on the confirmation page.
- Buttons: one primary per step (`primary: true`, autofocused). Rows default right-aligned;
  `layout: "split"` puts Back left, Next right.
- Forms survive refresh: field drafts persist to localStorage with a resume bar. The footer shows
  the draft status.
- Theming: light and dark ship together (`prefers-color-scheme`). Neutrals carry surfaces; one
  pastel tint per node kind carries edges.
- Text imports only (`style.css` pattern). No build step, ever.
- Run everything with `-A`. A wizard is deterministic; the user reviews the script before running
  it.

## Actions and files

Action nodes carry `{ label, id, command }`. Clicking posts to `/action`; output swaps below the
strip. Long or destructive commands use `run: "onConfirm"`. Shell access inside handlers uses the
re-exported `$` from zx: write the bash you would type, as in `` await $`git status --porcelain` ``,
then read `.stdout` off the result. Reach for it whenever bash is the shorter path than TypeScript.
The `files` proxy serves one root read-only (traversal, dotfiles, and directories 404) so pages can
fetch images or JSON.

## Ship it

`deno task dev` opens the chromeless window with hot reload. `deno task compile` emits the binary
plus shortcut. Installer and shortcut guidance lives in `INSTALLING.md`.

## Install story (grilled design)

One app per script. Three pieces compose at install time:

- Executable: `deno install -g -A -n <app> jsr:@<scope>/<app>@<version>`.
- Window: the shared `wizardkit-runtime` binary (one per platform, from wizardkit releases). Each
  shortcut runs it pointed at the installed wrapper:
  `wizardkit-runtime --title "App" -- ~/.deno/bin/app`.
- Launcher: a `.desktop` shortcut (Linux) naming the app.

Scripts read their port from `WIZARD_PORT` with a plain fallback:

```ts
const port = Number(Deno.env.get("WIZARD_PORT") ?? 8471);
```

`wizardkit/install.ts` automates all three (`--app`, `--version`, `--scope`, `--dest`, `--dry`).
`wizardkit/install.sh` ensures Deno, then runs the installer from JSR. Updates mean reinstalling the
same command. Icons ride `assets/icon.png` by convention.
