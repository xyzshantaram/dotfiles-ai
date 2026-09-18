# Wizard skill: ship a desktop wizard from one script

Build interactive wizards (forms, splitters, dashboards, small apps) on wizardkit. One dependency
only: Deno. HTMX and the Web Awesome controls load from a pinned CDN, so a wizard needs network
access for its own UI.

## Layout

Copy three files into a fresh dir: `template.ts`, `deno.json`, and `compile.ts`. All three ship with
this skill. Rename the title, steps, and the desktop block. That dir is the whole wizard.

- `template.ts` imports everything from `"wizardkit"`: node builders, `createWizard`, plus
  re-exported shell (`$`).
- `deno.json` maps `"wizardkit"` to `jsr:@xyzshantaram/wizardkit@^0.1.0`. To develop against a
  checkout, map it at that checkout's `src/mod.ts` instead.
- `compile.ts` builds the binary plus the Linux shortcut. It reads the local `deno.json`, so it
  works unchanged per wizard.

## Steps as data

A step is `{ id, title, nodes }`, built with `step(id, title, nodes)` or hand-written as JSON. Node
kinds: `menu`, `tree`, `progress`, `radio`, `checkbox`, `textEntry`, `numberEntry`, `textarea`,
`table`, `copyable` (text plus a copy button), `markdown` (info panels only), `stages` (clickable
`1/3` rows posting `goto:N`), `spoiler` (native details), `tabs` (CSS-only, radio-driven), `action`
(runs a server command, output swaps inline), `answers` (review lists), `repeating` (one group of
fields per row), and `mount` (hands a region of the page to a component of your own).

```ts
const handle = createWizard({
  title: "My wizard",
  steps: [askStep, reviewStep], // Step or (answers) => Step
  actions: { date: { command: ["date"] } }, // run:"now" default
  files: { root: "./assets" }, // optional read-only file proxy
});
Deno.serve({ port: 8471 }, handle);
```

## Navigation

A step declares its footer, and the toolkit renders one bar stuck to the foot of the window, so Back
and Next stay in reach on a long screen. Set `nav` on the step:

```ts
{
  id: "pick",
  title: "Pick orders",
  nodes,
  nav: {
    back: true, // true gives the label Back, or pass your own label
    next: { label: "Next", run: onNext }, // one forward button only
    actions: [ // screen-wide actions, left of the forward button
      { id: "all", label: "Select all", run: selectAll },
    ],
  },
}
```

- One forward button per step. Declare `next`, `done` or `goto`, never two of them.
- A handler takes `(answers, fields, ctx)`. `answers` holds every answer so far, including the post
  that triggered this handler, so a value posted now wins over the stored value of the same name.
  `fields` is the plain view of that one post. `ctx` carries the session id.
- A `next` handler that returns nothing advances. A custom action that returns nothing re-renders
  the same screen, which is what a Select all button wants.
- Return `{ errors: ["..."] }` to hold the screen and show the message. Return `{ goto: "step-id" }`
  to move somewhere else.
- A step handler replaces the central `onSubmit` for that post, so one screen has exactly one owner.
- Back never blocks and takes no handler.
- The bar carries navigation and every action that applies to the whole screen. There is no in-page
  button node: a control that acts on one item belongs to that item's own node.

## Arrival and departure

Two hooks bracket a step. Both swallow their own errors, and neither can block.

- `onEnter(answers, ctx)` runs once when a move lands on the step, before it renders. Arrival work
  belongs here. It does not belong in the step builder, which runs on every render.
- `onLeave(dir, answers, ctx)` runs just before a move away. `dir` is `back`, `next`, `done` or
  `goto`. Save a draft here.

## Rules that matter

- State is an event log. Every post appends `{ action, step, fields }`; answers fold from it.
  Restart clears it. Nothing is permanent until Done: mark side-effecting actions `run: "onConfirm"`
  and they execute in order on the confirmation page.
- Buttons: declare every control through `nav` above. The bar puts Back on the left and the forward
  control on the right, and it autofocuses the forward control.
- Forms survive refresh: field drafts persist to localStorage, and a resume bar offers Restore or
  Discard. The draft holds one step's fields, and the bar appears only while that same step is on
  screen. It does not carry the reader back to the step they left. The footer shows the draft
  status.
- Theming: light and dark ship together (`prefers-color-scheme`). Neutrals carry surfaces; one
  pastel tint per node kind carries edges.
- No build step, ever. The toolkit's own CSS and browser scripts are real files under `src/client`,
  pulled in with `with { type: "text" }` and served as written.
- Run everything with `-A`. A wizard is deterministic; the user reviews the script before running
  it.

## Actions and files

Action nodes carry `{ label, id, command }`. Clicking posts to `/action`; output swaps below the
strip. Long or destructive commands use `run: "onConfirm"`. Shell access inside handlers uses the
re-exported `$` from zx: write the bash you would type, as in `` await $`git status --porcelain` ``,
then read `.stdout` off the result. Reach for it whenever bash is the shorter path than TypeScript.
The `files` proxy serves one root read-only (traversal, dotfiles, and directories 404) so pages can
fetch images or JSON.

## Browser component through mount

Use a browser component for one case only. Use it when the user moves fast through a long list. Do
not use it for a form. A form needs one screen per post. A long list needs no round trip per move.
The split screen hit this wall on a real 137 item run.

Call `mount(id, data)` to hand one page region to code of your own. Pass a stable id string as the
first arg. Pass plain JSON data as the second arg. Pass runId, currency, payer, me, and people. Pass
items as full rows with index, name, price, platform, orderId, and isFee. Pass assignments, skipped,
and at. Draw no per item nodes beside the mount. Let the component draw the items.

List the component file in `scripts` on `createWizard`. The toolkit renders each entry as a module
script tag. Serve that path from the app itself. Keep the file beside the step code and serve it
with no store cache. Keep the component in the app, never in wizardkit. Only this pattern ships with
wizardkit.

Read the mount data from the page on boot. Find the host with `[data-mount="your-id"]`. Find the
JSON island with `script[data-mount-data="your-id"]`. Parse the island text as JSON. Guard for a
missing host or bad JSON. Run boot again after each `htmx:afterSwap`. Flag the host when done. Treat
a fresh host as a fresh boot. Import nothing in the component file. Use no build step.

Hold working state in the browser between checkpoints. Post changed lines to the server at
checkpoints. Post on a timer. Post when the page hides. Post before each wizard post. Send runId,
changed assignments, changed skipped, and baseline. Keep dirty marks until the server answers ok.
Show a note when a post fails. Keep failed work in the page. Treat the server file as the sole
source of truth. Reload server state on each step render when the disk time moved on. Never write
the file from the browser directly.

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

The package's `install` entry point automates all three (`--app`, `--version`, `--scope`, `--dry`).
Set `DENO_INSTALL_ROOT` to install somewhere else. Its `install.sh` ensures Deno, then runs the
installer from JSR. Updates mean reinstalling the same command. Icons ride `assets/icon.png` by
convention.
