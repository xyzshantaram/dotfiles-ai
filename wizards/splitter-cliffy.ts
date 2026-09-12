#!/usr/bin/env -S deno run --no-lock --allow-read --allow-write --allow-run --allow-env --allow-sys --allow-net
//
// Splitter wizard on Cliffy prompts: assign delivery order costs across people.
// Reads run orders.json, walks one row per Select decision with fee lines
// merged, writes output.json, then offers the Splitwise push.
//

import { Select } from "cliffy-select";
import { Checkbox } from "cliffy-checkbox";
import { Number as NumberPrompt } from "cliffy-number";
import { Input } from "cliffy-input";
import { Confirm } from "cliffy-confirm";
import { $ } from "zx";
import {
  buildOutputDoc,
  countDoneOrders,
  createSaver,
  customAmounts,
  equalAmounts,
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
import { listRuns, readRun, runFilePath, updateRun } from "../src/runstate.ts";
import { createRunLog, type RunLog } from "../src/log.ts";
import { loadSettings } from "../src/settings.ts";
import { B, banner, hotkeyMenu, renderProgress, renderTreeRow, YELLOW } from "../src/cliffy-kit.ts";

// Picker value that opens the people editor.
const CHANGE_PEOPLE = "__change__";

// Clear the whole screen before each item so the wizard feels fullscreen
// without an alternate buffer (nothing can get stuck on Ctrl-C).
function clearScreen(): void {
  if (!Deno.stdout.isTerminal()) return;
  Deno.stdout.writeSync(new TextEncoder().encode("\x1b[2J\x1b[H"));
}

// Repo root holds the scripts dir and the wizards dir.
const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/\/+$/, "");

// Active run log. Every failure names its path.
let LOG: RunLog | null = null;

// Currency code loaded from settings. Prefixes every amount on screen.
let CUR = "INR";

// One row on screen. Fee rows merge every fee line of one order.
interface DisplayRow {
  orderPos: number;
  platform: string;
  date: string;
  name: string;
  price: number;
  fee: boolean;
  indexes: number[];
}

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

