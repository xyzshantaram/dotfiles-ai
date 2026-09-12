// Tests for the pure split engine. Red phase: the module does not exist yet.
// Types reuse the state shapes from src/splitstate.ts where they fit.

import {
  buildOutput,
  customShare,
  equalShare,
  feeLines,
  percentShare,
  scaleRepeat,
  singleShare,
} from "../src/splitengine.ts";

Deno.test(
  "equalShare splits evenly and puts the gap on the last person",
  () => {
    const two = equalShare(220, ["a", "b"]);
    assertEquals(two, { a: 110, b: 110 });
    const three = equalShare(100, ["a", "b", "c"]);
    assertEquals(three, { a: 33.33, b: 33.33, c: 33.34 });
  },
);

Deno.test("equalShare of 100 across 3 lands the gap on the last person", () => {
  const out = equalShare(100, ["x", "y", "z"]);
  const sum = (Object.values(out) as number[]).reduce(
    (a: number, b: number) => a + b,
    0,
  );
  assertEquals(sum, 100);
  assertEquals(out.x, 33.33);
  assertEquals(out.y, 33.33);
  assertEquals(out.z, 33.34);
});

Deno.test("empty people for equalShare throws", () => {
  assertThrows(() => equalShare(100, []));
});

Deno.test(
  "percentShare uses whole percents and puts the gap on the last person",
  () => {
    const out = percentShare(100, { a: 33, b: 33, c: 34 });
    assertEquals(out, { a: 33, b: 33, c: 34 });
    const odd = percentShare(100, { a: 33, b: 33, c: 34 });
    const sum = (Object.values(odd) as number[]).reduce(
      (a: number, b: number) => a + b,
      0,
    );
    assertEquals(sum, 100);
    // 33 percent of 99 rounds down; the gap lands on the last person.
    const gap = percentShare(99, { a: 33, b: 33, c: 34 });
    assertEquals(gap.a, 32.67);
    assertEquals(gap.b, 32.67);
    assertEquals(gap.c, 33.66);
  },
);

Deno.test("customShare returns amounts rounded to two decimals", () => {
  const out = customShare(100, { a: 60.004, b: 39.996 });
  assertEquals(out, { a: 60, b: 40 });
});

Deno.test(
  "customShare throws when amounts miss the price by more than 0.01",
  () => {
    assertThrows(
      () => customShare(100, { a: 60, b: 39.5 }),
      Error,
      undefined,
      "amounts sum to 99.50 but price is 100.00",
    );
  },
);

Deno.test("singleShare gives the full price to one person", () => {
  assertEquals(singleShare(123.456, "solo"), { solo: 123.46 });
});

Deno.test(
  "scaleRepeat scales by the price ratio and puts the gap on the last person",
  () => {
    const prev: Record<string, number> = { a: 50, b: 50 };
    const out = scaleRepeat(100, 110, prev);
    const sum = (Object.values(out) as number[]).reduce(
      (a: number, b: number) => a + b,
      0,
    );
    assertEquals(sum, 110);
    assertEquals(out.a, 55);
    assertEquals(out.b, 55);
    // 30 and 31 of 61 scaled to 122 gives 60 and 62 after the gap.
    const uneven = scaleRepeat(61, 122, { a: 30, b: 31 });
    assertEquals(uneven.a, 60);
    assertEquals(uneven.b, 62);
  },
);

Deno.test("feeLines emits Delivery and Packaging only above 0.001", () => {
  const all = feeLines({ delivery: 12, packaging: 3 });
  assertEquals(all, [
    { name: "[Delivery]", price: 12 },
    { name: "[Packaging]", price: 3 },
  ]);
  assertEquals(feeLines({ delivery: 0, packaging: 0 }), []);
  assertEquals(feeLines({ delivery: 0.001, packaging: 0.0005 }), []);
  assertEquals(feeLines({ delivery: 5, packaging: 0 }), [
    { name: "[Delivery]", price: 5 },
  ]);
});

Deno.test("buildOutput covers one two-person equal split", () => {
  const splits = [
    {
      item: "Paneer",
      platform: "swiggy",
      order_id: "O1",
      date: "2024-05-01",
      price: 220,
      split_type: "equal",
      assignments: { ana: 110, ben: 110 },
    },
  ];
  const doc = buildOutput(splits, ["ana", "ben"], "ana");
  assertEquals(
    doc.split_at,
    typeof doc.split_at === "string" ? doc.split_at : null,
  );
  assertEquals(typeof doc.split_at, "string");
  assertEquals(doc.people, ["ana", "ben"]);
  assertEquals(doc.splits, splits);
  assertEquals(doc.totals, { ana: 110, ben: 110 });
  assertEquals(doc.settlements, [{ from: "ben", to: "ana", amount: 110 }]);
});

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(msg || "expected " + e + " but got " + a);
  }
}

function assertThrows(
  fn: () => unknown,
  _cls?: unknown,
  _m1?: unknown,
  msg?: string,
): void {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (msg && !(err instanceof Error && err.message.includes(msg))) {
      throw new Error("wrong error: " + String(err));
    }
  }
  if (!threw) throw new Error("did not throw" + (msg ? " (" + msg + ")" : ""));
}
