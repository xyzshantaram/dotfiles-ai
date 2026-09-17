// Tests for splitter state. Pure logic runs headless. Saves use temp dirs.
import {
  buildOutputDoc,
  computeSettlements,
  computeTotals,
  countDoneOrders,
  createSaver,
  customAmounts,
  equalAmounts,
  firstUnfinished,
  flattenOrders,
  freshState,
  type ItemAssignment,
  loadSplitState,
  remapPeople,
  repeatAmounts,
  snapshotMtime,
  tmpStatePath,
  writeSplitState,
} from "../src/splitstate.ts";
import type { Order } from "../src/common.ts";
import { createRun, readRun, updateRun } from "../src/runstate.ts";

// Fail the test when a flag misses.
function assert(cond: boolean, msg: string): void {
  // Throw a clear error when false.
  if (!cond) throw new Error("assert failed: " + msg);
}

// Fail the test when two values differ.
function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  // Compare with JSON form for depth.
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  // Throw a clear error on mismatch.
  if (a !== b) throw new Error(msg + ": want " + b + " got " + a);
}

// Build one sample order with quantity copies and fee lines.
function sampleOrders(): Order[] {
  return [
    {
      id: "zepto-1",
      platform: "zepto",
      date: "2026-09-09 7:01 PM",
      paid: 200,
      items: [
        { name: "Latte", price: 40, quantity: 2, estimated: false },
        { name: "[Handling]", price: 20, quantity: 1, estimated: false },
      ],
      fees: { delivery: 100, packaging: 0 },
    },
  ];
}

// flattenOrders expands quantity and appends fee lines from the order.
Deno.test("flatten expands quantity and fees", () => {
  // Flatten one order with copies and a delivery fee.
  const flat = flattenOrders(sampleOrders());
  // Check two latte copies plus handling plus delivery.
  assertEquals(
    flat.map((l) => l.name),
    ["Latte", "Latte", "[Handling]", "[Delivery]"],
    "line names",
  );
  // Check the fee flags mark bracket names only.
  assertEquals(flat.map((l) => l.isFee), [false, false, true, true], "fee flags");
  // Check the delivery line carries the fee price.
  assertEquals(flat[3].price, 100, "delivery price");
});

// flattenOrders keeps bracket prefix names with trailing text as real items.
Deno.test("flatten keeps combo names real", () => {
  // Flatten one order with a combo prefix name.
  const flat = flattenOrders([{
    id: "swiggy-1",
    platform: "swiggy_food",
    date: "2026-09-09 7:01 PM",
    paid: 50,
    items: [{ name: "[Combo] Milky Mist Paneer", price: 50, quantity: 1 }],
    fees: { delivery: 0, packaging: 0 },
  }]);
  // Check the combo line counts as a real item.
  assertEquals(flat[0].isFee, false, "combo is real");
});

// equalAmounts splits evenly and parks the rounding gap on the last person.
Deno.test("equal split parks rounding on last", () => {
  // Split 100 across three people.
  const out = equalAmounts(100, ["Asha", "Ben", "Cara"]);
  assertEquals(out, { Asha: 33.33, Ben: 33.33, Cara: 33.34 }, "shares");
  // Check the shares sum back to the price.
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 100) < 0.001, "shares sum to price");
});

// customAmounts accepts exact sums and throws on mismatch.
Deno.test("custom amounts validate the sum", () => {
  // Accept amounts that sum to the price.
  const out = customAmounts({ Asha: 60, Ben: 40 }, 100);
  assertEquals(out, { Asha: 60, Ben: 40 }, "exact sums pass");
  // Throw when the sum misses the price.
  let msg = "";
  try {
    customAmounts({ Asha: 60, Ben: 30 }, 100);
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  assert(msg.includes("sum to"), "mismatch names the sum");
});

// computeSettlements points every debt at the payer.
Deno.test("settlements point at the payer", () => {
  // Settle totals where Asha paid up front.
  const out = computeSettlements(["Asha", "Ben", "Cara"], { Asha: 50, Ben: 30, Cara: 20 }, "Asha");
  assertEquals(out, [
    { from: "Ben", to: "Asha", amount: 30 },
    { from: "Cara", to: "Asha", amount: 20 },
  ], "debts");
});

// repeatAmounts recomputes equal shares for the new price.
Deno.test("repeat recomputes for the new price", () => {
  // Repeat an equal split of 90 onto a 60 line.
  const prev: ItemAssignment = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 45, Ben: 45 },
  };
  const next = repeatAmounts(prev, 60, ["Asha", "Ben", "Cara"]);
  assertEquals(next.people, ["Asha", "Ben"], "people stay");
  assertEquals(next.amounts, { Asha: 30, Ben: 30 }, "amounts recompute");
});

