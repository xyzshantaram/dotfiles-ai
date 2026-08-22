import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The personal bundle's host-plane plugins, each bundled so the plugin is
// self-contained. The dsh packages stay external: the loader resolves them
// from the host base (the profile's node_modules) at runtime.
const here = dirname(fileURLToPath(import.meta.url));

const entries = [
  ["plugins/bash-guard.ts", "plugins/bash-guard.js"],
  ["plugins/see.ts", "plugins/see.js"],
  ["plugins/session-hygiene.ts", "plugins/session-hygiene.js"],
  ["plugins/manifest-guard.ts", "plugins/manifest-guard.js"],
  ["plugins/package-tool.ts", "plugins/package-tool.js"],
  ["plugins/skill-gate.ts", "plugins/skill-gate.js"],
  ["plugins/profiles.ts", "plugins/profiles.js"],
  ["plugins/ask-interrupt.ts", "plugins/ask-interrupt.js"],
];

for (const [entry, outfile] of entries) {
  await build({
    entryPoints: [join(here, entry)],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["@deepseek-ai/*", "node:*"],
    outfile: join(here, outfile),
    logLevel: "info",
  });
}

// W13 spike: a CLIENT plugin, not a host-plane plugin. It runs in the
// browser, so it bundles as a browser script rather than a node module.
// The output is the self-contained client half; see the file header for
// how the slot registration wins.
await build({
  entryPoints: [join(here, "plugins/spike-keyed-slot.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: join(here, "plugins/spike-keyed-slot.js"),
  logLevel: "info",
});

// W8: the approval reject-with-comment CLIENT plugin package. Its client
// half is factory-form CJS: the browser module loader executes the file
// and calls the factory with its own require resolver. esbuild must not
// resolve or rewrite that factory, so the build step copies the two
// sources verbatim into the package's lib/. The package mirrors the
// installed client plugins (dsh-at-file, dsh-better-markdown).
const approvalCommentSources = [
  ["plugins/approval-comment/src/index.js", "plugins/approval-comment/lib/index.js"],
  ["plugins/approval-comment/src/client.js", "plugins/approval-comment/lib/client.js"],
];

for (const [source, outfile] of approvalCommentSources) {
  const dest = join(here, outfile);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(here, source), dest);
}

