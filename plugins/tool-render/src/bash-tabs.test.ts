/**
 * Tab seam and production pins for bash rows, in the new vocabulary (#173
 * stage two). The old file imported bash-diagram.ts. That module is deleted.
 * This file proves the same facts against the shipped path instead.
 *
 * THE NEW SEAM. resolveBashTab is gone. BashRow builds its tabs from two
 * things: the input string itself (commandText, never a re-serialisation)
 * and getBashGraphPanels (drawability is panelsHTML.length > 0). The strip
 * chrome (BashTabStrip) is untouched. The rewrite pair (two texts on show)
 * keeps no tabs, exactly as before, and stays the ONLY guard-state pin in
 * all five files. The default tab derives from the same cached panels the
 * Graph body renders, so verdict and body cannot disagree.
 *
 * HONESTY NOTE, kept from the old file. The return-value tests below pin
 * what the seam RETURNS and the source tests pin that the view CALLS it.
 * Catching a painted-but-wrong tab needs a render harness this repo does
 * not have. If one ever lands, the source tests here should be REPLACED by
 * tests that click the tabs and assert the painted panel, not kept
 * alongside them.
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
vi.mock("./client.module.css", () => ({ default: "" }));
vi.mock("./bash-graph/styles.css", () => ({ default: "" }));

import { getBashGraphPanels } from "./client";
import { installStub, resetStats } from "./bash-graph/geometry.stub.js";

const unesc = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Panels through the shipped entry, with realistic geometry. */
function shipped(command: string, pipeStages?: unknown): string[] {
  const restore = installStub();
  try {
    resetStats("bash-tabs-production");
    return getBashGraphPanels(command, pipeStages);
  } finally {
    restore();
  }
}

function panelText(panel: string): string {
  return unesc(panel.replace(/<[^>]*>/g, ""));
}

function shown(panels: string[]): string {
  return panels.map(panelText).join("\n");
}

function wordsSurvive(src: string, panels: string[]): void {
  const text = shown(panels);
  for (const w of new Set(src.match(/[A-Za-z0-9_]+/g) ?? []))
    expect(text, `word ${JSON.stringify(w)}`).toContain(w);
}

const source = readFileSync(new URL("./client.tsx", import.meta.url), "utf8");

describe("which tabs exist and which leads", () => {
  it("a drawable pipeline renders panels with Visual first", () => {
    // Re-points old L26. Panels exist, so the strip shows and Visual
    // leads. The label half is pinned on the strip below. The default half
    // is pinned on the derivation source line.
    const command = "a | b";
    expect(shipped(command, undefined).length).toBeGreaterThan(0);
    expect(source).toContain('defaultTab: graphDrawableNow ? "graph" : "command"');
  });

  it("a drawable sequence renders one panel per statement", () => {
    // Re-points old L35.
    const command = "a | b; c | d";
    expect(shipped(command, undefined)).toHaveLength(2);
  });

  it("a bare command draws one lone panel (hole 1)", () => {
    // Changed from old L45, which showed no tabs. Bare commands draw now.
    // The lone panel is uncapped by construction (data-size lone).
    for (const command of ["ls", "git status", "echo hello-pipe-test"]) {
      const panels = shipped(command, undefined);
      expect(panels, command).toHaveLength(1);
      expect(panels[0]).toContain('data-size="lone"');
      wordsSurvive(command, panels);
    }
  });

  it("a backgrounded command draws verbatim with no order claim (hole 2)", () => {
    // Changed from old L58, which showed no tabs. The segment draws as one
    // verbatim node through the shipped entry too: all text shown, no edge
    // drawn, no order claimed.
    const command = "sleep 1 & true | false";
    const panels = shipped(command, undefined);
    expect(panels).toHaveLength(1);
    expect(shown(panels)).toContain("sleep 1 & true | false");
    expect(panels.join("\n")).not.toContain("prim-edge");
    expect(panels.join("\n")).not.toContain("data-pipe=");
    wordsSurvive(command, panels);
  });

  it("the guard rewrite pair keeps no tabs (the only guard pin)", () => {
    // Re-points old L69. The branch is left untouched: a rewritten pair
    // renders wrote plus ran side by side, and the strip never mounts over
    // two command texts. Exactly one strip site exists, in the tabs branch.
    expect(source).toContain("rewrittenPair");
    expect(source).toContain('commandBlock("wrote"');
    expect(source.match(/<BashTabStrip/g) ?? []).toHaveLength(1);
  });

  it("no command means no panels and no tabs", () => {
    // Re-points old L79. The entry refuses non-strings, so the row keeps
    // the no-tabs behaviour it always had.
    expect(getBashGraphPanels(undefined as unknown as string, undefined)).toEqual([]);
    expect(source).toContain("typeof command !==");
  });

  it("two rows resolve independently from a shared cache", () => {
    // Re-points old L87 and strengthens it. Tab selection still lives per
    // row in BashRow state (needs a render harness to observe, stated
    // plainly). What a unit test CAN observe is that the shared cache
    // hands every row the same panels: same content, same array, no drift.
    const command = "tab purity probe | cat";
    const first = shipped(command, undefined);
    const second = shipped(command, undefined);
    expect(first).toBe(second);
    expect(first).toEqual(second);
  });
});

