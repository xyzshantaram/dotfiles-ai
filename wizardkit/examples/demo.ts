#!/usr/bin/env -S deno run --no-lock -A
// Sample three-step flow for the desktop wizard toolkit.
// Run it with: deno task desktop
// Then use the window or open http://localhost:8371 in a browser.

import { createWizard } from "../mod.ts";
import {
  action,
  answers,
  buttons,
  checkbox,
  markdown,
  menu,
  type Node,
  numberEntry,
  progress,
  radio,
  stages,
  type Step,
  step,
  tabs,
  textEntry,
} from "../mod.ts";

const STAGE_NAMES = [
  "Pick a split style",
  "Add people plus amounts",
  "Review answers",
];

export function styleStep(): Step {
  return step("style", "Pick a split style", [
    stages("Stages", STAGE_NAMES, 0),
    tabs([
      {
        label: "Style",
        nodes: [radio("Share the fee", "fee", ["Equal", "Skip"], "Equal")],
      },
      {
        label: "Help",
        nodes: [
          markdown(
            "This sample shows **every core node**.\nPick one option.\nSee /files/sample.json.",
          ),
        ],
      },
    ]),
    menu("Split style", ["Equal", "Percent", "Custom"], "style"),
    action("Show system date", "date", ["date"]),
    buttons([{ label: "Next", action: "next", primary: true }]),
  ]);
}

function peopleStep(): Step {
  return step("people", "Add people plus amounts", [
    stages("Stages", STAGE_NAMES, 1),
    progress("Coverage", 1, 0, 2),
    tabs([
      {
        label: "People",
        nodes: [checkbox("People", "who", ["Ana", "Bo", "Cy"], ["Ana"])],
      },
      {
        label: "Amounts",
        nodes: [
          textEntry("Run name", "run", "", "Friday dinner"),
          numberEntry("Total paid", "total", 100),
        ],
      },
    ]),
    action("Write deploy note", "deploy-note", ["echo", "deploy"], "onConfirm"),
    buttons(
      [
        { label: "Back", action: "back" },
        { label: "Next", action: "next", primary: true },
      ],
      undefined,
      "split",
    ),
  ]);
}

function reviewStep(saved: Map<string, string[]>): Step {
  const entries = [...saved].map(([name, values]) => ({ name, values }));
  const kids: Node[] = [];
  if (entries.length === 0) {
    kids.push(markdown("No answers yet. Go back and fill the form."));
  } else {
    kids.push(answers("Answers", entries));
  }
  return step("review", "Review answers", [
    stages("Stages", STAGE_NAMES, 2),
    ...kids,
    buttons([
      { label: "Back", action: "back" },
      { label: "Done", action: "done", primary: true },
    ]),
  ]);
}

const handle = createWizard({
  title: "Split sample",
  steps: [styleStep(), peopleStep(), reviewStep],
  actions: { date: { command: ["date"] } },
  files: { root: import.meta.dirname ?? "." },
});

if (import.meta.main) {
  // The runtime passes WIZARD_PORT. Plain runs fall back below.
  const port = Number(Deno.env.get("WIZARD_PORT") ?? 8371);
  Deno.serve({ port }, handle);
  adoptWindow("Split sample");
}

// Adopt the desktop window with a taller default. Plain deno run
// has no BrowserWindow, so the serve above is the whole story there.
function adoptWindow(title: string): void {
  const dns = Deno as unknown as {
    BrowserWindow?: new (opts: {
      title: string;
      width: number;
      height: number;
    }) => unknown;
  };
  if (dns.BrowserWindow !== undefined) {
    new dns.BrowserWindow({ title, width: 880, height: 960 });
  }
}
