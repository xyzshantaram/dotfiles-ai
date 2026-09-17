// Splitter state: flat lines, pure split math, and safe saves.
// The wizard drives the UI. This module holds the logic heads can test.

import { isFeeItem, type Order, type OutputDoc, parseDate } from "./common.ts";
import { round2 } from "./splitengine.ts";
import type { RunMeta } from "./runstate.ts";

// One flat line the wizard shows. Quantity copies become separate lines.
export interface FlatItem {
  orderPos: number;
  orderId: string;
  platform: string;
  date: string;
  orderTotal: number;
  name: string;
  price: number;
  estimated: boolean;
  isFee: boolean;
}

// One saved split for a flat line. Amounts always hold rupees.
export interface ItemAssignment {
  splitType: string;
  people: string[];
  amounts: Record<string, number>;
}

// Cursor points at the line the wizard shows next.
export interface SplitCursor {
  order: number;
  item: number;
}

// Saved splitter session for one run. Keys hold flat line indexes.
export interface SplitStateDoc {
  version: 1;
  payer: string;
  people: string[];
  assignments: Record<string, ItemAssignment>;
  skipped: Record<string, boolean>;
  cursor: SplitCursor;
  updatedAt: string;
}

// Name of the state file inside the run dir.
export const STATE_FILE = "split-state.json";
// Base name for conflict copies when another copy is newer.
const CONFLICT_BASE = "split-state";
// Wait before a scheduled save fires, in milliseconds.
export const SAVE_DEBOUNCE_MS = 800;

// Expand orders into wizard lines. Mirrors the dashboard loader.
export function flattenOrders(orders: Order[]): FlatItem[] {
  const flat: FlatItem[] = [];
  orders.forEach((order, orderPos) => {
    for (const item of order.items ?? []) {
      const qty = Math.max(1, Math.floor(item.quantity ?? 1));
      for (let i = 0; i < qty; i++) {
        flat.push({
          orderPos,
          orderId: order.id ?? "",
          platform: order.platform ?? "",
          date: order.date ?? "",
          orderTotal: order.paid ?? 0,
          name: item.name ?? "Unknown item",
          price: item.price ?? 0,
          estimated: item.estimated ?? false,
          isFee: isFeeItem(item.name ?? ""),
        });
      }
    }
    const fees = order.fees ?? { delivery: 0, packaging: 0 };
    if ((fees.delivery ?? 0) > 0.001) {
      flat.push({
        orderPos,
        orderId: order.id ?? "",
        platform: order.platform ?? "",
        date: order.date ?? "",
        orderTotal: order.paid ?? 0,
        name: "[Delivery]",
        price: fees.delivery,
        estimated: false,
        isFee: true,
      });
    }
    if ((fees.packaging ?? 0) > 0.001) {
      flat.push({
        orderPos,
        orderId: order.id ?? "",
        platform: order.platform ?? "",
        date: order.date ?? "",
        orderTotal: order.paid ?? 0,
        name: "[Packaging]",
        price: fees.packaging,
        estimated: false,
        isFee: true,
      });
    }
  });
  return flat;
}

// Split the price evenly. The rounding gap lands on the last person.
export function equalAmounts(
  price: number,
  people: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (people.length === 0) return out;
  const share = round2(price / people.length);
  for (const name of people) out[name] = share;
  const gap = round2(price - share * people.length);
  out[people[people.length - 1]] = round2(share + gap);
  return out;
}

// Give the whole price to one person.
export function singleAmounts(
  price: number,
  person: string,
): Record<string, number> {
  return { [person]: round2(price) };
}

// Check custom amounts. Every value must be a finite non negative number.
// The values must sum to the price within one paisa. Throws on failure.
export function customAmounts(
  input: Record<string, number>,
  price: number,
): Record<string, number> {
  const names = Object.keys(input);
  if (names.length === 0) throw new Error("custom split needs one person");
  const out: Record<string, number> = {};
  for (const name of names) {
    const amt = input[name];
    if (typeof amt !== "number" || !Number.isFinite(amt)) {
      throw new Error("amount for " + name + " is not a number");
    }
    if (amt < 0) throw new Error("amount for " + name + " is negative");
    out[name] = round2(amt);
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - price) > 0.01) {
    throw new Error(
      "amounts sum to " + sum.toFixed(2) + " but price is " + price.toFixed(2),
    );
  }
  return out;
}

