/**
 * Source-order pins for the run_code card's section layout (#152, Part C).
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. There is no jsdom/React harness in this
 * repo, so nothing here renders anything: these are assertions about source
 * text. They cannot tell you the card LOOKS right. What they can do is catch
 * the regressions that would otherwise be invisible in review, because the
 * card still renders perfectly well when it is wrong: nesting a section back
 * INSIDE the card (output stranded above every nested call, the exact layout
 * the owner rejected), collapsing the
 * order values so nested calls land outside the TOOL CALLS label, showing an
 * empty TOOL CALLS heading on a card with no nested calls, or rendering an
 * OUT section for empty output — all with no error, no test failure, and no
 * visual clue on a card that has no nested calls.
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

describe("run_code sections are SIBLINGS of the card, not its footer", () => {
  it("passes no below footer, so nothing is nested inside the card", () => {
    // The whole layout depends on this. toolRenderRow has no `below` option
    // at all (deleted: it was unused since Part C), so a section can only
    // ever be a sibling — but if one comes back, RunCodeRow must not feed it.
    expect(runCodeRowBody()).not.toContain("below:");
    expect(runCodeRowBody()).not.toContain("options.below");
    expect(tsx).not.toContain("options.below");
  });

  it("returns the head and all three sections as siblings", () => {
    const body = runCodeRowBody();
    expect(body).toContain("var card = toolRenderRow(");
    // A fragment puts every node into upstream's single call-row div alongside
    // the nested-call container, which is what makes ordering possible at all.
    expect(body).toMatch(
      /<>[\s\S]*\{card\}[\s\S]*\{inSection\}[\s\S]*\{callsLabel\}[\s\S]*\{outSection\}[\s\S]*<\/>/,
    );
  });

  it("the head row is not expandable: the code lives in IN now", () => {
    // An expandable head with a null body would offer a disclosure that opens
    // onto nothing; the sections below carry their own disclosures.
    expect(runCodeRowBody()).toContain("expandable: false");
  });

  it("marks every section so the CSS can find it", () => {
    const body = runCodeRowBody();
    expect(body).toContain("tool-render-runcode-in");
    expect(body).toContain("tool-render-runcode-calls-label");
    expect(body).toContain("tool-render-runcode-out");
    expect(body).toContain("runCode: true");
  });

  it("the card root actually emits the marker attribute", () => {
    // Without this the :has() selector matches nothing and the layout silently
    // falls back to DOM order.
    expect(tsx).toContain("data-run-code={options.runCode || undefined}");
  });

  it("renders no OUT section for empty output — never '0 lines'", () => {
    // runCodeOutputText's null contract (sentinel, blank-only, empty) is
    // pinned in run-code.test.ts; here the gate itself is pinned, so a future
    // edit cannot keep the derivation while dropping the suppression.
    expect(runCodeRowBody()).toMatch(/if\s*\(\s*outText\s*!==\s*null\s*\)/);
  });

  it("both spoilers start collapsed, with no silent empty disclosure", () => {
    const body = runCodeRowBody();
    expect(body).toContain("inOpenState = useState(false)");
    expect(body).toContain("outUserState = useState(null)");
  });
});

describe("a failed run stays legible (C5)", () => {
  it("OUT opens by default on error, user-overridable, so live failures open too", () => {
    // Mount-only `useState(isError)` would leave a call that settles into an
    // error live collapsed behind its spoiler. The derivation below defaults
    // open on error and only a user toggle overrides it.
    expect(runCodeRowBody()).toContain("outUser === null ? isError === true : outUser");
  });

  it("the collapsed head row still reports the error", () => {
    // Even with OUT closed by the user's own toggle, the head line carries the
    // failure — never a collapsed spoiler with no hint.
    expect(runCodeRowBody()).toContain("errorSummary: errorSummary");
  });

  it("the collapsed OUT spoiler itself carries the error mark", () => {
    expect(runCodeRowBody()).toMatch(/runCodeSpoiler\(outOpen,[\s\S]*state === "error"/);
    expect(css).toMatch(/\.tool-render-runcode-spoiler\[tool-render-error\]/);
  });
});

describe("the five siblings are ordered head -> IN -> TOOL CALLS -> nested -> OUT", () => {
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

  it("assigns all five orders, with the nested calls under the label", () => {
    expect(css).toMatch(/\.tool-render-card\[data-run-code\]\s*\{\s*order: 0/);
    expect(css).toMatch(/\.tool-render-runcode-in\s*\{\s*order: 1/);
    expect(css).toMatch(/\.tool-render-runcode-calls-label\s*\{\s*order: 2/);
    expect(css).toMatch(/\*:not\(\[data-slot\]\)\s*\{\s*order: 3/);
    expect(css).toMatch(/\.tool-render-runcode-out\s*\{\s*order: 4/);
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

  it("hides the TOOL CALLS label when the row has no nested container", () => {
    // Whether nested calls exist is unknowable from our props — upstream
    // renders them outside our view — so the label always renders and the row
    // hides it when it carries no non-wrapper child. The hide direction
    // matters: if a future edit drops the wrapper-exclusion step, every plain
    // card gains an empty heading LOUDLY instead of silently misordering.
    expect(css).toContain(":not(:has(> *:not([data-slot])))");
    expect(css).toMatch(
      /:not\(:has\(>\s*\*:not\(\[data-slot\]\)\)\)[\s\S]*?\.tool-render-runcode-calls-label\s*\{\s*display:\s*none/,
    );
  });

  it("long output keeps internal scrolling with the full text in the DOM", () => {
    // No clamping, no elision: the 150px cap mirrors upstream .ioSection.
    expect(css).toMatch(/\.tool-render-output\.tool-render-code-out-text\s*\{\s*max-height:\s*9\.375rem/);
  });
});
