#!/usr/bin/env -S deno run --no-lock --allow-read --allow-write --allow-run --allow-env --allow-sys --allow-net
//
// Splitter wizard: assign delivery order costs across people.
// Reads run orders.json, loops items with one key per split,
// writes output.json, then offers the Splitwise push.
//
// Exits run through wizardExit so the menu state machine holds.

import { $ } from "zx";
import { MepCLI } from "mepcli";
import {
  APP_VERSION,
  banner,
  checkHint,
  confirm,
  finish,
  keyLegend,
  menuSeparator,
  say,
  selectHint,
  setTotalStages,
  step,
  wizardExit,
} from "../src/wizardkit.ts";
import {
  buildOutputDoc,
  computeTotals,
  countDoneOrders,
  createSaver,
  customAmounts,
  equalAmounts,
  firstUnfinished,
  type FlatItem,
  flattenOrders,
  freshState,
  type ItemAssignment,
  loadSplitState,
  remapPeople,
  repeatAmounts,
  SAVE_DEBOUNCE_MS,
  singleAmounts,
  snapshotMtime,
  type SplitStateDoc,
  writeSplitState,
} from "../src/splitstate.ts";
import { fmtRs, type Order } from "../src/common.ts";
import { type OrderTreeRow, renderOrderTree } from "../src/render.ts";
import { listRuns, readRun, runFilePath, updateRun } from "../src/runstate.ts";
import { createRunLog, type RunLog } from "../src/log.ts";

// Picker value that opens the people editor.
const CHANGE_PEOPLE = "__change__";

// Repo root holds the scripts dir and the wizards dir.
const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/\/+$/, "");

// True when the user passed --dry on the command line.
const DRY = Deno.args.includes("--dry");

// Active run log. Every failure names its path.
let LOG: RunLog | null = null;

setTotalStages(3);

// First non flag argument feeds the run picker bypass.
function positionalArg(): string | null {
  for (const arg of Deno.args) {
    if (!arg.startsWith("--")) return arg;
  }
  return null;
}

// Build one picker row. Reuses the settled wording.
function shortDate(iso: string): string {
  // Show Sep 9 style. Add the year only for past years.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const label = months[date.getMonth()] + " " + date.getDate();
  return date.getFullYear() === new Date().getFullYear()
    ? label
    : label + ", " + date.getFullYear();
}

// Build one picker row. Reuses the settled wording.
function describeRun(
  meta: { createdAt: string; status: string; ordersDone?: number; ordersTotal?: number },
): string {
  const date = shortDate(meta.createdAt);
  const progress = meta.ordersTotal !== undefined
    ? (meta.ordersDone ?? 0) + " of " + meta.ordersTotal + " orders"
    : meta.status;
  return "Split from " + date + " — " + progress;
}

// Ask how many people share these orders. Defaults to 3.
async function askHowMany(initial: number): Promise<number> {
  const raw = await MepCLI.text({
    message: "How many people split these orders?",
    initial: String(initial),
    validate: (v) => {
      const n = Number(v.trim());
      return Number.isInteger(n) && n >= 1 && n <= 20 ? true : "Type a whole number from 1 to 20.";
    },
  });
  return Number(raw.trim());
}

// Fill n name slots, keeping existing names where they fit.
function defaultNames(n: number, existing: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(existing[i] ?? "Person " + (i + 1));
  return out;
}

// Ask for each name. Blank keeps the default. Mirrors the name dialog.
async function askNames(defaults: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const raw = await MepCLI.text({
      message: "Name person " + (i + 1) + " of " + defaults.length + ":",
      initial: defaults[i] ?? "Person " + (i + 1),
    });
    const name = raw.trim();
    out.push(name === "" ? "Person " + (i + 1) : name);
  }
  return out;
}

