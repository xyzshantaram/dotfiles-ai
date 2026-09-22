/**
 * Wiring pins for the #173 swap, stage one. The five old bash test files
 * stay untouched: this file pins only the properties the new wiring in
 * client.tsx depends on. Shell-provided modules (react, the client-ui
 * primitives) are mocked; everything else is the real code, including the
 * client entry itself, so these tests fail if the wiring drifts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  default: {
    createElement: (...args: unknown[]) => ({ args }),
    Fragment: "fragment",
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  },
}));
vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  IconBrowseOutline16: () => null,
  IconEditOutline16: () => null,
  IconApiOutline14: () => null,
  IconChevronDownOutline14: () => null,
  IconInspectOutline12: () => null,
  IconChecklistOutline14: () => null,
  IconPlayOutline16: () => null,
  IconQuestionOutline14: () => null,
  IconAgentPresetOutline16: () => null,
  IconStopFill16: () => null,
  MarkdownText: () => null,
}));
// Stylesheets ship as strings through the build's css-text plugin; under
// vitest they are unreadable, so they are mocked out here. The strip test
// below reads the real file off disk instead, which is the stronger pin.
vi.mock("./client.module.css", () => ({ default: "" }));
vi.mock("./bash-graph/styles.css", () => ({ default: "" }));

import {
  bashGraphCacheKey,
  ensureBashGraphMeasure,
  getBashGraphPanels,
  stripBashGraphRoot,
  toggleBashGraphBlock,
} from "./client";
import { installStub } from "./bash-graph/geometry.stub.js";

/** Minimal fake document that records measurer creation. */
function fakeDocument(existing: boolean): { doc: any; created: { n: number } } {
  const created = { n: 0 };
  const store: Record<string, any> = {};
  if (existing) store["measure"] = { id: "measure" };
  const doc: any = {
    querySelector: (sel: string) => {
      if (sel === "#measure") return store["measure"] || null;
      return null;
    },
    createElement: (tag: string) => ({
      tag,
      id: "",
      setAttribute: () => {},
      appendChild: () => {},
    }),
    getElementById: (id: string) => store[id] || null,
    body: {
      appendChild: (el: any) => {
        created.n++;
        if (el && el.id) store[el.id] = el;
      },
    },
    documentElement: {},
  };
  return { doc, created };
}

function withDocument(doc: any, fn: () => void): void {
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  g.document = doc;
  try {
    fn();
  } finally {
    g.document = prev;
  }
}

describe("bash wiring: the measurer element", () => {
  it("creates one shared #measure when absent, and reuses it after", () => {
    const { doc, created } = fakeDocument(false);
    withDocument(doc, () => {
      expect(ensureBashGraphMeasure()).toBe(true);
      expect(ensureBashGraphMeasure()).toBe(true);
    });
    expect(created.n).toBe(1);
    expect(doc.querySelector("#measure")).not.toBeNull();
  });

  it("creates nothing when the element already exists", () => {
    const { doc, created } = fakeDocument(true);
    withDocument(doc, () => {
      expect(ensureBashGraphMeasure()).toBe(true);
    });
    expect(created.n).toBe(0);
  });

  it("returns false without a document instead of throwing", () => {
    const g = globalThis as { document?: unknown };
    const prev = g.document;
    g.document = undefined;
    try {
      expect(ensureBashGraphMeasure()).toBe(false);
    } finally {
      g.document = prev;
    }
  });
});

describe("bash wiring: the stylesheet", () => {
  it("ships no :root value blocks, and the strip still guards the injection", () => {
    // The prototype :root stand-ins were deleted from the source (#336: the
    // page never saw them — the strip dropped them at runtime). The strip
    // stays as a guard, pinned against a synthetic fixture rather than the
    // file, so a future :root addition cannot leak page-wide token values.
    // (Comment-aware: the file's own history note names the selector.)
    const css = readFileSync(new URL("./bash-graph/styles.css", import.meta.url), "utf8");
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toContain(":root");
    const stripped = stripBashGraphRoot(css);
    expect(stripped).toContain(".prim-node");
    expect(stripped).toContain("#measure");

    /*
     * THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG, and the reason the three
     * above did not. This file carries no :root VALUE block, so the strip
     * must be a byte-for-byte NO-OP on it. It was not: the unanchored pattern
     * matched the word ":root" inside this file's OWN history comment, then
     * `[^{]*` ran to the next `{` and `[^}]*\}` swallowed to the next `}` —
     * deleting 1347 bytes ending in the base `.prim-panel` rule. That rule
     * carries `background: var(--dsw-alias-bg-base)`, so every bash-graph
     * panel rendered with no background while the source was provably fine.
     *
     * `.prim-node` and `#measure` both survived that deletion, which is
     * precisely why containment checks could not see it. Equality can.
     */
    expect(stripped).toBe(css);

    // Name the casualty too, so a future over-match that spares most of the
    // file but eats this one rule still fails loudly rather than silently.
    expect(stripped).toMatch(/\.prim-panel\{[^}]*background:\s*var\(--dsw-alias-bg-base\)/);

    const fixture = ':root{--x:1;}html[data-theme="light"]{--y:2;}.prim-node{color:red;}';
    const cleaned = stripBashGraphRoot(fixture);
    expect(cleaned).not.toContain(":root");
    expect(cleaned).not.toContain("data-theme");
    expect(cleaned).toContain(".prim-node");

    // A dark block leaks token values exactly as a light one does.
    const darkFixture = 'html[data-theme="dark"] {--y:2;}.prim-node{color:red;}';
    expect(stripBashGraphRoot(darkFixture)).not.toContain("data-theme");
    expect(stripBashGraphRoot(darkFixture)).toContain(".prim-node");

    /*
     * The regression fixture: ":root" in PROSE, followed by a real rule.
     * Prose never sits at a rule boundary, so an anchored pattern cannot
     * match it, and the rule after it must survive untouched.
     */
    const prose = "/* :root blocks used to live here and were deleted */\n.prim-panel{background:red;}";
    expect(stripBashGraphRoot(prose)).toBe(prose);
  });
});

