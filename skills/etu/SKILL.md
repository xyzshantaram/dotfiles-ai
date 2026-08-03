---
name: etu
description: Use the etu time-tracker CLI to check hours, sessions, and memos. opencode's own permission system prompts for approval before every `etu` invocation, so call it directly.
compatibility: opencode
---

# etu time-tracker skill

`etu` is a time-tracking CLI you invoke directly. opencode's `permission.bash` config asks for confirmation before **every** `etu` invocation — not just destructive ones. Do not add your own confirmation logic. Present your plan, then run the command. The human approves or rejects via opencode's own prompt.

## Rules

- **Present a plan before you run anything.** State the exact `etu` command and what it does. Then run it. opencode shows an approval prompt to the human before it executes.
- **Do not try to route around the prompt.** No `sh -c 'etu ...'`, `eval`, or building the command in a variable to dodge the pattern match. If a command needs to run, ask for it.
- **Do not proceed if the user says no or seems uncertain.** Stop and ask for clarification.
- **Prefer structured output.** Use the global `--structured` flag for reads and mutations unless the user explicitly wants terminal-formatted output. Parse the JSON response envelope (`ok`, then `data` or `error`). Do not scrape text.
- **Use CLI arguments and flags for every input. Never use stdin or interactive prompts.** Supply names, project IDs, record IDs, fields, and values with positional arguments and documented options such as `--project`, `--session-id`, `--memo-id`, `--description`, `--cost`, `--rate`, `--advance`, `--start`, `--end`, and `--rename`. If a required ID or value is unknown, ask the user. Do not run a command that would prompt.

## Command reference

<!-- BEGIN GENERATED: source is `etu --help`, walked recursively. Regenerate with:
     cd ~/repos/etu && deno task skill ~/.config/opencode/skills/etu/SKILL.md
     Do not hand-edit between these markers; it will be overwritten. -->

_Generated 2026-07-31T11:06:07.201Z from `etu 0.0.1`._

### Global usage
```
Usage: etu [options] [command]

A simple time-tracker application.

Options:
  -V, --version         output the version number
  --structured          Emit structured JSON output instead of formatted text.
  -h, --help            display help for command

Commands:
  config [key] [value]  Set/get configuration values. If neither key nor value
                        is provided, prints the entire config.
  log [options]         Print the summary (hours worked, total billing) of the
                        project.
  session               Edit and manage sessions.
  project               Create, edit, and manage projects
  status [options]      Print the status of the ongoing session, if any.
  memo                  Add, edit, or remove memos from your invoice. Memos are
                        little bits of information that are presented along
                        with the project log.
  help [command]        display help for command
```

### `etu config`
```
Usage: etu config [options] [key] [value]

Set/get configuration values. If neither key nor value is provided, prints the
entire config.

Arguments:
  key         Config key to set/get. Prints the current value if no value is
              supplied. Valid keys: currency,output-path
  value       The value to set `key` to.

Options:
  -h, --help  display help for command
```

### `etu log`
```
Usage: etu log [options]

Print the summary (hours worked, total billing) of the project.

Options:
  -p --project <string>  id of the project to summarize. Uses the default if
                         not specified.
  --time-only            Print only the total hours worked.
  -s --short             Don't print the log of hours worked. If used in
                         conjunction with --time-only, prints the time in a
                         short format ([xx]h[yy]m[zz]s).
  -d --days              Group hours by day instead of session
  --template <name>      Render using a template (without extension).
                         Auto-detects .liquid or .typ format. Liquid defaults
                         to HTML output (stdout), Typst defaults to PDF output
                         (file).
  --format <format>      Output format: html, pdf, or png. Overrides template
                         default.
  -o, --output <path>    Output file path. Saves directly to this location.
  --output-dir <path>    Output directory. Defaults to Documents/etu or the
                         configured output-path.
  -h, --help             display help for command
```

### `etu session`
```
Usage: etu session [options] [command]

Edit and manage sessions.

Options:
  -h, --help                      display help for command

Commands:
  continue [options]              Start the clock.
  delete [options]                Delete a session of a project.
  edit [options]                  Edit a session of a project.
  start [options] [session-name]  Start the clock.
  stop [options]                  Stop the clock.
  help [command]                  display help for command
```

#### `etu session continue`
```
Usage: etu session continue [options]

Start the clock.

Options:
  -p --project <string>  id of the project to continue in. Uses the default if
                         not specified.
  -h, --help             display help for command
```

#### `etu session delete`
```
Usage: etu session delete [options]

Delete a session of a project.

Options:
  -p --project <string>  id of the project whose session to delete. uses
                         default project if not specified.
  --session-id <ulid>    ULID of the session to delete. Skips interactive
                         selection.
  -h, --help             display help for command
```

#### `etu session edit`
```
Usage: etu session edit [options]

Edit a session of a project.

Options:
  -p --project <string>  id of the project whose session to edit. uses default
                         project if not specified.
  --session-id <ulid>    ULID of the session to edit. Skips interactive
                         selection.
  --start <value>        New start time (Unix ms, 'now', or delta like '+1h').
  --end <value>          New end time (Unix ms, 'now', or delta like '+1h').
  --remove-end           Remove the end time (make session ongoing).
  --rename <name>        New name for the session.
  -h, --help             display help for command
```

#### `etu session start`
```
Usage: etu session start [options] [session-name]

Start the clock.

Arguments:
  session-name           Optional name for the session.

Options:
  -p --project <string>  id of the project to start the session in. Uses the
                         default if not specified.
  -h, --help             display help for command
```

#### `etu session stop`
```
Usage: etu session stop [options]

Stop the clock.

Options:
  -p --project <string>  id of the project to stop the session for. Uses the
                         default if not specified.
  -h, --help             display help for command
```

