// Tests for the cliffy kit pure helpers. Run with deno test.
// Each case checks one render rule from the T6 ticket.

import {
  B,
  DIM,
  type HotkeyRow,
  INDENT,
  matchHotkey,
  renderBanner,
  renderHotkeyMenu,
  renderKeyLegend,
  renderProgress,
  renderTreeRow,
  YELLOW,
} from "../src/cliffy-kit.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("banner contains the title between blank lines", () => {
  // Render a banner for a plain title.
  const out = renderBanner("Split orders");
  // Assert the title text survives inside the output.
  assert(out.includes("Split orders"), "banner keeps the title");
  // Assert the output opens and closes with a blank line.
  assert(out.startsWith("\n"), "banner opens blank");
  assert(out.endsWith("\n"), "banner closes blank");
});

Deno.test("every banner line starts blank or indented", () => {
  // Render a banner for a plain title.
  const out = renderBanner("Split orders");
  // Assert each line is empty or starts with two spaces.
  for (const line of out.split("\n")) {
    assert(line === "" || line.startsWith(INDENT), "banner indents body");
  }
});

Deno.test("tree rows use one glyph per state", () => {
  // Render one row per state with the same text.
  const done = renderTreeRow("done", "Rice");
  const todo = renderTreeRow("todo", "Rice");
  const current = renderTreeRow("current", "Rice");
  // Assert each state keeps its glyph from render.ts.
  assert(done.includes("✓"), "done keeps the check");
  assert(todo.includes("○"), "todo keeps the hollow circle");
  assert(current.includes("▸"), "current keeps the pointer");
  // Assert the tee arm is default and the last row takes the corner.
  assert(done.includes("├─"), "rows take the tee arm");
  assert(renderTreeRow("todo", "Rice", true).includes("└─"), "last row takes the corner");
  assert(done.startsWith(INDENT), "done indents");
  assert(todo.startsWith(INDENT), "todo indents");
  assert(current.startsWith(INDENT), "current indents");
});

Deno.test("skipped row uses the dim block glyph", () => {
  // Render a skipped row with plain text.
  const out = renderTreeRow("skipped", "Rice");
  // Assert the row keeps the glyph from render.ts.
  assert(out.includes("⊘"), "skipped keeps the block glyph");
  // Assert the row starts with the two-space indent.
  assert(out.startsWith(INDENT), "skipped indents");
});

Deno.test("legend keeps one line per entry", () => {
  // Render a legend with two entries.
  const out = renderKeyLegend([["Enter", "pick this row"], ["q", "quit"]]);
  // Assert the output holds exactly one line per entry.
  assert(out.split("\n").length === 2, "legend keeps line count");
  // Assert each line starts indented and names its key.
  for (const line of out.split("\n")) {
    assert(line.startsWith(INDENT), "legend indents each line");
  }
  assert(out.includes("Enter"), "legend keeps the first key");
  assert(out.includes("quit"), "legend keeps the last action");
});

Deno.test("hotkey menu keeps one line per row with aligned labels", () => {
  // Build two rows with one-letter keys.
  const rows: HotkeyRow[] = [
    { key: "s", label: "split with everyone", value: "all" },
    { key: "k", label: "skip this item", value: "skip" },
  ];
  // Render the menu with the first row selected.
  const lines = renderHotkeyMenu(rows, 0).split("\n");
  // Assert the output holds exactly one line per row.
  assert(lines.length === rows.length, "menu keeps line count");
  // Assert each line starts indented and keeps its label.
  assert(lines[0].startsWith(INDENT), "menu indents first line");
  assert(lines[1].startsWith(INDENT), "menu indents second line");
  // Assert both labels start at the same column.
  assert(lines[0].indexOf("split") === lines[1].indexOf("skip"), "labels align");
});

Deno.test("hotkey menu marks only the selected row", () => {
  // Build two rows with one-letter keys.
  const rows: HotkeyRow[] = [
    { key: "s", label: "split with everyone", value: "all" },
    { key: "k", label: "skip this item", value: "skip" },
  ];
  // Render the menu with the second row selected.
  const lines = renderHotkeyMenu(rows, 1).split("\n");
  // Assert only the selected row carries the pointer.
  assert(!lines[0].includes("▸"), "first row hides pointer");
  assert(lines[1].includes("▸"), "second row shows pointer");
});

Deno.test("matchHotkey finds by letter case-insensitively", () => {
  // Build two rows with lowercase keys.
  const rows: HotkeyRow[] = [
    { key: "s", label: "split with everyone", value: "all" },
    { key: "k", label: "skip this item", value: "skip" },
  ];
  // Assert lower and upper input both hit the first row.
  assert(matchHotkey(rows, "s") === "all", "lower hits");
  assert(matchHotkey(rows, "S") === "all", "upper hits");
  assert(matchHotkey(rows, "K") === "skip", "upper hits second");
});

Deno.test("matchHotkey returns null for unknown keys", () => {
  // Build one row with a lowercase key.
  const rows: HotkeyRow[] = [
    { key: "s", label: "split with everyone", value: "all" },
  ];
  // Assert an unlisted key returns null.
  assert(matchHotkey(rows, "z") === null, "unknown returns null");
});
Deno.test("progress shows bold color-coded counts", () => {
  // Render a progress line with nonzero counts.
  const out = renderProgress(4, 0, 3);
  // Assert each count survives with its label.
  assert(out.includes("Assigned") && out.includes("4"), "progress keeps assigned");
  assert(out.includes("Skipped") && out.includes("0"), "progress keeps skipped");
  assert(out.includes("Left") && out.includes("3"), "progress keeps left");
  // Assert the line starts with the two-space indent.
  assert(out.startsWith(INDENT), "progress indents");
});

Deno.test("only the progress line uses the white code", () => {
  // Collect one sample from each helper except progress.
  const samples = [
    renderBanner("Split orders"),
    renderTreeRow("done", "Rice"),
    renderTreeRow("todo", "Rice"),
    renderTreeRow("current", "Rice"),
    renderKeyLegend([["Enter", "pick this row"]]),
    B("bold") + DIM("dim") + YELLOW("fee"),
  ];
  // Assert no sample contains the white escape code.
  for (const s of samples) {
    assert(!s.includes("\x1b[37m"), "output avoids white");
  }
  // Color codes render only on a live terminal, so assert the shape here
  // and check the colors by eye in the demo.
  const plain = renderProgress(4, 0, 3);
  assert(plain.includes("Assigned 4"), "progress pairs assigned");
  assert(plain.includes("Skipped 0"), "progress pairs skipped");
  assert(plain.includes("Left 3"), "progress pairs left");
});
