#!/usr/bin/env -S deno run --no-lock --allow-read --allow-write --allow-run --allow-env --allow-sys --allow-net
//
// Splitter on SplitKit: the exotui flow for a run. Fresh setup asks how
// many people, one Input per name, then a payer List. The loop shows one
// tree per order with six split keys plus Enter for people and c for
// custom amounts. Run end offers the Splitwise push.
//
// Exits 0 after a flush exit, a finished run, or the push offer. Exits 1
// on a bad run.

import { $ } from "zx";
import { CheckBox, Computed, Input, Label, List, Signal, Tree } from "exotui/app";
import type { Rectangle, TerminalApp } from "exotui/app";
import type { TreeNode } from "exotui";
import {
  amountForm,
  chosen,
  contentRect,
  createKitApp,
  createMulti,
  indexOf,
  type KitTreeRow,
  move,
  rootNode,
  rowStyleFor,
  SplitKit,
} from "../src/kit/mod.ts";
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
import { compact, fmtRs, type Order } from "../src/common.ts";
import { readRun, runFilePath, updateRun } from "../src/runstate.ts";
import { loadSettings } from "../src/settings.ts";

// Repo root: the push offer spawns the pusher from here.
const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/\/+$/, "");

// First non flag argument feeds the run id.
function positionalArg(): string | null {
  for (const arg of Deno.args) {
    if (!arg.startsWith("--")) return arg;
  }
  return null;
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
  return { out, stamped };
}

// Find the nearest saved split before this line. Returns null when none.
function previousAssignment(doc: SplitStateDoc, index: number): ItemAssignment | null {
  for (let i = index - 1; i >= 0; i--) {
    const found = doc.assignments[String(i)];
    if (found) return found;
  }
  return null;
}

// Fill n name slots, keeping existing names where they fit.
function defaultNames(n: number, existing: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(existing[i] ?? "Person " + (i + 1));
  return out;
}

// Widget option types, used to satisfy the invariant signal types exotui
// expects. Same casts as the kitchen sink demo.
type InputOpts = ConstructorParameters<typeof Input>[0];

// Payer screen result: a chosen name, or a request to edit the names.
type PayerPick = { kind: "pick"; payer: string } | { kind: "change" };

// Side screens carry one plain action tag, same shape as the loop keys.
type StageAction = { type: string };

const runId = positionalArg();
if (runId === null) {
  console.log("Pass a run id: deno task dev wizards/splitter-kit.ts <run id>");
  Deno.exit(1);
}
// Non null bindings: closures lose the null narrowing above.
const RUN_ID: string = runId;

const settings = await loadSettings();
// Currency code with one space before each amount.
const CUR = settings.currency + " ";

const loaded = await loadOrders(RUN_ID);
if (loaded === null) {
  console.log("This run has no orders yet. Gather first.");
  Deno.exit(1);
}
const flat = flattenOrders(loaded.orders);
if (flat.length === 0) {
  console.log("This run holds no items to split.");
  Deno.exit(1);
}
const orderCount = loaded.orders.length;
// Keep the run dir in one closed over binding: closures lose narrowing.
const RUN_DIR: string = loaded.dir;

// Debounced atomic saves with the conflict guard. Filled in once the
// session doc exists.
let baseline = 0;
let doc: SplitStateDoc = freshState([], "");
async function persist(orderPos: number, at: number): Promise<void> {
  doc.cursor = { order: orderPos, item: at };
  const res = await writeSplitState(RUN_DIR, doc, baseline);
  baseline = Date.now();
  if (res.conflicted) {
    console.log("Saved a spare copy because another window saved first: " + res.path);
  }
}
const saver = createSaver(SAVE_DEBOUNCE_MS, () => persist(doc.cursor.order, doc.cursor.item));
const schedulePersist = (orderPos: number, at: number): void => {
  doc.cursor = { order: orderPos, item: at };
  saver.schedule();
};

// Indexes of every line inside the order that holds line `at`.
function orderIndexes(at: number): number[] {
  const orderPos = flat[at]!.orderPos;
  const idx: number[] = [];
  flat.forEach((entry, i) => {
    if (entry.orderPos === orderPos) idx.push(i);
  });
  return idx;
}