// Repeat the previous split for a new price. People stay the same.
// Equal and single splits recompute. Other modes scale by price ratio.
export function repeatAmounts(
  prev: ItemAssignment,
  price: number,
  people: string[],
): ItemAssignment {
  const kept = prev.people.filter((name) => people.includes(name));
  const selected = kept.length > 0 ? kept : [...people];
  if (prev.splitType === "single") {
    const person = selected[0];
    return {
      splitType: "single",
      people: [person],
      amounts: singleAmounts(price, person),
    };
  }
  if (prev.splitType === "equal") {
    return {
      splitType: "equal",
      people: selected,
      amounts: equalAmounts(price, selected),
    };
  }
  const oldTotal = Object.values(prev.amounts).reduce((a, b) => a + b, 0);
  const ratio = oldTotal > 0 ? price / oldTotal : 0;
  const amounts: Record<string, number> = {};
  for (const name of selected) {
    amounts[name] = round2((prev.amounts[name] ?? 0) * ratio);
  }
  const gap = round2(price - Object.values(amounts).reduce((a, b) => a + b, 0));
  amounts[selected[selected.length - 1]] = round2(
    amounts[selected[selected.length - 1]] + gap,
  );
  return { splitType: prev.splitType, people: selected, amounts };
}

// Sum every assignment into per person totals, rounded to two decimals.
export function computeTotals(
  people: string[],
  assignments: Record<string, ItemAssignment>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const name of people) totals[name] = 0;
  for (const assignment of Object.values(assignments)) {
    for (const [name, amt] of Object.entries(assignment.amounts)) {
      totals[name] = round2((totals[name] ?? 0) + amt);
    }
  }
  return totals;
}

// Point every non payer debt at the payer. Mirrors the dashboard.
export function computeSettlements(
  people: string[],
  totals: Record<string, number>,
  payer: string,
): { from: string; to: string; amount: number }[] {
  const out: { from: string; to: string; amount: number }[] = [];
  for (const name of people) {
    if (name === payer) continue;
    const amount = round2(totals[name] ?? 0);
    if (amount > 0.001) out.push({ from: name, to: payer, amount });
  }
  return out;
}

// Format a date for output.json. Keeps the raw string when it does not parse.
export function formatOutputDate(raw: string): string {
  const dt = parseDate(raw);
  if (dt === null) return raw;
  const pad = (n: number): string => String(n).padStart(2, "0");
  const hour24 = dt.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 < 12 ? "AM" : "PM";
  return (
    dt.getFullYear() +
    "-" +
    pad(dt.getMonth() + 1) +
    "-" +
    pad(dt.getDate()) +
    " " +
    hour12 +
    ":" +
    pad(dt.getMinutes()) +
    " " +
    ampm
  );
}

// Build the canonical output doc. Skipped lines stay out of the splits.
export function buildOutputDoc(opts: {
  flat: FlatItem[];
  assignments: Record<string, ItemAssignment>;
  skipped: Record<string, boolean>;
  people: string[];
  payer: string;
  splitAt?: string;
}): OutputDoc {
  const splits: OutputDoc["splits"] = [];
  const totals: Record<string, number> = {};
  for (const name of opts.people) totals[name] = 0;
  opts.flat.forEach((line, index) => {
    const key = String(index);
    if (opts.skipped[key]) return;
    const assignment = opts.assignments[key];
    if (!assignment) return;
    splits.push({
      item: line.name,
      platform: line.platform,
      order_id: line.orderId,
      date: formatOutputDate(line.date),
      price: line.price,
      split_type: assignment.splitType,
      assignments: { ...assignment.amounts },
    });
    for (const [name, amt] of Object.entries(assignment.amounts)) {
      totals[name] = round2((totals[name] ?? 0) + amt);
    }
  });
  for (const name of Object.keys(totals)) totals[name] = round2(totals[name]);
  return {
    split_at: opts.splitAt ?? new Date().toISOString(),
    people: [...opts.people],
    splits,
    totals,
    settlements: computeSettlements(opts.people, totals, opts.payer),
  };
}