describe("VERBATIM MEANS VERBATIM through the shipped entry", () => {
  // Re-points old L101, L115, L125, L137. The hostile shapes now draw, so
  // these pin the drawn text AND the Command tab source. commandText is the
  // input string itself. The seam cannot normalise what it never touches.
  it("keeps irregular spacing on a drawable pipeline", () => {
    const command = "git  commit   -m 'msg with \"nested\" quotes'  |  cat";
    const panels = shipped(command, undefined);
    expect(panels.length).toBeGreaterThan(0);
    expect(shown(panels)).toContain("git  commit   -m");
    expect(shown(panels)).toContain('\'msg with "nested" quotes\'');
    expect(source).toContain("commandText: command");
    expect(source).toContain("tabs.commandText ?? command");
  });

  it("keeps an ANSI-C string byte for byte", () => {
    const command = "printf $'a\\nb'  |  head -2";
    expect(shown(shipped(command, undefined))).toContain("$'a\\nb'");
  });

  it("keeps a heredoc body byte for byte on a conditional command", () => {
    const command = "cd /tmp && cat > m3.sh <<'EOF'\nbody with 'q' and \"dq\" $HOME\nEOF";
    const panels = shipped(command, undefined);
    expect(panels).toHaveLength(1);
    expect(shown(panels)).toContain("body with 'q' and \"dq\" $HOME");
    wordsSurvive(command, panels);
  });

  it("keeps nested quotes, a heredoc body, and an ANSI-C string together", () => {
    const command =
      "git commit -m 'msg with \"nested\" quotes' > out.txt; cat <<EOF\nheredoc body $HOME 'q'\nEOF\nprintf $'a\\nb' | head -2";
    const panels = shipped(command, undefined);
    const text = shown(panels);
    expect(text).toContain("'msg with \"nested\" quotes'");
    expect(text).toContain("heredoc body $HOME 'q'");
    expect(text).toContain("$'a\\nb'");
    wordsSurvive(command, panels);
  });
});

