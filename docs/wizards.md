# Wizard contracts

The seams every wizard builds against. Change a contract here first, then change the wizards. The
main menu (`wizards/meta.ts`) dispatches purely through these surfaces, so it builds in parallel
with the wizards it calls.

## Main menu

`wizards/meta.ts` shows the main menu. While the settings file misses, the menu shows exactly one
item, "Start here". After onboarding saves the file, the full menu appears with one description line
under each title:

1. "Split and push recent orders" — all three steps in order.
2. "Pick up where you left off" — resume a saved session from run history.
3. "Collect orders from platforms" — gather step only.
4. "Assign per-order split" — split step on a picked run.
5. "Upload orders to Splitwise" — push my orders, or push someone else's orders from a share link (a
   file path still works).
6. "Settings" — runs `wizards/settings.ts`.
7. "Set up with an AI assistant" — prints a copyable setup prompt.
8. "Exit" — leaves the menu.

"Start here" asks how the user wants to use the app, saves the usage mode at once, then runs the
currency flow, then offers Splitwise setup (or the AI setup prompt for the AI mode), and ends with
"You are all set."

No user-facing line prints a command or a bare file path. Exact commands and paths go to the run log
only.

## Settings file

`<stateRoot>/config/settings.json` holds `{ "currency": "INR",
"usage": "ai" | "auto" | "manual" }`.
The usage mode is absent until onboarding saves it. `loadSettings` stays backward compatible: old
files without usage read fine, and unknown usage values fall back to absent.

## State layout

Root: `<repo>/state` resolved from each module's own `import.meta.url`. The env var
`SPLIT_UTILS_STATE=<dir>` overrides the whole root for tests and for the shipped OS-data-dir layout
(T13).

- `share/runs/<runId>/` — one gather-to-push cycle.
  - `meta.json` — the run record (shape below).
  - `orders.json` — gathered orders (docs/schema.md).
  - `output.json` — canonical latest assignment output.
  - `output-<unix>.json` — timestamped copies, never deleted by the tool.
- `share/config/` — machine-local settings the user or a wizard wrote: `zomato.json` (constants),
  `splitwise.json` (`{ "envPath": "..." }`).
- `cache/logs/<unix>-<kind>.log` — redacted run logs (src/log.ts).
- `cache/runs/<runId>/` — archived runs after a successful push.

`runId` is `<unix-seconds>-<label>` with label like `zepto` or `multi`.

`meta.json` shape:

```json
{
  "id": "1788951958-zepto",
  "label": "zepto",
  "createdAt": "2026-09-09T18:30:00.000Z",
  "platforms": ["zepto"],
  "rangeDays": 30,
  "status": "gathered | assigned | pushed | failed",
  "outputFile": "output.json",
  "logFile": "/abs/path/cache/logs/1788951958-gather.log",
  "failureReason": "only when status is failed"
}
```

## Run lifecycle

1. gatherer creates the run, gathers, writes `orders.json`, status `gathered`. On failure: status
   `failed` plus `failureReason`, and the run dir is copied to `share/runs/<runId>-failed-backup/`.
2. splitter assigns, writes outputs, status `assigned`.
3. pusher pushes every confirmed order; on full success the run dir moves to `cache/runs/<runId>`
   (archived, safe to delete).
4. the main menu shows every `failed` run's reason on startup.

## Wizard CLI surface

All wizards run from the repo root:

```
deno run -A --no-lock wizards/<name>.ts [runId] [--dry]
```

- `--allow-sys` in the shebang: zx 8.8.5 reads os.cpus at import.
- Exit 0 on success, 1 on failure (run marked failed where one exists).
- Every wizard opens a redacted log via `createRunLog(<kind>)` and prints the log path on any
  failure.
- `--dry` prints what the wizard WOULD do, runs nothing that writes or pushes, and exits 0.
  Mandatory for every wizard.
- `runId` (splitter, pusher): operate on that run instead of asking.

| file                  | kind   | reads                    | writes                |
| --------------------- | ------ | ------------------------ | --------------------- |
| `wizards/gatherer.ts` | gather | platform logins in state | run `orders.json`     |
| `wizards/splitter.ts` | split  | run `orders.json`        | run `output*.json`    |
| `wizards/pusher.ts`   | push   | run `output.json`        | Splitwise, pushed map |
| `wizards/meta.ts`     | menu   | runs                     | dispatches the above  |

The main menu never imports another wizard's internals. It shells out to the exact commands above
and reads results through `src/runstate.ts`.

## Child contract

The main menu sets `SPLIT_UTILS_FROM_MENU=1` in the environment of each child wizard it runs. Direct
runs leave the variable unset.

`src/wizardkit.ts` exports `wizardExit(code)`. It prints "Back to the main menu." for menu-owned
runs, else "Open the main menu again to pick your next step.", then exits with the given code. Every
wizard ends through `wizardExit`, never through a bare `Deno.exit`.

Each wizard banner follows "split-utils v0.1.0 wizard — <purpose>". The main menu banner is
"split-utils v0.1.0 main menu" with no suffix.

Each pusher stage offers "Back to the main menu" at its first prompt (or checks for it before
starting). Picking it calls `wizardExit(0)`. Saved work stays saved.

## Splitwise access setup

Onboarding owns the "Set up Splitwise access now?" question:

1. Ask whether the user has an API key (from secure.splitwise.com/oauth_clients).
2. Yes: read the consumer key (visible) and secret (hidden), write them to
   `<stateRoot>/config/splitwise.env` as `CONSUMER_KEY=` / `CONSUMER_SECRET=` lines (the exact
   format `loadCredentials` parses), then offer the OAuth handshake immediately: authorize URL opens
   in the browser, the user pastes the verifier, the token is cached. Confirm by printing the
   signed-in user's name.
3. No: print the friend-with-premium handoff text (the README section name is fine as a placeholder)
   and stop.

Pusher credential resolution order: `<stateRoot>/config/splitwise.env`, then `SPLITWISE_ENV` env
var, then fail with a message that points at the main menu's setup question.

## Sharing between friends

`src/share.ts` moves an output.json between two people without the host learning anything:
AES-256-GCM locally, a six-char code like `ab2x9k` as the URL `#fragment` (PBKDF2-stretched into the
key, so the whole share looks like `https://paste.rs/NmjPJ#ab2x9k`), opaque ciphertext uploaded to
paste.rs (dpaste.com fallback, 30-day expiry). The upload flow in the main menu asks for a share
link in one prompt (a file path still works for power users):

- Link: `fetchShareLink` decrypts it -> stored under `share/imports/<unix>-import.json` -> the
  pusher runs on that file.
- File path: the pusher runs on the path directly.

Imported files land in `share/imports/<unix>-import.json`.

## Maintenance (dev-only)

`wizards/dev-zomato-consts.ts` refreshes `share/config/zomato.json` from a dropped APK. Never listed
in the user menu; the drift messages in `src/drift.ts` point developers at it.