// buildOutputDoc skips lines, totals, and formats the date.
Deno.test("output doc omits skipped lines", () => {
  // Build output with one assigned line and one skipped line.
  const flat = flattenOrders(sampleOrders());
  const doc = buildOutputDoc({
    flat,
    assignments: {
      "0": { splitType: "equal", people: ["Asha", "Ben"], amounts: { Asha: 20, Ben: 20 } },
    },
    skipped: { "1": true },
    people: ["Asha", "Ben"],
    payer: "Asha",
    splitAt: "2026-09-09T00:00:00.000Z",
  });
  // Check only the assigned line lands in splits.
  assertEquals(doc.splits.length, 1, "split count");
  assertEquals(doc.splits[0].item, "Latte", "split item");
  // Check the date keeps dashboard output form.
  assertEquals(doc.splits[0].date, "2026-09-09 7:01 PM", "split date");
  // Check totals and settlements follow.
  assertEquals(doc.totals, { Asha: 20, Ben: 20 }, "totals");
  assertEquals(doc.settlements, [{ from: "Ben", to: "Asha", amount: 20 }], "settlements");
});

// remapPeople renames assignment keys by position.
Deno.test("remap renames by position", () => {
  // Rename Ben to Bala in second position.
  const doc = freshState(["Asha", "Ben", "Cara"], "Asha");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 20, Ben: 20 },
  };
  const next = remapPeople(doc, ["Asha", "Bala", "Cara"]);
  assertEquals(next.people, ["Asha", "Bala", "Cara"], "people");
  assertEquals(next.assignments["0"].amounts, { Asha: 20, Bala: 20 }, "amounts");
  assertEquals(next.assignments["0"].people, ["Asha", "Bala"], "members");
});

// remapPeople moves one rename across people, members, and amount keys.
Deno.test("remap moves one rename and keeps values", () => {
  const doc = freshState(["Asha", "Ben", "Cara"], "Asha");
  doc.assignments["0"] = {
    splitType: "custom",
    people: ["Asha", "Ben"],
    amounts: { Asha: 12.5, Ben: 27.5 },
  };
  const next = remapPeople(doc, ["Asha", "Bala", "Cara"]);
  assertEquals(next.people, ["Asha", "Bala", "Cara"], "people");
  assertEquals(next.assignments["0"].people, ["Asha", "Bala"], "members");
  assertEquals(next.assignments["0"].amounts, { Asha: 12.5, Bala: 27.5 }, "amounts");
  assertEquals(next.assignments["0"].amounts["Bala"], 27.5, "value stays");
  assertEquals(next.assignments["0"].splitType, "custom", "type stays");
});

// remapPeople moves a rename of the payer.
Deno.test("remap moves the payer name", () => {
  const doc = freshState(["Asha", "Ben"], "Ben");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 20, Ben: 20 },
  };
  const next = remapPeople(doc, ["Asha", "Bala"]);
  assertEquals(next.payer, "Bala", "payer");
  assertEquals(next.people, ["Asha", "Bala"], "people");
  assertEquals(next.assignments["0"].amounts, { Asha: 20, Bala: 20 }, "amounts");
});

// remapPeople keeps a pure reorder unchanged.
Deno.test("remap keeps a swap unchanged", () => {
  const doc = freshState(["Asha", "Ben"], "Asha");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 20, Ben: 20 },
  };
  const next = remapPeople(doc, ["Ben", "Asha"]);
  assertEquals(next, doc, "swap changes nothing");
});

