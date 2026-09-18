// Validate a splitter output.json file against the schema contract.
// See docs/schema.md for the full contract.
// Usage: deno run --no-lock --allow-read scripts/validate.ts <output.json> [--orders <orders.json>]

import { parseArgs } from "jsr:@std/cli@^1.0.32/parse-args";
import { fmtRs, type Order, type OutputDoc, type SplitEntry } from "../src/common.ts";

// Tolerance for one line balance check, in rupees.
const ITEM_TOL = 0.01;
// Tolerance for the per person totals check, in rupees.
const TOTALS_TOL = 0.05;
// Tolerance for the settlements sum check, in rupees.
const SETTLE_TOL = 0.05;
// Tolerance for the per order paid check, in rupees.
const ORDER_TOL = 0.01;

// Failure lines. Checks append here and never stop early.
const failures: string[] = [];

// Add one failure line with the FAIL prefix.
function fail(msg: string): void {
  failures.push(`FAIL: ${msg}`);
}

// True for finite numbers only. Rejects NaN and Infinity.
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// True for plain objects. Rejects arrays and null.
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Shape checked document. Later checks read these fields.
interface Checked {
  people: OutputDoc["people"];
  splits: SplitEntry[];
  totals: OutputDoc["totals"] | null;
  badTotals: Set<string>;
  settlements: OutputDoc["settlements"];
  settlementsOk: boolean;
}

// Read a JSON file. Records a failure and returns undefined on any error.
function readJson(path: string): unknown {
  let text: string;
  try {
    text = Deno.readTextFileSync(path);
  } catch {
    fail(`cannot read file "${path}"`);
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(`file "${path}" is not valid JSON`);
    return undefined;
  }
}

// Check the top level shape. Collect every shape failure.
// Return usable fields for the later math checks.
function checkShape(doc: unknown): Checked {
  const out: Checked = {
    people: [],
    splits: [],
    totals: null,
    badTotals: new Set<string>(),
    settlements: [],
    settlementsOk: false,
  };
  if (!isObj(doc)) {
    fail("output root must be an object");
    return out;
  }
  if (typeof doc["split_at"] !== "string") {
    fail('key "split_at" must be a string');
  }
  const people = doc["people"];
  if (
    !Array.isArray(people) || people.length === 0 ||
    !people.every((p) => typeof p === "string")
  ) {
    fail('key "people" must be a non-empty string array');
  } else {
    out.people = people as string[];
  }
  const peopleSet = new Set<string>(out.people);
  const splits = doc["splits"];
  if (!Array.isArray(splits)) {
    fail('key "splits" must be an array');
  } else {
    splits.forEach((entry, i) => {
      if (!isObj(entry)) {
        fail(`split #${i + 1} must be an object`);
        return;
      }
      const label = typeof entry["item"] === "string"
        ? `split "${entry["item"]}"`
        : `split #${i + 1}`;
      if (typeof entry["item"] !== "string") fail(`${label} is missing string "item"`);
      if (typeof entry["platform"] !== "string") fail(`${label} is missing string "platform"`);
      if (typeof entry["date"] !== "string") fail(`${label} is missing string "date"`);
      if (!isNum(entry["price"])) fail(`${label} is missing numeric "price"`);
      if (typeof entry["split_type"] !== "string") fail(`${label} is missing string "split_type"`);
      if (entry["order_id"] !== undefined && typeof entry["order_id"] !== "string") {
        fail(`${label} has non-string "order_id"`);
      }
      const assignments = entry["assignments"];
      if (!isObj(assignments)) {
        fail(`${label} is missing object "assignments"`);
        return;
      }
      let mathOk = isNum(entry["price"]);
      for (const [name, amt] of Object.entries(assignments)) {
        if (!isNum(amt)) {
          fail(`${label} has non-numeric assignment for "${name}"`);
          mathOk = false;
        } else if (!peopleSet.has(name)) {
          fail(`${label} assigns "${name}" who is not in "people"`);
        }
      }
      // Keep entries with numeric math for the balance checks.
      if (mathOk) out.splits.push(entry as unknown as SplitEntry);
    });
  }
  const totals = doc["totals"];
  if (!isObj(totals)) {
    fail('key "totals" must be an object');
  } else {
    const good: Record<string, number> = {};
    for (const [name, amt] of Object.entries(totals)) {
      if (!isNum(amt)) {
        fail(`totals entry for "${name}" must be a number`);
        out.badTotals.add(name);
      } else {
        good[name] = amt;
      }
    }
    out.totals = good;
  }
  const settlements = doc["settlements"];
  if (!Array.isArray(settlements)) {
    fail('key "settlements" must be an array');
  } else {
    out.settlementsOk = true;
    settlements.forEach((entry, i) => {
      const n = i + 1;
      if (!isObj(entry)) {
        fail(`settlement #${n} must be an object`);
        return;
      }
      if (typeof entry["from"] !== "string") fail(`settlement #${n} is missing string "from"`);
      if (typeof entry["to"] !== "string") fail(`settlement #${n} is missing string "to"`);
      if (!isNum(entry["amount"])) fail(`settlement #${n} is missing numeric "amount"`);
      if (
        typeof entry["from"] === "string" && typeof entry["to"] === "string" &&
        isNum(entry["amount"])
      ) {
        out.settlements.push({ from: entry["from"], to: entry["to"], amount: entry["amount"] });
      }
    });
  }
  return out;
}

