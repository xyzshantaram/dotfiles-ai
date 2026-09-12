// Tests for the SplitKit tree row helper. Run with deno test.
// Each case checks one mapping rule from the T2 ticket.

import { indexOf, type KitTreeRow, rootNode } from "../src/kit/tree.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

// Build four rows with one row per status.
function oneRowSet(): KitTreeRow[] {
  return [
    { id: "a", label: "Fetch order", status: "done" },
    { id: "b", label: "Split milk", status: "current" },
    { id: "c", label: "Split bread", status: "skipped" },
    { id: "d", label: "Push offer", status: "todo" },
  ];
}

Deno.test("rootNode yields one expanded parent with ordered children", () => {
  // Feed the row set to the helper.
  const root = rootNode("plan", "Split plan", oneRowSet());
  // Assert the parent stays expanded and keeps its own id plus label.
  assert(root.id === "plan", "parent keeps id");
  assert(root.label === "Split plan", "parent keeps label");
  assert(root.expanded === true, "parent starts expanded");
  // Assert the children keep ids, labels, and statuses in order.
  const kids = root.children ?? [];
  assert(kids.length === 4, "one child per row");
  assert(
    kids[0]!.id === "a" && kids[0]!.label === "Fetch order" && kids[0]!.status === "done",
    "first child keeps row data",
  );
  assert(kids[1]!.status === "current", "second child keeps status");
  assert(kids[2]!.status === "skipped", "third child keeps status");
  assert(kids[3]!.id === "d" && kids[3]!.status === "todo", "last child keeps row data");
});

Deno.test("indexOf maps the current child to its flat position", () => {
  // Child position 1 plus the parent row gives 2.
  assert(indexOf(oneRowSet(), "current") === 2, "current row maps to child plus 1");
});

Deno.test("indexOf falls past the last row when nothing is current", () => {
  // Feed rows with no current status.
  const rows = oneRowSet().map((row) => ({ ...row, status: "todo" as const }));
  // Assert the position lands one past the parent plus last child.
  assert(indexOf(rows, "current") === 5, "no current row maps past the end");
});