// remapPeople keeps a longer list unchanged.
Deno.test("remap keeps an added name unchanged", () => {
  const doc = freshState(["Asha", "Ben"], "Asha");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 20, Ben: 20 },
  };
  const next = remapPeople(doc, ["Asha", "Ben", "Cara"]);
  assertEquals(next, doc, "add changes nothing");
});

// remapPeople keeps a shorter list unchanged.
Deno.test("remap keeps a removed name unchanged", () => {
  const doc = freshState(["Asha", "Ben", "Cara"], "Asha");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 20, Ben: 20 },
  };
  const next = remapPeople(doc, ["Asha", "Ben"]);
  assertEquals(next, doc, "remove changes nothing");
});

// firstUnfinished finds the exact gap in the line list.
Deno.test("resume finds the first gap", () => {
  // Mark lines 0 and 2 done, line 1 skipped, line 3 open.
  const at = firstUnfinished(4, { "0": fresh("equal"), "2": fresh("equal") }, { "1": true });
  assertEquals(at, 3, "gap index");
});

// Fresh helper builds one throwaway assignment for index tests.
function fresh(splitType: string): ItemAssignment {
  return { splitType, people: ["Asha"], amounts: { Asha: 10 } };
}

// countDoneOrders counts orders with no open lines.
Deno.test("progress counts finished orders", () => {
  // Finish order one fully, leave order two open.
  const flat = flattenOrders([
    {
      id: "a",
      platform: "zepto",
      date: "2026-09-09 7:01 PM",
      paid: 40,
      items: [{ name: "Latte", price: 40, quantity: 1 }],
      fees: { delivery: 0, packaging: 0 },
    },
    {
      id: "b",
      platform: "zepto",
      date: "2026-09-09 8:01 PM",
      paid: 40,
      items: [{ name: "Tea", price: 40, quantity: 1 }],
      fees: { delivery: 0, packaging: 0 },
    },
  ]);
  const doc = freshState(["Asha"], "Asha");
  doc.assignments["0"] = fresh("equal");
  assertEquals(countDoneOrders(flat, 2, doc), 1, "done count");
});

// writeSplitState round trips the doc through the run dir.
Deno.test("atomic save round trips state", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  const doc = freshState(["Asha", "Ben"], "Asha");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 20, Ben: 20 },
  };
  // Save with a zero baseline on first write.
  const first = await writeSplitState(dir, doc, 0);
  assertEquals(first.conflicted, false, "first save lands");
  // Load the doc back and compare fields.
  const back = await loadSplitState(dir);
  assert(back !== null, "state loads");
  assertEquals(back!.people, ["Asha", "Ben"], "people round trip");
  assertEquals(back!.assignments, doc.assignments, "assignments round trip");
  // Save again with a fresh baseline and check no conflict fires.
  const stamp = await snapshotMtime(dir);
  const second = await writeSplitState(dir, back!, stamp);
  assertEquals(second.conflicted, false, "fresh baseline lands");
});

// writeSplitState keeps the newer file and writes a conflict copy instead.
Deno.test("conflict guard keeps the newer file", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  const first = freshState(["Asha", "Ben"], "Asha");
  // Save once so a real file exists.
  await writeSplitState(dir, first, 0);
  const real = await Deno.readTextFile(dir + "/split-state.json");
  // Save stale work with a zero baseline against the newer file.
  const stale = freshState(["Asha", "Ben"], "Ben");
  const res = await writeSplitState(dir, stale, 0);
  // Check the guard fires and names a conflict copy.
  assertEquals(res.conflicted, true, "guard fires");
  assert(res.path.includes(".conflict-"), "names a conflict copy");
  // Check the real file still holds the first doc.
  assertEquals(await Deno.readTextFile(dir + "/split-state.json"), real, "real file kept");
  // Check the conflict copy holds the stale work.
  const conflict = JSON.parse(await Deno.readTextFile(res.path));
  assertEquals(conflict.payer, "Ben", "conflict holds stale work");
});

