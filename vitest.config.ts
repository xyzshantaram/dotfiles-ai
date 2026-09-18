import { configDefaults, defineConfig } from "vitest/config";

// The build step drops compiled .js files next to their .ts sources
// (plugins/bash-guard.js beside plugins/bash-guard.ts). Vite's default
// extension order resolves .js first, so tests silently imported the stale
// build. Sources win here; .js stays in the list for plain-JS helpers.
//
// TWO TEST RUNNERS LIVE IN THIS REPO (#182). vitest owns the plugins. `deno
// test` owns split-utils, which arrived as a whole Deno application under
// skills/. Its 32 test files import `jsr:` specifiers, `@std/assert` and
// Deno globals, none of which vitest can load, so with the default include
// they fail to COLLECT: 28 files error while every JS test still passes. A
// suite that reports red for a reason unrelated to the change under test is
// worse than no suite, because every future ticket is verified by running
// it.
//
// The rule, rather than two hard-coded paths: a tree owned by another test
// runner is excluded here, and its own runner covers it. Both split-utils
// locations are listed because criteria 1 to 4 of #182 move the tests out of
// the skill directory to make the skill portable, and the suite must not go
// red on the day that lands. Whoever adds the next non-Node skill adds its
// tree here for the same reason.
export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "skills/split-utils/**",
      "tests/split-utils/**",
    ],
  },
});