// Rename by set difference. Same count only. Empty map keeps a pure reorder unchanged.
export function remapPeople(doc: SplitStateDoc, next: string[]): SplitStateDoc {
  if (next.length !== doc.people.length) return doc;
  const gone = doc.people.filter((name) => !next.includes(name));
  const fresh = next.filter((name) => !doc.people.includes(name));
  if (gone.length === 0 || fresh.length === 0) return doc;
  const rename = new Map<string, string>();
  gone.forEach((old, i) => {
    const nextName = fresh[i];
    if (nextName !== undefined && nextName !== old) rename.set(old, nextName);
  });
  if (rename.size === 0) return doc;
  const people = doc.people.map((name) => rename.get(name) ?? name);
  const payer = rename.get(doc.payer) ?? doc.payer;
  const assignments: Record<string, ItemAssignment> = {};
  for (const [key, assignment] of Object.entries(doc.assignments)) {
    const amounts: Record<string, number> = {};
    for (const [name, amt] of Object.entries(assignment.amounts)) {
      amounts[rename.get(name) ?? name] = amt;
    }
    assignments[key] = {
      splitType: assignment.splitType,
      people: assignment.people.map((name) => rename.get(name) ?? name),
      amounts,
    };
  }
  return {
    ...doc,
    payer,
    people,
    assignments,
    skipped: { ...doc.skipped },
    cursor: { ...doc.cursor },
  };
}

// Find the first line with no assignment and no skip. Returns total when done.
export function firstUnfinished(
  total: number,
  assignments: Record<string, ItemAssignment>,
  skipped: Record<string, boolean>,
): number {
  for (let i = 0; i < total; i++) {
    const key = String(i);
    if (!assignments[key] && !skipped[key]) return i;
  }
  return total;
}

// Count orders where every line holds an assignment or a skip.
export function countDoneOrders(
  flat: FlatItem[],
  orderCount: number,
  doc: SplitStateDoc,
): number {
  let done = 0;
  for (let o = 0; o < orderCount; o++) {
    let open = false;
    flat.forEach((line, index) => {
      if (line.orderPos !== o) return;
      const key = String(index);
      if (!doc.assignments[key] && !doc.skipped[key]) open = true;
    });
    if (!open) done += 1;
  }
  return done;
}

// Make a fresh session doc for one run.
export function freshState(people: string[], payer: string): SplitStateDoc {
  return {
    version: 1,
    payer,
    people: [...people],
    assignments: {},
    skipped: {},
    cursor: { order: 0, item: 0 },
    updatedAt: new Date().toISOString(),
  };
}

// Path of the state file inside a run dir.
export function statePath(runDir: string): string {
  return runDir + "/" + STATE_FILE;
}

// Load the saved session. Returns null when no file exists.
export async function loadSplitState(
  runDir: string,
): Promise<SplitStateDoc | null> {
  let text: string;
  try {
    text = await Deno.readTextFile(statePath(runDir));
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as SplitStateDoc;
  } catch {
    throw new Error("bad split state " + statePath(runDir));
  }
}

// Sync twin of loadSplitState for step functions, which are sync.
// Returns null when no file exists. Throws on bad JSON.
export function loadSplitStateSync(runDir: string): SplitStateDoc | null {
  let text: string;
  try {
    text = Deno.readTextFileSync(statePath(runDir));
  } catch {
    return null;
  }
  try {
    return JSON.parse(text) as SplitStateDoc;
  } catch {
    throw new Error("bad split state " + statePath(runDir));
  }
}

// Read the state file mtime in milliseconds. Returns 0 when it misses.
export async function snapshotMtime(runDir: string): Promise<number> {
  try {
    const info = await Deno.stat(statePath(runDir));
    return info.mtime?.getTime() ?? 0;
  } catch {
    return 0;
  }
}

// Result of one save attempt.
export interface SaveResult {
  conflicted: boolean;
  path: string;
  // Carry the state file time this attempt leaves behind.
  at: number;
}

// Temp path for one save. Carries the process id plus a random id,
// so two overlapping saves never share a file. Stays beside the
// real file, so the rename stays on one file system. Ends in .tmp,
// so stray temp files stay easy to spot.
export function tmpStatePath(runDir: string): string {
  return statePath(runDir) + "." + Deno.pid + "-" + crypto.randomUUID() +
    ".tmp";
}

