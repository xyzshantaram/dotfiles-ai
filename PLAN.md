# PLAN.md — Desktop wizard toolkit plus flows

## Vision

A generic Desktop wizard toolkit: wizards author steps as JSON data nodes, Deno serves them as HTMX
fragments into a webview window. Markdown renders in info panels. First consumer is the splitter
flow at full dashboard parity. The toolkit stays portable for the dotfiles wizards skill. Aimed as
the one unified way for an agent to build useful interactive things: wizards, forms, dashboards, and
small apps from the same nodes.

## Checklist

Open work only. Closed tickets move to the human review queue at the foot of this file, where the
user drives the real screen before the work counts as finished.

G3 splits into the two tickets below. One browser can read another one's answers today. The user
chose the full fix: real per session state, in the toolkit first, then in every module.

- [x] G18 one reader for a posted field. Closed. src/answers.ts now holds field(), answer(),
      answers() and isDryMap(), each defined once. isDryMap keeps a re-export from src/runstate.ts
      so old import paths still work. About twenty hand written reads collapsed into it. The raw
      reads left behind are listed in the report: each one converts a number, tests for a missing
      key, or matches an exact string, so the trimmed reader would change its meaning.

- [ ] G17 nav() adoption across the step modules. Parked with a reason, not forgotten: nav() fixes
      the label of a goto row to "Next", so a sweep would silently rewrite copy such as "Back to
      menu". Blocked on K12. The other two parts of G17 landed: the People list now uses seeded
      repeating rows, and the AI setup uses copyable().

### Closed with a reason, not with code

- K1 gave the toolkit a custom done screen. This app does not need one. Every flow already ends on a
  purpose built screen with a Back to menu button, and one shared done screen would serve three
  flows badly. The single button that still posted `done` sat on the dry run export, where it hit
  the toolkit summary and left the user stuck. That button now returns to the menu, matching the
  live export path, and no `action: "done"` remains in the app.

### Final gate, after every ticket above is closed

- [ ] Z9 full code review plus slop audit of the whole repo. Look for dead code, unused imports,
      duplicated logic across modules, near copies that differ by one argument, duplicated type
      definitions, and hand rolled code that a small well scoped dependency would replace. Review
      the wizards, the toolkit, and src together, not module by module. Eval: every finding lands as
      its own ticket here, or as a written reason to leave it alone.
      Three findings already came out of the pre commit diff read, so start from them:
      1. wizardkit/toolkit.tsx repeats one block four times: run onEnter, rebuild every step,
         recompute applicability, find the step again, then reply. It sits on the root GET, the back
         move, the done goto, and the main move. One helper should own it.
      2. wizards/expense-split/gather.ts builds the same empty pick screen three times, differing
         only in one sentence of the note.
      3. The reader `answers` in src/answers.ts collides with the node builder `answers` from the
         toolkit, so gather.ts imports one of them as `showAnswers`. One of the two names should
         change.

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
- [x] U5 purge old UI stacks, stage one: delete the retired terminal wizards. Closed. Twenty files
      left the tree: splitter.ts, pusher.ts, splitter-kit.ts, splitter-cliffy.ts, meta.ts,
      settings.ts, _template.ts, kitchen-sink.ts, cliffy-kit.ts, splitwise-setup.ts, the whole
      src/kit tree, and four test files that tested only deleted code. src/wizardkit.ts lost
      seventeen dead exports. src/settings.ts lost the terminal pickCurrency. deno.json lost exotui,
      exotui/app, crayon, five cliffy packages, and the menu task. Gates: 358 tests, check clean,
      fixtures ALL MATCH, lint over 88 files. docs/copy-audit.md keeps the deleted names on purpose
      as the record.
- [x] U6 strip the interactive half of wizards/gatherer.ts. Closed. The file fell from 2622 lines to
      2148. Stage one deleted the terminal wizard entry, runDry, gatherManual, askLocation,
      zomatoLogin, the dead interactive branch of gatherZomato, and seven wizardkit imports. Stage
      two deleted the loginWait timeout menu with its noPrompt and confirmChoice options, the Zepto
      confirmChoice block, the dead login branch of gatherBrowserPlatform, and the MepCLI import.
      The site URL ternary became the helper platformSiteUrl, shared by the two callers. Verified by
      me on the real binary: a bare run prints the five modes and exits 1, --login=nosuch and
      --zomato-city and --zomato-login-start each still print their one human line, and no MepCLI
      call remains. Gates green at every step.