// Screen state shared by every loop app instance.
const nodes = new Signal<TreeNode[]>([]);
const selected = new Signal(0);
const title = new Signal("");
const progress = new Signal("");
// One shot note from the last command, plus the standing fee note.
let notice = "";
let feeNotice = "";
// The live loop app, so commands can destroy it before a side screen.
type KitAction = {
  type: "equal" | "skip" | "repeat" | "payer" | "skipRest" | "flushExit" | "people" | "custom";
};
let loopApp: TerminalApp<KitAction> | null = null;

// Full content rectangle with required widths, for List and Label rects.
function fullRect(app: TerminalApp<StageAction>): Computed<Rectangle> {
  return new Computed<Rectangle>(() => {
    const rect = contentRect(app).value;
    return { column: rect.column, row: rect.row, width: rect.width ?? 1, height: rect.height ?? 1 };
  });
}

// Ask how many people share the orders. One List of 1 to 20, default 3.
async function askHowMany(existing: number): Promise<number> {
  const def = existing > 0 ? existing : 3;
  const items = new Signal<string[]>(Array.from({ length: 20 }, (_, i) => String(i + 1)));
  const at = new Signal(def - 1);
  let done: ((n: number) => void) | null = null;
  const result = new Promise<number>((resolve) => {
    done = resolve;
  });
  const app = createKitApp<StageAction>({
    title: new Signal("Split setup — how many people share these orders?"),
    progress: new Signal("Suggested: " + def + ". Move with up and down, Enter confirms."),
    commands: [
      {
        id: "up",
        label: "Up",
        description: "move up one row",
        binding: { key: "up" },
        action: { type: "up" },
      },
      {
        id: "down",
        label: "Down",
        description: "move down one row",
        binding: { key: "down" },
        action: { type: "down" },
      },
      {
        id: "next",
        label: "Next",
        description: "confirm the count",
        binding: { key: "return" },
        action: { type: "next" },
      },
    ],
    onAction(action) {
      if (action.type === "up") at.value = Math.max(0, at.value - 1);
      else if (action.type === "down") at.value = Math.min(19, at.value + 1);
      else if (action.type === "next" && done !== null) {
        const settle = done;
        done = null;
        app.destroy();
        settle(at.value + 1);
      }
    },
  });
  const list = new List({
    parent: app.tui,
    theme: SplitKit,
    zIndex: 1,
    rectangle: fullRect(app),
    items,
    selectedIndex: at,
    onSelect: (_item, index) => {
      at.value = index;
    },
  });
  app.registerComponent(list);
  app.start();
  return await result;
}

// Ask for each name on one Input per slot. Blank keeps the suggestion.
async function askNamesKit(count: number, existing: string[]): Promise<string[]> {
  const names = defaultNames(count, existing).map((name) => new Signal(name));
  let done: ((names: string[]) => void) | null = null;
  const result = new Promise<string[]>((resolve) => {
    done = resolve;
  });
  const app = createKitApp<StageAction>({
    title: new Signal("Split setup — name each person"),
    progress: new Signal("Type one name per line. Enter confirms. Blank keeps the suggestion."),
    commands: [
      {
        id: "next",
        label: "Next",
        description: "confirm these names",
        binding: { key: "return" },
        action: { type: "next" },
      },
    ],
    onAction(action) {
      if (action.type === "next" && done !== null) {
        const settle = done;
        done = null;
        app.destroy();
        settle(names.map((signal, i) => {
          const text = signal.value.trim();
          return text === "" ? "Person " + (i + 1) : text;
        }));
      }
    },
  });
  // One Input per name, stacked down the content rows.
  const rects = new Computed<Rectangle[]>(() => {
    const band = contentRect(app).value;
    const width = Math.max(16, Math.floor((band.width ?? 1) / 2));
    return names.map((_, i) => ({
      column: (band.column ?? 1) + 1,
      row: (band.row ?? 1) + i,
      width,
      height: 1,
    }));
  });
  for (const [i, signal] of names.entries()) {
    const input = new Input({
      parent: app.tui,
      theme: SplitKit as unknown as InputOpts["theme"],
      zIndex: 1,
      rectangle: new Computed(() => rects.value[i]!) as unknown as InputOpts["rectangle"],
      placeholder: "Person " + (i + 1),
      text: signal,
    });
    app.registerComponent(input);
  }
  app.start();
  return await result;
}

