# Function parity audit: old surfaces vs. new expense-split wizard

50 behaviors checked. 8 preserved, 17 partial, 24 gaps, 1 replaced by design. Method: behavior
tables per old file, then consolidated gaps, persistence voids, dead inputs. Copy-only audit lives
in docs/copy-audit.md.

## wizards/meta.ts — 12 behaviors, 2 kept, 6 partial, 4 gaps

1. Dry plan via `--dry`: GAP, no dry mode in new wizard.
2. Child spawn with `SPLIT_UTILS_FROM_MENU=1`: REPLACED, inline steps.
3. `reportFailedRuns` failed-run list: GAP, never surfaced.
4. Whole flow gather→split→push with failure gating: PARTIAL, flow exists, no gating, no runId
   auto-advance.
5. Resume routing by status (gathered/assigned/failed/pushed): GAP, "Pick up where you left off"
   always lands on split-people.
6. Push mine (assigned-run picker or file): PARTIAL, hand-typed only.
7. Push theirs (share link fetch to `share/imports/`): GAP, `fetchShareLink` has no new-wizard
   caller.
8. First-run gate on settings.json: PRESERVED (`expense-split.ts:83-90`).
9. Onboarding routing: PARTIAL, routes but persists nothing.
10. AI setup prompt: PARTIAL, static text, old code copied to clipboard.
11. Splitwise setup in onboarding: PARTIAL, collects keys, never writes.
12. Menu list: PRESERVED minus Exit (server app, fine).

## wizards/gatherer.ts — 8 behaviors, 4 kept, 3 partial, 1 gap

Reused by delegation (`gather.ts:99-119,200-222`), so internals survive.

1. Flags `--platforms/--days/--emit/--dry`: PRESERVED, same parser.
2. Platform multiselect plus day range: PRESERVED in shape.
3. Headed login then headless scrape: PRESERVED by delegation.
4. Zomato phone OTP login: PARTIAL, phone/OTP fields exist (`gather.ts:87-92`), nothing reads them.
5. Zomato city ask plus location file: PARTIAL, headless default only.
6. Manual expense loop: GAP, fields never become orders in a run.
7. Screenshot-only orders plus manifest: PRESERVED.
8. Run write (createRun, orders.json, meta): PRESERVED.

## wizards/pusher.ts — 14 behaviors, 0 kept, 2 partial, 12 gaps

1. Source arg/picker over assigned runs: PARTIAL, hand-typed only.
2. `--dry` mode: GAP.
3. Env discovery (state config, then `SPLITWISE_ENV`): GAP.
4. No-access fallback (aggregate summary or stop): GAP.
5. OAuth1 handshake (URL, browser, verifier incl. callback URL, 0600 token cache): GAP, verifier
   field never used.
6. Name-to-id mapping with disambiguation plus manual entry: GAP.
7. Group picker: GAP.
8. Currency from settings: GAP, never read.
9. Cutoff validation plus date filtering: GAP, value never consumed.
10. Per-order Push/Skip/Stop with fingerprint dedup: PARTIAL, UI shape kept, choices only counted,
    nothing pushed.
11. createExpense with shares plus comment plus fingerprint: GAP.
12. `failPush` path (no fingerprint, issues URL): GAP.
13. `archiveRun` after full push: GAP.
14. Aggregate summary beside source file: GAP.

## splitter trio — 12 behaviors, 2 kept, 5 partial, 5 gaps

1. Run picker over gathered runs: PARTIAL, hand-typed only.
2. `--dry` plan: GAP.
3. People count plus names: PARTIAL, fixed 3 fields, no count ask.
4. Payer prompt with rename/remap: PARTIAL, plain field only.
5. Per-item keys: PARTIAL, equal/single/custom kept, percent added; skip-rest-of-order and
   save-and-exit missing.
6. Fee merge plus equal-all default: GAP, lines shown raw.
7. Resume via `loadSplitState`: GAP, `freshState` always wins and overwrites old state.
8. Atomic splitstate writes: PRESERVED per post, not debounced.
9. Run meta updates (lastPayer, ordersDone, status, outputFile): GAP, runs stay "gathered" forever.
10. output.json plus stamped copy: PRESERVED for write; GAP, validator never runs.
11. Post-finish push offer plus handoff: GAP, words only.
12. Currency prefix from settings: GAP, hardcoded "Rs ".

## wizards/settings.ts — 4 behaviors, 0 kept, 1 partial, 3 gaps

1. Currency pick persisted: GAP, answer never saved.
2. Splitwise setup (guidance, browser, entry, 0600 write, handshake, identity check): GAP, copy
   only.
3. AI connect with clipboard copy: GAP, static text.
4. Loop until Back: REPLACED by step flow, fine.

## Shared backends

- `src/share.ts`: intact, never called by the new wizard.
- `src/splitwise.ts`: `saveToken`, `loadPushed`, `savePushed` intact, called only by old code.
- `src/splitwise-setup.ts`: unchanged, still terminal MepCLI.
- Old `src/wizardkit.ts` menu/exit-130 contract: no equivalent.

## Persistence voids

- `config/settings.json`: read by `firstRun()`, never written. New users stay first-run forever.
- `config/splitwise.env`: gated by old code, never written by new.
- `splitwise_pushed.json`: never read or written. Dedup lost.
- Run `meta.json` status: never leaves "gathered". Old pickers that select on "assigned" never find
  new runs.

## Dead inputs

`usage` (never persisted), `phone`/`otp`, manual `expenses` rows, `me`, `verifier`, `cutoff`,
`sw-key`/`sw-secret`, per-order Push/Skip/Stop (display only), Repeat Last (action id `repeat` has
no dispatch branch in `wizardkit/toolkit.ts:971-981`, re-renders the same line).
