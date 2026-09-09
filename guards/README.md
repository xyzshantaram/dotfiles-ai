# guards/ — bash-guard rule files, and nothing else

Every `*.json` file in this directory is parsed by **bash-guard** as a command
rule file. That is the whole convention, and until #128 it was undeclared —
which is how a differently-shaped file ended up here and produced 868 false
"malformed rule file" warnings in six hours.

## What makes a file here a rule file

`sync.sh`'s `step_sync_guard_rules` copies this entire directory to
`$DSH_HOME/plugins/guards`, and the bash-guard row is configured with
`guardsDir: $DSH_HOME/plugins/guards`. bash-guard then reads **every** `.json`
file it finds there and expects each to carry a `commands[]` key. A `.json`
file without one is skipped with a warning — on **every bash call**, because
the directory is re-read per evaluation rather than cached. The warning volume
therefore scales with how hard the agent is working, which is exactly when the
journal most needs to be readable.

So: the file extension is load-bearing. A `.json` file here is a promise that
it is a bash-guard rule file.

## What does NOT belong here

Anything read by a repo script rather than by bash-guard at runtime.
`preset-drift.json` used to live here and was moved to `scripts/` in #128: its
only consumers are `scripts/check-preset-drift.mjs` and
`plugins/preset-drift.test.ts`, neither of which runs inside the harness, so it
never needed to be copied into the runtime guards directory at all.

If you need to add a non-rule file that must ship to `$DSH_HOME`, put it
somewhere else and extend `sync.sh` deliberately. Do not add it here and teach
bash-guard to skip it by name — the next such file hits the same wall.

## Files without a `.json` extension

`profile-awaiting_verification` and `profile-planning` are not rule files and
do not collide, precisely because bash-guard only globs `*.json`. That is an
accident of the glob rather than a designed exemption; do not rely on it for a
file that would otherwise be a rule.
