import { build } from "esbuild";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// The personal bundle's host-plane plugins, each bundled so the plugin is
// self-contained. The dsh packages stay external: the loader resolves them
// from the host base (the profile's node_modules) at runtime.
const cssTextPlugin = {
  name: "css-text",
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path),
      namespace: "css-text",
    }));
    build.onLoad({ filter: /.*/, namespace: "css-text" }, async (args) => {
      const text = await readFile(args.path, "utf8");
      return { contents: `export default ${JSON.stringify(text)};`, loader: "js" };
    });
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const isCheckMode = process.argv.includes("--check");

const entries = [
  ["plugins/log-exporter.ts", "plugins/log-exporter.js"],
  ["plugins/bash-guard.ts", "plugins/bash-guard.js"],
  ["plugins/see.ts", "plugins/see.js"],
  ["plugins/manifest-guard.ts", "plugins/manifest-guard.js"],
  ["plugins/package-tool.ts", "plugins/package-tool.js"],
  ["plugins/skill-gate.ts", "plugins/skill-gate.js"],
  ["plugins/profiles.ts", "plugins/profiles.js"],
  ["plugins/resume.ts", "plugins/resume.js"],
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

// CLIENT plugin halves bundle to a temp file, then get wrapped in the
// module-loader facade and written to their final path. The esbuild
// options are identical for every client half (browser CJS, react and
// @deepseek-ai external), so they live here rather than at each call site.
async function wrapClientBundle(entryPath, outPath, id) {
  const tmpDir = await mkdtemp(join(tmpdir(), "dsh-wrap-"));
  const bundlePath = join(tmpDir, "_client.bundle.js");
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2022",
    external: ["react", "react-dom/client", "@deepseek-ai/*"],
    jsx: "transform",
    jsxFactory: "react.createElement",
    jsxFragment: "react.Fragment",
    plugins: [cssTextPlugin],
    outfile: bundlePath,
    logLevel: "info",
  });
  const bundled = (await readFile(bundlePath, "utf8")).replace(/\s+$/, "");
  await writeFile(
    outPath,
    `window.__ModuleLoader__.load({
	id: "${id}",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${bundled}
		return module.exports;
	}
});
`,
  );
  await rm(bundlePath);
  await rm(tmpDir, { recursive: true, force: true });
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

// Effort 4: mcp-servers host half. The roster reader and the later MCP
// transports bundle here. @modelcontextprotocol/sdk is a real dependency and
// MUST be bundled, so it is deliberately not in external.
await build({
  entryPoints: [join(here, "plugins/mcp-servers/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/mcp-servers/lib/index.js"),
  logLevel: "info",
});

await wrapClientBundle(
  join(here, "plugins/mcp-servers/src/client.tsx"),
  join(here, "plugins/mcp-servers/lib/client.js"),
  "mcp-servers",
);

await wrapClientBundle(
  join(here, "plugins/approval-comment/src/client.tsx"),
  join(here, "plugins/approval-comment/lib/client.js"),
  "approval-comment",
);

// durable-todos: the todo panel that survives interrupts and restarts. The
// host half registers a mirror session projection that never clears at
// turn/start, so zod bundles into it (only @deepseek-ai/* and node:* stay
// external). The client half reads that projection in the input dock.
await build({
  entryPoints: [join(here, "plugins/durable-todos/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/durable-todos/lib/index.js"),
  logLevel: "info",
});
await wrapClientBundle(
  join(here, "plugins/durable-todos/src/client.tsx"),
  join(here, "plugins/durable-todos/lib/client.js"),
  "durable-todos",
);

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
await wrapClientBundle(
  join(here, "plugins/subscriptions/src/client.tsx"),
  join(here, "plugins/subscriptions/lib/client.js"),
  "subscriptions",
);
// session-archive: archived-session cleanup panel CLIENT plugin package.
// The host half bundles via esbuild; the client half bundles as factory-form
// CJS (react external) and gets wrapped in the module-loader facade.
await build({
  entryPoints: [join(here, "plugins/session-archive/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/session-archive/lib/index.js"),
  logLevel: "info",
});
await wrapClientBundle(
  join(here, "plugins/session-archive/src/client.tsx"),
  join(here, "plugins/session-archive/lib/client.js"),
  "session-archive",
);

// log-viewer: dsh-web server log viewer panel CLIENT plugin package.
// The host half bundles via esbuild; the client half bundles as factory-form
// CJS (react external) and gets wrapped in the module-loader facade.
await build({
  entryPoints: [join(here, "plugins/log-viewer/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/log-viewer/lib/index.js"),
  logLevel: "info",
});
await wrapClientBundle(
  join(here, "plugins/log-viewer/src/client.tsx"),
  join(here, "plugins/log-viewer/lib/client.js"),
  "log-viewer",
);
// W8/W13 family: H2+H3 tool-render CLIENT plugin package. The client half
// bundles as factory-form CJS (highlight.js inlined; the browser loader
// table cannot resolve npm deps) and gets wrapped in the module-loader
// facade. react and @deepseek-ai stay external. The host half bundles
// via esbuild like the TS plugins.
// Why the wrapper asymmetry (review nit, 2026-08-22): the client halves
// bundle CJS with npm deps inlined, so esbuild's CJS output needs the
// module-loader facade with Symbol.toStringTag to expose a shape the loader
// accepts. profiles-client has no npm deps, so it emits a plain IIFE that
// calls window.__ModuleLoader__.load itself; no facade is needed. Not
// unifying on one wrapper: the IIFE form is simpler, and the facade form
// exists only because esbuild cannot emit a bare load call around an
// inlined bundle without it.
await wrapClientBundle(
  join(here, "plugins/tool-render/src/client.tsx"),
  join(here, "plugins/tool-render/dist/client.js"),
  "tool-render",
);
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
  entryPoints: [join(here, "plugins/profiles-client/src/client.tsx")],
  bundle: true,
  platform: "browser",
  format: "iife",
  external: ["react"],
  jsx: "transform",
  jsxFactory: "react.createElement",
  jsxFragment: "react.Fragment",
  plugins: [cssTextPlugin],
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

if (isCheckMode) {
  const { execSync } = await import("node:child_process");
  try {
    execSync("git diff --exit-code -- plugins/*.js plugins/*/dist/** plugins/*/lib/**", {
      cwd: here,
      stdio: "inherit",
    });
    console.log("build check: no drift");
  } catch {
    console.error(
      "build check FAILED: committed bundles differ from fresh build. Run node build.mjs + ` and commit.",
    );
    process.exit(2);
  }
}
