// Tests for the push title builder. Run with deno test.
// Each case checks one date path from the T15 ticket.

import { buildItemizedComment, formatTitle, renderOrderTree, renderTree } from "../src/render.ts";
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

Deno.test("formatTitle names the goods when the date misses", () => {
  // Feed a raw string the date parser rejects.
  const title = formatTitle(oneOrder("not-a-date"));
  // Assert the title names the goods with the platform.
  assert(title === "Biryani [Swiggy]", "bad date still names the goods");
});

Deno.test("formatTitle names the goods on a good date", () => {
  // Feed a date the parser accepts.
  const title = formatTitle(oneOrder("2024-08-14 7:30 PM"));
  // Assert the title names the goods with the platform.
  assert(title === "Biryani [Swiggy]", "good date names the goods");
});

Deno.test("formatTitle names the goods and ignores the currency label", () => {
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
  // Assert the goods title ignores the label.
  assert(title === "Biryani [Swiggy]", "goods title ignores the label");
});

Deno.test("formatTitle lists several goods with the platform in brackets", () => {
  // Build one order with three plain goods.
  const order: SplitEntry[] = [
    {
      item: "Milk",
      platform: "swiggy",
      date: "2024-08-14 7:30 PM",
      price: 60,
      split_type: "equal",
      assignments: { Sid: 60 },
    },
    {
      item: "Bread",
      platform: "swiggy",
      date: "2024-08-14 7:30 PM",
      price: 45,
      split_type: "equal",
      assignments: { Sid: 45 },
    },
    {
      item: "Eggs",
      platform: "swiggy",
      date: "2024-08-14 7:30 PM",
      price: 80,
      split_type: "equal",
      assignments: { Sid: 80 },
    },
  ];
  // Assert the title names each good and ends with the platform.
  assert(formatTitle(order) === "Milk, Bread, Eggs [Swiggy]", "title lists goods plus platform");
});

Deno.test("formatTitle falls back to the dated title for fee rows alone", () => {
  // Build one order holding fee rows alone.
  const order: SplitEntry[] = [
    {
      item: "[Delivery]",
      platform: "swiggy",
      date: "2024-08-14 7:30 PM",
      price: 20,
      split_type: "equal",
      assignments: { Sid: 20 },
    },
    {
      item: "[Handling]",
      platform: "swiggy",
      date: "2024-08-14 7:30 PM",
      price: 10,
      split_type: "equal",
      assignments: { Sid: 10 },
    },
  ];
  // Assert the fallback keeps the dated shape.
  assert(formatTitle(order) === "Swiggy order 08-14 7:30 PM", "fee rows keep dated title");
});

Deno.test("buildItemizedComment opens with the platform and the time", () => {
  // Feed one goods order with a good date.
  const comment = buildItemizedComment(oneOrder("2024-08-14 7:30 PM"), ["Sid"]);
  // Assert the first line names the platform and the time.
  assert(
    comment.split("\n")[0] === "Swiggy — 08-14 7:30 PM",
    "comment opens with platform and time",
  );
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
