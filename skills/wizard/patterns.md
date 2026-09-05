# Wizard patterns quick reference

Shapes only. Confirm exact options with
`deno doc --filter <Name> npm:mepcli@1.4.0`.
Full guides live in /tmp/dsh/mep-docs/docs.

## Flow

- `Pipeline` chains named steps into one context object.
- Each step takes an action plus `validate`, `transform`, `timeout`, `fallback`.
- `stepIf` runs a step only when the context meets a test.
- `onStepStart` and `onStepComplete` drive counters and progress events.
- `TaskRunner` injects spinners and progress bars into steps.
- `PipelineExit` stops the run early from any step.

## Text input

- `text` asks one line with `placeholder`, `initial`, `validate`.
- `password` masks with stars. `secret` hides input fully.
- `list` takes comma split tags in one prompt.
- `confirm` returns yes or no. `toggle` renames the two sides.

## Picks

- `select` picks one row with optional descriptions.
- `fuzzySelect` fuzzy searches hundreds of rows client side.
- `autocomplete` filters through an async `suggest` callback.
- `multiSelect` ticks many rows with search in one prompt.
- `checkbox` is the plain multi tick form with `min` and `max`.
- `sort` reorders rows and returns the new order.

## Show then pick

- `table` shows columns plus rows and returns the picked row value.
- Use it to show scored options before a `select` step.

## Shell and files

- `exec` runs one shell command with live output.
- `write_env` upserts `KEY=value` lines. `set_secret` uses `gh`.
- `file` picks a path with base path plus extension filter.
- `editor` opens the human editor for long input.

## Numbers and dates

- `number` bounds with `min`, `max`, `step`, `initial`.
- `slider` picks one value on a bar. `range` picks a low high pair.
- `date`, `time`, `calendar`, `cron` cover schedules. The template wraps
  `number` only. Call these direct from `MepCLI` when a wizard needs them.

## Verify

- `deno check` clears the script.
- Keyless runs must fail with the exact missing key line.
- Piped runs must stay free of ANSI codes.
