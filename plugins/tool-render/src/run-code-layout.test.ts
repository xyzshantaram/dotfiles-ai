/**
 * Source-order pins for the run_code card's nesting layout (#152).
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. There is no jsdom/React harness in this
 * repo, so nothing here renders anything: these are assertions about source
 * text. They cannot tell you the card LOOKS right. What they can do is catch
 * the one regression that would otherwise be invisible in review, because the
 * card still renders perfectly well when it is wrong: moving the OUT block
 * back INSIDE the card via toolRenderRow's `below` option. That produces
 * head/OUT/nested instead of head/nested/OUT -- output stranded above every
 * nested call, the exact layout the owner rejected -- with no error, no test
 * failure, and no visual clue in a card that has no nested calls.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = readFileSync(join(here, "client.tsx"), "utf8");
const css = readFileSync(join(here, "client.module.css"), "utf8");

/** The RunCodeRow function body, so a match elsewhere in the file cannot pass. */
function runCodeRowBody(): string {
  const start = tsx.indexOf("function RunCodeRow(");
  expect(start).toBeGreaterThan(-1);
  const end = tsx.indexOf("\nfunction ", start + 1);
  expect(end).toBeGreaterThan(start);
  return tsx.slice(start, end);
}

describe("run_code output is a SIBLING of the card, not its footer", () => {
  it("passes below: null, so nothing is nested inside the card", () => {
    // The whole layout depends on this. `below: below` would render the output
    // inside the card, above the nested calls.
    expect(runCodeRowBody()).toContain("below: null");
  });

  it("returns the card and the output as two siblings", () => {
    const body = runCodeRowBody();
    expect(body).toContain("var card = toolRenderRow(");
    // A fragment puts both nodes into upstream's single call-row div alongside
    // the nested-call container, which is what makes ordering possible at all.
    expect(body).toMatch(/<>[\s\S]*\{card\}[\s\S]*\{below\}[\s\S]*<\/>/);
  });

  it("marks both halves so the CSS can find them", () => {
    expect(runCodeRowBody()).toContain("tool-render-runcode-out");
    expect(runCodeRowBody()).toContain("runCode: true");
  });

  it("the card root actually emits the marker attribute", () => {
    // Without this the :has() selector matches nothing and the layout silently
    // falls back to DOM order.
    expect(tsx).toContain("data-run-code={options.runCode || undefined}");
  });
});

describe("the three siblings are ordered head -> nested -> out", () => {
  const scope =
    'div[data-chat-call-id]:has(> [data-slot="tool.call.toolview"] > .tool-render-card[data-run-code])';

  it("selects THROUGH the renderer's slot wrapper", () => {
    // The regression that actually shipped. The renderer wraps every slot entry
    // in <div data-slot="tool.call.toolview" style="display:contents">, so our
    // card is a GRANDchild of the call row, and the obvious
    // `:has(> .tool-render-card[data-run-code])` matches nothing -- silently,
    // with no error and no visual clue beyond the layout simply not happening.
    // Measured in the live DOM: selectorMatches was false while ruleLoaded was
    // true. Any future edit that drops the wrapper step reintroduces exactly
    // that failure, so pin the wrapper, not just the order values.
    expect(css).toContain('[data-slot="tool.call.toolview"] > .tool-render-card[data-run-code]');
    expect(css).not.toMatch(/:has\(>\s*\.tool-render-card\[data-run-code\]\)/);
  });

  it("the call row is a flex column, or order does nothing", () => {
    const rule = css.slice(css.indexOf(scope));
    expect(css.indexOf(scope)).toBeGreaterThan(-1);
    expect(rule).toContain("flex-direction: column");
  });

  it("assigns all three orders, with the nested calls in the middle", () => {
    expect(css).toMatch(/\.tool-render-card\[data-run-code\]\s*\{\s*order: 0/);
    expect(css).toMatch(/\*:not\(\[data-slot\]\)\s*\{\s*order: 1/);
    expect(css).toMatch(/\.tool-render-runcode-out\s*\{\s*order: 2/);
  });

  it("selects the nested container by exclusion, never by a hashed class", () => {
    // upstream's .subCalls class is content-hashed and turns over every build,
    // so naming it in a selector would break at the next release. Comments are
    // stripped first: the prose above the rule names the class deliberately,
    // and an assertion that cannot tell a selector from its own rationale is
    // worse than no assertion -- it fails on documentation.
    const selectorsOnly = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(selectorsOnly).not.toContain("subCalls");
  });
});
