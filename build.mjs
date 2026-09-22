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
  ["plugins/see.ts", "plugins/see.js"],
  ["plugins/manifest-guard.ts", "plugins/manifest-guard.js"],
  ["plugins/package-tool.ts", "plugins/package-tool.js"],
  ["plugins/context-guard.ts", "plugins/context-guard.js"],
  ["plugins/profiles.ts", "plugins/profiles.js"],
  ["plugins/resume.ts", "plugins/resume.js"],
  ["plugins/ask-interrupt.ts", "plugins/ask-interrupt.js"],
  ["plugins/approval-interrupt.ts", "plugins/approval-interrupt.js"],
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

// bash-guard: same bare-specifier require shim problem as mcp-servers below.
// The bundled `yaml` package's composer guards a feature check with
// `require("process")` (a bare specifier, not `node:process`), which the
// `node:*` external pattern does not match. esbuild inlines its __require
// shim for that call, and the shim throws in ESM output because no `require`
// binding exists. Restoring a real `require` through createRequire satisfies
// the shim, which checks `typeof require !== "undefined"` before it throws.
// Without this the whole plugin tree fails to load and dsh does not boot.
await build({
  entryPoints: [join(here, "plugins/bash-guard.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  banner: {
    js: [
      'import { createRequire as __dshCreateRequire } from "node:module";',
      "const require = __dshCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  outfile: join(here, "plugins/bash-guard.js"),
  logLevel: "info",
});

// subagent-steer (#129): a HOST-only tool plugin. No require shim needed —
// it bundles only its own source plus @deepseek-ai externals, with none of
// the bare-specifier `require` problem bash-guard has to work around.
await build({
  entryPoints: [join(here, "plugins/subagent-steer.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["@deepseek-ai/*", "node:*"],
  outfile: join(here, "plugins/subagent-steer.js"),
  logLevel: "info",
});

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
    // Bare `react-dom` is external too, not just `react-dom/client`. The module
    // loader supplies it: four shipped bundles already require it that way
    // (dsh-client-ui-trajectory, -renderer, -message-feedback, -attachment).
    // Without this, any dependency that portals pulls a second copy of
    // react-dom into the bundle, about 130 KB.
    external: ["react", "react-dom", "react-dom/client", "@deepseek-ai/*"],
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
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

// ── The plain esbuild host-half stanzas, as one data table. ─────────────
//
// Sixteen host-half build() calls sat below this line as copy-paste pairs of
// one entry path and one output path, plus three verbatim createRequire
// banners. They are data now, driven by the loop after the table. The
// per-plugin prose stays as the row's `why` field — read it, not the
// boilerplate that used to repeat under it.
//
// THIS TABLE IS LOAD-BEARING, not boilerplate: sync.sh builds plugins by
// running this file, and a plugin with no row here is simply never rebuilt
// (quote-selection's row records the staleness that story prevents).
//
// SPECIAL ROWS, each with its reason, all still here rather than in the
// table: bash-guard and mcp-servers need the requireBanner shim; and
// subs-ext adds lz4 as external, because esbuild cannot bundle native
// .node addons and runtime resolution is unchanged.
const hostStanzas = [
  // W8: the approval reject-with-comment CLIENT plugin package. The host
  // half now bundles via esbuild like the TS host plugins. The client half
  // bundles like tool-render: highlight.js inlined (the browser module
  // table cannot resolve npm deps), react and the @deepseek-ai packages
  // external, wrapped in the module-loader facade with Symbol.toStringTag.
  {
    entry: "plugins/approval-comment/src/index.ts",
    outfile: "plugins/approval-comment/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
  },

  // Effort 4: mcp-servers host half. The roster reader and the later MCP
  // transports bundle here. @modelcontextprotocol/sdk is a real dependency and
  // MUST be bundled, so it is deliberately not in external.
  //
  // The banner is load-bearing. cross-spawn, pulled in by the SDK's stdio
  // transport, calls `require("child_process")` with a bare specifier, which the
  // `node:*` external pattern does not match. esbuild therefore inlines its
  // __require shim, and that shim throws in ESM output because no `require`
  // binding exists. Restoring a real `require` through createRequire satisfies
  // the shim, which checks `typeof require !== "undefined"` before it throws.
  // Without this the whole plugin tree fails to load and dsh does not boot.
  {
    entry: "plugins/mcp-servers/src/index.ts",
    outfile: "plugins/mcp-servers/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    // banner: the shim story every banner stanza shares, told
    // once in requireBanner at the loop below.
    banner: true,
    wrap: {
      client: "plugins/mcp-servers/src/client.tsx",
      outfile: "plugins/mcp-servers/lib/client.js",
      id: "mcp-servers",
    },
  },

  {
    wrapOnly: {
      client: "plugins/approval-comment/src/client.tsx",
      outfile: "plugins/approval-comment/lib/client.js",
      id: "approval-comment",
    },
  },

  // durable-todos: the todo panel that survives interrupts and restarts. The
  // host half registers a mirror session projection that never clears at
  // turn/start, so zod bundles into it (only @deepseek-ai/* and node:* stay
  // external). The client half reads that projection in the input dock.
  {
    entry: "plugins/durable-todos/src/index.ts",
    outfile: "plugins/durable-todos/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/durable-todos/src/client.tsx",
      outfile: "plugins/durable-todos/lib/client.js",
      id: "durable-todos",
    },
  },

  // context-meter: the ring reads the token-meter projections in the
  // composer tool row. It needs no host logic, so the host half stays a stub.
  {
    entry: "plugins/context-meter/src/index.ts",
    outfile: "plugins/context-meter/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/context-meter/src/client.tsx",
      outfile: "plugins/context-meter/lib/client.js",
      id: "context-meter",
    },
  },

  // system-fonts: overrides the hardcoded dsh font tokens so code and UI text
  // defer to the system font settings. It needs no host logic, so the host half
  // stays a stub.
  {
    entry: "plugins/system-fonts/src/index.ts",
    outfile: "plugins/system-fonts/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/system-fonts/src/client.tsx",
      outfile: "plugins/system-fonts/lib/client.js",
      id: "system-fonts",
    },
  },

  // tooltips: styled tooltips for elements that opt in with `data-dsh-tip`. The
  // text stays in the element's own `title`, so the native tooltip is the
  // fallback when this plugin does not load. It needs no host logic, so the host
  // half stays a stub.
  {
    entry: "plugins/tooltips/src/index.ts",
    outfile: "plugins/tooltips/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/tooltips/src/client.tsx",
      outfile: "plugins/tooltips/lib/client.js",
      id: "tooltips",
    },
  },

  // composer-menu: the overflow menu at the left edge of the composer tool
  // row. It holds the sandbox picker and offers the composer.overflow.item
  // slot for other plugins.
  {
    entry: "plugins/composer-menu/src/index.ts",
    outfile: "plugins/composer-menu/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/composer-menu/src/client.tsx",
      outfile: "plugins/composer-menu/lib/client.js",
      id: "composer-menu",
    },
  },

  // toast: the shared toast stack. Mounts one container into shell.overlay and
  // publishes window.__dshToast__ so other bundles (and aidos) can raise a
  // notification without importing anything. It needs no host logic, so the
  // host half stays a stub.
  {
    entry: "plugins/toast/src/index.ts",
    outfile: "plugins/toast/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/toast/src/client.tsx",
      outfile: "plugins/toast/lib/client.js",
      id: "toast",
    },
  },

  // modal: the shared modal host. Mounts one container into shell.overlay and
  // publishes window.__dshModal__ so other bundles can open a PluginModal
  // without inlining their own copy. The container renders the shared
  // component (plugins/shared/plugin-modal.tsx), which stays its single
  // source. Built before its consumers, like toast above; it needs no host
  // logic, so the host half stays a stub.
  {
    entry: "plugins/modal/src/index.ts",
    outfile: "plugins/modal/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/modal/src/client.tsx",
      outfile: "plugins/modal/lib/client.js",
      id: "modal",
    },
  },

  // composer-approvals: the pending-approval indicator beside the overflow
  // trigger, with a modal listing every pending approval. Plain client plugin:
  // host half bundles via esbuild, client half via the module-loader facade.
  {
    entry: "plugins/composer-approvals/src/index.ts",
    outfile: "plugins/composer-approvals/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/composer-approvals/src/client.tsx",
      outfile: "plugins/composer-approvals/lib/client.js",
      id: "composer-approvals",
    },
  },

  // quote-selection: selecting text in an assistant message offers a floating
  // quote button that appends the passage to the composer draft. Same plain
  // client-plugin split as composer-approvals.
  //
  // THIS STANZA IS LOAD-BEARING, not boilerplate: sync.sh builds plugins by
  // running this file, and a plugin with no stanza here is simply never
  // rebuilt. Its lib/ would keep whatever bytes it was born with while its
  // src/ moved on -- a silent staleness with no error anywhere. The first
  // bundles for this plugin were hand-built for exactly that reason and are
  // replaced by this build.
  {
    entry: "plugins/quote-selection/src/index.ts",
    outfile: "plugins/quote-selection/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/quote-selection/src/client.tsx",
      outfile: "plugins/quote-selection/lib/client.js",
      id: "quote-selection",
    },
  },

  // user-bubble: markdown user/steering bubbles with hard breaks outside
  // fenced code; pasted paths stop chipping as skill references. Same plain
  // client-plugin split as composer-approvals.
  {
    entry: "plugins/user-bubble/src/index.ts",
    outfile: "plugins/user-bubble/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/user-bubble/src/client.tsx",
      outfile: "plugins/user-bubble/lib/client.js",
      id: "user-bubble",
    },
  },

  // restart-pause: the Debug settings panel. The host half tracks agents
  // mid-turn and owns the /restart-pause/* routes; the client half is the
  // panel. Same esbuild/wrapClientBundle split as session-archive.
  {
    entry: "plugins/restart-pause/src/index.ts",
    outfile: "plugins/restart-pause/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/restart-pause/src/client.tsx",
      outfile: "plugins/restart-pause/lib/client.js",
      id: "restart-pause",
    },
  },

  // W18: combined subscription panel (OpenCode GO + Claude/meridian) CLIENT
  // plugin package. The host half bundles via esbuild; lz4 stays
  // external (native .node addons esbuild cannot bundle; runtime
  // resolution is unchanged). The client half bundles as factory-form CJS
  // (react external) and gets wrapped in the module-loader facade.
  {
    entry: "plugins/subscriptions/src/index.ts",
    outfile: "plugins/subscriptions/lib/index.js",
    external: ["@deepseek-ai/*", "node:*", "lz4"],
    wrap: {
      client: "plugins/subscriptions/src/client.tsx",
      outfile: "plugins/subscriptions/lib/client.js",
      id: "subscriptions",
    },
  },
  // session-archive: archived-session cleanup panel CLIENT plugin package.
  // The host half bundles via esbuild; the client half bundles as factory-form
  // CJS (react external) and gets wrapped in the module-loader facade.
  {
    entry: "plugins/session-archive/src/index.ts",
    outfile: "plugins/session-archive/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/session-archive/src/client.tsx",
      outfile: "plugins/session-archive/lib/client.js",
      id: "session-archive",
    },
  },

  // log-viewer: dsh-web server log viewer panel CLIENT plugin package.
  // The host half bundles via esbuild; the client half bundles as factory-form
  // CJS (react external) and gets wrapped in the module-loader facade.
  {
    entry: "plugins/log-viewer/src/index.ts",
    outfile: "plugins/log-viewer/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/log-viewer/src/client.tsx",
      outfile: "plugins/log-viewer/lib/client.js",
      id: "log-viewer",
    },
  },

  // job-viewer: background job output buffer, replacement job_list/job_output/
  // job_kill tools, the /job-viewer/output and /job-viewer/kill routes, and
  // completion delivery (host). The client half is the replacement dropdown
  // and output modal. Same esbuild/wrapClientBundle split as log-viewer.
  {
    entry: "plugins/job-viewer/src/index.ts",
    outfile: "plugins/job-viewer/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    wrap: {
      client: "plugins/job-viewer/src/client.tsx",
      outfile: "plugins/job-viewer/lib/client.js",
      id: "job-viewer",
    },
  },
  // W8/W13 family: H2+H3 tool-render CLIENT plugin package. The client half
  // bundles as factory-form CJS (highlight.js inlined; the browser loader
  // table cannot resolve npm deps) and gets wrapped in the module-loader
  // facade. react and @deepseek-ai stay external. The host half bundles
  // via esbuild like the TS plugins.
  // Why the wrapper asymmetry (review nit, 2026-08-22): the client halves
  // bundle CJS with npm deps inlined, so esbuild's CJS output needs the
  // module-loader facade with Symbol.toStringTag to expose a shape the loader
  // accepts. The facade form exists because esbuild cannot emit a bare load
  // call around an inlined bundle without it; every client half with npm deps
  // goes through it.
  {
    wrapOnly: {
      client: "plugins/tool-render/src/client.tsx",
      outfile: "plugins/tool-render/dist/client.js",
      id: "tool-render",
    },
  },
  // The banner is load-bearing, same as bash-guard/mcp-servers: guard.ts
  // imports yaml, whose composer guards a feature check with
  // `require("process")` (a bare specifier, not `node:process`), which the
  // `node:*` external pattern does not match. esbuild inlines its __require
  // shim for that call, and the shim throws in ESM output because no `require`
  // binding exists. Restoring a real `require` through createRequire satisfies
  // the shim. Without this the whole plugin tree fails to load and dsh does
  // not boot (Dynamic require of "process" is not supported).
  {
    entry: "plugins/tool-render/src/index.ts",
    outfile: "plugins/tool-render/dist/index.js",
    external: ["@deepseek-ai/*", "node:*"],
    // banner: the shim story every banner stanza shares, told
    // once in requireBanner at the loop below.
    banner: true,
  },

  // W6: profiles-client CLIENT plugin package. The seat and title rewriter
  // live in the browser half; the host half bundles via esbuild. The browser
  // half bundles as factory-form CJS through the module-loader facade like the
  // other client halves: it now has npm deps (@dnd-kit), which a plain IIFE
  // cannot carry — any React-importing dep inlines a top-level __require shim
  // that throws at evaluation before __ModuleLoader__.load runs, so the bundle
  // would load without registering (green build, vanished panel).
  {
    wrapOnly: {
      client: "plugins/profiles-client/src/client.tsx",
      outfile: "plugins/profiles-client/dist/client.js",
      id: "profiles-client",
    },
  },
  {
    entry: "plugins/profiles-client/src/index.ts",
    outfile: "plugins/profiles-client/lib/index.js",
    external: ["@deepseek-ai/*", "node:*"],
  },
];

// The createRequire banner itself, shared by every banner row: the shim
// inside the bundled code calls require() with a bare specifier, which the
// "node:*" external pattern does not match, so esbuild inlines a __require
// shim that throws in ESM output without a real require to satisfy it. The
// three stanzas that need it say so in their row prose above. 
const requireBannerJs = [
  'import { createRequire as __dshCreateRequire } from "node:module";',
  "const require = __dshCreateRequire(import.meta.url);",
].join("\n");

for (const stanza of hostStanzas) {
  if (stanza.entry !== undefined) {
    await build({
      entryPoints: [join(here, stanza.entry)],
      bundle: true,
      platform: "node",
      format: "esm",
      external: stanza.external,
      ...(stanza.banner === true
        ? { banner: { js: requireBannerJs } }
        : {}),
      outfile: join(here, stanza.outfile),
      logLevel: "info",
    });
  }
  if (stanza.wrap !== undefined && stanza.entry !== undefined) {
    await wrapClientBundle(
      join(here, stanza.wrap.client),
      join(here, stanza.wrap.outfile),
      stanza.wrap.id,
    );
  }
  if (stanza.wrapOnly !== undefined) {
    const w = stanza.wrapOnly;
    await wrapClientBundle(
      join(here, w.client),
      join(here, w.outfile),
      w.id,
    );
  }
}

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
