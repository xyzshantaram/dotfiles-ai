# PLAN.md — Desktop wizard toolkit plus flows

## Vision

A generic Desktop wizard toolkit: wizards author steps as JSON data nodes, Deno serves them as HTMX
fragments into a webview window. Markdown renders in info panels. First consumer is the splitter
flow at full dashboard parity. The toolkit stays portable for the dotfiles wizards skill. Aimed as
the one unified way for an agent to build useful interactive things: wizards, forms, dashboards, and
small apps from the same nodes.

## Checklist

Open work only. A closed ticket leaves this file. Git holds its history, and anything worth
remembering moves to Critical context. Work the user must drive by hand moves to the review queue.

### N series: the declared navigation bar

Settled with the user on 2026-09-17. A step declares its own footer instead of hand building a
buttons row, the toolkit renders that footer stuck to the foot of the window, and each screen owns
its own submit logic. This retired G17, which planned to spread the old `nav()` helper instead. The
bar, the flows, the hooks and the drafts API have all landed. What is left of the series:

### V series: the split board

Settled with the user on 2026-09-17, after they drove a real 137 item run. The verdict: the split
screen is confusing, it cannot move back to an earlier item, and it is worse than the Tk dashboard
it replaced. One item per server round trip is the cause. The fix is a component that holds the run
in the browser and tells the server at checkpoints.

Settled decisions, which no ticket may revisit: one item fills the screen and movement runs both
ways; the browser holds the whole run; checkpoints go on a timer while working and once on leaving;
the step renders the run into the page as JSON and the component posts only what changed; the keys
mirror the dashboard, a for all, m for me, r for repeat, arrows to move, Enter to move on, plus s to
skip and number keys for the split modes; the component replaces the server rendered item screen
rather than standing beside it; the component lives in the app, never in wizardkit, and only the
pattern goes in the wizard skill.

V1 to V4 have landed. What is left of the series:

### A series: the Splitwise API key replaces the OAuth handshake

Settled with the user on 2026-09-17. The push flow dies at the verifier swap with a 401 that reads
`Invalid API Request: you are not logged in`. I claimed Splitwise had withdrawn OAuth 1. That claim
was wrong. The user reports the Python pusher completes the same flow, and the API reference lists
`OAuth ApiKeyAuth` on every endpoint, so both schemes are live and the cause of the 401 stays
unknown. The user chose the API key anyway, because this app runs on one personal machine.

Settled decisions, which no ticket may revisit: the API key replaces OAuth 1 outright, so the
authorize screen, the verifier screen, the token cache and the `oauth` dependency all go. The key
lives in the same 0600 file as the old pair, `<state>/config/splitwise.env`, under `API_KEY`. The
connect step verifies the key at once with `get_current_user` and shows the account name, so a bad
key fails on the settings screen and not halfway through a push.

A1 to A4 have landed. The series is closed.

### W series: three homes, a shared core, and a CLI

Settled with the user on 2026-09-17 by grilling. The work splits into three homes.
`~/repos/wizardkit` becomes the JSR package `@xyzshantaram/wizardkit`, holding `deno.json`,
`license.md`, `readme.md`, `src/` and `tests/`. The `wizard` skill ships one file that imports that
package. `split-utils` lives in `dotfiles-ai/skills/split-utils`, imports wizardkit from JSR, and
runs straight from its GitHub URL. split-utils is never published to JSR, because the user does not
want to maintain a release for it.

Settled decisions, which no ticket may revisit. The work becomes pure functions with a thin CLI over
them, and both the wizard and an agent use that core. The wizard calls the CLI through zx where that
is easy, which is what gathering already does, and imports the functions where interaction demands
it. The CLI carries six verbs: gather, validate, push, aggregate, share, wizard. The skill is a thin
router that names the surface and sends the reader to `docs/schema.md` for the split format. An
agent always dry runs, shows the expense table and the per person totals, and stops until the user
says go. The skill explains all three push paths: aggregate for no API access, share to a friend who
has access, and the user's own API key. An agent asks rather than guessing, accepts standing rules
such as per person affinities and a fallback owner with a cap, and asks the user where to persist
those rules using whatever the host offers, because split-utils stores none of it.

