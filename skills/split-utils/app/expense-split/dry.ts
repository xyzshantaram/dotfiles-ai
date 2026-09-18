// Shared Dry run helpers for the expense-split wizard.
// One definition covers the gather, split, and push flows.

import { checkbox, markdown, type Node } from "jsr:@xyzshantaram/wizardkit@^0.1.1";

// Dry run box shared by the first screen of each flow. Same name and
// shape on every stage, so one pattern covers all three flows.
export function dryBox(ticked: boolean): Node {
  return checkbox("Dry run", "dry", [
    {
      value: "dry",
      hint: "Show the plan only. Nothing opens and nothing is written.",
    },
  ], ticked ? ["dry"] : []);
}

// Muted note for later screens when the dry answer is on. Later
// screens show this note when the answer is on and show nothing when
// the answer is off.
export function dryNote(): Node {
  return markdown(
    "_Dry run is on. Nothing is written. Press Back to the first screen of this flow to change it._",
  );
}
