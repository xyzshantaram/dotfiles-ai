# split-utils

You order food and groceries with friends. This app splits each bill. It tells each person what they
owe. It sends the shares to Splitwise.

Splitwise is a free app that tracks who owes whom in a group.

## Set up with an AI assistant

Paste the whole block below into your AI coding assistant. The assistant takes it from there.

```
Install the split utils skill from the dotfiles-ai repo path skills/split-utils.
Read docs/schema.md for the output format.
Gather orders with scripts/cli.ts gather.
Write the split result as output.json.
Check the file with scripts/cli.ts validate before you push.
```

The assistant reads `docs/schema.md` for the output format. It gathers your orders. It writes
`output.json` with the split result. It checks the file with the validator before it pushes.

## Run the app by hand

### Open a command prompt

Windows: press Win and R together. Type `powershell`. Press Enter. The install script needs
PowerShell. Use that program and no other.

macOS: open the Terminal app. Linux: open the Terminal app.

### Install the app

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/xyzshantaram/dotfiles-ai/main/skills/split-utils/install.ps1 | iex
```

macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/xyzshantaram/dotfiles-ai/main/skills/split-utils/install.sh | sh
```

The script installs Deno when your machine does not have it. Deno is a tool that runs this app. The
script copies the app into a `split-utils` folder in your home folder. It refreshes that folder when
you run it again.

The script then starts the app for you.

### Start the app

Start it again later with two commands.

```sh
cd ~/split-utils
deno task start
```

The app listens at `http://localhost:8471/`. Open that address in a browser.

Deno refuses a package younger than 24 hours. This app uses one such package,
`@xyzshantaram/wizardkit`. If the app prints a message about minimum dependency age, run it once
with the flag below instead. The message stops once the package ages, and you never need the flag
again.

```sh
deno run --no-lock -A --min-dep-age=0 app/expense-split.ts
```

### Use the command line

The entry point is `scripts/cli.ts`. It carries seven verbs.

```sh
deno run --no-lock -A scripts/cli.ts <verb>
```

- `gather`: collects orders from platforms.
- `validate`: checks a split file.
- `push`: sends a split file to Splitwise. A run is a dry run unless you pass `--yes`.
- `aggregate`: prints the hand-entry summary. It needs no account.
- `share`: makes a share link for a split file.
- `last-push`: shows the last push record. Pass `--confirm` to mark the waiting push done.
- `wizard`: starts the browser app. It fails until the package ages. Use the start command above
  until then.

## First run

The app shows one item at first: Start here. It asks three things.

1. Pick a mode. The modes are "With an AI helper", "By myself but push to Splitwise automatically",
   and "By myself, push manually".
2. Pick a currency. The default is INR. INR is the code for the Indian rupee.
3. Add a Splitwise key or skip the step. The app works without a key.

Automatic upload needs Splitwise Pro on at least one group account. Splitwise Pro is a paid plan
that allows automatic expense upload.

Answer all three questions. The full menu appears after that.

## Everyday use

Pick a menu item. Each item does one job.

- Split and push recent orders. It runs all three steps in order. Use it to sync new expenses.
- Pick up where you left off. It continues a session you started earlier.
- Collect orders from platforms. It reads past orders from Zepto, Blinkit, Zomato, or Swiggy. It
  also takes expenses you type by hand.
- Assign per-order split. It walks each order item by item. You mark who takes what.
- Upload orders to Splitwise. It sends your split to Splitwise. It also pushes a share link or a
  file from a friend.
- Settings. It changes the currency. It holds Splitwise access. It prints the AI setup prompt.

## Share costs without a key

An API key is a secret code that lets apps talk to Splitwise. You can share costs without one.

Run `aggregate` on your split file. It prints one summary expense for the whole session. Add that
expense to Splitwise by hand. No account or key is needed for this path.

A friend with API access can also push for you. Send them your share link or your split file. They
pick Upload orders to Splitwise and push it from their side.

## Where the app keeps data

The app stores data outside the repository. The folder depends on your system.

- Linux: `~/.local/share/split-utils`
- macOS: `~/Library/Application Support/split-utils`
- Windows: `%APPDATA%\split-utils`

Set `SPLIT_UTILS_STATE` to store data in another folder.

Each run writes one log file into `cache/logs/` under that folder. Attach the log file when you
report a problem. The log file holds no secrets and is safe to share.

Report problems at `https://github.com/xyzshantaram/dotfiles-ai/issues`.

## When a shop site changes

The app detects when a shop site changes its pages. It shows one of three plain messages.

- Logins stopped working on every platform at once. The sites changed their login. Report it and
  wait for a fix.
- Order history stopped loading from the company side. The site server failed. Try again later and
  report it when it stays broken.
- Bills stopped opening in a form this tool can read. The site changed its bill layout. Report it
  with your log file.

Each message also names the log file to attach.

## For developers

You need Deno on your machine. The installer script gets it for you.

| Command                   | What it does                            |
| ------------------------- | --------------------------------------- |
| `deno task start`         | Starts the browser app.                 |
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