// Ask who paid. Offers the people editor as one extra choice.
async function askPayer(
  doc: SplitStateDoc,
  preferred: string | null,
  onRename: (next: SplitStateDoc) => void,
): Promise<string> {
  let people = doc.people;
  let first = preferred && people.includes(preferred) ? preferred : people[0];
  while (true) {
    const ordered = [first, ...people.filter((p) => p !== first)];
    const pick = await MepCLI.select<string>({
      message: "Who paid for these orders?" + selectHint(),
      choices: [
        ...ordered.map((p) => ({ title: p, value: p })),
        menuSeparator(),
        { title: "Change people", value: CHANGE_PEOPLE },
      ],
    });
    if (pick !== CHANGE_PEOPLE) return pick;
    const names = await askNames(people);
    const next = remapPeople({ ...doc, people: [...people] }, names);
    people = next.people;
    first = people[0];
    onRename(next);
  }
}

// Read orders.json from a run dir. Accepts a bare array or an orders key.
async function loadOrders(runId: string): Promise<{ orders: Order[]; dir: string } | null> {
  const found = await readRun(runId);
  if (found === null) return null;
  const path = await runFilePath(runId, "orders.json");
  if (path === null) return null;
  const raw = JSON.parse(await Deno.readTextFile(path)) as unknown;
  const orders = (Array.isArray(raw) ? raw : (raw as { orders?: Order[] }).orders ?? []) as Order[];
  return { orders, dir: found.dir };
}

// Launch the main menu on the same terminal, then stop this wizard.
async function launchMenu(): Promise<never> {
  say("Back to the main menu.");
  try {
    await $({ cwd: ROOT, stdio: "inherit" })`deno run -A --no-lock wizards/meta.ts`;
  } catch {
    LOG?.write("warn", "menu launch failed; rerun wizards/meta.ts by hand");
    say("The menu did not open. Open it again from the shortcut or the install folder.");
  }
  wizardExit(0);
}

// Ask custom amounts. Prefills the equal share. Retries until sums match.
async function askCustomAmounts(line: FlatItem, chosen: string[]): Promise<Record<string, number>> {
  while (true) {
    const pre = equalAmounts(line.price, chosen);
    const input: Record<string, number> = {};
    for (const name of chosen) {
      const raw = await MepCLI.text({
        message: name + " pays, in rupees:",
        initial: pre[name].toFixed(2),
        validate: (v) => {
          const n = Number(v.trim());
          return Number.isFinite(n) && n >= 0 ? true : "Type a number like 120.50.";
        },
      });
      input[name] = Number(raw.trim());
    }
    try {
      return customAmounts(input, line.price);
    } catch (e) {
      say((e instanceof Error ? e.message : String(e)) + " Try again.");
    }
  }
}

// Ask which people share one line. Starts with everyone checked.
async function askPeople(message: string, people: string[]): Promise<string[]> {
  return await MepCLI.checkbox<string>({
    message: message + checkHint(),
    choices: people.map((p) => ({ title: p, value: p, selected: true })),
  });
}

// Find the nearest saved split before this line. Returns null when none.
function previousAssignment(
  doc: SplitStateDoc,
  index: number,
): ItemAssignment | null {
  for (let i = index - 1; i >= 0; i--) {
    const found = doc.assignments[String(i)];
    if (found) return found;
  }
  return null;
}