// Save the session with an atomic replace and a conflict guard.
// Writes to a private temp file first, then renames over the real file.
// When the real file grew newer than the baseline, the save lands in a
// conflict copy instead and the real file stays untouched.
// Two saves inside one timestamp tick read as equal.
// The later one wins.
// The earlier one is lost.
// The owner accepted this limit.
// Carry at forward into the next save.
export async function writeSplitState(
  runDir: string,
  doc: SplitStateDoc,
  baselineMs: number,
): Promise<SaveResult> {
  const stamped: SplitStateDoc = {
    ...doc,
    updatedAt: new Date().toISOString(),
  };
  const tmp = tmpStatePath(runDir);
  try {
    await Deno.writeTextFile(tmp, JSON.stringify(stamped, null, 2) + "\n");
    const current = await snapshotMtime(runDir);
    if (current > baselineMs) {
      // Build a conflict name with millisecond time.
      // Probe with a sync check.
      // Add a counter on clash.
      // Stop after a bound so the loop always ends.
      const stamp = Date.now();
      let conflict = runDir + "/" + CONFLICT_BASE + ".conflict-" + stamp +
        ".json";
      for (let n = 1; n < 1000; n++) {
        try {
          Deno.statSync(conflict);
        } catch {
          break;
        }
        conflict = runDir + "/" + CONFLICT_BASE + ".conflict-" + stamp +
          "-" + n + ".json";
      }
      await Deno.copyFile(tmp, conflict);
      await Deno.remove(tmp);
      // Return the live file time for the next baseline.
      return { conflicted: true, path: conflict, at: current };
    }
    await Deno.rename(tmp, statePath(runDir));
    // Read the fresh state file time after the rename.
    const at = await snapshotMtime(runDir);
    return { conflicted: false, path: statePath(runDir), at };
  } finally {
    // Drop the temp file when the write fails part way. Succeeds
    // silently when the rename already consumed it.
    try {
      await Deno.remove(tmp);
    } catch {
      // The temp file is already gone.
    }
  }
}

// Name of the output file inside the run dir.
export const OUTPUT_FILE = "output.json";

// Save the final output doc with an atomic replace. Writes to a temp
// file first, then renames over the real file. A stamped copy keyed by
// unix seconds lands beside it as a history of exports.
export async function writeOutputDoc(
  runDir: string,
  doc: unknown,
): Promise<string> {
  const outPath = runDir + "/" + OUTPUT_FILE;
  const unix = Math.floor(Date.now() / 1000);
  const stamped = runDir + "/output-" + unix + ".json";
  const tmp = outPath + ".tmp";
  await Deno.writeTextFile(tmp, JSON.stringify(doc, null, 2) + "\n");
  await Deno.copyFile(tmp, stamped);
  await Deno.rename(tmp, outPath);
  return outPath;
}

// Sync twin of writeOutputDoc for step functions, which are sync.
// Writes output.json plus the stamped history copy. Returns the path.
export function writeOutputDocSync(runDir: string, doc: unknown): string {
  const outPath = runDir + "/" + OUTPUT_FILE;
  const unix = Math.floor(Date.now() / 1000);
  const stamped = runDir + "/output-" + unix + ".json";
  const tmp = outPath + ".tmp";
  Deno.writeTextFileSync(tmp, JSON.stringify(doc, null, 2) + "\n");
  Deno.copyFileSync(tmp, stamped);
  Deno.renameSync(tmp, outPath);
  return outPath;
}

// Patch meta.json inside a run dir and keep every other field.
// Creates the file when it misses. Sync, so step functions can call it.
export function patchRunMeta(
  runDir: string,
  patch: Partial<RunMeta>,
): void {
  const path = runDir + "/meta.json";
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(Deno.readTextFileSync(path)) as Record<
      string,
      unknown
    >;
  } catch {
    // No meta yet, start from an empty record.
  }
  const next = { ...meta, ...patch };
  Deno.writeTextFileSync(path, JSON.stringify(next, null, 2) + "\n");
}

// Debounced saver. Schedule restarts the wait. Flush saves at once.
// Work that lands during a running save triggers one more save after it.
export function createSaver(
  delayMs: number,
  save: () => Promise<void>,
): { schedule(): void; flush(): Promise<void>; pending(): boolean } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: Promise<void> | null = null;
  let dirty = false;
  const run = async (): Promise<void> => {
    dirty = false;
    active = save();
    try {
      await active;
    } finally {
      active = null;
    }
  };
  const flush = async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (active !== null) {
      // Wait for the running save first.
      await active;
      // Save once more when new work arrived during the wait.
      if (dirty) await run();
      return;
    }
    await run();
  };
  return {
    schedule(): void {
      dirty = true;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delayMs);
    },
    flush,
    pending(): boolean {
      return timer !== null;
    },
  };
}