// Two quick conflicts land in two files.
Deno.test("quick conflicts keep both copies", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  // Save once so a real file exists.
  await writeSplitState(dir, freshState(["Asha", "Ben"], "Asha"), 0);
  // Force two stale saves through the conflict path.
  const first = freshState(["Asha", "Ben"], "Asha");
  const second = freshState(["Asha", "Ben"], "Ben");
  await writeSplitState(dir, first, 0);
  await writeSplitState(dir, second, 0);
  // Count files with the conflict prefix.
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name.startsWith("split-state.conflict-")) names.push(entry.name);
  }
  // Check both copies survived.
  assertEquals(names.length, 2, "two conflict files");
});

// Conflict names keep the shared prefix.
Deno.test("conflict name keeps the prefix", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  // Save once so a real file exists.
  await writeSplitState(dir, freshState(["Asha", "Ben"], "Asha"), 0);
  // Force one stale save through the conflict path.
  const res = await writeSplitState(dir, freshState(["Asha", "Ben"], "Ben"), 0);
  // Check the file name keeps the prefix.
  const base = res.path.split("/").pop() ?? "";
  assert(base.startsWith("split-state.conflict-"), "prefix stays");
});

// Two writes started together both finish, and the later doc wins.
Deno.test("concurrent saves both land with the later doc last", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  const first = freshState(["Asha", "Ben"], "Asha");
  const second = freshState(["Asha", "Ben"], "Ben");
  // Use a future baseline so the conflict guard stays quiet for both.
  const baseline = Date.now() + 60000;
  const p1 = writeSplitState(dir, first, baseline);
  const p2 = writeSplitState(dir, second, baseline);
  const [r1, r2] = await Promise.all([p1, p2]);
  assertEquals(r1.conflicted, false, "first save lands");
  assertEquals(r2.conflicted, false, "second save lands");
  // Check the real file holds the later document.
  const back = await loadSplitState(dir);
  assert(back !== null, "state loads");
  assertEquals(back!.payer, "Ben", "later doc wins");
});

// Temp paths never repeat between writes.
Deno.test("temp paths never repeat", () => {
  // Build two temp paths for the same run dir.
  const a = tmpStatePath("rundir");
  const b = tmpStatePath("rundir");
  assert(a !== b, "paths differ");
  // Check both stay beside the real file and end in .tmp.
  assert(a.startsWith("rundir/split-state.json."), "temp stays beside the file");
  assert(a.endsWith(".tmp"), "temp ends in .tmp");
  assert(b.startsWith("rundir/split-state.json."), "second stays beside the file");
  assert(b.endsWith(".tmp"), "second ends in .tmp");
});

// Names in a dir that end in .tmp.
async function tmpLeftovers(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name.endsWith(".tmp")) out.push(entry.name);
  }
  return out;
}

// No temp file survives a save, even when the rename fails.
Deno.test("no temp file survives a save", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  const doc = freshState(["Asha", "Ben"], "Asha");
  // Save once and check no .tmp file stays behind.
  await writeSplitState(dir, doc, 0);
  assertEquals(await tmpLeftovers(dir), [], "clean after a save");
  // Force a stale baseline so a conflict copy lands instead.
  const stale = freshState(["Asha", "Ben"], "Ben");
  await writeSplitState(dir, stale, 0);
  assertEquals(await tmpLeftovers(dir), [], "clean after a conflict");
  // Break the rename and check the failed write still cleans up.
  const realRename = Deno.rename;
  Deno.rename = () => Promise.reject(new Error("rename broke"));
  try {
    let msg = "";
    try {
      await writeSplitState(dir, doc, Date.now() + 60000);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    assert(msg.includes("rename broke"), "rename failure throws");
  } finally {
    Deno.rename = realRename;
  }
  assertEquals(await tmpLeftovers(dir), [], "clean after a failure");
});

// createSaver debounces many schedules into one save.
Deno.test("saver debounces schedules", async () => {
  // Count save calls across rapid schedules.
  let calls = 0;
  const saver = createSaver(10, () => {
    calls += 1;
    return Promise.resolve();
  });
  saver.schedule();
  saver.schedule();
  saver.schedule();
  // Wait past the debounce wait and check one call fired.
  await new Promise((r) => setTimeout(r, 60));
  assertEquals(calls, 1, "one debounced call");
  // Check flush saves at once even with nothing pending.
  await saver.flush();
  assertEquals(calls, 2, "flush saves now");
});