// Ask who paid. One List of the names plus a Change people row.
async function askPayerKit(people: string[]): Promise<PayerPick> {
  const items = new Signal<string[]>([...people, "Change people"]);
  const at = new Signal(0);
  let done: ((pick: PayerPick) => void) | null = null;
  const result = new Promise<PayerPick>((resolve) => {
    done = resolve;
  });
  const app = createKitApp<StageAction>({
    title: new Signal("Split setup — who paid for these orders?"),
    progress: new Signal("Move with up and down. Enter picks."),
    commands: [
      {
        id: "up",
        label: "Up",
        description: "move up one row",
        binding: { key: "up" },
        action: { type: "up" },
      },
      {
        id: "down",
        label: "Down",
        description: "move down one row",
        binding: { key: "down" },
        action: { type: "down" },
      },
      {
        id: "pick",
        label: "Pick",
        description: "choose the highlighted row",
        binding: { key: "return" },
        action: { type: "pick" },
      },
    ],
    onAction(action) {
      const settle = (pick: PayerPick): void => {
        if (done === null) return;
        const finish = done;
        done = null;
        app.destroy();
        finish(pick);
      };
      if (action.type === "up") at.value = Math.max(0, at.value - 1);
      else if (action.type === "down") at.value = Math.min(people.length, at.value + 1);
      else if (action.type === "pick") {
        if (at.value >= people.length) settle({ kind: "change" });
        else settle({ kind: "pick", payer: people[at.value]! });
      }
    },
  });
  const list = new List({
    parent: app.tui,
    theme: SplitKit,
    zIndex: 1,
    rectangle: fullRect(app),
    items,
    selectedIndex: at,
    onSelect: (_item, index) => {
      if (index >= people.length) {
        at.value = index;
        return;
      }
      at.value = index;
    },
  });
  app.registerComponent(list);
  app.start();
  return await result;
}

// Multi pick screen: one CheckBox per person, all ticked at the start.
// u and j move the active row, y toggles it, Enter confirms, b cancels.
async function pickPeopleKit(people: string[]): Promise<string[] | null> {
  const multi = createMulti(people.length, people.map((_, i) => i));
  const boxes: CheckBox[] = [];
  let done: ((names: string[] | null) => void) | null = null;
  const result = new Promise<string[] | null>((resolve) => {
    done = resolve;
  });
  const hint = new Signal("u or j moves, y ticks or unticks, Enter confirms, b goes back.");
  const app = createKitApp<StageAction>({
    title: new Signal("Split with whom?"),
    progress: hint,
    commands: [
      {
        id: "up",
        label: "Up",
        description: "move up one person",
        binding: { key: "u" },
        action: { type: "up" },
      },
      {
        id: "down",
        label: "Down",
        description: "move down one person",
        binding: { key: "j" },
        action: { type: "down" },
      },
      {
        id: "toggle",
        label: "Tick",
        description: "tick or untick the active person",
        binding: { key: "y" },
        action: { type: "toggle" },
      },
      {
        id: "confirm",
        label: "Confirm",
        description: "split with the ticked people",
        binding: { key: "return" },
        action: { type: "confirm" },
      },
      {
        id: "back",
        label: "Back",
        description: "go back without splitting",
        binding: { key: "b" },
        action: { type: "back" },
      },
    ],
    onAction(action) {
      const settle = (names: string[] | null): void => {
        if (done === null) return;
        const finish = done;
        done = null;
        app.destroy();
        finish(names);
      };
      if (action.type === "up") move(multi, -1);
      else if (action.type === "down") move(multi, 1);
      else if (action.type === "toggle") {
        const at = multi.state.peek().activeIndex;
        const box = boxes[at];
        if (box !== undefined) box.checked.value = !box.checked.value;
      } else if (action.type === "confirm") {
        const picked = chosen(multi).map((i) => people[i]!);
        if (picked.length === 0) hint.value = "Pick one person at least.";
        else settle(picked);
      } else if (action.type === "back") settle(null);
    },
  });
  const rects = new Computed<Rectangle[]>(() => {
    const band = contentRect(app).value;
    return people.map((_, i) => ({
      column: (band.column ?? 1) + 1,
      row: (band.row ?? 1) + i,
      width: Math.max(16, Math.floor((band.width ?? 1) / 2)),
      height: 1,
    }));
  });
  for (const [i, name] of people.entries()) {
    const box = new CheckBox({
      parent: app.tui,
      theme: SplitKit,
      zIndex: 1,
      rectangle: new Computed(() => {
        const rect = rects.value[i]!;
        return { column: rect.column, row: rect.row, width: 3, height: rect.height };
      }),
      checked: true,
    });
    boxes.push(box);
    app.registerComponent(box);
    // CheckBoxOptions carries no label, so the name sits beside the mark.
    const nameRect = new Computed(() => {
      const rect = rects.value[i]!;
      return {
        column: rect.column + 4,
        row: rect.row,
        width: Math.max(4, rect.width - 4),
        height: rect.height,
      };
    });
    const text = new Label({
      parent: app.tui,
      theme: SplitKit,
      zIndex: 1,
      rectangle: nameRect as unknown as ConstructorParameters<typeof Label>[0]["rectangle"],
      text: name,
    });
    app.registerComponent(text);
  }
  app.start();
  return await result;
}