W4 and W5 have landed. Three facts came out of them, and no later ticket may contradict them.

A raw GitHub URL run cannot resolve a bare specifier. Deno does not apply a local `deno.json` to a
remote module, and it rejects `--config` pointing at a URL. Only `--import-map=<url>` works. The
user chose to name every dependency in full inside the source instead, so a plain `deno run <url>`
needs no extra flag. The `no-import-prefix` lint rule is off for that reason, and `deno.json` keeps
only `@std/assert` for the tests.

A package cannot read the compilerOptions of the project that imports it. wizardkit's JSX only ever
compiled because split-utils declared `jsx` settings at its own root. `toolkit.tsx` now carries a
`@jsxImportSource` pragma, and the package manifest declares no jsx settings, so its own check
proves the pragma carries the build.

`desktop/` is gone. Its `compile.ts` was byte for byte identical to `wizard/compile.ts`, and its
tasks only packaged the wizardkit demo, which now lives in that package's own `examples/`.

W1, W2 and W3 have landed. The CLI is `scripts/cli.ts`, with six verbs. The browser libraries load
from pinned CDN URLs, and the push work is a callable core in `src/pushcore.ts`.

- [x] W3b drop `buttons()` from wizardkit before the first publish. The nav bar replaced it, no app
      file uses it, and a new package must not ship two ways to build one footer. Eval: no export
      named buttons survives, and the suite is green.
- [x] W3c rename `src/wizardkit.ts` to `src/term.ts`. It is the terminal output helper for the two
      remaining CLI scripts, and it has nothing to do with the library. Four files import it. Eval:
      no file named wizardkit.ts sits under src/.
- [x] W4 move wizardkit to `~/repos/wizardkit` as a JSR package with `src/` and `tests/`. Eval:
      `deno publish --dry-run` passes there.
- [x] W5 split-utils imports `jsr:@xyzshantaram/wizardkit`. Eval: the app runs with no local
      wizardkit on the import path.
- [x] W10 wizardkit's installer and runtime parse flags with `parseArgs` from `@std/cli` instead of
      a hand-rolled reader. The runtime also drops its manual `--` split. Eval: a bare word and an
      unknown flag both throw, and the runtime still starts a child after `--`.
- [x] W12 move `cli.ts` into `scripts/`, beside `validate.ts`. It is a runnable entry, not a library
      module. Eval: the six verbs still work, including the two subprocess dispatches whose targets
      resolve relative to the entry.

`deno publish --dry-run` is not proof. It passed three times while the real publish failed twice.
The global types check and the module graph build both run on the server only.

A published package may not augment another module's types, and a `@jsxImportSource` pragma must
name a specifier that resolves on its own, because JSR does not apply the package import map when it
resolves one. Element names Preact does not know now live in `src/elements.ts` as typed bindings,
which needs neither.

Deno refuses a JSR version younger than 24 hours by default. Right after a wizardkit release, a
consumer needs `--min-dep-age=0` until the version ages. This bites a raw URL run of split-utils,
which carries no config to set the policy in.

- [x] W6 the wizard skill ships one file that imports the JSR package. Eval: the template runs from
      a directory holding nothing else.

### Deferred: wizardkit footguns found by the C-series audit

These are toolkit gaps, not app bugs. Each one invited a bug we then fixed inside split-utils. Do
not start these until split-utils runs end to end. Keep them here so the fix lands in the toolkit
later, and the next app does not pay the same cost.

