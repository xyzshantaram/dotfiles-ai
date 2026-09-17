/**
 * Chrome pins for the user-bubble takeover (#125).
 *
 * WHY A CSS TEST AT ALL, when pixel geometry is not testable: exactly one
 * property in this stylesheet is load-bearing rather than cosmetic, and it
 * shipped wrong. The actions row (clock + copy) is a SIBLING of the bubble
 * stack, so the parent's axis decides whether the clock sits BELOW the
 * message or BESIDE it — and beside it, in a right-aligned row, it displaces
 * every bubble leftward by the width of the clock. The owner reported exactly
 * that on 2026-09-17. Nothing about that failure is visible in a unit test of
 * the text model, and nothing in the JSX looks wrong: the bug is one CSS
 * keyword. So it gets a pin.
 *
 * These assertions are deliberately NARROW. They do not police colour, font,
 * spacing or anything else a designer may reasonably change; re-styling this
 * bundle must not have to argue with a test. They cover only the two rules
 * whose violation reproduces a reported defect.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "client.module.css"), "utf8");
const tsx = readFileSync(join(here, "client.tsx"), "utf8");
const host = readFileSync(join(here, "index.ts"), "utf8");

/** The declarations of one rule, by selector, with comments stripped. */
function ruleBlock(selector: string): string {
  const start = css.indexOf(selector + " {");
  expect(start, "missing rule: " + selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("user-bubble chrome: the clock sits below the message, not beside it", () => {
  it("the row is a COLUMN, which is what puts the actions row underneath", () => {
    const row = ruleBlock(".user-bubble-row");
    expect(row).toContain("flex-direction: column;");
    // The failure mode was a horizontal row packing its children to the end.
    // If that returns, the clock steals width from the bubble again.
    expect(row).not.toContain("justify-content: flex-end;");
  });

  it("the actions row is a sibling of the stack, so the axis above decides its position", () => {
    // This is the structural fact that makes the pin above meaningful: were
    // the actions nested INSIDE the stack, the row's axis would not matter
    // and the test would be pinning nothing.
    const row = tsx.indexOf('className="user-bubble-row"');
    const stackClose = tsx.indexOf("</div>", tsx.indexOf('className="user-bubble-stack"'));
    const actions = tsx.indexOf("<BubbleActions", row);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(actions).toBeGreaterThan(stackClose);
  });

  it("the actions row reserves its height, so hovering a message moves nothing", () => {
    const actions = ruleBlock(".user-bubble-actions");
    // The row is opacity-0 until hover; without a height of its own the page
    // would reflow under the pointer.
    expect(actions).toContain("height: 28px;");
    expect(actions).toContain("opacity: 0;");
  });
});

describe("user-bubble composition: one text flow with chips inline (#148)", () => {
  // Defect B was the alternating-renderer composition: each segment became
  // either a block-level MarkdownText or an inline chip span, so
  // text/chip/text rendered as block, span, block and every chip cost a
  // line break. The fix renders the whole body through ONE MarkdownText
  // with chips encoded inside the source. These pins fail against the old
  // composition (it mapped segments to alternating renderers) and pass on
  // the single flow — so the stacking defect cannot return silently.
  it("does not map segments to alternating renderers", () => {
    // The old shape: segments.map(...) choosing MarkdownText for text and
    // RefChip for refs. Any return of per-segment renderer choice fails here.
    expect(tsx).not.toContain("segments.map");
    expect(tsx).not.toContain('segment.kind === "text"');
    expect(tsx).not.toContain("<RefChip");
  });

  it("renders the whole body through one MarkdownText over the encoded source", () => {
    // The single flow: split against the served names, encode chips into
    // the source, one MarkdownText. Markdown survives because the single
    // pass parses the full body (including constructs a chip used to split).
    expect(tsx).toContain("encodeRefsForMarkdown");
    expect(tsx).toContain("<MarkdownText text={markdown}");
    expect(tsx).toContain("MarkdownText");
  });

  it("chips are styled inline links, not dropped and not block spans", () => {
    // The encoding hook lives in the pure model (CHIP_LINK_PREFIX) and the
    // stylesheet styles exactly that hook as a non-interactive chip. A fix
    // that drops chips, or one that keeps block-level chip spans, fails here.
    expect(tsx).toContain("encodeRefsForMarkdown");
    expect(css).toContain('a[href^="#ub-ref/"]');
    const chipRule = ruleBlock('.user-bubble-body a[href^="#ub-ref/"]');
    expect(chipRule).toContain("display: inline-block;");
    // Non-interactive: these decorate sent text, they navigate nowhere.
    expect(chipRule).toContain("pointer-events: none;");
    // No block-level chip span may remain: it would reintroduce the defect.
    expect(css).not.toContain(".user-bubble-chip");
  });

  it("slash names come from our host half, which serves what the client fetches", () => {
    // The cross-file contract: index.ts serves GET /user-bubble/slash-names
    // from the real registries, and client.tsx validates against exactly
    // that list. If either side drifts, chips lose their names or the
    // route 404s — both fail here rather than in the GUI.
    expect(host).toContain("/user-bubble/slash-names");
    expect(tsx).toContain("/user-bubble/slash-names");
    expect(host).toContain("skills");
    expect(host).toContain("commands");
  });
});
