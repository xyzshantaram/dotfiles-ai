import { build } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The personal bundle's host-plane plugins, each bundled so the plugin is
// self-contained. The dsh packages stay external: the loader resolves them
// from the host base (the profile's node_modules) at runtime.
const here = dirname(fileURLToPath(import.meta.url));

const entries = [
  ["plugins/bash-guard.ts", "plugins/bash-guard.js"],
  ["plugins/see.ts", "plugins/see.js"],
  ["plugins/manifest-guard.ts", "plugins/manifest-guard.js"],
  ["plugins/package-tool.ts", "plugins/package-tool.js"],
  ["plugins/skill-gate.ts", "plugins/skill-gate.js"],
  ["plugins/profiles.ts", "plugins/profiles.js"],
  ["plugins/ask-interrupt.ts", "plugins/ask-interrupt.js"],
  ["plugins/tmp-dsh-shared.ts", "plugins/tmp-dsh-shared.js"],
  ["plugins/grant.ts", "plugins/grant.js"],
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


// W8: the approval reject-with-comment CLIENT plugin package. The host
// half now bundles via esbuild like the TS host plugins. The client half
// bundles like tool-render: highlight.js inlined (the browser module
// table cannot resolve npm deps), react and the @deepseek-ai packages
// external, wrapped in the module-loader facade with Symbol.toStringTag.
await build({
  entryPoints: [join(here, "plugins/approval-comment/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/approval-comment/lib/index.js"),
  logLevel: "info",
});

await build({
  entryPoints: [join(here, "plugins/approval-comment/src/client.ts")],
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["react", "react/jsx-runtime", "react-dom/client", "@deepseek-ai/*"],
  outfile: join(here, "plugins/approval-comment/dist/_client.bundle.js"),
  logLevel: "info",
});
{
  const bundled = (
    await readFile(join(here, "plugins/approval-comment/dist/_client.bundle.js"), "utf8")
  ).replace(/\s+$/, "");
  await writeFile(
    join(here, "plugins/approval-comment/lib/client.js"),
    `window.__ModuleLoader__.load({\n\tid: "approval-comment",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n${bundled}\n\t\treturn module.exports;\n\t}\n});\n`,
  );
  await rm(join(here, "plugins/approval-comment/dist/_client.bundle.js"));
}

// W18: combined subscription panel (OpenCode GO + Claude/meridian) CLIENT
// plugin package. The host half bundles via esbuild; lz4 stays
// external (native .node addons esbuild cannot bundle; runtime
// resolution is unchanged). The client half bundles as factory-form CJS
// (react external) and gets wrapped in the module-loader facade.
await build({
  entryPoints: [join(here, "plugins/subscriptions/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*", "lz4"],
  outfile: join(here, "plugins/subscriptions/lib/index.js"),
  logLevel: "info",
});
await build({
  entryPoints: [join(here, "plugins/subscriptions/src/client.ts")],
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["react", "react/jsx-runtime", "react-dom/client", "@deepseek-ai/*"],
  outfile: join(here, "plugins/subscriptions/dist/_client.bundle.js"),
  logLevel: "info",
});
{
  const bundled = (
    await readFile(join(here, "plugins/subscriptions/dist/_client.bundle.js"), "utf8")
  ).replace(/\s+$/, "");
  await writeFile(
    join(here, "plugins/subscriptions/lib/client.js"),
    `window.__ModuleLoader__.load({\n\tid: "subscriptions",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n${bundled}\n\t\treturn module.exports;\n\t}\n});\n`,
  );
  await rm(join(here, "plugins/subscriptions/dist/_client.bundle.js"));
}

// W8/W13 family: H2+H3 tool-render CLIENT plugin package. The client half
// bundles as factory-form CJS (highlight.js inlined; the browser loader
// table cannot resolve npm deps) and gets wrapped in the module-loader
// facade. react and @deepseek-ai stay external. The host half bundles
// via esbuild like the TS plugins.
await build({
  entryPoints: [join(here, "plugins/tool-render/src/client.ts")],
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["react", "react/jsx-runtime", "react-dom/client", "@deepseek-ai/*"],
  outfile: join(here, "plugins/tool-render/dist/_client.bundle.js"),
  logLevel: "info",
});
// Why the wrapper asymmetry (review nit, 2026-08-22): tool-render bundles CJS
// with npm deps inlined, so esbuild's CJS output needs the module-loader facade
// with Symbol.toStringTag to expose a shape the loader accepts. profiles-client
// has no npm deps, so it emits a plain IIFE that calls window.__ModuleLoader__.
// load itself; no facade is needed. Not unifying on one wrapper: the IIFE form
// is simpler, and the facade form exists only because esbuild cannot emit a bare
// load call around an inlined bundle without it.
{
  const bundled = (
    await readFile(join(here, "plugins/tool-render/dist/_client.bundle.js"), "utf8")
  ).replace(/\s+$/, "");
  await writeFile(
    join(here, "plugins/tool-render/dist/client.js"),
    `window.__ModuleLoader__.load({\n\tid: "tool-render",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n${bundled}\n\t\treturn module.exports;\n\t}\n});\n`,
  );
  await rm(join(here, "plugins/tool-render/dist/_client.bundle.js"));
}
await build({
  entryPoints: [join(here, "plugins/tool-render/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/tool-render/dist/index.js"),
  logLevel: "info",
});

// W6: profiles-client CLIENT plugin package. The seat and title rewriter
// live in the browser half; the host half bundles via esbuild. No
// browser half bundles as a plain IIFE that calls window.__ModuleLoader__.load
// itself at evaluation.
await build({
  entryPoints: [join(here, "plugins/profiles-client/src/client.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: join(here, "plugins/profiles-client/dist/client.js"),
  logLevel: "info",
});
await build({
  entryPoints: [join(here, "plugins/profiles-client/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/profiles-client/lib/index.js"),
  logLevel: "info",
});