- [ ] G27 move the split writes out of render. Low priority, with the evidence below. itemStep
      writes while it renders: the Start over branch calls freshState plus saveState, and
      commitPosted saves each posted assignment. K3 landed an onEnter hook, so arrival work belongs
      there. Measured before acting: onSubmit holds no split-item branch, so no external veto can
      re-render a rejected post, the toolkit already serialises double submits, and pendingResume
      clears itself so the Start over write runs once. So this is a design fault with no known user
      visible symptom. Do it when the core loop is not about to be hand driven. Eval: a repeated
      render of one item writes nothing, and a posted assignment still saves once.
- [ ] U10 the zx version sits in three files: deno.json, wizardkit/deno.json, and wizardkit/mod.ts,
      which hardcodes `npm:zx@8.8.5` so the published package resolves with no import map. A bump
      needs three edits today, and nothing fails when one is missed. Eval: one place states the
      version, or a check fails when the three disagree.
- [ ] N13 show which build a window is running. Four bug reports on 2026-09-17 were a stale process
      serving the code it booted with, and each cost a round of investigation. Wanted: the footer
      strip carries a short build mark, so a reader can see at a glance that the window predates a
      fix. A start time works, and a short commit mark works better. Eval: two windows on different
      builds show different marks, and the mark changes after a restart.
- [ ] W6 file pick: the last open gap (descriptions, polling, entry onConfirm all shipped). Eval:
      user picks a split file through the dialog in push flow.

## Critical context

- A running server keeps the code it booted with. The page carries an inlined stylesheet and an
  inlined client script, so a committed and green change still will not reach an open window. Four
  reports on 2026-09-17 turned out to be exactly this: the sticky bar, the strip resume, one of my
  own measurements, and a missing button. Restart the app before believing what a screen shows.
- The parity audit is finished and its document is deleted. All 50 rows were re-checked against the
  tree on 2026-09-17: 47 carried, 2 dropped with the terminal flows they belonged to, and 1 missing.
  The missing one was Splitwise key discovery through a `SPLITWISE_ENV` variable, and the user chose
  to leave it dropped with the rest of the environment plumbing. Keys live at the config path only.
- The footer strip offers the newest saved session, and the menu keeps its resume row on purpose.
  The user decided on 2026-09-17 to keep both rather than build a second strip control, so the
  picker stays reachable for older sessions.
- Two split saves inside one filesystem timestamp tick still lose the earlier document. The user
  accepted that on 2026-09-17, so only the conflict file name was made unique. A hash or a version
  counter was considered and rejected as too much machinery for the risk.
- The toolkit replays every post into one answers map per session, so any app level copy of the
  answers is duplication. This is why N6 deletes the `seen` store rather than feeding it.
- Back is unblockable by construction: the toolkit resolves a backward move before any app code
  runs. Departure work goes in `onLeave`, which takes the direction and cannot block.
- The terminal era is over. One script still runs from a shell, `scripts/gatherer.ts`, and it takes
  machine modes only. `scripts/dev/zomato-consts.ts` is a dev tool that takes an APK path. mepcli,
  exotui, crayon and cliffy are gone, and zx stays because wizard authors run bash through it.
- Three top level code dirs, renamed on 2026-09-18. `src/` is the library, `app/` is the wizard that
  consumes it, and `scripts/` holds every command line entry point, with dev tools in
  `scripts/dev/`. The boundary that matters is the UI framework: `src/` holds no wizardkit import
  and no entry point, which is why `scripts/validate.ts` runs under `--allow-read` alone with no
  toolkit. Dependencies point one way, `app` to `src`, and nothing enforces that beyond review. The
  old `wizards/` dir also held two programs that were not wizards, which is what prompted the split.
  The "no entry point" half of that claim was false when it was first written here. `src/render.ts`
  carried a main block until the Z9 audit found it on 2026-09-18. It moved to
  `scripts/render-fixtures.ts`, and `tests/run.sh` now calls that path. The claim holds now, and a
  reviewer can check it with one search for `import.meta.main` under `src/`.