// Custom amount screen: one Input per chosen person, prefilled with the
// equal share. Enter checks the split, b goes back.
async function customAmountsKit(
  line: FlatItem,
  picked: string[],
): Promise<Record<string, number> | null> {
  const { form, inputs } = amountForm(picked, line.price, line.price / picked.length);
  const hint = new Signal("Type each amount. Enter checks the split. b goes back.");
  let done: ((amounts: Record<string, number> | null) => void) | null = null;
  const result = new Promise<Record<string, number> | null>((resolve) => {
    done = resolve;
  });
  const app = createKitApp<StageAction>({
    title: new Signal("Custom split — " + line.name + ", total " + CUR + fmtRs(line.price)),
    progress: hint,
    commands: [
      {
        id: "check",
        label: "Check",
        description: "check and save these amounts",
        binding: { key: "return" },
        action: { type: "check" },
      },
      {
        id: "back",
        label: "Back",
        description: "go back without saving",
        binding: { key: "b" },
        action: { type: "back" },
      },
    ],
    onAction(action) {
      const settle = (amounts: Record<string, number> | null): void => {
        if (done === null) return;
        const finish = done;
        done = null;
        app.destroy();
        finish(amounts);
      };
      if (action.type === "back") settle(null);
      else if (action.type === "check") {
        form.validate();
        const inspection = form.inspect();
        if (!inspection.valid) {
          const first = Object.values(inspection.errors ?? {}).flat()[0];
          hint.value = String(first);
          return;
        }
        try {
          const input: Record<string, number> = {};
          for (const name of picked) input[name] = Number(inputs[name]!.value);
          settle(customAmounts(input, line.price));
        } catch (e) {
          hint.value = (e instanceof Error ? e.message : String(e)) +
            " Fix the amounts and press Enter.";
        }
      }
    },
  });
  const rects = new Computed<Rectangle[]>(() => {
    const band = contentRect(app).value;
    const width = Math.max(16, Math.floor((band.width ?? 1) / 2));
    return picked.map((_, i) => ({
      column: (band.column ?? 1) + 1,
      row: (band.row ?? 1) + i,
      width,
      height: 1,
    }));
  });
  for (const [i, name] of picked.entries()) {
    const input = new Input({
      parent: app.tui,
      theme: SplitKit as unknown as InputOpts["theme"],
      zIndex: 1,
      rectangle: new Computed(() => rects.value[i]!) as unknown as InputOpts["rectangle"],
      placeholder: name,
      text: inputs[name]!,
    });
    app.registerComponent(input);
  }
  app.start();
  return await result;
}