// Main loop. Returns when every line holds an assignment or a skip.
async function assignLoop(
  flat: FlatItem[],
  orderCount: number,
  doc: SplitStateDoc,
  runId: string,
  persist: (orderPos: number, index: number) => void,
  flush: () => Promise<void>,
): Promise<void> {
  const orderOf = (index: number): number => flat[index].orderPos;
  let index = firstUnfinished(flat.length, doc.assignments, doc.skipped);
  while (index < flat.length) {
    const line = flat[index];
    const orderPos = orderOf(index);
    const orderIdx: number[] = [];
    flat.forEach((entry, i) => {
      if (entry.orderPos === orderPos) orderIdx.push(i);
    });
    const posInOrder = orderIdx.indexOf(index);
    // One tree per item: decided rows above, the current line marked,
    // later lines collapsed to a count. Space around the group.
    console.log("");
    const rows: OrderTreeRow[] = [];
    for (const i of orderIdx.slice(0, posInOrder)) {
      const f = flat[i];
      const saved = doc.assignments[String(i)];
      if (saved) {
        rows.push({
          name: f.name,
          price: f.price,
          isFee: f.isFee,
          estimated: f.estimated,
          state: "done",
          people: Object.keys(saved.amounts),
        });
      } else {
        rows.push({
          name: f.name,
          price: f.price,
          isFee: f.isFee,
          estimated: f.estimated,
          state: "skipped",
        });
      }
    }
    rows.push({
      name: line.name,
      price: line.price,
      isFee: line.isFee,
      estimated: line.estimated,
      state: "current",
    });
    console.log(renderOrderTree(
      "Order " + (orderPos + 1) + " of " + orderCount + " · " + line.platform + " · " + line.date,
      rows,
      orderIdx.length - posInOrder - 1,
      "Rs",
    ));
    console.log("");
    const assigned = Object.keys(doc.assignments).length;
    const skipped = Object.keys(doc.skipped).length;
    say(
      "Progress: " + assigned + " assigned, " + skipped + " skipped, " +
        (flat.length - assigned - skipped) + " left.",
    );
    const totals = computeTotals(doc.people, doc.assignments);
    say("Totals so far: " + doc.people.map((p) => p + " Rs" + fmtRs(totals[p] ?? 0)).join(" · "));

    const def = line.isFee ? equalAmounts(line.price, doc.people) : null;
    if (def !== null) {
      say(
        "Fee default: everyone pays Rs" + fmtRs(line.price / doc.people.length) +
          ". Enter keeps it.",
      );
    }
    const key = (await MepCLI.keypress({
      message: "\nPick a key from the list:\n" + keyLegend([
        ["a", "split with everyone"],
        ["n", "skip this item"],
        ["r", "same people as the last item"],
        ["m", "just the payer"],
        ["Enter", "pick people"],
        ["c", "type exact amounts"],
        ["s", "skip the rest of this order"],
        ["b", "back to the main menu"],
      ]) + "\n",
      keys: ["a", "n", "r", "m", "enter", "c", "s", "b"],
    })).trim().toLowerCase();
    const k = key === "" || key === "\r" || key === "\n" || key === "return" ? "enter" : key;

    if (k === "b") {
      await flush();
      say("Progress saved.");
      LOG?.write("info", "exit to menu for run " + runId);
      LOG?.close("exit to menu");
      await launchMenu();
    } else if (k === "s") {
      for (const i of orderIdx.slice(posInOrder)) {
        delete doc.assignments[String(i)];
        doc.skipped[String(i)] = true;
      }
      say("Skipped the rest of this order.");
      index = orderIdx[orderIdx.length - 1] + 1;
      persist(orderPos, index);
    } else if (k === "n") {
      delete doc.assignments[String(index)];
      doc.skipped[String(index)] = true;
      say("Left " + line.name + " with nobody.");
      index += 1;
      persist(orderOf(Math.min(index, flat.length - 1)), index);
    } else if (k === "a") {
      doc.assignments[String(index)] = {
        splitType: "equal",
        people: [...doc.people],
        amounts: equalAmounts(line.price, doc.people),
      };
      delete doc.skipped[String(index)];
      index += 1;
      persist(orderOf(Math.min(index, flat.length - 1)), index);
    } else if (k === "m") {
      doc.assignments[String(index)] = {
        splitType: "single",
        people: [doc.payer],
        amounts: singleAmounts(line.price, doc.payer),
      };
      delete doc.skipped[String(index)];
      say(doc.payer + " takes the full line.");
      index += 1;
      persist(orderOf(Math.min(index, flat.length - 1)), index);
    } else if (k === "r") {
      const prev = previousAssignment(doc, index);
      if (prev === null) {
        say("No previous split to repeat.");
        continue;
      }
      const next = repeatAmounts(prev, line.price, doc.people);
      doc.assignments[String(index)] = next;
      delete doc.skipped[String(index)];
      say("Repeated: " + next.people.join(", ") + ".");
      index += 1;
      persist(orderOf(Math.min(index, flat.length - 1)), index);
    } else if (k === "enter") {
      if (def !== null) {
        doc.assignments[String(index)] = {
          splitType: "equal",
          people: [...doc.people],
          amounts: def,
        };
        delete doc.skipped[String(index)];
        say("Kept the fee split.");
        index += 1;
        persist(orderOf(Math.min(index, flat.length - 1)), index);
      } else {
        const picked = await askPeople("Split with whom?", doc.people);
        if (picked.length === 0) {
          say("Pick one person at least.");
          continue;
        }
        doc.assignments[String(index)] = {
          splitType: "equal",
          people: picked,
          amounts: equalAmounts(line.price, picked),
        };
        delete doc.skipped[String(index)];
        index += 1;
        persist(orderOf(Math.min(index, flat.length - 1)), index);
      }
    } else if (k === "c") {
      const picked = await askPeople("Custom split for whom?", doc.people);
      if (picked.length === 0) {
        say("Pick one person at least.");
        continue;
      }
      const amounts = await askCustomAmounts(line, picked);
      doc.assignments[String(index)] = { splitType: "custom", people: picked, amounts };
      delete doc.skipped[String(index)];
      index += 1;
      persist(orderOf(Math.min(index, flat.length - 1)), index);
    } else {
      say("That key is not used here. Use one key from the list.");
      continue;
    }

    const nextOrder = index < flat.length ? orderOf(index) : -1;
    if (nextOrder !== orderPos) {
      await flush();
      const done = countDoneOrders(flat, orderCount, doc);
      await updateRun(runId, { ordersDone: done, ordersTotal: orderCount });
      say("Order " + (orderPos + 1) + " of " + orderCount + " done.");
      LOG?.write("info", "order done " + (orderPos + 1) + "/" + orderCount + " run " + runId);
    }
  }
}

