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

Run them with:

    DENO_DIR=/tmp/dsh/deno deno test --no-lock --min-dep-age=0 \
      --allow-read --allow-write --allow-env --allow-sys --allow-run \
      tests/split-utils/

`vitest.config.ts` excludes this tree: vitest owns the plugins, `deno test`
owns this.
