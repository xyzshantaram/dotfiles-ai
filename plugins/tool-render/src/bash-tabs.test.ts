/**
 * Unit tests for the #164 tab seam in bash-diagram.ts (resolveBashTab).
 * String in, plain model out: no React render, no DOM, no snapshots.
 *
 * The seam exists for the same reason sequenceUnitDiagramModel does: the
 * strip and the panel must read ONE object, or they can disagree with a
 * green suite (the defect class behind #162's two reviews). The return-value
 * tests below pin what the seam RETURNS; the wiring tests at the bottom pin
 * that the view CALLS it. The wiring tests are source-structure assertions
 * and say so plainly: without a render harness (this repo has no jsdom and
 * no react-dom, and adding one is outside the ticket's allowlist) nothing
 * here can prove a pixel or an accessible name — only that no branch has
 * gone back to hand-rolling the answers, which is the defect class. If a
 * render harness ever lands, the wiring tests should be REPLACED by tests
 * that click the tabs and assert the painted panel, not kept alongside them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getBashDiagram,
  getBashSequenceDiagram,
  resolveBashTab,
} from "./bash-diagram";

describe("resolveBashTab: which tabs exist and which leads", () => {
  it("a drawable pipeline shows both tabs with Graph first", () => {
    const command = "a | b";
    const tabs = resolveBashTab(command, false);
    expect(tabs.drawable).toBe(true);
    expect(tabs.showTabs).toBe(true);
    expect(tabs.defaultTab).toBe("graph");
    expect(tabs.commandText).toBe(command);
  });

  it("a drawable sequence shows both tabs with Graph first", () => {
    const command = "a | b; c | d";
    expect(getBashSequenceDiagram(command)).not.toBeNull();
    const tabs = resolveBashTab(command, false);
    expect(tabs.drawable).toBe(true);
    expect(tabs.showTabs).toBe(true);
    expect(tabs.defaultTab).toBe("graph");
    expect(tabs.commandText).toBe(command);
  });

  it("a single simple command shows no tabs, Command by default", () => {
    // "ls" draws nowhere (v1 leaves it as text, v2 owns only multi-statement
    // scripts), so a Graph tab would be an empty tab that looks broken.
    const command = "ls";
    expect(getBashDiagram(command)).toBeNull();
    expect(getBashSequenceDiagram(command)).toBeNull();
    const tabs = resolveBashTab(command, false);
    expect(tabs.drawable).toBe(false);
    expect(tabs.showTabs).toBe(false);
    expect(tabs.defaultTab).toBe("command");
    expect(tabs.commandText).toBe(command);
  });

  it("a backgrounded command shows no tabs (nothing can be drawn)", () => {
    const command = "sleep 1 & true | false";
    expect(getBashDiagram(command)).toBeNull();
    expect(getBashSequenceDiagram(command)).toBeNull();
    const tabs = resolveBashTab(command, false);
    expect(tabs.drawable).toBe(false);
    expect(tabs.showTabs).toBe(false);
    expect(tabs.defaultTab).toBe("command");
    expect(tabs.commandText).toBe(command);
  });

  it("the guard rewrite pair shows no tabs (two texts are not a two-tab strip)", () => {
    // The rewrite pair renders "wrote" plus "ran" side by side, as today; a
    // Graph/Command strip over two command texts would hide one of them.
    const command = "a | b";
    const tabs = resolveBashTab(command, true);
    expect(tabs.showTabs).toBe(false);
    expect(tabs.defaultTab).toBe("command");
    expect(tabs.commandText).toBe(command);
  });

  it("a call with no command carries no text and no tabs", () => {
    const tabs = resolveBashTab(undefined, false);
    expect(tabs.drawable).toBe(false);
    expect(tabs.showTabs).toBe(false);
    expect(tabs.defaultTab).toBe("command");
    expect(tabs.commandText).toBeNull();
  });

  it("is pure: two rows resolve independently (per-row state lives in the view)", () => {
    // Tab state is per ROW: each BashRow keeps its own useState and this
    // helper carries no module state, so switching one card cannot move
    // another. Purity is the half of that claim a unit test can observe —
    // that two mounts cannot share selection through here needs a render
    // harness this repo does not have (see the wiring note at the top).
    const first = resolveBashTab("a | b", false);
    const second = resolveBashTab("a | b", false);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe("resolveBashTab: VERBATIM MEANS VERBATIM (criterion 2)", () => {
  it("keeps irregular spacing on a drawable pipeline (a reprint would collapse it)", () => {
    // LITERAL anchor: a plausible re-serialisation (words joined with single
    // spaces, the parser's unquoted values) reads
    // `git commit -m msg with "nested" quotes | cat`. The seam must hand the
    // view the typed bytes, spacing and quotes included.
    const command = "git  commit   -m 'msg with \"nested\" quotes'  |  cat";
    expect(getBashDiagram(command)).not.toBeNull();
    const tabs = resolveBashTab(command, false);
    expect(tabs.drawable).toBe(true);
    expect(tabs.defaultTab).toBe("graph");
    expect(tabs.commandText).toBe(command);
    expect(tabs.commandText).not.toBe("git commit -m msg with \"nested\" quotes | cat");
  });

  it("keeps an ANSI-C $'...' string byte for byte on a drawable pipeline", () => {
    const command = "printf $'a\\nb'  |  head -2";
    expect(getBashDiagram(command)).not.toBeNull();
    const tabs = resolveBashTab(command, false);
    expect(tabs.commandText).toBe(command);
    // The escape rides verbatim: unescaping it to a real newline is exactly
    // the normalisation the Command tab must not perform.
    expect(tabs.commandText).toContain("$'a\\nb'");
  });

  it("keeps a heredoc body byte for byte on an undrawable command", () => {
    // `&&` plus a heredoc: v1 refuses AndOr, the sequence refuses a carve on
    // a non-last line — no model exists, which is precisely when a
    // model-sourced Command tab would have nothing to read from.
    const command = "cd /tmp && cat > m3.sh <<'EOF'\nbody with 'q' and \"dq\" $HOME\nEOF";
    expect(getBashDiagram(command)).toBeNull();
    expect(getBashSequenceDiagram(command)).toBeNull();
    const tabs = resolveBashTab(command, false);
    expect(tabs.showTabs).toBe(false);
    expect(tabs.commandText).toBe(command);
  });

  it("keeps nested quotes, a heredoc body, and an ANSI-C string together", () => {
    // The criterion-2 headline fixture: all three hostile shapes in one
    // command. commandText is the input string itself, not a slice the model
    // happened to preserve.
    const command =
      "git commit -m 'msg with \"nested\" quotes' > out.txt; cat <<EOF\nheredoc body $HOME 'q'\nEOF\nprintf $'a\\nb' | head -2";
    const tabs = resolveBashTab(command, false);
    expect(tabs.commandText).toBe(command);
    expect(tabs.commandText).toContain("'msg with \"nested\" quotes'");
    expect(tabs.commandText).toContain("heredoc body $HOME 'q'");
    expect(tabs.commandText).toContain("$'a\\nb'");
  });
});

describe("the view is WIRED to the seam: one call, verbatim text, real controls", () => {
  // Why these tests are source assertions and say so plainly: the tests above
  // pin what the seam RETURNS, and #162's reviews proved that is not the same
  // thing — a view branch that stops calling the seam keeps every return-value
  // test green while the screen goes wrong. Catching that properly needs a
  // render (react-dom/server or jsdom); this repo has neither installed, and
  // adding one is outside this ticket's allowlist. So these pin the structure
  // instead, and are honest about the limit: they cannot prove the tabs are
  // painted or clickable, only that no branch has gone back to hand-rolling
  // the answers, which is the defect CLASS every review on this file found.
  // If a render harness ever lands, these should be REPLACED by tests that
  // click Graph/Command and assert the painted panel, not kept alongside them.
  const source = readFileSync(new URL("./client.tsx", import.meta.url), "utf8");

  it("BashRow resolves the tabs through the seam exactly once (the funnel)", () => {
    // One call whose object feeds BOTH the strip and the panel. A second call
    // site is how the two disagree — each with its own default — so the count
    // is the assertion, not incidental.
    const calls = source.match(/=\s*resolveBashTab\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("the Command panel renders the seam's verbatim text, never a reprint", () => {
    expect(source).toContain("tabs.commandText");
    // The model reconstructors reproduce the command when drawable, which is
    // why reading the tab off them would LOOK right: forbid the resemblance.
    // (They remain imported by the test files, never by the view.)
    expect(source).not.toContain("reconstructBashDiagram");
    expect(source).not.toContain("reconstructBashSequence");
  });

  it("the tabs are real tab controls, not clickable divs", () => {
    expect(source).toContain('role="tablist"');
    // Exactly one JSX element carries role="tab": the strip's <button>,
    // rendered for both tabs via the ["graph", "command"] map. Count the JSX
    // site, not the bare string: the arrow-key handler's querySelectorAll
    // mentions '[role="tab"]' too, so a plain toContain would stay green
    // while the painted control silently lost its role.
    const jsxTabRoles = source.match(/^\s*role="tab"\s*$/gm) ?? [];
    expect(jsxTabRoles).toHaveLength(1);
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-selected");
    expect(source).not.toMatch(/<div[^>]*role="tab"/);
  });
});
