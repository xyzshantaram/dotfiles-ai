// Tests for the push title builder. Run with deno test.
// Each case checks one date path from the T15 ticket.

import { formatTitle, renderOrderTree, renderTree } from "../src/render.ts";
import type { SplitEntry } from "../src/common.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

// Build one test order with a fixed date and total.
function oneOrder(date: string): SplitEntry[] {
  // Keep one item so the total stays plain.
  return [{
    item: "Biryani",
    platform: "swiggy",
    date,
    price: 100,
    split_type: "equal",
    assignments: { Sid: 100 },
  }];
}

Deno.test("formatTitle skips a raw date and keeps merchant plus total", () => {
  // Feed a raw string the date parser rejects.
  const title = formatTitle(oneOrder("not-a-date"));
  // Assert the fallback holds merchant plus total.
  assert(title === "Swiggy — ₹100.00", "fallback keeps merchant plus total");
});

Deno.test("formatTitle keeps the normal shape on a good date", () => {
  // Feed a date the parser accepts.
  const title = formatTitle(oneOrder("2024-08-14 7:30 PM"));
  // Assert the normal shape holds date parts.
  assert(title === "Swiggy order 08-14 7:30 PM", "good date keeps normal title");
});

Deno.test("formatTitle uses the passed currency label", () => {
  // Build one order with a total of 490.
  const order: SplitEntry[] = [{
    item: "Biryani",
    platform: "swiggy",
    date: "not-a-date",
    price: 490,
    split_type: "equal",
    assignments: { Sid: 490 },
  }];
  // Pass the INR label with a trailing space.
  const title = formatTitle(order, "INR ");
  // Assert the label form holds code plus amount.
  assert(title === "Swiggy — INR 490.00", "label keeps code plus amount");
});

Deno.test("renderOrderTree marks done, current, and collapsed lines", () => {
  // Feed one decided row, one skipped row, and one current fee row.
  const tree = renderOrderTree(
    "Order 1 of 2 · Zepto · 2026-09-08",
    [
      {
        name: "Milk",
        price: 66,
        isFee: false,
        estimated: false,
        state: "done",
        people: ["Asha", "Ben"],
      },
      { name: "Bread", price: 45, isFee: false, estimated: true, state: "skipped" },
      { name: "[Handling]", price: 12, isFee: true, estimated: false, state: "current" },
    ],
    2,
    "Rs",
  );
  // Assert the exact tree shape with arms and markers.
  assert(
    tree === [
      "Order 1 of 2 · Zepto · 2026-09-08",
      "├─ ✓ \u201cMilk\u201d — Rs66.00 → Asha, Ben",
      "├─ ⊘ \u201cBread\u201d — Rs45.00 · skipped",
      "├─ ▸ [Handling] — Rs12.00 · fee, split evenly",
      "└─ ○ 2 more lines after this one",
    ].join("\n"),
    "tree keeps arms, markers, and collapsed count",
  );
});

Deno.test("renderOrderTree closes the arm when nothing follows", () => {
  // Feed a single current row with no lines after it.
  const tree = renderOrderTree(
    "Order 2 of 2 · Blinkit · 2026-09-08",
    [
      { name: "Eggs", price: 80, isFee: false, estimated: false, state: "current" },
    ],
    0,
    "Rs",
  );
  // Assert the last row takes the corner arm.
  assert(
    tree === [
      "Order 2 of 2 · Blinkit · 2026-09-08",
      "└─ ▸ \u201cEggs\u201d — Rs80.00",
    ].join("\n"),
    "lone current row takes the corner arm",
  );
});

Deno.test("renderTree puts the corner arm on the last row", () => {
  // Feed a root with three plain rows.
  const tree = renderTree("Saved 9 orders from the last 30 days", [
    "5 from zepto",
    "3 from blinkit",
    "1 screenshot order",
  ]);
  // Assert the arms split branch and corner.
  assert(
    tree === [
      "Saved 9 orders from the last 30 days",
      "├─ 5 from zepto",
      "├─ 3 from blinkit",
      "└─ 1 screenshot order",
    ].join("\n"),
    "last row takes the corner arm",
  );
});