// Offer screen after a finished run: push to Splitwise or finish.
async function offerKit(): Promise<"push" | "done"> {
  let done: ((pick: "push" | "done") => void) | null = null;
  const result = new Promise<"push" | "done">((resolve) => {
    done = resolve;
  });
  const app = createKitApp<StageAction>({
    title: new Signal("Split complete"),
    progress: new Signal("All items assigned. Send these to Splitwise now?"),
    commands: [
      {
        id: "push",
        label: "Push",
        description: "send the split to Splitwise",
        binding: { key: "p" },
        action: { type: "push" },
      },
      {
        id: "done",
        label: "Done",
        description: "finish and leave",
        binding: { key: "d" },
        action: { type: "done" },
      },
    ],
    onAction(action) {
      if (action.type === "push" || action.type === "done") {
        if (done === null) return;
        const settle = done;
        done = null;
        app.destroy();
        settle(action.type);
      }
    },
  });
  app.start();
  return await result;
}

// Finish the run: flush, write outputs, mark assigned, offer the push.
async function finishRun(): Promise<void> {
  await saver.flush();
  const { out, stamped } = await writeOutputs(RUN_DIR, doc, flat);
  await updateRun(RUN_ID, {
    status: "assigned",
    outputFile: "output.json",
    ordersDone: orderCount,
    ordersTotal: orderCount,
  });
  loopApp?.destroy();
  loopApp = null;
  const pick = await offerKit();
  console.log("Split saved. Wrote:");
  console.log(out);
  console.log(stamped);
  if (pick === "push") {
    try {
      const env = { ...Deno.env.toObject(), SPLIT_UTILS_FROM_MENU: "1" };
      await $({
        cwd: ROOT,
        stdio: "inherit",
        env,
      })`deno run -A --no-lock wizards/pusher.ts ${RUN_ID}`;
    } catch {
      console.log("The push wizard stopped early. The output stays saved.");
    }
  }
  Deno.exit(0);
}

// Build the rows for one order view. Done, skipped, current, todo rows all
// show. Markers sit in the labels. Fees are normal rows.
function buildRows(at: number): KitTreeRow[] {
  const line = flat[at]!;
  const idx = orderIndexes(at);
  const pos = idx.indexOf(at);
  const rows: KitTreeRow[] = [];
  for (const i of idx.slice(0, pos)) {
    const f = flat[i]!;
    const saved = doc.assignments[String(i)];
    if (saved) {
      rows.push({
        id: String(i),
        label: "✓ " + f.name + " — " + CUR + compact(f.price) + " (" + saved.people.join(", ") +
          ")",
        status: "done",
      });
    } else {
      rows.push({
        id: String(i),
        label: "— " + f.name + " — " + CUR + compact(f.price) + " (skipped)",
        status: "skipped",
      });
    }
  }
  rows.push({
    id: String(at),
    label: "› " + line.name + " — " + CUR + fmtRs(line.price),
    status: "current",
  });
  for (const i of idx.slice(pos + 1)) {
    const f = flat[i]!;
    rows.push({
      id: String(i),
      label: "  " + f.name + " — " + CUR + compact(f.price),
      status: "todo",
    });
  }
  return rows;
}

// Fee lines default to equal all, recorded like any other decision.
function ensureFeeDefault(at: number): void {
  const line = flat[at]!;
  const key = String(at);
  if (!line.isFee || doc.assignments[key] !== undefined || doc.skipped[key]) return;
  doc.assignments[key] = {
    splitType: "equal",
    people: [...doc.people],
    amounts: equalAmounts(line.price, doc.people),
  };
  feeNotice = "Fee default: everyone pays " + CUR + fmtRs(line.price / doc.people.length) +
    " each. Any key keeps or changes it.";
  schedulePersist(line.orderPos, at);
}