- The Z9 audit ran on 2026-09-18 and found 32 items. These were judged correct and must not be
  "fixed" by a later reader. `src/runstate.ts` keeps a sync twin of the run lister because wizard
  step builders are synchronous. `src/splitwise.ts` reads one env key by hand, because a dotenv
  dependency buys nothing on a single read. `src/lastpush.ts` lists twelve month names by hand,
  because a date library buys nothing for one label. `src/pushcore.ts` hides raw error text, but it
  stops the loop and leaves the order unsent, so the silence costs no money. `src/paths.ts` joins
  with slashes rather than taking a path dependency. `scripts/cli.ts`, `app/expense-split/split.ts`
  and `app/expense-split/board-routes.ts` all resolve siblings through the module URL on purpose,
  because a raw GitHub run needs that base to survive. Resolving a module is not building a state
  path, and only the second one is banned.
- State paths all resolve through src/paths.ts and honour `SPLIT_UTILS_STATE`. With no override the
  root is `<data>/split-utils`, where `<data>` comes from `@cross/dir`. That is the only portable
  answer: hand-rolling `~/.local/share` would have been Linux only, as the user pointed out on
  2026-09-18.
- No path may derive from `import.meta.url`. A module loaded from a URL has no directory of its own,
  so `new URL("../state/", import.meta.url).pathname` resolved to `/state` and the headline raw-URL
  run had nowhere to write. Proven by importing src/paths.ts over http on 2026-09-18. The same fault
  hid in `src/log.ts` (logs dir), `src/zomato.ts` (two login-state fallbacks) and
  `app/expense-split/split.ts` (the validator path, which took `.pathname` where `.href` is
  correct). Use `.href` when the target is a module to run or fetch, and paths.ts when it is data.
- `@cross/dir` is async, and the path accessors cannot be: call sites include `Deno.statSync`,
  `Deno.readDirSync` and `Deno.readTextFileSync`, and `loadConfig` in src/zomato.ts is sync. So
  src/paths.ts resolves the data dir once with a top level await and keeps every accessor sync. That
  avoids an init step a caller could forget.
- All migration code is gone as of 2026-09-18, by the user's call: the repo is days old and has no
  installed base to carry. `migrateIfMissing`, the three `legacy*Path` helpers, the old cache reads
  and their two tests were deleted rather than retargeted.
- Splitwise facts (verified Sep 2026): app registration at secure.splitwise.com/apps is free and
  yields a personal API key. Free accounts cap at a few expenses a day, so a full push needs Pro on
  one group account.
- Splitwise auth is a personal API key sent as `Authorization: Bearer`, saved as `API_KEY` in
  `<state>/config/splitwise.env` at mode 0600. The app used OAuth 1 until 2026-09-17 and the swap
  happened because this app runs on one personal machine. Splitwise did NOT withdraw OAuth 1. I
  claimed it had, on a web search, and the user corrected me: the Python pusher completes the same
  handshake, and the API reference lists `OAuth ApiKeyAuth` on every endpoint. The 401 that started
  this still has no known cause. `Invalid API Request: you are not logged in` is the generic reply
  for any credential Splitwise does not accept, and a wrong API key returns exactly the same body.
- The expense description names the goods, not the clock: `itemSummary` gives five tidied product
  names plus a `+N more` tail, then the platform in brackets. Fee only orders fall back to the old
  dated title. The date and time moved to the first line of the expense comment. This is safe
  because `orderFingerprint` keys on platform, order id, date and total, never on the title.
- Never render the aggregate summary through markdown. It is fixed width plain text, and its `====`
  and `----` rules are read as setext heading underlines, which turned the whole block into giant
  headings on 2026-09-17. It renders through `copyable` with `mono` set.
