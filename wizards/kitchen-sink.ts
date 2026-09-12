// Kitchen sink demo for SplitKit. Shows the shell: status top, key help
// bottom, centered label in the upper content half, and a state tree in
// the lower half with a ticking progress signal.
// Run: deno task dev wizards/kitchen-sink.ts
import { Computed, Input, Label, Signal, Tree } from "exotui/app";
import type { Rectangle, TreeNode } from "exotui";
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

const title = new Signal("SplitKit demo");
const progress = new Signal("0%");

const tick = setInterval(() => {
  const next = Math.min(100, Number.parseInt(progress.value) + 5);
  progress.value = `${next}%`;
  if (next >= 100) clearInterval(tick);
}, 200);

// Five fake rows with mixed statuses and one current row.
const rows: KitTreeRow[] = [
  { id: "fetch", label: "Fetch order", status: "done" },
  { id: "milk", label: "Split milk", status: "current" },
  { id: "bread", label: "Split bread", status: "skipped" },
  { id: "fees", label: "Add fees", status: "todo" },
  { id: "push", label: "Push offer", status: "todo" },
];
const nodes = new Signal<TreeNode[]>([rootNode("plan", "Split plan", rows)]);
const selected = new Signal(indexOf(rows, "current"));

// Rebuild the tree node after any status change.
function redraw(): void {
  nodes.value = [rootNode("plan", "Split plan", rows)];
  selected.value = indexOf(rows, "current");
}

type DemoAction = {
  type: "titleA" | "titleB" | "next" | "prev" | "check" | "pick" | "up" | "down" | "quit";
};

// Three fake people in a multi-select, all ticked at the start.
const pickerPeople = ["ada", "ben", "cy"];
const picker = createMulti(pickerPeople.length, [0, 1, 2]);

// Fake two-person amount form, total 100, prefilled with 50 each.
const { form, inputs } = amountForm(["asha", "bolu"], 100, 50);
const people = ["asha", "bolu"] as const;

const app = createKitApp<DemoAction>({
  title,
  progress,
  commands: [
    {
      id: "titleA",
      label: "Title A",
      description: "show the first title",
      binding: { key: "a" },
      action: { type: "titleA" },
    },
    {
      id: "titleB",
      label: "Title B",
      description: "show the second title",
      binding: { key: "b" },
      action: { type: "titleB" },
    },
    {
      id: "next",
      label: "Next",
      description: "advance the current row",
      binding: { key: "n" },
      action: { type: "next" },
    },
    {
      id: "prev",
      label: "Back",
      description: "move the current row back",
      binding: { key: "p" },
      action: { type: "prev" },
    },
    {
      id: "check",
      label: "Check",
      description: "validate the amounts",
      binding: { key: "f" },
      action: { type: "check" },
    },
    {
      id: "pick",
      label: "Pick",
      description: "tick or untick the active person",
      binding: { key: "y" },
      action: { type: "pick" },
    },
    {
      id: "up",
      label: "Up",
      description: "move the active person up",
      binding: { key: "u" },
      action: { type: "up" },
    },
    {
      id: "down",
      label: "Down",
      description: "move the active person down",
      binding: { key: "j" },
      action: { type: "down" },
    },
    {
      id: "quit",
      label: "Quit",
      description: "leave the demo",
      binding: { key: "q" },
      action: { type: "quit" },
    },
  ],
  onAction(action) {
    if (action.type === "titleA") title.value = "SplitKit demo";
    else if (action.type === "titleB") title.value = "SplitKit demo — title B";
    else if (action.type === "next") {
      const current = indexOf(rows, "current") - 1;
      const nextTodo = rows.findIndex((row, at) => at > current && row.status === "todo");
      if (nextTodo !== -1) {
        rows[current]!.status = "done";
        rows[nextTodo]!.status = "current";
        redraw();
      }
    } else if (action.type === "prev") {
      const current = indexOf(rows, "current") - 1;
      if (current > 0) {
        rows[current]!.status = "todo";
        rows[current - 1]!.status = "current";
        redraw();
      }
    } else if (action.type === "check") {
      // Recheck the whole form so the schema validate runs.
      form.validate();
      const result = form.inspect();
      const firstError = Object.values(result.errors ?? {}).flat()[0];
      progress.value = result.valid ? "amounts ok" : String(firstError);
    } else if (action.type === "pick") {
      // Toggle the active person, then show the chosen names in progress.
      picker.toggle(picker.state.peek().activeIndex);
      progress.value = chosen(picker).map((at) => pickerPeople[at]).join(", ") || "nobody picked";
    } else if (action.type === "up") {
      move(picker, -1);
      progress.value = `active: ${pickerPeople[picker.state.peek().activeIndex]}`;
    } else if (action.type === "down") {
      move(picker, 1);
      progress.value = `active: ${pickerPeople[picker.state.peek().activeIndex]}`;
    } else if (action.type === "quit") {
      clearInterval(tick);
      app.destroy();
      Deno.exit(0);
    }
  },
});