// Redraw the screen for line `at`.
function draw(at: number): void {
  ensureFeeDefault(at);
  const line = flat[at]!;
  const rows = buildRows(at);
  title.value = "Order " + (line.orderPos + 1) + " of " + orderCount + " · " + line.platform +
    " · " + line.date;
  const assigned = Object.keys(doc.assignments).length;
  const totals = computeTotals(doc.people, doc.assignments);
  const perPerson = doc.people.map((p) => p + " " + CUR + fmtRs(totals[p] ?? 0)).join(" · ");
  const note = notice !== "" ? notice + " · " : feeNotice !== "" ? feeNotice + " · " : "";
  progress.value = note + assigned + "/" + flat.length + " assigned · " + perPerson;
  nodes.value = [rootNode("order", "Items", rows)];
  selected.value = indexOf(rows, "current");
}

// Advance to `at`, redraw, save, and finish the run when the loop ends.
async function advance(at: number, finishedOrder: number): Promise<void> {
  if (at >= flat.length) {
    await finishRun();
    return;
  }
  const nextOrderPos = flat[at]!.orderPos;
  if (nextOrderPos !== finishedOrder) {
    await saver.flush();
    const done = countDoneOrders(flat, orderCount, doc);
    await updateRun(RUN_ID, { ordersDone: done, ordersTotal: orderCount });
  }
  schedulePersist(flat[at]!.orderPos, at);
  draw(at);
}

// Open the people pick screen, then apply the split it returns.
async function runPeoplePick(): Promise<void> {
  loopApp?.destroy();
  loopApp = null;
  const line = flat[index]!;
  const picked = await pickPeopleKit(doc.people);
  if (picked === null) {
    notice = "";
    startLoop();
    return;
  }
  doc.assignments[String(index)] = {
    splitType: "equal",
    people: picked,
    amounts: equalAmounts(line.price, picked),
  };
  delete doc.skipped[String(index)];
  notice = "Split with " + picked.join(", ") + ".";
  await advance(index + 1, line.orderPos);
  startLoop();
}

// Open the custom amount screen, then apply the split it returns.
async function runCustomAmounts(): Promise<void> {
  loopApp?.destroy();
  loopApp = null;
  const line = flat[index]!;
  const picked = await pickPeopleKit(doc.people);
  if (picked === null) {
    notice = "";
    startLoop();
    return;
  }
  const amounts = await customAmountsKit(line, picked);
  if (amounts === null) {
    notice = "";
    startLoop();
    return;
  }
  doc.assignments[String(index)] = { splitType: "custom", people: picked, amounts };
  delete doc.skipped[String(index)];
  notice = "Custom split saved.";
  await advance(index + 1, line.orderPos);
  startLoop();
}