- A headless scrape must load the site first. `openSite` passes the app URL for the headed login
  phase alone, so the scrape page sat on `about:blank` until 2026-09-17. Blinkit reads its access
  token from `localStorage`, which throws `SecurityError` there, and Swiggy fetches relative paths,
  which cannot resolve there. Both reported zero orders. Zepto escaped it by navigating on its own.
- Swiggy answers HTTP 200 while logged out. The body carries the truth: `statusCode` 0 means the
  call worked, and `statusCode` 1 with "Session expired. Please login again." means it did not.
  Never read a Swiggy reply by HTTP status alone. That mistake closed the login window after four
  seconds, because the login check only asked for a 200, and it also turned an expired session into
  a report of zero orders.
- A saved browser profile proves that a sign-in happened once, never that it still works. The
  accounts screen must always offer the sign-in control. It read "ready" and drew no control until
  2026-09-17, which left a user with an expired session no way back in.
- One gather may press several Fetch buttons, and every press must add to one run. The gatherer
  merges platforms into a single run labelled `multi` when it runs them together, but the wizard
  draws one button per platform, so three presses wrote three runs and the pick screen showed one.
  The user kept the per-platform buttons for their retry value, so the run id travels with them.
- A slow step must say it is working. The push of 38 orders took 26 seconds of silence on
  2026-09-17, which read as a dead button and nearly caused a second press. The step form now
  carries `hx-disabled-elt="find wa-button"` and a `.wiz-busy` line that htmx reveals through the
  `htmx-request` class. The disable matters more than the text: two pushes at once would beat the
  fingerprint guard, because the guard only reads what the first push already wrote.
- A node label is not a document heading. It rendered as `<h3>` until 2026-09-17, which shouted on a
  screen holding 40 order rows. It renders as `p.node-label` at normal size now. The user asked for
  the fix in wizardkit rather than a per node flag, and a screen that mixed heading labels with
  plain ones would look broken, so the change covers every node kind.
- The per order push rows pre-select Push, so a plain Next sends every order that is not already
  sent. A choice the user already posted always wins over that default on a re-render.
- The per order push screen offers Push and Skip alone. Stop was a terminal era control that meant
  "push the orders above this one, then halt". A form shows every order at once, so Skip on the rest
  says the same thing, and Back leaves without pushing anything.
- Install grill verdict (author-hosts, reinstall updates, source tags, convention icons, shared
  runtime): one app per script; `deno
      install -g` owns the executable; chromeless comes from
  one shared wizardkit runtime binary (our releases); authors host source on GitHub and tags publish
  to JSR; installer resolves app plus version from JSR; icons ride assets/icon.png; WIZARD_PORT env
  carries the serve port from runtime to script.
- Prior art: `deno install --global` (adopts executable install), `deno x` (try-before-install),
  AppImage (double-click, no integration; our shortcut fills it).
- T8-T10 terminal port dropped, superseded by Desktop. MepCLI and exotui still retire, but through
  disuse rather than a port.
- Prior art: hippo (~/repos/hippo) for server-driven data-defined forms; denidian
  (github.com/bartlomieju/denidian) for the vanilla Deno.serve plus webview shape; dashboard.py for
  the parity widget list (radios equal/percent/custom/single, people checkboxes, amount entries,
  item tree, progress).
- Desktop needs Deno 2.9 or later (have 2.9.6). Dev runs through `deno desktop --hmr`; plain
  `deno run` serves the same pages in a browser for quick checks.
- Only bootstrap dependency is Deno. Deno resolves server deps; browser libs load from CDN.
- Wizard skill ships from wizard/ (template plus deno.json plus compile plus SKILL plus INSTALLING).
  Template verified live against the checkout. JSR publish and the dotfiles-ai move come later; the
  `@sid` scope is a placeholder.
- Run everything with -A. A wizard is a deterministic program the user reviews before running, so
  minimal flags buy nothing.
- Style floor carries over: bold structure, dim meta, yellow fees, two-space indent, never white on
  light themes, NO_COLOR equivalent where it applies.

