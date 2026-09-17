// ESLint flat config (ticket #154).
//
// NARROW BY DESIGN. This repo lived without a linter, and a broad rule set
// would produce mass churn that gets ignored -- the same failure as the bug.
// Exactly one rule is enabled: react-hooks/rules-of-hooks as an error.
//
// CLOSED BLIND SPOT (verified experimentally in #154, closed by #158):
// the v7 rule hardcodes the React namespace object name as `React`, so it
// did NOT see hook calls through this repo's former universal lowercase
// alias (`react.useRef`, `react.useState`, ...). A `react.useRef` moved
// below an early return -- the exact #150 shape -- linted SILENT, while the
// identical code through `React.useRef` or a bare `useRef` import failed as
// it should. The repo-wide `react` -> `React` rename (#158) closed that gap:
// every plugin source now calls hooks through `React.*`, so this config sees
// the namespaced majority as well (it already reports five in tool-render).
// Do not reintroduce a lowercase alias: any `react.useX` call would go blind
// again, silently. A clean lint may now be read as no conditional-hook
// defect in `React.*`- or bare-`useX`-style code.
//
// PARSER NOTE. The obvious parser, @typescript-eslint/parser, hard-refuses
// to load under this repo's TypeScript 7 ("typescript-eslint does not
// support TS 7.0"); downgrading the compiler for the linter's sake is out of
// the question. So parsing goes through @babel/eslint-parser, which is
// independent of the installed typescript version. No type-aware rules are
// enabled, so syntax-only parsing is all the linter needs -- and the v8
// parser resolves syntax plugins directly from
// parserOptions.babelOptions.parserOpts (it never runs the preset chain),
// which is why the config below names "typescript"/"jsx" there instead of
// loading @babel presets. Deliberately NOT enabled:
// react-hooks/exhaustive-deps (see the note at
// plugins/composer-approvals/src/client.tsx's badge effect -- the dep array
// there is intentional and repo-wide exhaustive-deps would be churn).

import reactHooks from "eslint-plugin-react-hooks";
import babelParser from "@babel/eslint-parser";

const plugins = {
  "react-hooks": reactHooks,
};

const rules = {
  "react-hooks/rules-of-hooks": "error",
};

function parserOptionsFor(syntaxPlugins) {
  return {
    requireConfigFile: false,
    babelOptions: {
      configFile: false,
      babelrc: false,
      parserOpts: {
        plugins: syntaxPlugins,
      },
    },
  };
}

export default [
  // Built output is generated bundles, not source. Linting it is noise.
  // That includes the compiled lib/ and dist/ directories AND the
  // esbuild-generated .js bundles sitting at plugins/ root (each is built
  // from a sibling .ts source, which is what gets linted). Declaration
  // files (*.d.ts) contain no runtime code, so no hook call can exist in
  // them -- and one (.d.ts doc comment with JSX in it) does not even parse.
  // Excluding them loses zero rules-of-hooks signal.
  {
    ignores: [
      "**/node_modules/**",
      "**/lib/**",
      "**/dist/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.d.ts",
    ],
  },
  {
    files: ["plugins/**/*.ts"],
    languageOptions: {
      parser: babelParser,
      parserOptions: parserOptionsFor(["typescript"]),
    },
    plugins,
    rules,
  },
  {
    files: ["plugins/**/*.tsx"],
    languageOptions: {
      parser: babelParser,
      parserOptions: parserOptionsFor(["typescript", "jsx"]),
    },
    plugins,
    rules,
  },
];