describe("bash wiring: panels through the real entry", () => {
  it("renders panels for a pipeline and none for blank input", () => {
    const restore = installStub();
    try {
      expect(getBashGraphPanels("a | b", undefined).length).toBeGreaterThan(0);
      expect(getBashGraphPanels("   ", undefined)).toEqual([]);
      expect(getBashGraphPanels("", undefined)).toEqual([]);
    } finally {
      restore();
    }
  });

  it("keys the cache by command plus stages", () => {
    expect(bashGraphCacheKey("a | b", undefined)).toBe("a | b\n");
    expect(bashGraphCacheKey("a | b", [{ name: "b", exitCode: 0 }])).toBe(
      'a | b\n[{"name":"b","exitCode":0}]',
    );
  });

  it("escapes hostile text at the HTML boundary", () => {
    const restore = installStub();
    try {
      const html = getBashGraphPanels('echo "<img src=x onerror=alert(1)>" | cat', undefined).join(
        "\n",
      );
      expect(html).toContain("&lt;img");
      expect(html).not.toContain("<img");
      // The text itself survives verbatim (inert): escaping must not eat it.
      expect(html).toContain("onerror=alert(1)");
      const hd = getBashGraphPanels("cat <<EOF\n'<b>' & \"amp\"\nEOF", undefined).join("\n");
      expect(hd).toContain("&lt;b&gt;");
      expect(hd).not.toContain("<b>");
    } finally {
      restore();
    }
  });

  it("shows exit codes only when stages arrive", () => {
    const restore = installStub();
    try {
      const coded = getBashGraphPanels(
        "a | b",
        [
          { name: "a", exitCode: 0 },
          { name: "b", exitCode: 2 },
        ],
      ).join("\n");
      expect(coded).toContain("exit 0");
      expect(coded).toContain("exit 2");
      const plain = getBashGraphPanels("a | b", undefined).join("\n");
      expect(plain).not.toContain("exit 0");
      expect(plain).not.toContain("exit 2");
    } finally {
      restore();
    }
  });

  it("every expand button has a matching hidden block", () => {
    const restore = installStub();
    try {
      const longArg = 'git commit -m "' + "x".repeat(100) + '" | tail -2';
      const html = getBashGraphPanels("cat <<EOF\nhello\nEOF", undefined)
        .concat(getBashGraphPanels(longArg, undefined))
        .join("\n");
      const hdKeys = [...html.matchAll(/data-hd="([^"]+)"/g)].map((m) => "hd-" + m[1]);
      const argKeys = [...html.matchAll(/data-arg="([^"]+)"/g)].map((m) => "arg-" + m[1]);
      expect(hdKeys.length + argKeys.length).toBeGreaterThan(0);
      const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
      for (const k of hdKeys.concat(argKeys)) expect(ids.has(k)).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("bash wiring: the expand toggle", () => {
  function fakeButton(attrs: Record<string, string | null>): any {
    const store: Record<string, string> = {};
    return {
      getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
      setAttribute: (k: string, v: string) => {
        store[k] = v;
      },
      read: (k: string) => store[k],
    };
  }

  function fakeBlock(hidden: boolean): any {
    return {
      hidden,
      hasAttribute: function (k: string) {
        return k === "hidden" ? this.hidden : false;
      },
      removeAttribute: function () {
        this.hidden = false;
      },
      setAttribute: function () {
        this.hidden = true;
      },
    };
  }

  it("expands a heredoc block and collapses it again", () => {
    const block = fakeBlock(true);
    const doc: any = { getElementById: (id: string) => (id === "hd-0_1" ? block : null) };
    const btn = fakeButton({ "data-hd": "0_1" });
    expect(toggleBashGraphBlock(doc, btn)).toBe(true);
    expect(block.hidden).toBe(false);
    expect(btn.read("aria-expanded")).toBe("true");
    expect(toggleBashGraphBlock(doc, btn)).toBe(true);
    expect(block.hidden).toBe(true);
    expect(btn.read("aria-expanded")).toBe("false");
  });

  it("resolves arg buttons through the arg id space", () => {
    const block = fakeBlock(true);
    const doc: any = { getElementById: (id: string) => (id === "arg-a0_0" ? block : null) };
    const btn = fakeButton({ "data-hd": null, "data-arg": "a0_0" });
    expect(toggleBashGraphBlock(doc, btn)).toBe(true);
    expect(block.hidden).toBe(false);
  });

  it("returns false on an unknown target instead of throwing", () => {
    const doc: any = { getElementById: () => null };
    expect(toggleBashGraphBlock(doc, fakeButton({ "data-hd": "9_9" }))).toBe(false);
    expect(toggleBashGraphBlock(doc, fakeButton({}))).toBe(false);
    expect(toggleBashGraphBlock(null, fakeButton({ "data-hd": "0_1" }))).toBe(false);
  });
});
