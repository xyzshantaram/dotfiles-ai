import { defineConfig } from "vitest/config";

// The build step drops compiled .js files next to their .ts sources
// (plugins/bash-guard.js beside plugins/bash-guard.ts). Vite's default
// extension order resolves .js first, so tests silently imported the stale
// build. Sources win here; .js stays in the list for plain-JS helpers.
export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
});
