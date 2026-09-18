# split-utils

You order food and groceries with friends. This app splits each bill. It tells each person what they
owe. It sends the shares to Splitwise.

Splitwise is a free app that tracks who owes whom in a group.

## Install

You need no coding skill. Pick your system.

macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/YOURUSER/split-utils/main/install.sh | sh
```

This command downloads the app and opens a simple menu.

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/YOURUSER/split-utils/main/install.ps1 | iex
```

This command downloads the app and opens a simple menu.

The installer gets Deno for you when your machine misses it. Deno is a tool that runs this app. A
Splitwise account helps but is not required. Automatic upload needs Splitwise Pro on at least one
group account. Splitwise Pro is a paid plan that allows automatic expense upload.

Note: replace `YOURUSER` with the real GitHub name before you publish this repo. The links above and
the issue link below need the real name.

## First run

The menu shows one item at first: Start here. It asks three things.

1. How you want to use the app. Pick one of three modes. An AI assistant runs the app for you. Or
   you run it alone and it uploads to Splitwise for you. Or you run it alone and add one summary
   expense by hand.
2. Which currency to use. The default is INR. INR is the code for the Indian rupee.
3. Whether to set up Splitwise access now. You can skip this step. The app still works without an
   account.

After these answers the app says you are all set. The full menu appears on the next start.

## Everyday use

Pick a menu item. Each item does one job.

- Split and push recent orders. This runs all three steps in order. Use it when you just want to
  sync some expenses.
- Pick up where you left off. This continues a session you started earlier.
- Collect orders from platforms. This reads your past orders. It supports Zepto, Blinkit, Zomato,
  Swiggy, or manual entry.
- Assign per-order split. This walks each order item by item. You mark who takes what.
- Upload orders to Splitwise. This sends your split to Splitwise. It can also push orders from a
  share link or a file.
- Settings. This changes currency and other preferences.
- Set up with an AI assistant. This prints a copyable prompt. The prompt tells an AI assistant how
  to run this app for you.
- Exit. This leaves the menu.

## Sharing without an API key

An API key is a secret code that lets apps talk to Splitwise. You can share costs without one.

The app writes one summary expense for the whole session. Add that expense to Splitwise by hand. No
account or key is needed for this path.

A friend with API access can also push for you. Send them your share link or your split file. They
pick Upload orders to Splitwise and push it from their side.

## For AI-harness users

Pick Set up with an AI assistant in the menu. It prints a prompt block. Copy the lines between the
`---` marks. Give them to your AI assistant.

The prompt text is:

```
Install the split utils skill from the dotfiles-ai repo path skills/split-utils.
Read docs/schema.md for the output format.
Gather orders from the main menu.
Write the split result as output.json.
Check the file with scripts/validate.ts before you push.
```

The assistant reads `docs/schema.md` for the output format. It writes `output.json` with the split
result. It checks the file with the validator before it pushes.

## Troubleshooting

The app keeps its data in the per-user data dir: `~/.local/share/split-utils` on Linux,
`~/Library/Application Support/split-utils` on macOS, and `%APPDATA%\split-utils` on Windows. Set
`SPLIT_UTILS_STATE` to put it somewhere else.

Find logs in `<data>/split-utils/cache/logs/`. Each run writes one log file there. Attach the log
file when you report a problem. The log file holds no secrets and is safe to share.

Report problems at https://github.com/YOURUSER/split-utils/issues. Replace `YOURUSER` with the real
GitHub name before you publish this repo.

The app detects when a shop site changes its pages. It shows one of three plain messages.

- Logins stopped working on every platform at once. The sites changed their login. Report it and
  wait for a fix.
- Order history stopped loading from the company side. The site server failed. Try again later and
  report it when it stays broken.
- Bills stopped opening in a form this tool can read. The site changed its bill layout. Report it
  with your log file.

Each message also names the log file to attach.

## Development

You need Deno on your machine. The installer script gets it for you.

| Command                   | What it does                            |
| ------------------------- | --------------------------------------- |
| `deno task dev`           | Runs any single wizard file.            |
| `deno task check`         | Type-checks the source.                 |
| `deno task test`          | Runs the unit tests.                    |
| `deno task test:fixtures` | Renders fixtures and diffs the outputs. |

Check a split file with the validator:

```sh
deno run --no-lock --allow-read scripts/validate.ts <output.json> [--orders <orders.json>]
```

Fix every `FAIL` line it prints.

Site guides live in `docs/playbook-zepto.md`, `docs/playbook-blinkit.md`, `docs/playbook-zomato.md`,
and `docs/playbook-swiggy.md`. The output format contract lives in `docs/schema.md`.

Test fixtures are synthetic. `tests/fixtures/orders.json` holds invented people, items, and prices.
`tests/expected/` holds frozen ground truth. Never add real names, real merchants, or real amounts
to these files. The `state/` dir and `tests/actual/` stay out of git by design.

A checkout writes to the same per-user data dir as an install. To keep development data separate,
set `SPLIT_UTILS_STATE` to a dir inside the checkout:

```sh
export SPLIT_UTILS_STATE="$PWD/state"
```
