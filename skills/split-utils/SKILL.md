# Split Utils Skill

## What this tool does

This tool splits shared delivery orders among people. It collects platform orders and writes one
split file per job. It sends that file to Splitwise, or it prints a summary for hand entry.

## Commands

The entry point is `scripts/cli.ts`. It carries seven verbs. Run a verb with no arguments to see its
own usage or error text.

`gather` collects orders through the gatherer. It takes one mode flag per run. `--emit` collects
orders and writes a run dir. `--login=<platform>` signs in to zepto, blinkit, or swiggy. The
`--zomato-login-start`, `--zomato-login-finish`, and `--zomato-city` flags handle Zomato sign in.

Two flags narrow a run. `--platforms` takes a comma separated list from `zepto`, `blinkit`,
`zomato`, `swiggy` and `manual`, and it defaults to every platform. `--days` takes a day count and
defaults to 30. Use both to keep a run short: a gather of every platform over a long window opens
several browsers and can take many minutes.

```sh
deno run --no-lock -A scripts/cli.ts gather --emit --platforms blinkit --days 200
```

```sh
deno run --no-lock -A scripts/cli.ts gather
```

`validate` checks a split file against the schema. It takes a split file path. It takes an optional
`--orders` path for cross check. It prints `PASS` with counts, or one `FAIL` line per fault.

```sh
deno run --no-lock --allow-read scripts/validate.ts <output.json> [--orders <orders.json>]
```

`push` sends a split file to Splitwise. It takes `--split` with a file path. It takes `--group` with
a group id, and the id defaults to `0`. It takes `--map` with `Name=id` pairs for name resolution.
Without `--yes` it runs a dry run and prints a retry command. With `--yes` it sends for real.

```sh
deno run --no-lock -A scripts/cli.ts push --split output.json
```

`aggregate` prints a hand entry summary. It takes `--split` with a file path. It takes `--out` with
a path and saves the summary there. It needs no account at all.

```sh
deno run --no-lock -A scripts/cli.ts aggregate --split output.json
deno run --no-lock -A scripts/cli.ts aggregate --split output.json --out summary.txt
```

`share` makes a share link for a split file. It takes the file path as a bare argument. It prints
one link for a friend to fetch.

```sh
deno run --no-lock -A scripts/cli.ts share output.json
```

`wizard` serves the browser app. It takes no documented flags. Open the printed local URL in a
browser. Follow the steps on screen.

```sh
deno run --no-lock -A scripts/cli.ts wizard
```

`last-push` shows the last push record. With no flags it prints the record as one JSON line. With
`--confirm` it marks the waiting push done and prints `Confirmed.` or `Nothing to confirm.`.

```sh
deno run --no-lock -A scripts/cli.ts last-push
deno run --no-lock -A scripts/cli.ts last-push --confirm
```

## Run a whole job

Work in this order.

1. Run `gather` with `--emit`. It ends by printing one JSON block. That block names `runId`,
   `runDir`, `ordersFile` and `logFile`. Read those paths from the block. Do not guess them.
2. Read `<runDir>/orders.json`. Split it between the people the user names.
3. Write the result to `<runDir>/output.json`, in the shape `docs/schema.md` defines.
4. Validate the file. Fix every `FAIL` line.
5. Pick a push path below. Dry run it. Show the table. Stop and wait.

Run dirs live under the per-user data dir, at `<data>/split-utils/share/runs/<runId>/`. On Linux
`<data>` is `~/.local/share`. On macOS it is `~/Library/Application Support`. On Windows it is
`%APPDATA%`. The variable `SPLIT_UTILS_STATE` overrides the whole root. Set it to a scratch dir when
you test, so a trial run never touches the real orders or the saved Splitwise key.

## Input and output files

Read `docs/schema.md` for the `orders.json` and `output.json` formats. `orders.json` lists raw
platform orders and feeds the splitter. `output.json` holds the people, splits, totals, and
settlements for one job.

## Push paths

Pick `aggregate` when the user has no API access at all. Pick `share` when a friend has API access
and can push. Pick `push` when the user holds their own Splitwise API key.

## Safety contract

Always run a dry run first. Show the expense table and the per person totals. Then stop. Wait until
the user says go. Never push on your own initiative.

## Split rules

Ask the user who pays for what. Never guess. Accept standing rules such as item affinity or a
fallback owner with a cap. This tool stores none of those rules. Ask the user where to persist them,
using whatever the host offers.

## Check the work

The validator is `scripts/validate.ts`. Run the command below after each edit. Fix every `FAIL` line
before you move on. A passing file prints `PASS` with split, people, and total counts. Add
`--orders` with the orders file to cross check group sums.

```sh
deno run --no-lock --allow-read scripts/validate.ts <output.json> [--orders <orders.json>]
```
