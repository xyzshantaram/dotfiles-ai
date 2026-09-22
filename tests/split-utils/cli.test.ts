// Tests for the CLI pure pieces. No subprocess, no browser, and no
// network call happens here. The flag parser, the --map parser, the
// push input builder, and the usage text are all pure.
import { buildPushInput, parseNameMap, parsePushFlags, usageText } from "@app/scripts/cli.ts";
import type { OutputDoc } from "@app/src/common.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";

// One split line for Ann and Bob.
function line(item: string, orderId: string, price: number, a: number, b: number) {
  return {
    item,
    platform: "zepto",
    order_id: orderId,
    date: "2026-01-01T10:00:00",
    price,
    split_type: "custom",
    assignments: { Ann: a, Bob: b },
  };
}

// A small finished split document with two orders.
function doc(): OutputDoc {
  return {
    split_at: "2026-01-06T09:00:00Z",
    people: ["Ann", "Bob"],
    splits: [
      line("Milk", "o1", 100, 60, 40),
      line("Eggs", "o2", 50, 25, 25),
    ],
    totals: { Ann: 85, Bob: 65 },
    settlements: [{ from: "Bob", to: "Ann", amount: 65 }],
  };
}

Deno.test("cli: the flag parser reads split, group, map and yes", () => {
  const flags = parsePushFlags(["--split", "out.json", "--group", "3", "--map", "Ann=5", "--yes"]);
  assertEquals(flags.split, "out.json", "split file");
  assertEquals(flags.group, 3, "group id");
  assertEquals(flags.map, "Ann=5", "map text");
  assertEquals(flags.yes, true, "--yes sets live mode");
});

Deno.test("cli: a missing yes flag means a dry run", () => {
  const flags = parsePushFlags(["--split", "out.json"]);
  assertEquals(flags.yes, false, "missing --yes stays dry");
  assertEquals(flags.group, 0, "group defaults to zero");
  assertEquals(flags.map, null, "map defaults to null");
});

Deno.test("cli: the map parser turns Ann=5,Bob=7 into resolutions", () => {
  const map = parseNameMap("Ann=5,Bob=7");
  assertEquals(map.get("Ann"), 5, "Ann resolves to 5");
  assertEquals(map.get("Bob"), 7, "Bob resolves to 7");
});

Deno.test("cli: the map parser rejects a malformed entry", () => {
  assertThrows(() => parseNameMap("Ann"), "entry without an id");
  assertThrows(() => parseNameMap("Ann=abc"), "entry with a bad id");
  assertThrows(() => parseNameMap("Ann=0"), "entry with a zero id");
  assertThrows(() => parseNameMap("=5"), "entry without a name");
});

Deno.test("cli: the push input builder sets every order to Push", () => {
  const input = buildPushInput(doc(), {
    groupId: 7,
    currency: "INR",
    nameMap: { Ann: 1, Bob: 2 },
    pushed: {},
    api: null,
    dry: true,
  });
  assertEquals(input.choices, { o1: "Push", o2: "Push" }, "every order pushes");
  assertEquals(input.payer, "Ann", "payer comes from the settlements");
  assertEquals(input.currency, "INR", "currency carries through");
  assertEquals(input.groupId, 7, "group id carries through");
  assertEquals(input.people, ["Ann", "Bob"], "people carry through");
  assertEquals(input.groups.length, 2, "both orders present");
});

Deno.test("cli: an unknown verb produces the usage text", () => {
  const text = usageText();
  for (const verb of ["gather", "validate", "push", "aggregate", "share", "wizard"]) {
    assert(text.includes(verb), "usage names " + verb);
  }
});