// computeTotals sums every assignment per person.
Deno.test("totals sum every assignment", () => {
  // Sum two assignments across two people.
  const out = computeTotals(["Asha", "Ben"], {
    "0": { splitType: "equal", people: ["Asha", "Ben"], amounts: { Asha: 20, Ben: 20 } },
    "1": { splitType: "single", people: ["Ben"], amounts: { Ben: 15 } },
  });
  assertEquals(out, { Asha: 20, Ben: 35 }, "totals");
});

// updateRun persists splitter progress fields on the run meta.
Deno.test("run meta keeps split progress", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one run and patch progress fields.
  const { id } = await createRun("zepto", ["zepto"], 30, root + "/gather.log");
  await updateRun(id, { lastPayer: "Asha", ordersDone: 1, ordersTotal: 3 });
  // Read the run back and check the fields survive.
  const found = await readRun(id);
  assert(found !== null, "readRun finds the run");
  assertEquals(found!.meta.lastPayer, "Asha", "last payer");
  assertEquals(found!.meta.ordersDone, 1, "orders done");
  assertEquals(found!.meta.ordersTotal, 3, "orders total");
  // Check the status stays gathered on partial progress.
  assertEquals(found!.meta.status, "gathered", "partial status");
});

// Clean save reports the state file time left behind.
Deno.test("clean save reports the live file time", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  // Save one doc with a zero baseline.
  const doc = freshState(["Asha", "Ben"], "Asha");
  const result = await writeSplitState(dir, doc, 0);
  // Read the live file time after the write.
  const live = await snapshotMtime(dir);
  // Check the clean path reports no clash.
  assertEquals(result.conflicted, false, "clean save lands");
  // Check the reported time matches the live file time.
  assertEquals(result.at, live, "at matches live mtime");
});

// Clashing save reports the live file time.
Deno.test("clash reports the live file time", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  // Save once so a real file exists.
  await writeSplitState(dir, freshState(["Asha", "Ben"], "Asha"), 0);
  // Read the live file time before the clash.
  const live = await snapshotMtime(dir);
  // Wait past the timestamp tick for a fresh conflict time.
  await new Promise((r) => setTimeout(r, 25));
  // Save stale work with a zero baseline.
  const res = await writeSplitState(dir, freshState(["Asha", "Ben"], "Ben"), 0);
  // Check the guard fires.
  assertEquals(res.conflicted, true, "guard fires");
  // Check the reported time matches the live file time.
  assertEquals(res.at, live, "at matches live mtime");
  // Read the conflict copy time from disk.
  const info = await Deno.stat(res.path);
  const conflictMs = info.mtime?.getTime() ?? 0;
  // Check the reported time stays behind the conflict copy time.
  assert(res.at < conflictMs, "at stays behind conflict time");
});

// Second save with the first at avoids a conflict copy.
Deno.test("carried at avoids a self conflict", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  const dir = root + "/run";
  await Deno.mkdir(dir, { recursive: true });
  // Save the first doc with a zero baseline.
  const firstDoc = freshState(["Asha", "Ben"], "Asha");
  const first = await writeSplitState(dir, firstDoc, 0);
  // Check the first save lands clean.
  assertEquals(first.conflicted, false, "first lands");
  // Save the next doc with the first at as baseline.
  const secondDoc = freshState(["Asha", "Ben"], "Asha");
  secondDoc.assignments["0"] = {
    splitType: "equal",
    people: ["Asha", "Ben"],
    amounts: { Asha: 20, Ben: 20 },
  };
  const second = await writeSplitState(dir, secondDoc, first.at);
  // Check the second save lands clean.
  assertEquals(second.conflicted, false, "second lands");
  // Count files with the conflict prefix.
  const names: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name.startsWith("split-state.conflict-")) names.push(entry.name);
  }
  // Check no conflict copy exists.
  assertEquals(names.length, 0, "no conflict file");
});