- [x] U7 decided by the user: keep the tool, drop MepCLI, keep zx. Closed.
      wizards/dev-zomato-consts.ts is now a linear non interactive script, 480 lines down to 395. It
      takes an APK or XAPK path plus an optional `--write`. It prints the fresh values by default
      and writes the config only with the flag. The drop folder polling loop, the file manager
      question, and the write question are gone. Its `--selftest` used to die with a raw readDirSync
      stack trace, because the decoded tree at /tmp/dsh/zomato-re/decoded no longer exists, and it
      now states that in one line. With the last MepCLI call gone, src/wizardkit.ts fell from 297
      lines to 101 and lost twelve dead exports: APP_VERSION, setTotalStages, clearScreen,
      selectHint, installProcessGuards, createWizard, banner, readyGate, warn, open_url, confirm,
      and finish. Nine print helpers remain. `mepcli` is out of deno.json. zx stays, and a real bash
      command through the toolkit `$` is proven to run.
- [ ] U11 the Zomato constants file ignores the state root override. src/zomato.ts reads its tokens
      and its login state through `shareDir()`, which honours `SPLIT_UTILS_STATE`, but it reads the
      constants from a fixed repo relative URL at lines 31 and 32. The dev script writes that same
      fixed path, so the two agree with each other and disagree with every other state read. An
      installed binary with a state root elsewhere would read constants from beside the module. This
      predates the purge, so I report it and leave it alone. Eval: one resolver serves all three
      reads, or a written reason says why the constants differ.
- [ ] U10 the zx version sits in three files: deno.json, wizardkit/deno.json, and wizardkit/mod.ts,
      which hardcodes `npm:zx@8.8.5` so the published package resolves with no import map. A bump
      needs three edits today, and nothing fails when one is missed. Eval: one place states the
      version, or a check fails when the three disagree.
- [x] U8 retire CHECKLIST.md. Closed. The file is deleted, so one list survives: the human review
      queue at the foot of this file. Its header certified a machine run from 2026-09-10 that no
      longer held, and its first step called `deno task menu`, a task the repo no longer defines.
      Folded across as new tickets: the four release gates as P1 to P4, the two session save as C10,
      and the share link drive rewritten into U4, which used to cite a CHECKLIST line number. The
      "must not happen" block moved into the standing rules below. Dropped on purpose: steps 1 to 9
      drove terminal screens that no longer exist and are already covered by U2, W3, W8, G1, R2 and
      F4, step 18 asked for `git init`, which landed as commit 5f5792e, and step 19 named an aidos
      scratch prompt that no ticket here tracks. One capability in it has no home, recorded as U9.
- [ ] U9 decide the fate of the no account summary. The terminal push flow offered "Write one short
      summary instead. No Splitwise login needed." when no Splitwise key was configured, and it
      saved a summary file beside the source file. No string like it survives anywhere in the tree,
      so the browser app dropped the capability with no decision on record. Needs a user decision:
      rebuild it in the push flow, or retire it in writing. Eval: either the push flow offers it
      when no key is configured, or this plan states why it is gone.
- [ ] W6 file pick: the last open gap (descriptions, polling, entry onConfirm all shipped). Eval:
      user picks a split file through the dialog in push flow.

## Critical context

- Splitwise facts (verified Sep 2026): app registration at secure.splitwise.com/apps is free and
  yields a consumer key plus consumer secret. Free accounts cap at a few expenses a day, so a full
  push needs Pro on one group account.
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
- Ported copy needs proof: every old user-facing string maps to a new home or a written reason, in
  docs/copy-audit.md.

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

- [ ] R3 push source hand-drive: the source screen lists your assigned runs, newest first, and
      starts on the newest. A run id typed into Other run still wins.
- [ ] G32 reset hand-drive: sign in to Splitwise, run a factory reset, then open the push flow. It
      must ask you to connect again. The old cache copy used to survive a reset and get copied back
      on the next read, which left you signed in.
- [ ] G31 pick list hand-drive: finish a gather. The last screen lists every order with a tick box,
      none ticked. Select all ticks every row and Select none clears them. Next with nothing ticked
      refuses. Tick two, and the split walks only those two lines.
- [ ] G30 sign in hand-drive (your bug): press Sign in to Zepto. A browser window opens for the sign
      in. The panel shows one sentence when it lands. No banner, no "Ready to start?", and no line
      about opening a main menu.
