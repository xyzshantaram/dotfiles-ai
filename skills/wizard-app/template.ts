#!/usr/bin/env -S deno run --no-lock -A
// Starter wizard. Copy this file plus deno.json plus compile.ts into a
// fresh dir, rename the title and steps, and run it.
// One dependency only: wizardkit (see deno.json).

import {
  answers,
  createWizard,
  markdown,
  radio,
  stages,
  type Step,
  step,
  textEntry,
} from "wizardkit";

const STAGE_NAMES = ["Ask", "Review"];

function askStep(): Step {
  return {
    ...step("ask", "Ask", [
      stages("Stages", STAGE_NAMES, 0),
      markdown("Answer two questions, then review."),
      textEntry("Your name", "name", "", "Ada"),
      radio("Pick a style", "style", ["Equal", "Custom"], "Equal"),
    ]),
    nav: { next: "Next" },
  };
}

function reviewStep(saved: Map<string, string[]>): Step {
  const entries = [...saved].map(([name, values]) => ({ name, values }));
  return {
    ...step("review", "Review", [
      stages("Stages", STAGE_NAMES, 1),
      markdown("## Answers"),
      answers("Fields", entries),
    ]),
    nav: { back: true, done: "Done" },
  };
}

const handle = createWizard({
  title: "Starter wizard",
  steps: [askStep(), reviewStep],
});

if (import.meta.main) {
  // The runtime passes WIZARD_PORT. Plain runs fall back below.
  const port = Number(Deno.env.get("WIZARD_PORT") ?? 8471);
  Deno.serve({ port }, handle);
}