// Label in the upper content area, leaving one row above the tree for the
// amount inputs.
// Rectangle type of a component's options, used to satisfy the invariant
// signal types exotui expects.
type LabelOpts = ConstructorParameters<typeof Label>[0];
type InputOpts = ConstructorParameters<typeof Input>[0];

const labelBand = new Computed<Rectangle>(() => {
  const full = contentRect(app).value;
  const fullHeight = full.height ?? 1;
  const half = Math.floor(fullHeight / 2);
  return { column: full.column, row: full.row, width: full.width ?? 1, height: half - 1 };
});

const label = new Label({
  parent: app.tui,
  theme: SplitKit,
  zIndex: 1,
  rectangle: labelBand as unknown as LabelOpts["rectangle"],
  text:
    "SplitKit kitchen sink\nPress a or b to flip the title.\nPress n or p to walk the tree.\nPress f to check the amounts.\nPress y to tick the active person, u or j to move.\nPress q to quit.",
  align: { horizontal: "center", vertical: "center" },
});
app.registerComponent(label);

// One Input widget per person in the row just above the tree, each bound to
// the matching form signal.
const inputBand = new Computed<Rectangle>(() => {
  const full = contentRect(app).value;
  const fullHeight = full.height ?? 1;
  const half = Math.floor(fullHeight / 2);
  return { column: full.column, row: full.row + half - 1, width: full.width ?? 1, height: 1 };
});

const inputRects = new Computed<Rectangle[]>(() => {
  const band = inputBand.value;
  const width = Math.max(4, Math.floor((band.width ?? 1) / (people.length * 2)));
  return people.map((_, at) => ({
    column: (band.column ?? 1) + at * width * 2,
    row: band.row ?? 1,
    width,
    height: 1,
  }));
});

for (const [at, name] of people.entries()) {
  const input = new Input({
    parent: app.tui,
    theme: SplitKit as unknown as InputOpts["theme"],
    zIndex: 1,
    rectangle: new Computed(() => inputRects.value[at]!) as unknown as InputOpts["rectangle"],
    placeholder: name,
    text: inputs[name]!,
  });
  app.registerComponent(input);
}

// Demo tree in the lower half of the content area.
const lowerHalf = new Computed(() => {
  const full = contentRect(app).value;
  const fullHeight = full.height ?? 1;
  const fullWidth = full.width ?? 1;
  const top = Math.floor(fullHeight / 2);
  return { column: full.column, row: full.row + top, width: fullWidth, height: fullHeight - top };
});

const demoTree = new Tree({
  parent: app.tui,
  theme: SplitKit,
  zIndex: 1,
  rectangle: lowerHalf,
  nodes,
  selectedIndex: selected,
  markerFor: (_row, sel) => (sel ? "› " : "  "),
  rowStyle: (row, sel) => rowStyleFor(row.node.status, sel),
});
app.registerComponent(demoTree);

app.start();