// Check that each line balance holds. Report item name and both numbers.
function checkBalance(splits: SplitEntry[]): void {
  for (const s of splits) {
    const sum = Object.values(s.assignments).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - s.price) > ITEM_TOL) {
      fail(`split "${s.item}" sums to ${fmtRs(sum)} but price is ${fmtRs(s.price)}`);
    }
  }
}

// Check that each person total matches the sum of their assignments.
function checkTotals(checked: Checked): void {
  if (checked.totals === null || checked.people.length === 0) return;
  const totals = checked.totals;
  for (const name of checked.people) {
    if (checked.badTotals.has(name)) continue;
    const want = totals[name];
    if (want === undefined) {
      fail(`total for "${name}" is missing from "totals"`);
      continue;
    }
    let got = 0;
    for (const s of checked.splits) got += s.assignments[name] ?? 0;
    if (Math.abs(got - want) > TOTALS_TOL) {
      fail(`total for "${name}" sums to ${fmtRs(got)} but "totals" says ${fmtRs(want)}`);
    }
  }
}

// Check settlement membership and the payer sum.
// The dashboard points every settlement at the payer.
// It uses the first person as payer when settlements are empty.
function checkSettlements(checked: Checked): void {
  if (!checked.settlementsOk || checked.people.length === 0) return;
  const peopleSet = new Set<string>(checked.people);
  for (const e of checked.settlements) {
    if (!peopleSet.has(e.from)) fail(`settlement from "${e.from}" is not in "people"`);
    if (!peopleSet.has(e.to)) fail(`settlement to "${e.to}" is not in "people"`);
  }
  const tos = new Set(checked.settlements.map((e) => e.to));
  if (tos.size > 1) {
    fail(
      `settlements point at ${tos.size} payers (${[...tos].join(", ")}) but must share one payer`,
    );
    return;
  }
  if (checked.totals === null) return;
  const totals = checked.totals;
  const payer = checked.settlements.length > 0 ? checked.settlements[0].to : checked.people[0];
  let owed = 0;
  for (const name of checked.people) {
    if (name === payer) continue;
    owed += totals[name] ?? 0;
  }
  const paid = checked.settlements.reduce((a, e) => a + e.amount, 0);
  if (Math.abs(paid - owed) > SETTLE_TOL) {
    fail(
      `settlements sum to ${fmtRs(paid)} but non-payer totals sum to ${
        fmtRs(owed)
      } (payer "${payer}")`,
    );
  }
}