### `etu project`
```
Usage: etu project [options] [command]

Create, edit, and manage projects

Options:
  -h, --help                                   display help for command

Commands:
  new [options] <name> <rate> [initial-hours]  Start a new project and set it as the default.
  default <id>                                 Change the default project.
  list [options]                               List all projects.
  edit [options]                               Edit a project.
  delete [options]                             Deletes a project, all its sessions, and removes it from the default if set.
  help [command]                               display help for command
```

#### `etu project new`
```
Usage: etu project new [options] <name> <rate> [initial-hours]

Start a new project and set it as the default.

Arguments:
  name                   name to use for the project.
  rate                   hourly rate
  initial-hours          number of hours to log to start with

Options:
  -p --project <string>  the slug to use for the project. autogenerated by
                         default.
  -a --advance <number>  the number of hours advanced on the project. These
                         will be subtracted when calculating the final amount.
  -h, --help             display help for command
```

#### `etu project default`
```
Usage: etu project default [options] <id>

Change the default project.

Arguments:
  id          id of the project to set as default.

Options:
  -h, --help  display help for command
```

#### `etu project list`
```
Usage: etu project list [options]

List all projects.

Options:
  --page <n>  Page number for paginated output (structured mode only). Default:
              1.
  -h, --help  display help for command
```

#### `etu project edit`
```
Usage: etu project edit [options]

Edit a project.

Options:
  -p --project <string>  id of the project to edit. Uses the default if not
                         specified.
  --rate <number>        New hourly rate.
  --advance <number>     New advance amount in hours.
  --rename <name>        New project name.
  -h, --help             display help for command
```

#### `etu project delete`
```
Usage: etu project delete [options]

Deletes a project, all its sessions, and removes it from the default if set.

Options:
  -p --project <string>  id of the project to delete. Uses the default if not
                         specified.
  -h, --help             display help for command
```

### `etu status`
```
Usage: etu status [options]

Print the status of the ongoing session, if any.

Options:
  -p --project <string>  id of the project to summarize. Uses the default if
                         not specified.
  -s --short             Print only the time in a short format
                         ([xx]h[yy]m[zz]s). If no session is ongoing, exit
                         silently.
  --show-project         For use with --short. Prints the project slug along
                         with the time spent.
  -h, --help             display help for command
```

### `etu memo`
```
Usage: etu memo [options] [command]

Add, edit, or remove memos from your invoice. Memos are little bits of
information that are presented along with the project log.

Options:
  -h, --help            display help for command

Commands:
  add [options] <name>  Add a memo to a project.
  delete [options]      Delete a memo (note or expense) from a project.
  edit [options]        Edit a memo (note or expense) of a project.
  help [command]        display help for command
```

#### `etu memo add`
```
Usage: etu memo add [options] <name>

Add a memo to a project.

Arguments:
  name                    The name of the memo. Memos can optionally have a
                          description.

Options:
  -e --expense            Whether the memo to add indicates an expense.
  -p --project <project>  id of the project to which to add the memo. uses
                          default project if not specified.
  --description <text>    Memo description. Skips interactive prompt.
  --cost <number>         Expense cost. Implies --expense.
  -h, --help              display help for command
```

#### `etu memo delete`
```
Usage: etu memo delete [options]

Delete a memo (note or expense) from a project.

Options:
  -p --project <string>  id of the project whose note to delete. uses default
                         project if not specified.
  --memo-id <id>         ID of the memo to delete. Skips interactive selection.
  -h, --help             display help for command
```

#### `etu memo edit`
```
Usage: etu memo edit [options]

Edit a memo (note or expense) of a project.

Options:
  -p --project <project>  id of the project whose memo to edit. uses default
                          project if not specified.
  --memo-id <id>          ID of the memo to edit. Skips interactive selection.
  --rename <name>         New memo name.
  --description <text>    New description.
  --type <type>           Memo type: kv or expense.
  --cost <number>         New expense cost (only with --type expense).
  -h, --help              display help for command
```

<!-- END GENERATED -->

## Workflow

1. **Understand the intent.** What does the user want? Check status, start or stop tracking, review logs, or manage memos.
2. **Present the plan.** Tell the user: "I will run `etu <command>` to <explain what it does>. OK?"
3. **Execute.** Run the command. opencode's permission prompt reaches the human automatically. You do not need to relay or duplicate it.
4. **Report results.** Show the output and any relevant context.
5. **Use structured, non-interactive commands.** `--structured` is global. Prefer `etu --structured log` for hours, billing, and sessions. Prefer `etu --structured status` for active-session data. Prefer `etu --structured project list` for project data. For mutations, provide all required positional inputs and flags. Do not rely on stdin or interactive prompts.

## Examples

### Checking status
```
User: "am i tracking anything?"
AI: "Let me check. Running: etu --structured status"
→ parse active, project, and session from the JSON response
```

### Starting a session
```
User: "start tracking for client X"
AI: "I will start a new session named 'client X'. Running: etu --structured session start 'client X' --project client-x. OK?"
```

### Stopping a session
```
User: "stop the clock"
AI: "I will stop the current session. Running: etu --structured session stop --project client-x."
```

### Reviewing logs
```
User: "how many hours this week?"
AI: "Running: etu --structured log -s --time-only"
→ parse decimalHours, finalAmount from the JSON
```

### Editing without prompts
```
User: "make Acme $50/hour, with 2 hours advanced"
AI: "Running: etu --structured project edit --project acme --rate 50 --advance 2"

User: "add the $12.50 travel expense"
AI: "Running: etu --structured memo add 'Travel' --project acme --description 'Train' --cost 12.50"

User: "rename session 01J... to planning"
AI: "Running: etu --structured session edit --project acme --session-id 01J... --rename planning"
```