describe("the view is WIRED to the seam", () => {
  it("the strip labels the diagram tab Visual, not Graph", () => {
    // Kept from old L165. Pinned on the labelOf mapping, not the bare
    // word: history comments still say Graph, so a plain toContain stays
    // green while the label reads anything at all.
    const labelMaps = source.match(/id === "graph" \? "[^"]+" : "[^"]+"/g) ?? [];
    expect(labelMaps).toHaveLength(1);
    expect(labelMaps[0]).toBe('id === "graph" ? "Visual" : "Command"');
    expect(source).not.toMatch(/id === "graph" \? "Graph"/);
  });

  it("BashRow renders through one cached call that feeds verdict and body", () => {
    // Re-points old L177 (hole 7). One call site renders the panels. The
    // verdict reads its length. The Graph body renders the same array. A
    // second call site is how the two disagree, so the count is the
    // assertion, not incidental.
    const calls = source.match(/getBashGraphPanels\(command, graphStages/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(source).toContain("panels={graphPanelsNow}");
  });

  it("the Command panel renders the seam verbatim text, never a reprint", () => {
    // Kept from old L185, re-anchored. The model reconstructors are gone
    // with the old module, so the resemblance they once offered is gone
    // too. The tab reads the input string.
    expect(source).toContain("tabs.commandText");
    expect(source).not.toContain("reconstructBashDiagram");
    expect(source).not.toContain("reconstructBashSequence");
  });

  it("the tabs are real tab controls, not clickable divs", () => {
    // Kept from old L194. The strip is untouched.
    expect(source).toContain('role="tablist"');
    const jsxTabRoles = source.match(/^\s*role="tab"\s*$/gm) ?? [];
    expect(jsxTabRoles).toHaveLength(1);
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-selected");
    expect(source).not.toMatch(/<div[^>]*role="tab"/);
  });
});

describe("criterion 4: nothing hidden, nothing abbreviated, in production", () => {
  // The prototype broke this invariant twice: 93 silently clipped sites
  // once, 6 spilled pills another time, plus 3 mid-token breaks from a 2px
  // measurement error. The module pins its guards in contract.test.ts. This
  // ports the CHECK into the shipped renderer: every word survives, every
  // expand button has its block, and every pill truncation carries counts
  // with the full text one click away. Abbreviation with the text attached
  // is disclosure. Abbreviation without it is the defect.
  const fixtures = [
    "rg -n foo src | head -20",
    "cat < in.txt | sort > out.txt 2>&1",
    "cat <<EOF | sort\nline1\nline2\nEOF",
    'git commit -m "' + "x".repeat(100) + '" | tail -2',
    "a && b && c; d | e",
    "(a | b); c | d",
    "a | b; # comment\nc | d",
  ];

  it("loses no word on any production shape", () => {
    for (const command of fixtures) {
      const panels = shipped(command, undefined);
      expect(panels.length, command).toBeGreaterThan(0);
      for (const panel of panels) expect(panel, command).toContain("prim-node");
      wordsSurvive(command, panels);
    }
  });

  it("matches every expand button to its hidden block", () => {
    const joined = fixtures.map((c) => shipped(c, undefined).join("\n")).join("\n");
    const hdKeys = [...joined.matchAll(/data-hd="([^"]+)"/g)].map((m) => "hd-" + m[1]);
    const argKeys = [...joined.matchAll(/data-arg="([^"]+)"/g)].map((m) => "arg-" + m[1]);
    expect(hdKeys.length + argKeys.length).toBeGreaterThan(0);
    const ids = new Set([...joined.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    for (const k of hdKeys.concat(argKeys)) expect(ids.has(k), k).toBe(true);
  });

  it("abbreviates pills only with counts and the full text attached", () => {
    // REJECTS a silent clip: the label may truncate, but the counts ride
    // the label and the complete argument rides the expandable block.
    const inner = "y".repeat(100);
    const joined = shipped(`git commit -m "${inner}" | tail -2`, undefined).join("\n");
    expect(joined).toContain("…");
    expect(joined).toContain("ch ·");
    expect(joined).toContain(inner);
    expect(joined).toContain("full verbatim argument");
  });
});

describe("cap, cache, and cost (holes 5 and 6, criterion 6)", () => {
  it("refuses commands past the stated cap", () => {
    // Hole 5. The cap lives in the client, carried across by value from
    // the old BASH_DIAGRAM_MAX_COMMAND. renderOne itself is uncapped
    // (pinned in bash-sequence.test.ts). This documents the seam.
    expect(shipped("echo " + "y".repeat(19995), undefined).length).toBeGreaterThan(0);
    expect(shipped("echo " + "y".repeat(19996), undefined)).toEqual([]);
  });

  it("keys the cache by command plus stages, and never mutates the base", () => {
    // Hole 6. Identical stages hit. Live updates do not re-measure. A
    // coded render never leaks codes into the plain render of the same
    // command: the cache key folds the stages in as JSON.
    const command = "cache probe | cat";
    expect(shipped(command, undefined)).toBe(shipped(command, undefined));
    const stages = [
      { name: "cache probe", exitCode: 0 },
      { name: "cat", exitCode: 2 },
    ];
    expect(shown(shipped(command, stages))).toContain("exit 2");
    expect(shown(shipped(command, undefined))).not.toContain("exit ");
  });

  it("builds no AST and stores none (criterion 6)", () => {
    // The old module memoised by command string and kept the AST out of
    // session state and every projection. The new path does the same: the
    // call site passes a standalone-scan literal, so unbash never runs and
    // no AST exists to store. The cache key is command plus stages JSON.
    // Per-row cost is measured, not assumed: a repeat render is a cache
    // hit (pinned above), and the DP pricing is pinned in the module
    // contract tests. No timing assert here: wall-clock pins are flaky,
    // and the mechanism pins above discriminate without one.
    const scans = source.match(/\{\s*status:\s*"stable-unavailable", nodes: \[\]\s*\}/g) ?? [];
    expect(scans).toHaveLength(1);
    expect(source).toContain("bashGraphCacheKey(command, pipeStages)");
    expect(source).toContain("BASH_GRAPH_CACHE_LIMIT");
  });
});

describe("criterion 5: the #170 rule in the new vocabulary", () => {
  // #170 asked what an undrawable statement should look like. The owner
  // retired it as superseded by this rewrite. THE RULE, stated in the new
  // vocabulary: an undrawable statement is the command, undrawn. No
  // panels, no Visual tab, no SVG. The row shows the command text itself.
  // It stays distinguishable from a drawn one because a drawn statement
  // always pairs its panels with the strip. WHERE IT LIVES:
  // getBashGraphPanels returning [] plus the BashRow no-tabs branch, both
  // pinned below.
  it("renders no panels for undrawable input", () => {
    expect(shipped("", undefined)).toEqual([]);
    expect(shipped("   ", undefined)).toEqual([]);
    expect(shipped("echo " + "z".repeat(19996), undefined)).toEqual([]);
  });

  it("shows the command text directly with no strip when nothing draws", () => {
    // showTabs is true only when panels exist, so the Graph branch always
    // has content. The else branch renders the verbatim text directly,
    // never an empty Visual tab.
    expect(source).toContain("showTabs: graphDrawableNow");
    expect(source).toContain("inner.push.apply(inner, commandBlock(null, tabs.commandText ?? command));");
  });
});