// Build and start one loop app instance. The tree, title, and progress
// signals live above, so a fresh instance rebinds the same screen state.
function startLoop(): void {
  const app = createKitApp<KitAction>({
    title,
    progress,
    commands: [
      {
        id: "equal",
        label: "Equal",
        description: "split with everyone",
        binding: { key: "a" },
        action: { type: "equal" },
      },
      {
        id: "skip",
        label: "Skip",
        description: "skip this item",
        binding: { key: "n" },
        action: { type: "skip" },
      },
      {
        id: "repeat",
        label: "Repeat",
        description: "repeat the previous split",
        binding: { key: "r" },
        action: { type: "repeat" },
      },
      {
        id: "payer",
        label: "Payer",
        description: "payer takes all",
        binding: { key: "m" },
        action: { type: "payer" },
      },
      {
        id: "skipRest",
        label: "Skip rest",
        description: "skip the rest of this order",
        binding: { key: "s" },
        action: { type: "skipRest" },
      },
      {
        id: "people",
        label: "People",
        description: "pick people for this item",
        binding: { key: "return" },
        action: { type: "people" },
      },
      {
        id: "custom",
        label: "Custom",
        description: "type exact amounts",
        binding: { key: "c" },
        action: { type: "custom" },
      },
      {
        id: "flushExit",
        label: "Save and exit",
        description: "save now and leave",
        binding: { key: "b" },
        action: { type: "flushExit" },
      },
    ],
    onAction(action) {
      const line = flat[index]!;
      const orderIdx = orderIndexes(index);
      const pos = orderIdx.indexOf(index);
      notice = "";

      if (action.type === "flushExit") {
        return (async () => {
          await saver.flush();
          app.destroy();
          loopApp = null;
          console.log("Progress saved for run " + RUN_ID + ".");
          Deno.exit(0);
        })();
      }
      if (action.type === "people") {
        void runPeoplePick();
        return;
      }
      if (action.type === "custom") {
        void runCustomAmounts();
        return;
      }
      if (action.type === "skipRest") {
        for (const i of orderIdx.slice(pos)) {
          delete doc.assignments[String(i)];
          doc.skipped[String(i)] = true;
        }
        notice = "Skipped the rest of this order.";
        void advance(orderIdx[orderIdx.length - 1]! + 1, line.orderPos);
        return;
      }
      if (action.type === "skip") {
        delete doc.assignments[String(index)];
        doc.skipped[String(index)] = true;
        notice = "Left " + line.name + " with nobody.";
        void advance(index + 1, line.orderPos);
        return;
      }
      if (action.type === "equal") {
        doc.assignments[String(index)] = {
          splitType: "equal",
          people: [...doc.people],
          amounts: equalAmounts(line.price, doc.people),
        };
        delete doc.skipped[String(index)];
        void advance(index + 1, line.orderPos);
        return;
      }
      if (action.type === "payer") {
        doc.assignments[String(index)] = {
          splitType: "single",
          people: [doc.payer],
          amounts: singleAmounts(line.price, doc.payer),
        };
        delete doc.skipped[String(index)];
        notice = doc.payer + " takes the full line.";
        void advance(index + 1, line.orderPos);
        return;
      }
      // action.type === "repeat"
      const prev = previousAssignment(doc, index);
      if (prev === null) {
        notice = "No previous split to repeat.";
        draw(index);
        return;
      }
      const next = repeatAmounts(prev, line.price, doc.people);
      doc.assignments[String(index)] = next;
      delete doc.skipped[String(index)];
      notice = "Repeated: " + next.people.join(", ") + ".";
      void advance(index + 1, line.orderPos);
    },
  });
  const treeRect = new Computed<Rectangle>(() => {
    const rect = contentRect(app).value;
    return { column: rect.column, row: rect.row, width: rect.width ?? 1, height: rect.height ?? 1 };
  });
  const tree = new Tree({
    parent: app.tui,
    theme: SplitKit,
    zIndex: 1,
    rectangle: treeRect,
    nodes,
    selectedIndex: selected,
    markerFor: (_row, sel) => (sel ? "› " : "  "),
    rowStyle: (row, sel) => rowStyleFor(row.node.status, sel),
  });
  app.registerComponent(tree);
  loopApp = app;
  app.start();
}

// Session start: resume a saved state, or run fresh setup in the kit.
const savedDoc = await loadSplitState(RUN_DIR);
let index: number;
if (savedDoc !== null && savedDoc.people.length > 0 && savedDoc.payer) {
  doc = savedDoc;
  index = firstUnfinished(flat.length, doc.assignments, doc.skipped);
} else {
  let names: string[] = savedDoc?.people ?? [];
  let payer = "";
  for (;;) {
    const howMany = await askHowMany(names.length);
    names = await askNamesKit(howMany, names);
    const pick = await askPayerKit(names);
    if (pick.kind === "change") continue;
    payer = pick.payer;
    break;
  }
  doc = savedDoc !== null ? remapPeople(savedDoc, names) : freshState(names, payer);
  doc = { ...doc, people: names, payer };
  index = firstUnfinished(flat.length, doc.assignments, doc.skipped);
}

// Seed the saves: baseline, one persisted state, run meta.
baseline = await snapshotMtime(RUN_DIR);
await persist(flat[index]!.orderPos, index);
await updateRun(RUN_ID, {
  lastPayer: doc.payer,
  ordersDone: countDoneOrders(flat, orderCount, doc),
  ordersTotal: orderCount,
});

if (index >= flat.length) {
  // Every line already holds a decision. Republish and offer the push.
  await finishRun();
}
draw(index);
startLoop();