## User preferences and special rules

- Every ticket ends with the user driving the real screen by hand.
- Subagents build; orchestrator owns design and verifies one claim per ticket before closing it.
- Suite plus fixtures stay green on every ticket (`deno task check`, `deno task test`,
  `deno task test:fixtures`).
- Wizard tone is cohesive and fun, never annoying. No generated transitions like "Opening X".
  Cross-app steps give real moves.
- Ported copy needs proof: every old user-facing string maps to a new home or a written reason. The
  audit that proved it is done, so its file is gone.

### Must not happen, anywhere, ever

Folded here from the retired CHECKLIST.md. These rules hold for every ticket.

- `state/`, env files, or token files reach the public repo.
- An unredacted secret appears in a run log. Spot check one log after each live run.
- A user facing line shows a bare path, a command, a fingerprint, or an id. The AI setup block is
  the one deliberate exception, because the user's AI tool reads it, not the user.
- The words "meta wizard" appear in copy, or a platform is named "custom".

## Human review queue

Every entry here names work that is code complete and green. It counts as done only after the user
drives the real screen. Restart the server first. A fix cannot reach a process that started before
it.

- [ ] NAV hand-drive (your smoke test): the user confirmed on 2026-09-17 that the bar stays at the
      foot of the window while a long screen scrolls. What is left to drive by hand: Select all and
      Select none tick and untick without leaving the screen, Next refuses an empty pick list with
      one message, and the split and push flows show the same bar now that they carry it too.
- [ ] REPEAT hand-drive: split a run on the board. Press `r` on the second line. Confirm the line
      takes the same people and the same split type as the line before. The board starts every line
      unticked, fees included, so `r` is now the only repeat path and no button exists. Confirm the
      run dir grows no `split-state.conflict-` file.
- [ ] CONFIRM hand-drive: reach the last push screen and read the summary above the bar, under the
      heading "Read this summary before you push." Confirm it matches what the push then sends, and
      that no file lands beside the source until a push with no Splitwise access writes one.
- [ ] PICK detail hand-drive: on Pick orders each row now carries a second line naming up to five
      items with their quantities, then a count of the rest. Confirm it reads well on a real grocery
      order, which is the thing that made price and count too little to decide on.
- [ ] RESUME hand-drive: gather a run, leave the wizard, come back through Pick up where you left
      off, and confirm you land on Pick orders with your earlier ticks already set, not in the split
      flow. Change one tick, press Next, and confirm the split opens on that run with the change.
- [ ] R3 push source hand-drive: the source screen lists your assigned runs, newest first, and
      starts on the newest. A run id typed into Other run still wins.
- [ ] G30 sign in hand-drive (your bug): press Sign in to Zepto. A browser window opens for the sign
      in. The panel shows one sentence when it lands. No banner, no "Ready to start?", and no line
      about opening a main menu.
- [ ] G24 usage screen hand-drive (your bug): the first run screen shows one heading, one muted
      line, then the choices. No third block of text sits between them.
- [ ] Z2 Zomato hand-drive: with no saved sign in, the accounts screen takes your phone, sends the
      code, verifies it, and saves a city, with no terminal at any point.
- [ ] M1 manual row hand-drive: type a store with no amount and press Next. The screen names the row
      and refuses. A zero amount refuses the same way. Back with a bad row still leaves the screen.
- [ ] S2 save hand-drive: assign several lines quickly, then reopen the run. Every assignment is
      there. No file ending in .tmp sits in the run dir.
- [ ] A1 Splitwise fault hand-drive: connect an account, then break the network and push. The screen
      says the sign in check failed and names the reason, instead of claiming no account exists.
- [ ] D2 dry run hand-drive: the box appears on the first screen of each flow only. A later screen
      shows the muted note when the run is dry, and shows nothing when it is not.