// Cross check split groups against orders.json.
// Group key is (platform, order_id) or (platform, date) for legacy rows.
// Source order ids carry a platform prefix, so match by suffix.
function checkOrders(splits: SplitEntry[], ordersPath: string): void {
  const raw = readJson(ordersPath);
  if (raw === undefined) return;
  // Accept a bare array or an envelope with an orders array.
  const orders: unknown = Array.isArray(raw) ? raw : (raw as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) {
    fail(`orders file "${ordersPath}" must hold an array of orders`);
    return;
  }
  interface Group {
    platform: string;
    orderId: string;
    date: string;
    sum: number;
  }
  const groups = new Map<string, Group>();
  for (const s of splits) {
    const orderId = typeof s.order_id === "string" ? s.order_id : "";
    const key = orderId !== "" ? `id ${s.platform} ${orderId}` : `date ${s.platform} ${s.date}`;
    const g = groups.get(key);
    if (g) {
      g.sum += s.price;
    } else {
      groups.set(key, { platform: s.platform, orderId, date: s.date, sum: s.price });
    }
  }
  for (const g of groups.values()) {
    const label = g.orderId !== ""
      ? `(platform "${g.platform}", order "${g.orderId}")`
      : `(platform "${g.platform}", date "${g.date}")`;
    const matches: Order[] = [];
    for (const o of orders) {
      if (!isObj(o)) continue;
      if (o["platform"] !== g.platform) continue;
      if (typeof o["id"] !== "string" || typeof o["date"] !== "string" || !isNum(o["paid"])) {
        continue;
      }
      if (g.orderId !== "") {
        if (o["id"] === g.orderId || o["id"].endsWith("-" + g.orderId)) {
          matches.push(o as unknown as Order);
        }
      } else if (o["date"] === g.date) {
        matches.push(o as unknown as Order);
      }
    }
    if (matches.length === 0) {
      fail(`order group ${label} has no source order in "${ordersPath}"`);
      continue;
    }
    const expected = matches.reduce((a, o) => a + o.paid, 0);
    if (Math.abs(g.sum - expected) > ORDER_TOL) {
      fail(`order group ${label} sums to ${fmtRs(g.sum)} but source paid is ${fmtRs(expected)}`);
    }
  }
}

// Parsed command line. ordersPath stays null without --orders.
interface Args {
  outputPath: string;
  ordersPath: string | null;
}

// Print usage to stderr. Usage errors never touch stdout.
function usage(): void {
  console.error(
    "Usage: deno run --no-lock --allow-read scripts/validate.ts <output.json> [--orders <orders.json>]",
  );
}

// Parse Deno.args. Returns null on usage errors.
function parseCliArgs(args: string[]): Args | null {
  let badOption: string | null = null;
  const parsed = parseArgs(args, {
    string: ["orders"],
    unknown: (arg) => {
      if (arg.startsWith("-")) {
        if (badOption === null) badOption = arg;
        return false;
      }
      return true;
    },
  });
  if (badOption !== null) {
    console.error(`Unknown option: ${badOption}`);
    usage();
    return null;
  }
  let outputPath: string | null = null;
  for (const item of parsed._ ?? []) {
    const word = String(item);
    if (outputPath === null) {
      outputPath = word;
    } else {
      console.error(`Unexpected argument: ${word}`);
      usage();
      return null;
    }
  }
  if (outputPath === null) {
    usage();
    return null;
  }
  if (parsed.orders !== undefined && parsed.orders === "") {
    usage();
    return null;
  }
  return { outputPath, ordersPath: parsed.orders ?? null };
}

// Print every failure line to stdout.
function printFailures(): void {
  for (const f of failures) console.log(f);
}

// Run every check and print the result. Returns the exit code.
function main(): number {
  const args = parseCliArgs(Deno.args);
  if (args === null) return 2;
  const doc = readJson(args.outputPath);
  if (doc === undefined) {
    printFailures();
    return 1;
  }
  const checked = checkShape(doc);
  checkBalance(checked.splits);
  checkTotals(checked);
  checkSettlements(checked);
  if (args.ordersPath !== null) checkOrders(checked.splits, args.ordersPath);
  if (failures.length > 0) {
    printFailures();
    return 1;
  }
  const total = checked.splits.reduce((a, s) => a + s.price, 0);
  console.log("PASS");
  console.log(
    `${checked.splits.length} splits, ${checked.people.length} people, total ₹${fmtRs(total)}`,
  );
  return 0;
}

Deno.exit(main());
