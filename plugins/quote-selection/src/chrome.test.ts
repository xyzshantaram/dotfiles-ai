/**
 * Chrome pins for the quote-selection takeover (#155).
 *
 * WHY SOURCE ASSERTIONS: this repo has no DOM harness, so what the pure
 * tests in ./quote.test.ts cannot reach — the slot the entry registers in,
 * the DOM hook the containment predicate reads, the listeners that arm and
 * dismiss the button, and the composer write path — is pinned here against
 * the source text, the same precedent as
 * plugins/user-bubble/src/chrome.test.ts. These assertions are deliberately
 * NARROW: they pin only the properties whose violation reproduces a reported
 * or ticket-named defect class, never style or wording.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = readFileSync(join(here, "client.tsx"), "utf8");
const css = readFileSync(join(here, "client.module.css"), "utf8");
const host = readFileSync(join(here, "index.ts"), "utf8");
const mine = readFileSync(join(here, "quote.ts"), "utf8");
const patch = readFileSync(join(here, "..", "cordis.patch.yml"), "utf8");
const manifest = readFileSync(join(here, "..", "package.json"), "utf8");
const durable = readFileSync(join(here, "..", "..", "durable-todos", "src", "client.tsx"), "utf8");

describe("quote-selection composition: the button lives where the composer API is", () => {
  it("registers in an input-zone slot that receives inputActions, never in chat.node", () => {
    // chat.node entries get no inputActions and no sessionId (#148), so a
    // per-message button there could never write the composer.
    expect(tsx).toContain("conversation.input.dock");
    expect(tsx).not.toContain("conversation.chat.node");
  });

  it("writes through the composer API, reading the live draft first", () => {
    expect(tsx).toContain("inputActions.setDraft");
    expect(tsx).toContain("useInput");
    expect(tsx).toContain("appendToDraft(draft");
  });

  it("the host half is a registration stub: all behaviour is the client bundle", () => {
    expect(host).toContain('name = "quote-selection"');
    expect(tsx).toContain('PLUGIN_NAME = "quote-selection"');
  });

  it("is registered the way the repo registers plugins", () => {
    expect(patch).toContain("id: quote-selection");
    expect(manifest).toContain('"quote-selection"');
    expect(manifest).toContain('"./lib/client.js"');
  });
});

describe("quote-selection containment: assistant rows only, by shipped contract", () => {
  it("reads the shipped row kind, not a bubble or markdown class name", () => {
    // data-chat-flow-kind is stamped by the conversation view itself and read
    // by its own scroll code: a load-bearing contract, not a hashed class.
    expect(tsx).toContain("data-chat-flow-kind");
    expect(tsx).toContain("isAssistantFlowKind");
  });

  it("names no bubble, takeover, or upstream class: restyling bubbles cannot break it", () => {
    expect(tsx).not.toContain("user-bubble");
    expect(tsx).not.toContain("MarkdownText");
    expect(mine).not.toContain("user-bubble");
  });

  it("requires both selection ends in the same row", () => {
    expect(tsx).toContain("anchorRow !== focusRow");
  });
});

describe("quote-selection conduct: never fights the native selection", () => {
  it("tracks the selection without touching it, and clicks without collapsing it", () => {
    expect(tsx).toContain("selectionchange");
    expect(tsx).toContain("preventDefault");
  });

  it("dismisses on collapse, Escape, and scroll", () => {
    expect(tsx).toContain("isCollapsed");
    expect(tsx).toContain("Escape");
    expect(tsx).toContain('"scroll"');
  });

  it("quoting renders a markdown blockquote, fenced inside code", () => {
    expect(tsx).toContain("toBlockquote(");
    expect(tsx).toContain('closest("pre")');
  });

  it("the button is fixed-position and renders only while armed", () => {
    expect(tsx).toContain("fixed");
    expect(tsx).toContain("if (quote === null) return null;");
    expect(css).toContain(".quote-selection-float");
    expect(css).toContain("position: fixed;");
  });
});

describe("quote-selection append contract: no second appendToDraft to drift", () => {
  // durable-todos owns the append semantics; this plugin reuses them by
  // contract. Both snippets below must stay identical: if either side edits
  // its copy, this fails and forces the two back in sync.
  const SNIPPETS = ['existing.replace(/\\s+$/, "")', 'trimmed + "\\n\\n" + addition'];

  it("durable-todos still carries the canonical implementation", () => {
    for (const snippet of SNIPPETS) expect(durable).toContain(snippet);
  });

  it("this plugin's copy matches it line for line", () => {
    for (const snippet of SNIPPETS) expect(mine).toContain(snippet);
  });
});