- [ ] T2 settings hand-drive: settings opens as one tabbed screen. Move through Currency, Splitwise,
      AI assistant and Reset. Every field still saves. The AI tab opens first for an AI user.
- [ ] X1 factory reset hand-drive: type RESET, press Factory reset, then confirm the app opens
      onboarding with no saved credentials and no runs. Use a spare state root first.
- [ ] L1 label hand-drive: no control states its label twice. The gather review names the platforms
      and the day range instead of drawing an empty Gather heading.
- [ ] P2 People hand-drive: the People list is one repeating block with real rows. A seeded name can
      be edited and removed. A rename keeps every saved assignment.
- [ ] N1 navigation hand-drive: on the People step type two names and press Next with no roles
      picked. The error shows, the typed names survive, the radios render. Press Back from People
      and from each settings step. Back never blocks and never validates.
- [ ] S1 stage hand-drive: gather reads 1/3, split reads 2/3, push reads 3/3 on every screen. The
      menu and settings show no stage marker.
- [ ] G2 cutoff hand-drive: leave the cutoff blank and push. Every order goes. A bad date still
      reports an error.
- [ ] G5 money hand-drive: push confirm lines and the report now read currency first, for example
      "INR 100.00". Confirm the wording reads right on a real push.
- [ ] B1 currency hand-drive (your bug): pick INR, press Next without touching any radio, currency
      saves; custom code path saves uppercase and rejects junk
- [ ] U3 flow hand-drive: every gather, split, push step shows a muted description; no label echoes
      its heading; push report states what landed
- [ ] F6 hand-drive: dry push prints the plan and writes nothing; resume picker routes each status
      to the right step
- [ ] F8 handoff hand-drive: Finish offers Push, lands on push-source with the run loaded
- [ ] U4 live share hand-drive: make a share link, then consume it through the push flow by pasting
      the link. Both paste.rs and the dpaste fallback must round trip live.
- [ ] C10 conflict copy hand-drive: open one run in two browser sessions and save both. The newer
      file must survive, and the loser must land beside it as a `.conflict-<unix>` copy in the run
      dir. src/splitstate.ts holds the guard, and tests/splitstate.test.ts covers it, so this drive
      checks the user facing half only.
- [ ] P1 release gate: replace every YOURUSER placeholder. Three files hold them today: README.md
      install one liners plus the issues link, install.sh, and install.ps1.
- [ ] P2 release gate: cold box install. Follow README.md alone on one clean Linux box and one
      Windows box. A VM counts. The installers passed a syntax check only, so nobody has run them.
- [ ] P3 release gate: real data sweep before the first public push. Search the tree that git would
      publish for real names and brands. The fixtures are synthetic and verified. Check docs and
      comments too. `state/` is ignored, so confirm with `git status`.
- [ ] P4 after one full flow: delete the `expense-split` skill from dotfiles-ai. The final Python
      version is committed there at `be1523d`.
- [ ] F3 live push hand-drive: one real order to Splitwise, rerun skips it by fingerprint, report
      counts match; duplicate names show the pick list, unknown names take a hand id
- [ ] F4/F5 hand-drive: leave a split mid-way, come back, continue keeps assignments; one
      manual-expense run gathers and splits end to end
- [ ] Menu plus onboarding hand-drive: fresh settings state shows Start here on top; used state
      hides it; usage step leads into the settings chain; every menu item opens its module
- [ ] W8 split hand-drive: serve `app/expense-split.ts` on a real run dir, split every line, press
      Finish, confirm output.json plus the stamped copy land in the run dir
- [ ] WA restyle: restart the window (old bundle keeps serving stale pages), confirm tabs switch,
      dark mode follows the system, form posts record answers
- [ ] W1 template hand-drive: copy the `wizard/` trio to a fresh dir, run `deno task start`, and
      click Ask through Review to Done. wizardkit comes from JSR now, so no local mapping step
      applies. I proved the template serves from a dir holding nothing else. The click through is
      the part still unproven.
