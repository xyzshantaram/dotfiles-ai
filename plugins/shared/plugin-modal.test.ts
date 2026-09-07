/**
 * The shared modal's structural contract.
 *
 * Modal consistency is enforced by the shared component, not by review of
 * each caller, so these are source-level drift tests: the two standard sizes
 * live in exactly one stylesheet, the actions row is right-aligned there, the
 * callers pick a size and nothing else, and the built client bundles carry
 * the same rules the sources do.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const plugins = dirname(here);

const read = (relative: string) => readFileSync(join(plugins, relative), "utf8");

const css = read("shared/plugin-modal.module.css");
const tsx = read("shared/plugin-modal.tsx");
const dts = read("shared/plugin-modal.d.ts");

/**
 * Source with its comments removed. These are source-level drift tests, so
 * they must read the CODE: a comment that merely mentions a class name (this
 * file's own explanations do) is not a rule and not a lookup.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The declaration block of the first rule whose selector text matches. */
function ruleBlock(sheet: string, selector: string): string {
  const at = sheet.indexOf(selector);
  expect(at, "selector not found: " + selector).toBeGreaterThan(-1);
  const open = sheet.indexOf("{", at);
  const close = sheet.indexOf("}", open);
  return sheet.slice(open + 1, close);
}

describe("shared modal: two standard sizes", () => {
  it("the full size is the settings-panel spec, on the base panel rule", () => {
    const panel = ruleBlock(css, ".plugin-modal-panel {");
    expect(panel).toContain("width: 800px;");
    expect(panel).toContain("max-width: calc(100vw - 48px);");
    expect(panel).toContain("height: min(800px, 100vh - 48px);");
  });

  it("the compact size is the aidos spec", () => {
    const compact = ruleBlock(css, '.plugin-modal-panel[data-size="compact"]');
    expect(compact).toContain("width: 420px;");
    expect(compact).toContain("max-width: 100%;");
    expect(compact).toContain("max-height: 100%;");
    expect(compact).toContain("height: auto;");
  });

  it("sizes are capped against a mask safe box, so compact's 100% is inset", () => {
    const mask = ruleBlock(css, ".plugin-modal-mask {");
    expect(mask).toContain("padding: 24px;");
    expect(mask).toContain("box-sizing: border-box;");
  });

  it("the body scrolls and the panel never does", () => {
    const panel = ruleBlock(css, ".plugin-modal-panel {");
    expect(panel).toContain("overflow: hidden;");
    const body = ruleBlock(css, ".plugin-modal-body {");
    expect(body).toContain("overflow-y: auto;");
    // A flex column body is what gives a caller's `flex: 1` region (the
    // job-viewer output box) its constant height.
    expect(body).toContain("display: flex;");
    expect(body).toContain("flex-direction: column;");
  });

  it("exactly two size values exist in the stylesheet", () => {
    const sizes = Array.from(css.matchAll(/\[data-size="([a-z]+)"\]/g)).map((m) => m[1]);
    expect(Array.from(new Set(sizes)).sort()).toEqual(["compact"]);
  });

  it("the component folds every accepted size onto one of the two", () => {
    expect(tsx).toContain('return size === "compact" ? "compact" : "full";');
    // No per-caller sizing escape hatch on the props.
    for (const escape of ["width?", "height?", "className?", "style?", "maxWidth?"]) {
      expect(tsx).not.toContain(escape);
    }
  });
});

describe("shared modal: action buttons are right-aligned structurally", () => {
  it("the actions row aligns to the end in the shared stylesheet", () => {
    const actions = ruleBlock(css, ".plugin-modal-actions,");
    expect(actions).toContain("justify-content: flex-end;");
  });

  it("the component owns the row, so callers pass buttons only", () => {
    expect(tsx).toContain('<div className="plugin-modal-actions">{actions}</div>');
    // `footer` stays accepted, and lands in the same right-aligned row.
    expect(tsx).toContain("props.footer");
  });

  it("no caller re-aligns or re-sizes the shared modal from its own sheet", () => {
    for (const sheet of [
      "composer-approvals/src/client.module.css",
      "job-viewer/src/client.module.css",
    ]) {
      expect(code(read(sheet)), sheet).not.toContain("plugin-modal");
    }
  });
});

describe("shared modal: the stylesheet actually reaches the page", () => {
  it("class names are the literal global names, not an index into CSS text", () => {
    // build.mjs loads .css as TEXT, so an indexed lookup yields undefined.
    expect(code(tsx)).not.toMatch(/\w+\["plugin-modal-/);
    expect(tsx).toContain('className="plugin-modal-panel"');
    expect(tsx).toContain('className="plugin-modal-mask"');
  });

  it("the component injects its own sheet once", () => {
    expect(tsx).toContain('import { injectStyle } from "./client-util";');
    expect(tsx).toContain("injectStyle(STYLE_OWNER, STYLE_ID, modalCss);");
  });
});

describe("shared modal: callers and their built bundles", () => {
  it("job-viewer takes the full size and the shared actions row", () => {
    const client = read("job-viewer/src/client.tsx");
    expect(client).toContain('size="full"');
    expect(client).toContain("actions={");
    // The output area keeps its constant height.
    expect(read("job-viewer/src/client.module.css")).toContain("flex: 1;");
    // Heading rules: "Job output" heading, command in a monospace body line.
    expect(client).toContain('title="Job output"');
    expect(client).toContain('className="jv-command"');
  });

  it("composer-approvals takes the compact size", () => {
    expect(read("composer-approvals/src/client.tsx")).toContain('size="compact"');
  });

  it("the built client bundles mirror the shared source", () => {
    for (const bundle of ["composer-approvals/lib/client.js", "job-viewer/lib/client.js"]) {
      const built = read(bundle);
      expect(built, bundle).toContain("width: 420px;");
      expect(built, bundle).toContain("justify-content: flex-end;");
      expect(built, bundle).toContain('className: "plugin-modal-panel"');
      expect(code(built), bundle).not.toMatch(/\w+\["plugin-modal-/);
    }
    expect(read("job-viewer/lib/client.js")).toContain('"data-size": size');
  });

  it("the type definitions stay in step with the component", () => {
    expect(dts).toContain('export type PluginModalSize = "full" | "compact" | "default";');
    expect(dts).toContain("actions?: any;");
    expect(dts).toContain("footer?: any;");
    expect(dts).toContain("size?: PluginModalSize;");
  });
});
