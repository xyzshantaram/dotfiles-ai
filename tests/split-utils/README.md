# split-utils tests

These live OUTSIDE `skills/split-utils` on purpose (#182).

A skill should be copyable: anyone can take the skill directory and have it
work, the way every other skill in this repo does. Tests inside it break that,
and they were also the only reason that directory needed configuration at all
— its `deno.json` mapped `@std/assert` for the tests alone, both `fmt` and
`lint` excluded `tests/fixtures`, and two of its five tasks were test tasks.

They reach the app through an import map rather than a relative path, so if
the skill ever moves again this costs one line instead of rewriting every
file.

Run them from the repo root with:

    DENO_DIR=/tmp/dsh/deno deno test --config tests/split-utils/deno.json \
      --no-lock --min-dep-age=0 \
      --allow-read --allow-write --allow-env --allow-sys --allow-run \
      tests/split-utils/

The `--config` flag points at this dir's own import map. Deno finds its
config from the working dir, so without the flag a root run misses the
`@app/` mapping. From inside this dir, `deno task test` runs the same
suite with no flag.

`vitest.config.ts` excludes this tree: vitest owns the plugins, `deno test`
owns this.
