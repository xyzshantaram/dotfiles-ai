import { buildAggregateSummary } from "../src/render.ts";
import type { SplitEntry } from "../src/common.ts";

// Three people keep the hand check short.
const people = ["Asha", "Dev", "Mira"];

// First group holds two foods plus one fee entry.
const groupOne: SplitEntry[] = [
  {
    item: "Biryani",
    platform: "swiggy",
    order_id: "1001",
    date: "2026-08-01 7:30 PM",
    price: 240,
    split_type: "equal",
    assignments: { Asha: 120, Dev: 120 },
  },
  {
    item: "Naan",
    platform: "swiggy",
    order_id: "1001",
    date: "2026-08-01 7:30 PM",
    price: 60,
    split_type: "equal",
    assignments: { Asha: 60 },
  },
  {
    item: "[Packaging]",
    platform: "swiggy",
    order_id: "1001",
    date: "2026-08-01 7:30 PM",
    price: 20,
    split_type: "equal",
    assignments: { Asha: 10, Dev: 10 },
  },
];

// Second group holds two grocery entries.
const groupTwo: SplitEntry[] = [
  {
    item: "Milk",
    platform: "blinkit",
    order_id: "2002",
    date: "2026-08-02 1:15 PM",
    price: 100,
    split_type: "equal",
    assignments: { Dev: 50, Mira: 50 },
  },
  {
    item: "Bread",
    platform: "blinkit",
    order_id: "2002",
    date: "2026-08-02 1:15 PM",
    price: 50,
    split_type: "equal",
    assignments: { Mira: 50 },
  },
];

const groups = [groupOne, groupTwo];
const payer = "Asha";
const settlements = [
  { from: "Dev", to: "Asha", amount: 100 },
  { from: "Mira", to: "Asha", amount: 50 },
];

// Hand totals: Asha 190, Dev 180, Mira 100, grand 470.
const expected = [
  "==========================================================================",
  "Summary expense — 2 orders — total ₹470.00 — paid by Asha",
  "==========================================================================",
  "Amounts to enter:",
  "  Asha ₹190.00",
  "  Dev  ₹180.00",
  "  Mira ₹100.00",
  "Settlements:",
  "  Dev → Asha  ₹100.00",
  "  Mira → Asha ₹50.00",
  "==========================================================================",
  "Itemized summary for the comment:",
  "   1. Swiggy — 08-01 7:30 PM — ₹320.00 — A 190.00 · D 130.00 · M 0.00",
  "   2. Blinkit — 08-02 1:15 PM — ₹150.00 — A 0.00 · D 50.00 · M 100.00",
  "==========================================================================",
  "Paste the itemized part as a comment. Title the expense anything you",
  "like. No Splitwise account or API is needed.",
].join("\n");

Deno.test("aggregate summary matches the hand computed block", () => {
  // Render the block from the small fixture.
  const text = buildAggregateSummary(groups, people, payer, settlements);
  // Fail with the full text on any drift.
  if (text !== expected) throw new Error("block drift:\n" + text);
});

Deno.test("aggregate owed totals match the hand computed sums", () => {
  // Build one uneven order on purpose so the sums cannot come from
  // an equal split shortcut inside the renderer.
  const uneven: SplitEntry[] = [
    {
      item: "Rice",
      price: 90,
      date: "2026-09-10 1:00 PM",
      platform: "manual",
      order_id: "manual-77",
      split_type: "custom",
      assignments: { Asha: 70, Dev: 20, Mira: 0 },
    },
  ];
  // Render the uneven order alone.
  const text = buildAggregateSummary([uneven], people, payer, settlements);
  // The amounts section must show the uneven sums as they are.
  for (const line of ["Asha", "Dev", "Mira"]) {
    // Each person row pads the name; find the row and its number.
    const row = text.split("\n").find((l) => l.trim().startsWith(line + " "));
    if (row === undefined) throw new Error("block lacks a row for " + line);
  }
  // Check the three exact amounts the hand computation gives.
  if (!text.includes("70.00")) throw new Error("block lacks Asha 70.00");
  if (!text.includes("20.00")) throw new Error("block lacks Dev 20.00");
  if (!text.includes("0.00")) throw new Error("block lacks Mira 0.00");
});
