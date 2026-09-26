# command-hooks/ — pre-command hooks, and nothing else

Every **executable regular file** in this directory is a pre-command hook.
`sync.sh` mirrors it to `$DSH_HOME/plugins/command-hooks`, and the bash-guard
row is configured with `hooksDir` pointing there. Anything that is not an
executable file (directories, non-executable files, broken symlinks) is
ignored — the execute bit is the convention, exactly like rule files are
recognized by their `.json` extension in `guards/`.

## The contract

The rule layer stays the default policy. When — and only when — the rules
gate a command (an **ask**, or a **deny that came from a rule verdict**),
bash-guard offers the decision to every hook, in name order:

```
hook <depth> <command>
```

- **argv 1** — the agent depth: `0` for the primary agent, `1+` for
  subagents (the same `delegationDepthOf` number aidos uses).
- **argv 2** — the command string as the guard evaluated it (for an escaped
  ask this is the rewritten form; for a deny, the original).
- **cwd** — the command's resolved workdir when one is known.
- **`DSH_HOOK_PROFILE`** — the aidos bash profile (`planning`,
  `implementation`, `subagent-<provider>`, or `none`).
- **`DSH_HOOK_VERDICT`** — `"ask"` or `"deny"`: what the rules decided.

## The exit code

- **`0`** — the command runs, no approval prompt. The first hook to exit 0
  wins; later hooks are not consulted.
- **non-zero** — this hook declines; the block stands unless a later hook
  allows.

A hook that cannot run at all (spawn failure, timeout — 10s by default,
`hookTimeoutMs` on the bash-guard row) can never allow, and never denies
anything on its own: the rule verdict it failed to escape still applies.

## What hooks cannot do

Hooks bypass only the rule layer's ask/deny. They cannot relax the file
sandbox (executor-level), the aidos write boundary, or escalation approval.
Parse-failure denies are **not escapable** — a command bash-guard could not
parse must never run on a hook's say-so.

## Writing one

```bash
#!/usr/bin/env bash
set -u
depth="$1"; command="$2"
[ "$depth" -ge 1 ] || exit 1
case "$command" in
  git\ commit*) exit 0 ;;
  *) exit 1 ;;
esac
```

Decline with a message on stderr — it lands in the harness journal at debug
level, which makes a misfiring hook diagnosable without a manual re-run.
