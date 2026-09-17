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
its own submit logic. This retires G17, which planned to spread the old `nav()` helper instead.

- [ ] N6 settings and the app shell move the same way. Then delete the app's `seen` store, which
      duplicates the toolkit answers map, and delete the unused `nav()` helper. Eval: a search for
      seenStore returns nothing, onSubmit holds only genuinely shared work or is gone, suite green.
- [ ] S3 the split save guard loses a concurrent write when two saves share a timestamp. Found while
      chasing a test that fails only under heavy load. src/splitstate.ts compares
      `current >
      baselineMs`, so an equal mtime reads as no conflict and the second save
      overwrites the first instead of landing beside it as a conflict copy. The conflict file name
      also uses whole seconds, so two conflicts inside one second overwrite each other. Both paths
      lose a user's assignments rather than reporting a clash. This predates today's work, so it is
      reported, not fixed. Eval: two saves sharing an mtime leave one conflict copy and no lost
      document, and two conflicts in one second leave two files.
- [ ] N9 the saved draft cannot carry you back to where you were, which is the second half of the
      report that produced N8. Measured in wizardkit/toolkit.tsx: the draft script stores one record
      of `{version, step, fields}` in localStorage, and its resume bar checks
      `saved.step !==
      sid(form)` and returns when they differ. So the bar appears only while
      the very step you left is already on screen. Come back after the server session ends and you
      land on the menu, where the saved draft for `gather-manual` stays invisible for ever, and a
      successful post clears it. Wanted: a draft that names where you were and offers to go there,
      for example "You were on Manual expenses. Continue or Discard", with Continue posting a goto
      to that step. Eval: fill a middle step, drop the session, reopen the wizard, and the bar
      offers that step by name and lands on it with the fields restored. N9 is the toolkit half of
      N11 and ships inside it.
- [ ] N11 a drafts API in the toolkit, with the footer strip as its face. Settled with the user: the
      toolkit owns the affordance, an app may hook in to offer its own resumable sessions, and the
      default offer is the newest one. On resume the app does its own restoring first and hands back
      a step id, so no state enters the toolkit by a new path. The strip is the one that already
      reads "Draft saved 5:23", and it gains a line such as "Saved session from 09-17 05:26" with a
      Resume button. "Pick up where you left off" stops being a hand written menu row and is rebuilt
      on this API. Two sources feed it: the toolkit's own browser draft, which is a step id plus
      that step's fields, and the app's sessions, which here are the runs on disk. Eval: with no app
      hook, a half typed screen offers Resume in the strip and lands back on that step with the
      fields intact. With the hook, a gathered run offers Resume and lands on the pick screen. The
      menu holds no resume row.
- [ ] S4 "Repeat Last" on the split item screen does nothing. Found while classifying the button
      rows for N4. The button posts the action `repeat`, and a search of split.ts, expense-split.ts
      and the toolkit finds no code that reads it, so the toolkit treats it as an unknown action and
      re-renders the step. The press saves whatever the fields already hold, exactly as Next line
      does, and the label promises a copy of the previous line that never happens. The terminal
      dashboard had this feature, and the port kept the button without the logic. Reported, not
      fixed, because the fix is a feature decision. Eval: pressing it on a fresh line fills the same
      people and the same split type as the last saved line.

### Final gate, after every ticket above is closed

- [ ] Z9 full code review plus slop audit of the whole repo. Look for dead code, unused imports,
      duplicated logic across modules, near copies that differ by one argument, duplicated type
      definitions, and hand rolled code that a small well scoped dependency would replace. Review
      the wizards, the toolkit, and src together, not module by module. Eval: every finding lands as
      its own ticket here, or as a written reason to leave it alone. One finding from the pre commit
      diff read is still open and starts the pass: wizards/expense-split/gather.ts defines its own
      `LEGACY_TOKENS_FILE`, duplicating the one in src/zomato.ts, and repeats that module's read
      chain of current path, then old path, then older path. The chain belongs in one place.

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
- [ ] U9 the aggregate summary survives, but nobody can choose it. I searched for the old sentence
      and found none, then read the engine and found the whole capability alive. push-engine.ts
      carries a mode of idle, aggregate, or live. It falls to aggregate when the key pair is
      missing, when the credentials fail to read, when no token is cached, and when the sign in
      check throws. It writes `aggregate-<unix>.txt` beside the source file, which matches the old
      behaviour, and the report step shows the text. push.ts states it plainly: "No Splitwise access
      is configured. The push writes one summary file instead." Two tests cover the fallback and two
      more cover the arithmetic. So one gap remains, and only one: the path is a fallback, never a
      choice. A user who has Splitwise set up cannot ask for the summary on purpose, which the old
      menu allowed. Eval: the push flow offers the summary as a choice with access configured, and
      the automatic fallback still works with no access.
- [ ] U12 re-run the parity audit against the current tree. docs/function-audit.md is the list that
      caught this class of loss, and it is now stale in the other direction: it still marks as GAP
      the OAuth handshake, the group picker, cutoff validation and filtering, the manual expense
      loop, resume routing by status, the failPush path, archiveRun, and the aggregate summary. Each
      of those exists today. A parity list that cries GAP on closed work stops being read, which is
      how a real loss slips past. Eval: every row states its live state, and each true gap becomes a
      ticket here.
- [ ] W6 file pick: the last open gap (descriptions, polling, entry onConfirm all shipped). Eval:
      user picks a split file through the dialog in push flow.

## Critical context

- The toolkit replays every post into one answers map per session, so any app level copy of the
  answers is duplication. This is why N6 deletes the `seen` store rather than feeding it.
- Back is unblockable by construction: the toolkit resolves a backward move before any app code
  runs. Departure work goes in `onLeave`, which takes the direction and cannot block.
- The terminal era is over. One script still runs from a shell, `wizards/gatherer.ts`, and it takes
  machine modes only. `wizards/dev-zomato-consts.ts` is a dev tool that takes an APK path. mepcli,
  exotui, crayon and cliffy are gone, and zx stays because wizard authors run bash through it.
- State paths all resolve through src/paths.ts and honour `SPLIT_UTILS_STATE`. Token and login state
  reads keep two fixed repo paths on purpose, as the later entries of a migration chain.
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

- [ ] NAV hand-drive (your smoke test): the user confirmed on 2026-09-17 that the bar stays at the
      foot of the window while a long screen scrolls. What is left to drive by hand: Select all and
      Select none tick and untick without leaving the screen, Next refuses an empty pick list with
      one message, and the split and push flows show the same bar now that they carry it too.
- [ ] PICK detail hand-drive: on Pick orders each row now carries a second line naming up to five
      items with their quantities, then a count of the rest. Confirm it reads well on a real grocery
      order, which is the thing that made price and count too little to decide on.
- [ ] RESUME hand-drive: gather a run, leave the wizard, come back through Pick up where you left
      off, and confirm you land on Pick orders with your earlier ticks already set, not in the split
      flow. Change one tick, press Next, and confirm the split opens on that run with the change.
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