// Merge fee lines of each order into one Fees row. Keeps flat order.
function buildRows(flat: FlatItem[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const feeRowByOrder = new Map<number, DisplayRow>();
  for (let i = 0; i < flat.length; i++) {
    const line = flat[i];
    if (!line.isFee) {
      rows.push({
        orderPos: line.orderPos,
        platform: line.platform,
        date: line.date,
        name: line.name,
        price: line.price,
        fee: false,
        indexes: [i],
      });
      continue;
    }
    const found = feeRowByOrder.get(line.orderPos);
    if (found !== undefined) {
      found.price = Math.round((found.price + line.price) * 100) / 100;
      found.indexes.push(i);
    } else {
      const row: DisplayRow = {
        orderPos: line.orderPos,
        platform: line.platform,
        date: line.date,
        name: "Fees",
        price: line.price,
        fee: true,
        indexes: [i],
      };
      feeRowByOrder.set(line.orderPos, row);
      rows.push(row);
    }
  }
  return rows;
}

// True when every underlying line holds an assignment or a skip.
function rowDecided(doc: SplitStateDoc, row: DisplayRow): boolean {
  return row.indexes.every((i) =>
    doc.assignments[String(i)] !== undefined || doc.skipped[String(i)] === true
  );
}

// Find the first row with an undecided line. Returns total when done.
function firstOpenRow(rows: DisplayRow[], doc: SplitStateDoc): number {
  for (let p = 0; p < rows.length; p++) {
    if (!rowDecided(doc, rows[p])) return p;
  }
  return rows.length;
}

// Ask how many people share these orders. Defaults to 3.
async function askHowMany(initial: number): Promise<number> {
  return await NumberPrompt.prompt({
    message: "How many people split these orders?",
    default: initial,
    min: 1,
    max: 20,
  });
}

// Fill n name slots, keeping existing names where they fit.
function defaultNames(n: number, existing: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(existing[i] ?? "Person " + (i + 1));
  return out;
}

// Ask for each name. Blank keeps the default.
async function askNames(defaults: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const fallback = defaults[i] ?? "Person " + (i + 1);
    const raw = await Input.prompt({
      message: "Name person " + (i + 1) + " of " + defaults.length + ":",
      default: fallback,
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
  let first = preferred !== null && people.includes(preferred) ? preferred : people[0];
  while (true) {
    const ordered = [first, ...people.filter((p) => p !== first)];
    const pick: string = await Select.prompt({
      message: "Who paid for these orders?",
      options: [
        ...ordered.map((p) => ({ name: p, value: p })),
        { name: "Change people", value: CHANGE_PEOPLE },
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

// Run one child wizard with inherited stdio. Mirrors meta runWizard.
async function runWizard(file: string, extra: string[]): Promise<number> {
  // Record the exact command in the run log only.
  LOG?.write("info", "run wizards/" + file + (extra.length > 0 ? " " + extra.join(" ") : ""));
  try {
    // Keep child output on the same terminal.
    const env = { ...Deno.env.toObject(), SPLIT_UTILS_FROM_MENU: "1" };
    await $({ cwd: ROOT, stdio: "inherit", env })`deno run -A --no-lock ${
      "wizards/" + file
    } ${extra}`;
    return 0;
  } catch (e) {
    // Read the exit code from the failed process.
    const code = (e as { exitCode?: unknown }).exitCode;
    return typeof code === "number" ? code : 1;
  }
}

// Launch the main menu on the same terminal, then stop this wizard.
async function launchMenu(): Promise<never> {
  console.log("Back to the main menu.");
  await runWizard("meta.ts", []);
  Deno.exit(0);
}

// Ask which people share one row. Starts with everyone checked.
async function askPeople(message: string, people: string[]): Promise<string[]> {
  return await Checkbox.prompt({
    message,
    options: people.map((p) => ({ name: p, value: p, checked: true })),
  });
}

// Ask custom amounts for one total. Prefills the equal share.
// Retries until the amounts match the total.
async function askCustomTotal(total: number, chosen: string[]): Promise<Record<string, number>> {
  while (true) {
    const pre = equalAmounts(total, chosen);
    const input: Record<string, number> = {};
    for (const name of chosen) {
      const v: number = await NumberPrompt.prompt({
        message: name + " pays, in " + CUR + ":",
        default: pre[name],
      });
      input[name] = v;
    }
    try {
      return customAmounts(input, total);
    } catch (e) {
      console.log((e instanceof Error ? e.message : String(e)) + " Try again.");
    }
  }
}

// Split one custom fee total across fee lines pro-rata to those totals.
function prorateFee(
  totals: Record<string, number>,
  feeSum: number,
  price: number,
  chosen: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of chosen) {
    out[p] = Math.round(((totals[p] ?? 0) * price / feeSum) * 100) / 100;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  const gap = Math.round((price - sum) * 100) / 100;
  const last = chosen[chosen.length - 1];
  out[last] = Math.round(((out[last] ?? 0) + gap) * 100) / 100;
  return out;
}

// Find the nearest saved split before this flat line. Returns null when none.
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

// Save the same split to every underlying line of the row.
function saveEqual(doc: SplitStateDoc, flat: FlatItem[], row: DisplayRow, people: string[]): void {
  for (const i of row.indexes) {
    const price = flat[i].price;
    doc.assignments[String(i)] = {
      splitType: "equal",
      people: [...people],
      amounts: equalAmounts(price, people),
    };
    delete doc.skipped[String(i)];
  }
}

// Mark every underlying line of the row skipped.
function saveSkipped(doc: SplitStateDoc, row: DisplayRow): void {
  for (const i of row.indexes) {
    delete doc.assignments[String(i)];
    doc.skipped[String(i)] = true;
  }
}

// Main loop. Returns when every row holds an assignment or a skip.
async function assignLoop(
  flat: FlatItem[],
  rows: DisplayRow[],
  orderCount: number,
  doc: SplitStateDoc,
  runId: string,
  persist: (orderPos: number, index: number) => void,
  flush: () => Promise<void>,
): Promise<void> {
  let pos = firstOpenRow(rows, doc);
  while (pos < rows.length) {
    const row = rows[pos];
    const assigned = Object.keys(doc.assignments).length;
    const skipped = Object.keys(doc.skipped).length;
    const left = flat.length - assigned - skipped;
    clearScreen();
    console.log(
      "  " + B(
        "[" + (row.orderPos + 1) + "/" + orderCount +
          "] · " + row.platform + " · " + row.date,
      ),
    );
    console.log("");
    const orderRows = rows.filter((r) => r.orderPos === row.orderPos);
    for (let k = 0; k < orderRows.length; k++) {
      const r = orderRows[k];
      const quote = r.name.startsWith("[") ? r.name : "\u201c" + r.name + "\u201d";
      const text = quote + " — " + CUR + " " + fmtRs(r.price);
      const last = k === orderRows.length - 1;
      const at = rows.indexOf(r);
      if (at < pos) {
        const isSkip = doc.skipped[String(r.indexes[0])] === true;
        console.log(renderTreeRow(isSkip ? "skipped" : "done", text, last));
      } else if (at === pos) {
        console.log(renderTreeRow("current", text, last));
      } else {
        console.log(renderTreeRow("todo", text, last));
      }
    }
    console.log("");
    console.log(renderProgress(assigned, skipped, left));
    if (row.fee) {
      console.log(YELLOW(
        "  Fee default: everyone pays " + CUR + " " +
          fmtRs(row.price / doc.people.length) + " each.",
      ));
    }
    console.log("");
    const choice = await hotkeyMenu(
      [
        { key: "s", label: "split with everyone", value: "all" },
        { key: "k", label: "skip this item", value: "skip" },
        { key: "r", label: "same people as the last item", value: "repeat" },
        { key: "m", label: "just the payer", value: "payer" },
        { key: "Enter", label: "pick people", value: "pick" },
        { key: "c", label: "type exact amounts", value: "custom" },
        { key: "b", label: "back to the main menu", value: "menu" },
      ],
      0,
      () => flush(),
    );

    if (choice === "menu") {
      await flush();
      console.log("Progress saved.");
      LOG?.write("info", "exit to menu for run " + runId);
      LOG?.close("exit to menu");
      await launchMenu();
    } else if (choice === "skip") {
      saveSkipped(doc, row);
      console.log("Left " + row.name + " with nobody.");
      persist(row.orderPos, row.indexes[0]);
    } else if (choice === "all") {
      saveEqual(doc, flat, row, [...doc.people]);
      persist(row.orderPos, row.indexes[0]);
    } else if (choice === "payer") {
      for (const i of row.indexes) {
        const price = flat[i].price;
        doc.assignments[String(i)] = {
          splitType: "single",
          people: [doc.payer],
          amounts: singleAmounts(price, doc.payer),
        };
        delete doc.skipped[String(i)];
      }
      console.log(doc.payer + " takes the full line.");
      persist(row.orderPos, row.indexes[0]);
    } else if (choice === "repeat") {
      const prev = previousAssignment(doc, row.indexes[0]);
      if (prev === null) {
        console.log("No previous split to repeat.");
        continue;
      }
      for (const i of row.indexes) {
        const next = repeatAmounts(prev, flat[i].price, doc.people);
        doc.assignments[String(i)] = next;
        delete doc.skipped[String(i)];
      }
      const shown = repeatAmounts(prev, row.price, doc.people);
      console.log("Repeated: " + shown.people.join(", ") + ".");
      persist(row.orderPos, row.indexes[0]);
    } else if (choice === "pick") {
      const picked = await askPeople("Split with whom?", doc.people);
      if (picked.length === 0) {
        console.log("Pick one person at least.");
        continue;
      }
      saveEqual(doc, flat, row, picked);
      persist(row.orderPos, row.indexes[0]);
    } else if (choice === "custom") {
      const picked = await askPeople("Custom split for whom?", doc.people);
      if (picked.length === 0) {
        console.log("Pick one person at least.");
        continue;
      }
      if (!row.fee) {
        const amounts = await askCustomTotal(row.price, picked);
        const i = row.indexes[0];
        doc.assignments[String(i)] = { splitType: "custom", people: picked, amounts };
        delete doc.skipped[String(i)];
      } else {
        const totals = await askCustomTotal(row.price, picked);
        for (const i of row.indexes) {
          doc.assignments[String(i)] = {
            splitType: "custom",
            people: [...picked],
            amounts: prorateFee(totals, row.price, flat[i].price, picked),
          };
          delete doc.skipped[String(i)];
        }
      }
      persist(row.orderPos, row.indexes[0]);
    } else {
      console.log("That choice is not used here. Pick one choice from the list.");
      continue;
    }

    const next = firstOpenRow(rows, doc);
    if (next >= rows.length || rows[next].orderPos !== row.orderPos) {
      await flush();
      const done = countDoneOrders(flat, orderCount, doc);
      await updateRun(runId, { ordersDone: done, ordersTotal: orderCount });
      console.log("Order " + (row.orderPos + 1) + " of " + orderCount + " done.");
      LOG?.write("info", "order done " + (row.orderPos + 1) + "/" + orderCount + " run " + runId);
    }
    pos = next;
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
    console.log(res.stdout.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    LOG?.write("error", "validator failed for " + out + ": " + msg);
    LOG?.close("validator failed");
    throw new Error("The output failed its own check. This is a bug.");
  }
}

async function main(): Promise<void> {
  banner("split-utils — assign splits");

  // Session start: runId positional or the picker over gathered runs.
  const arg = positionalArg();
  let runId: string | null = arg;
  if (runId === null) {
    const runs = (await listRuns()).filter((r) => r.status === "gathered");
    if (runs.length === 0) {
      throw new Error("No gathered runs found. Gather first.");
    }
    runId = await Select.prompt({
      message: "Pick a run to split:",
      options: runs.map((r) => ({ name: describeRun(r), value: r.id })),
    });
  }
  LOG = createRunLog("split");
  LOG.write("info", "cliffy split started for run " + runId);

  const loaded = await loadOrders(runId);
  if (loaded === null) {
    throw new Error("This run has no orders yet. Gather first.");
  }
  const flat = flattenOrders(loaded.orders);
  if (flat.length === 0) {
    throw new Error("This run holds no items to split.");
  }
  const orderCount = (loaded.orders as Order[]).length;
  const rows = buildRows(flat);

  const settings = await loadSettings();
  CUR = settings.currency;

  // Default payer: last payer seen in any previous run meta.
  const runs = await listRuns();
  const prev = runs.find((r) => r.id !== runId && r.lastPayer);
  const lastPayer = prev?.lastPayer ?? null;

  // Resume: an existing state file restarts at the exact unfinished row.
  let doc: SplitStateDoc | null = await loadSplitState(loaded.dir);
  let people: string[] = doc?.people ?? [];
  let payer: string = doc?.payer ?? "";
  if (
    doc !== null && (Object.keys(doc.assignments).length > 0 || Object.keys(doc.skipped).length > 0)
  ) {
    const resume = await Confirm.prompt({ message: "Continue where you left off?" });
    if (!resume) {
      const kept = await askNames(
        defaultNames(await askHowMany(people.length > 0 ? people.length : 3), people),
      );
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
      console.log("Saved a spare copy because another window saved first.");
      LOG?.write("warn", "conflict copy at " + res.path);
    }
  }
  const saver = createSaver(SAVE_DEBOUNCE_MS, () => persist(doc!.cursor.order, doc!.cursor.item));
  // Flush pending saves on Ctrl-C outside the menu. The menu flushes itself.
  Deno.addSignalListener("SIGINT", () => {
    void (async () => {
      try {
        await saver.flush();
      } finally {
        Deno.exit(130);
      }
    })();
  });
  const schedulePersist = (orderPos: number, index: number): void => {
    doc!.cursor = { order: orderPos, item: index };
    saver.schedule();
  };

  // Payer prompt with the people editor. Rename remaps by position.
  if (payer === "" || !people.includes(payer)) {
    payer = await askPayer(doc, doc.payer || lastPayer, (next) => {
      people = next.people;
      doc = { ...next, payer: doc!.payer };
      schedulePersist(doc.cursor.order, doc.cursor.item);
    });
  }
  doc = { ...doc, people, payer };
  await updateRun(runId, { lastPayer: payer, ordersDone: 0, ordersTotal: orderCount });
  LOG.write("info", "session payer " + payer + " people " + people.join(","));

  // Item loop with one row in focus.
  await assignLoop(flat, rows, orderCount, doc, runId, schedulePersist, () => saver.flush());
  await saver.flush();

  // Export and finish: write outputs, validate, mark assigned, offer push.
  const { out, stamped } = await writeOutputs(loaded.dir, doc, flat);
  await runValidator(out);
  await updateRun(runId, {
    status: "assigned",
    outputFile: "output.json",
    ordersDone: orderCount,
    ordersTotal: orderCount,
  });
  LOG.write("info", "export assigned run " + runId);
  LOG.close("assigned");
  console.log("All items assigned. Your split is ready.");
  console.log("Wrote " + out);
  console.log("Wrote " + stamped);

  const push = await Confirm.prompt({ message: "Send these to Splitwise now?" });
  if (push) {
    await runWizard("pusher.ts", [runId]);
    Deno.exit(0);
  }
  await launchMenu();
}

// Read the run log path without tripping control flow narrowing.
function logPath(): string | null {
  if (LOG === null) return null;
  return LOG.path;
}

try {
  await main();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log(msg);
  const path = logPath();
  if (path !== null) console.log("See the run log at " + path);
  else console.log("No run log was opened.");
  Deno.exit(1);
}