// Write output.json plus a stamped copy. Returns both paths.
async function writeOutputs(
  dir: string,
  doc: SplitStateDoc,
  flat: FlatItem[],
): Promise<{ out: string; stamped: string }> {
  const output = buildOutputDoc({
    flat,
    assignments: doc.assignments,
    skipped: doc.skipped,
    people: doc.people,
    payer: doc.payer,
  });
  const out = dir + "/output.json";
  const stamped = dir + "/output-" + Math.floor(Date.now() / 1000) + ".json";
  await Deno.writeTextFile(out, JSON.stringify(output, null, 2) + "\n");
  await Deno.copyFile(out, stamped);
  LOG?.write("info", "wrote " + out);
  return { out, stamped };
}

// Run the validator shell. A failure is a bug, not a user error.
async function runValidator(out: string): Promise<void> {
  try {
    const res = await $`deno run --no-lock --allow-read ${ROOT}/scripts/validate.ts ${out}`;
    say(res.stdout.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    LOG?.write("error", "validator failed for " + out + ": " + msg);
    LOG?.close("validator failed");
    say("The output failed its own check. This is a bug.");
    say("The detail is in the run log.");
    wizardExit(1);
  }
}

if (DRY) {
  say("Splitter dry run. Nothing runs and nothing is written.");
  step("1 Pick a gathered run from the list");
  step("2 Ask who paid, with a Change people choice");
  step("3 Walk each item with one key from the list");
  step("4 Save your progress after each item");
  step("5 Write the finished split");
  step("6 Offer to send it to Splitwise");
  await finish(false);
  wizardExit(0);
}

await banner("split-utils wizard v" + APP_VERSION + " — assign splits");

// Session start: runId positional or the in-band picker.
const arg = positionalArg();
let runId: string | null = arg;
if (runId === null) {
  const runs = (await listRuns()).filter((r) => r.status === "gathered");
  if (runs.length === 0) {
    say("No gathered runs found. Gather first.");
    wizardExit(1);
  }
  runId = await MepCLI.select<string>({
    message: "Pick a run to split:" + selectHint(),
    choices: runs.map((r) => ({ title: describeRun(r), value: r.id })),
  });
}
LOG = createRunLog("split");
LOG.write("info", "split started for run " + runId);

const loaded = await loadOrders(runId);
if (loaded === null) {
  say("This run has no orders yet. Gather first.");
  LOG.write("error", "missing orders for run " + runId);
  LOG.close("missing orders");
  wizardExit(1);
}
const flat = flattenOrders(loaded.orders);
if (flat.length === 0) {
  say("This run holds no items to split.");
  LOG.close("empty run");
  wizardExit(1);
}
const orderCount = (loaded.orders as Order[]).length;

// Default payer: last payer seen in any previous run meta.
const runs = await listRuns();
const prev = runs.find((r) => r.id !== runId && r.lastPayer);
const lastPayer = prev?.lastPayer ?? null;

// Resume: an existing state file restarts at the exact unfinished line.
let doc: SplitStateDoc | null = await loadSplitState(loaded.dir);
let people: string[] = doc?.people ?? [];
let payer: string = doc?.payer ?? "";
if (
  doc !== null && (Object.keys(doc.assignments).length > 0 || Object.keys(doc.skipped).length > 0)
) {
  const resume = await confirm("Continue where you left off?");
  if (!resume) {
    const kept = defaultNames(await askHowMany(people.length > 0 ? people.length : 3), people);
    doc = freshState(kept, payer);
    people = kept;
  }
}
if (doc === null) doc = freshState([], "");
if (people.length === 0) {
  people = await askNames(defaultNames(await askHowMany(3), []));
  doc = { ...doc, people };
}

// Debounced atomic saves with the conflict guard.
let baseline = await snapshotMtime(loaded.dir);
async function persist(orderPos: number, index: number): Promise<void> {
  doc!.cursor = { order: orderPos, item: index };
  const res = await writeSplitState(loaded!.dir, doc!, baseline);
  baseline = Date.now();
  if (res.conflicted) {
    say("Saved a spare copy because another window saved first.");
    LOG?.write("warn", "conflict copy at " + res.path);
  }
}
const saver = createSaver(SAVE_DEBOUNCE_MS, () => persist(doc!.cursor.order, doc!.cursor.item));
const schedulePersist = (orderPos: number, index: number): void => {
  doc!.cursor = { order: orderPos, item: index };
  saver.schedule();
};

// Payer prompt with the people editor. Rename remaps by position.
if (!payer || !people.includes(payer)) {
  payer = await askPayer(doc, doc.payer || lastPayer, (next) => {
    people = next.people;
    doc = { ...next, payer: doc!.payer };
    schedulePersist(doc.cursor.order, doc.cursor.item);
  });
}
doc = { ...doc, people, payer };
await updateRun(runId, { lastPayer: payer, ordersDone: 0, ordersTotal: orderCount });
LOG.write("info", "session payer " + payer + " people " + people.join(","));

// Item loop with dashboard parity keys.
await assignLoop(flat, orderCount, doc, runId, schedulePersist, () => saver.flush());
await saver.flush();

// Export and finish: write outputs, validate, mark assigned, offer push.
const { out } = await writeOutputs(loaded.dir, doc, flat);
await runValidator(out);
await updateRun(runId, {
  status: "assigned",
  outputFile: "output.json",
  ordersDone: orderCount,
  ordersTotal: orderCount,
});
LOG.write("info", "export assigned run " + runId);
LOG.close("assigned");
say("All items assigned. Your split is ready.");

const push = await confirm("Send these to Splitwise now?");
if (push) {
  try {
    await $({ cwd: ROOT, stdio: "inherit" })`deno run -A --no-lock wizards/pusher.ts ${runId}`;
  } catch {
    say("The push wizard stopped early. The output stays saved.");
  }
  wizardExit(0);
}
await launchMenu();