- [ ] G23 Splitwise approve hand-drive (your bug): open Settings, paste a key pair, press Save keys
      and connect. The approve link shows with a verifier box under it. Reaching that screen with no
      handshake shows one plain line plus an Open Settings button, and no Next that asks for a box
      the screen never drew.
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
- [ ] P1 panel hand-drive: press Fetch on the gather review step. Output appears under the button,
      the heading and the buttons stay, and the page never turns into a bare output page. Found by a
      real browser probe: the poll fragment inherited hx-target from the step form.
- [ ] Z1 Zepto fetch hand-drive: press Fetch for Zepto over 30 days. No sign in window opens, the
      count passes eight, and each order prints one line that ends in Done.
- [ ] N1 navigation hand-drive: on the People step type two names and press Next with no roles
      picked. The error shows, the typed names survive, the radios render. Press Back from People
      and from each settings step. Back never blocks and never validates.
- [ ] S1 stage hand-drive: gather reads 1/3, split reads 2/3, push reads 3/3 on every screen. The
      menu and settings show no stage marker.
- [ ] R2 resume hand-drive: pick a gathered run on the resume screen. The split run step opens with
      that run already picked, and no screen asks for the run twice.
- [ ] G1 fee hand-drive: a fresh fee line arrives ticked for everyone with the per person amount
      stated. An item line still ticks you alone. A saved fee assignment wins over the default.
- [ ] G2 cutoff hand-drive: leave the cutoff blank and push. Every order goes. A bad date still
      reports an error.
- [ ] G5 money hand-drive: push confirm lines and the report now read currency first, for example
      "INR 100.00". Confirm the wording reads right on a real push.
- [ ] J1 window hand-drive: open the demo in a real window, confirm web-awesome controls bind
      (radios post, checked and autofocus hold), markdown renders headings and bold
- [ ] B2 scrape hand-drive: block unpkg, press Scrape, output streams in the panel under the button,
      step never leaves
- [ ] B1 currency hand-drive (your bug): pick INR, press Next without touching any radio, currency
      saves; custom code path saves uppercase and rejects junk
- [ ] U2 onboarding hand-drive: fresh settings state walks usage, currency, Splitwise, then menu; AI
      answer jumps to AI setup; used state opens the menu with no Start here
- [ ] U3 flow hand-drive: every gather, split, push step shows a muted description; no label echoes
      its heading; push report states what landed
- [ ] B3/B4 hand-drive: scrape prints the human summary in auto mode (no agent block); Done on an
      unscraped review names Scrape
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
- [ ] F2 live handshake hand-drive: real Splitwise approval in the browser, "Signed in as" names
      you, token cached owner-only
- [ ] Menu plus onboarding hand-drive: fresh settings state shows Start here on top; used state
      hides it; usage step leads into the settings chain; every menu item opens its module
- [ ] W8 split hand-drive: serve `wizards/expense-split.ts` on a real run dir, split every line,
      press Finish, confirm output.json plus the stamped copy land in the run dir
- [ ] W3 gather hand-drive: serve `wizards/expense-split.ts`, walk Platforms through Review, confirm
      Back/Next on every step
- [ ] W4 push hand-drive: same window, walk Source through Report, confirm OAuth prose and cutoff
      field
- [ ] W5 settings hand-drive: same window, pick a currency, open Splitwise and AI steps, confirm
      navigation
- [ ] WA restyle: restart the window (old bundle keeps serving stale pages), confirm tabs switch,
      dark mode follows the system, form posts record answers
- [ ] R1 runtime window: `deno task desktop`, confirm a tall chromeless window opens on the demo
      (window size itself is headless-untestable here); installer needs JSR publish before a real
      install works
- [ ] W1 template: copy the wizard/ trio to a fresh dir, map wizardkit local, run start, click Ask
      to Review to Done
- [ ] D1 demo round 3: `./desktop/demo.ts`, open :8371, confirm muted palette, tinted cards,
      centered stage index, Stages clicks, draft resume bar, action strips, 25-line helper shape in
      demo.ts
- [ ] D1 demo: serve `desktop/demo.ts` and click all three steps in a window, confirm every core
      widget renders and answers echo Dropped from this queue: T6 kit demo, T7 splitter run, and T7b
      decision screen. They drove the Cliffy, exotui and MepCLI terminal builds, which the Desktop
      port retired. U5 above still removes the code. The behaviour they checked lives on in this
      queue: the end to end split of a real run sits in W8, skipped lines and the fee note sit in
      G1, and the question that asks for names sits in N1.
