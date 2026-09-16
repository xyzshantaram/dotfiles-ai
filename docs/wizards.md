# Wizard contracts

The seams every wizard builds against. Change a contract here first, then change the wizards. The
main menu dispatches purely through these surfaces, so it builds in parallel with the wizards it
calls.

## Main menu

The main menu starts with one item while the settings file misses: item "Start here". After
onboarding saves the file, the full menu appears with one description line under each title:

1. "Split and push recent orders" — all three steps in order.
2. "Pick up where you left off" — resume a saved session from run history.
3. "Collect orders from platforms" — gather step only.
4. "Assign per-order split" — split step on a picked run.
5. "Upload orders to Splitwise" — push my orders, or push someone else's orders from a share link (a
   file path still works).
6. "Settings" — changes app settings.
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

1. The gather flow creates the run, collects orders, and writes `orders.json` with status
   `gathered`. On failure the status becomes `failed` with a `failureReason`, and the run dir is
   copied to `share/runs/<runId>-failed-backup/`.
2. The split flow assigns every line and writes `output.json` plus a stamped copy, status
   `assigned`.
3. The push flow pushes every confirmed order. On full success `archiveRun` moves the run dir to
   `cache/runs/<runId>`, which is archived and safe to delete.
4. The resume pickers in the split and push flows label each run through `runHint`, which states the
   reason on a failed run.

## Command line surface

The browser app owns every user flow. One script still runs from the command line, and the app
shells out to it as a child process:

```
deno run -A --no-lock wizards/gatherer.ts <mode>
```

- The modes are `--emit`, `--login=<zepto|blinkit|swiggy>`, `--zomato-login-start`,
  `--zomato-login-finish`, and `--zomato-city`.
- A run with no mode prints the mode list and exits 1. The file holds no prompt.
- `--allow-sys` in the shebang: zx 8.8.5 reads os.cpus at import.
- Exit 0 on success, 1 on failure, with the run marked failed where one exists.
- The script opens a redacted log through `createRunLog("gather")` and prints the log path on any
  failure.

| file                  | kind   | reads                    | writes            |
| --------------------- | ------ | ------------------------ | ----------------- |
| `wizards/gatherer.ts` | gather | platform logins in state | run `orders.json` |

`wizards/dev-zomato-consts.ts` is the one other script, and the Maintenance section below covers it.

## Child contract

The app runs the child with `Deno.Command` and shows its stdout in an action panel. Each machine
mode prints one plain sentence for that panel. The one exception is `--emit` in AI mode, which
prints the agent block on purpose.

No environment variable carries state between stages. One variable remains, `SPLIT_UTILS_STATE`, and
it overrides the state root. `src/paths.ts` holds its only reader.

`src/wizardkit.ts` exports `wizardExit(code)`. It closes the progress dot line, then exits with the
given code. It prints no closing advice, because the old line pointed at a terminal main menu that
no longer exists.

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
