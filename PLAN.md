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

- [ ] K14 the toolkit holds one set of state for every browser. In flight: a wizard-sid cookie plus
      a state record per session, with each live job owned by the session that started it. Eval: two
      browsers keep separate answers, and neither reads the other's task output.
- [ ] G3b every app module keys its state by the session id. seen and onboarding in
      wizards/expense-split.ts, manualRun in gather.ts, session plus currency plus lastPeoplePost
      plus storedShare in split.ts, session in push-engine.ts, and pending plus signedInAs in
      connect.ts. Blocked on K14. Eval: two browsers run two splits with no crossover.
- [ ] G7 Zomato sign in and the city question stay terminal only, so a Zomato user cannot finish a
      gather in the browser. Half done: gatherer.ts holds three machine modes (--zomato-login-start,
      --zomato-login-finish, --zomato-city), each printing one JSON line. No wizard step calls them
      yet. Decided: fix K13 first, then build one screen rather than three. The modes must print a
      short human line, because an action panel shows raw output to the user. Eval: a Zomato fetch
      completes without a terminal.

- [ ] G18 one reader for a posted field. field() now lives in wizards/expense-split.ts and covers
      the record form. The step modules still spell out the map form m.get("name")?.[0]?.trim().
      Wanted: one home for both readers, with isDryMap beside them. Eval: no module spells the
      shape out by hand.
- [ ] G21 a manual row cannot say "split this later". The old terminal flow asked that question per
      expense and saved the answer in the run meta. A repeating block takes only text and number
      fields today, so the row cannot hold a checkbox. Blocked on K11. Eval: a manual row carries
      its own split later answer into the run meta.
- [ ] G17 nav() adoption across the step modules. Parked with a reason, not forgotten: nav() fixes
      the label of a goto row to "Next", so a sweep would silently rewrite copy such as "Back to
      menu". Blocked on K12. The other two parts of G17 landed: the People list now uses seeded
      repeating rows, and the AI setup uses copyable().

### Final gate, after every ticket above is closed

- [ ] Z9 full code review plus slop audit of the whole repo. Look for dead code, unused imports,
      duplicated logic across modules, near copies that differ by one argument, duplicated type
      definitions, and hand rolled code that a small well scoped dependency would replace. Review
      the wizards, the toolkit, and src together, not module by module. Eval: every finding lands
      as its own ticket here, or as a written reason to leave it alone.

### Deferred: wizardkit footguns found by the C-series audit

These are toolkit gaps, not app bugs. Each one invited a bug we then fixed inside split-utils. Do
not start these until split-utils runs end to end. Keep them here so the fix lands in the toolkit
later, and the next app does not pay the same cost.

- [ ] K1 done is a dead end. The done action renders a fixed summary screen with no way back, so
      every flow that finishes kills the app. Apps work around it with goto:menu. Wanted: the wizard
      decides what done means.
- [ ] K3 a StepFn runs on every render, so any side effect inside one fires while the user is still
      typing. This wrote a run dir mid typing in the gather flow. Wanted: a per-step enter or submit
      hook, so side effects sit outside render.
- [ ] K11 a repeating block takes only text and number fields, so a row cannot hold a checkbox or a
      pick. This blocks the per row "split later" answer the old manual flow asked. Wanted: more
      field kinds inside a repeating row.
- [ ] K12 nav() fixes the label of a goto row to "Next", so a real row such as "Back to menu" cannot
      use it. Wanted: a label beside the goto step id.
- [ ] K4 the step list is fixed, so a step cannot say when it applies. Every user walked a Manual
      expenses screen they never asked for. Apps work around it with jumps. Wanted: a step
      predicate.
Closed in the toolkit, now awaiting a hand drive: K2 real back history, K5 seeded repeating rows,
K6 the pressed action in the hook, K7 the nav helper, K8 shared stage markers, K9 the copyable node,
plus the rule that a validation veto never blocks Back or Restart. The wizards do not use K5, K7 and
K9 yet. G17 above adopts them.

- [ ] U5 purge old UI stacks: remove every exotui/mepcli/cliffy reference (code, deps, docs) after
      U1 maps the copy. Eval: grep for exotui/mepcli/cliffy returns zero outside U1 evidence
      (docs/copy-audit.md stays as the record); check plus suite green.
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

## Human review queue

Every entry here names work that is code complete and green. It counts as done only after the user
drives the real screen. Restart the server first. A fix cannot reach a process that started before
it.

- [ ] R3 push source hand-drive: the source screen lists your assigned runs, newest first, and
      starts on the newest. A run id typed into Other run still wins.
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
- [ ] U4 live share hand-drive: paste a real friend link, push lands, per CHECKLIST.md line 15
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
      widget renders and answers echo
Dropped from this queue: T6 kit demo, T7 splitter run, and T7b decision screen. They drove the
Cliffy, exotui and MepCLI terminal builds, which the Desktop port retired. U5 above still removes
the code. The behaviour they checked lives on in this queue: the end to end split of a real run sits
in W8, skipped lines and the fee note sit in G1, and the question that asks for names sits in N1.
