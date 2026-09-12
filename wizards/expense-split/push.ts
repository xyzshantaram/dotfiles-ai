// Push wizard steps for the expense-split flow.
// Source choice, cutoff handling, and the per-order Push/Skip/Stop
// shape come from wizards/pusher.ts. The real push logic lives in
// push-engine.ts; these steps only show its state and collect choices.

import {
  answers,
  buttons,
  markdown,
  type Node,
  radio,
  type Step,
  step,
  type StepFn,
  textarea,
  textEntry,
} from "../../wizardkit/mod.ts";
import { buildAggregateSummary, orderFingerprint } from "../../src/render.ts";
import { formatDayISO, formatMoney, parseDate } from "../../src/common.ts";
import { isDryMap, listRunsSync, runHint } from "../../src/runstate.ts";
import { dryBox, dryNote } from "./dry.ts";
import { session, SHARE_SOURCE } from "./push-engine.ts";

// Choices for the source stage: an assigned run, a split file, or a
// friend's share link, as pusher.ts reads them.
const SOURCE_CHOICES = ["Assigned run", "Split JSON file", SHARE_SOURCE];

// One line naming the Splitwise access state for the current session.
// Null when nothing is known yet.
export function accessNote(): Node | null {
  if (session.mode === "live") {
    return markdown("Signed in as " + session.signedInAs + ".");
  }
  if (session.mode === "aggregate") {
    const fallback =
      "No Splitwise access is configured. The push writes one summary file instead.";
    if (session.setupError !== null) {
      return markdown(session.setupError + "\n\n" + fallback);
    }
    return markdown(fallback);
  }
  return null;
}

// Source step. The radio carries the picked choice (or the first
// choice before any pick), and only the matching value entry shows.
// The run entry starts from prefillRunId when the user typed nothing.
export function sourceStep(m: Map<string, string[]>, prefillRunId: string): Step {
  const picked = m.get("source")?.[0] ?? SOURCE_CHOICES[0];
  const nodes: Node[] = [
    radio("Whose orders", "source", SOURCE_CHOICES, picked),
  ];
  if (picked === SOURCE_CHOICES[0]) {
    const assigned = listRunsSync().filter((run) => run.status === "assigned");
    if (assigned.length === 0) {
      nodes.push(markdown("No assigned run exists yet. The split stage creates one."));
      nodes.push(textEntry("Other run", "run-id-other", ""));
    } else {
      const start = assigned.some((run) => run.id === prefillRunId)
        ? prefillRunId
        : assigned[0].id;
      nodes.push(
        radio(
          "Run",
          "run-id",
          assigned.map((run) => ({ value: run.id, hint: runHint(run) })),
          start,
        ),
      );
      nodes.push(textEntry("Other run", "run-id-other", ""));
    }
  } else if (picked === "Split JSON file") {
    nodes.push(
      textEntry("Split JSON file", "split-file", m.get("split-file")?.[0] ?? ""),
    );
  } else {
    nodes.push(
      textEntry("Paste the share link", "share-link", m.get("share-link")?.[0] ?? ""),
    );
  }
  nodes.push(dryBox(isDryMap(m)));
  nodes.push(buttons(
    [
      { label: "Back", action: "back" },
      { label: "Next", action: "next", primary: true },
    ],
    undefined,
    "split",
  ));
  return step(
    "push-source",
    "Pick source",
    nodes,
    "Choose an assigned run, a saved split file, or a share link from a friend. Then type or paste the matching value below.",
  );
}

// Splitwise access status, from pusher.ts splitwise stage. Shows the
// signed-in name in live mode, or the no-access fallback note.
function setupStep(): Step {
  const nodes = [];
  if (session.shareNote !== null) {
    nodes.push(markdown(session.shareNote));
  }
  if (session.mode === "live") {
    nodes.push(markdown(
      "Signed in as " + session.signedInAs + ".\n\n" +
        "Each person maps to one Splitwise member. Push target currency is " +
        session.currency + ".",
    ));
  } else if (session.mode === "aggregate") {
    if (session.setupError !== null) {
      nodes.push(markdown(session.setupError));
    }
    nodes.push(markdown(
      "No Splitwise access is configured.\n\n" +
        "The push writes one summary file instead. You enter the amounts in Splitwise by hand. " +
        "To push directly, run Set up Splitwise access in Settings first, then push again.",
    ));
  } else {
    nodes.push(markdown(
      session.setupError ??
        "Pick a source in the step before this one, then come back.",
    ));
  }
  nodes.push(buttons(
    [
      { label: "Back", action: "back" },
      { label: "Next", action: "next", primary: true },
    ],
    undefined,
    "split",
  ));
  return step(
    "push-setup",
    "Splitwise access",
    nodes,
    "One-time check that this app may talk to Splitwise. The approval from Settings owns the sign-in, so this step only reports it.",
  );
}

// Name picker, from pusher.ts:213-240. Ambiguous people show their
// Splitwise matches as a radio plus a hand-typed id entry. Unmatched
// people show the carried no-match copy plus the id entry. The posted
// answers go through resolveNamePicks in the engine.
function namePickStep(): Step {
  const nodes = [];
  if (session.namePicks.length === 0) {
    nodes.push(markdown(
      "Every person maps to one Splitwise member. Nothing to pick here.",
    ));
  }
  for (const pick of session.namePicks) {
    if (pick.candidates.length > 0) {
      nodes.push(markdown(
        "More than one Splitwise member matches " + pick.person + ". Pick one:",
      ));
      nodes.push(
        radio(
          "Pick the user for " + pick.person,
          "pick:" + pick.person,
          pick.candidates.map((member) => ({
            value: String(member.id),
            hint: member.name + " (id " + member.id + ")",
          })),
        ),
      );
      nodes.push(
        textEntry("Type an id by hand for " + pick.person, "manual:" + pick.person, ""),
      );
    } else {
      nodes.push(markdown(
        "No Splitwise member matches " + pick.person +
          " yet. Add them in Splitwise first, then come back.",
      ));
      nodes.push(
        textEntry("Type the Splitwise id for " + pick.person, "manual:" + pick.person, ""),
      );
    }
  }
  nodes.push(buttons(
    [
      { label: "Back", action: "back" },
      { label: "Next", action: "next", primary: true },
    ],
    undefined,
    "split",
  ));
  return step(
    "push-names",
    "Splitwise members",
    nodes,
    "More than one Splitwise member shares a name, or a person has no match. Pick the right member, or type their id number.",
  );
}

// Group picker, from pusher.ts group select. Live mode only.
function groupStep(): Step {
  const nodes = [];
  const note = accessNote();
  if (note !== null) nodes.push(note);
  if (session.mode !== "live") {
    nodes.push(markdown("Splitwise is not connected, so no group pick is needed."));
  } else {
    nodes.push(
      radio(
        "Push into which group",
        "push-group",
        [
          { value: "0", hint: "No group, a plain expense" },
          ...session.groupChoices.map((group) => ({
            value: String(group.id),
            hint: group.name + " (id " + group.id + ")",
          })),
        ],
        "0",
      ),
    );
  }
  nodes.push(buttons(
    [
      { label: "Back", action: "back" },
      { label: "Next", action: "next", primary: true },
    ],
    undefined,
    "split",
  ));
  return step(
    "push-group",
    "Splitwise group",
    nodes,
    "Expenses land in this group. Leave it on no group for plain expenses.",
  );
}

// Confirm step. Orders already sent show as auto-skips from the
// fingerprint set the engine staged. Everything else shows one
// Push/Skip/Stop choice per order, and the choices drive the real
// push outcomes. A ticked dry box marks the answers, so the submit
// runs the dry plan instead of the live push.
function confirmStep(m?: Map<string, string[]>): Step {
  const dry = m !== undefined && isDryMap(m);
  const nodes = [];
  if (dry) {
    nodes.push(markdown(
      "Dry run is on. Press Next to see the plan. Nothing will be written.",
    ));
  }
  if (session.groups.length === 0 && session.droppedByCutoff === 0) {
    nodes.push(markdown(
      "No orders reached this step. Check the source and cutoff steps.",
    ));
  } else {
    if (session.droppedByCutoff > 0) {
      nodes.push(markdown(
        "Cutoff " + session.cutoff + " leaves out " + session.droppedByCutoff +
          " later order(s).",
      ));
    }
    for (const order of session.groups) {
      const oid = order[0].order_id ?? "unknown";
      const total = order.reduce((sum, item) => sum + item.price, 0);
      if (session.dupes.has(orderFingerprint(order))) {
        nodes.push(markdown(
          "Order " + oid + " (total " + formatMoney(total, session.currency) +
            ") — already sent to Splitwise. It skips.",
        ));
        continue;
      }
      nodes.push(
        radio(
          "Order " + oid + " (total " + formatMoney(total, session.currency) + ")",
          "order-" + oid,
          ["Push", "Skip", "Stop"],
        ),
      );
    }
  }
  if (dry) {
    nodes.push(dryNote());
  }
  nodes.push(
    buttons(
      [
        { label: "Back", action: "back" },
        { label: "Next", action: "next", primary: true },
      ],
      undefined,
      "split",
    ),
  );
  return step(
    "push-confirm",
    "Confirm orders",
    nodes,
    "Pick Push, Skip, or Stop for each order. Push sends that order to Splitwise as one expense. Unpicked orders stay out.",
  );
}

// Summary text for the aggregate report step. The written file wins,
// so the box matches the file. A rebuild covers a missing file.
function aggregateText(): string | null {
  const file = session.outcome?.aggregateFile ?? null;
  if (file !== null) {
    try {
      const text = Deno.readTextFileSync(file);
      if (text.trim().length > 0) return text;
    } catch {
      // Fall through to the rebuild.
    }
  }
  try {
    return buildAggregateSummary(
      session.groups,
      session.people,
      session.payer,
      session.settlements,
      session.currency + " ",
    );
  } catch {
    return null;
  }
}

// Report step. Shows the real counts from the engine outcome, not the
// raw radio counts. A dry outcome leads with its plan banner.
function reportStep(): Step {
  const outcome = session.outcome;
  const nodes = [];
  if (outcome === null) {
    nodes.push(markdown("Nothing is pushed yet. Walk the steps before this one."));
  } else {
    const lines: string[] = [];
    if (outcome.dry) {
      lines.push("Dry run. Nothing went to Splitwise. This is the plan only.");
    }
    if (outcome.pushed > 0) {
      lines.push(
        outcome.dry
          ? "Would push: " + outcome.pushed + " order(s)."
          : "Sent to Splitwise: " + outcome.pushed + " order(s).",
      );
    }
    if (outcome.skippedDupes > 0) {
      lines.push("Skipped, already sent earlier: " + outcome.skippedDupes + ".");
    }
    if (outcome.skippedByChoice > 0) {
      lines.push("Skipped by your choice: " + outcome.skippedByChoice + ".");
    }
    if (outcome.stopped) {
      lines.push("You stopped early. The remaining orders stay ready for another push.");
    }
    if (outcome.archived) {
      lines.push("Run " + (session.runId ?? "") + " is archived.");
    }
    if (outcome.aggregateFile !== null) {
      lines.push("Summary file written to " + outcome.aggregateFile + ".");
    }
    if (outcome.note !== "") {
      lines.push(outcome.note);
    }
    lines.push(
      (outcome.dry ? "Total that would push: " : "Total pushed amount: ") +
        formatMoney(outcome.totalRs, session.currency) + ".",
    );
    nodes.push(markdown(lines.join("\n\n")));
    if (session.mode === "aggregate") {
      const text = aggregateText();
      if (text !== null) {
        nodes.push(
          textarea("Summary", "aggregate-summary", {
            value: text,
            rows: Math.max(8, Math.min(30, text.split("\n").length + 2)),
          }),
        );
      }
    }
    nodes.push(
      answers("Push", [
        { name: "Pushed", values: [String(outcome.pushed)] },
        { name: "Skipped", values: [String(outcome.skippedDupes + outcome.skippedByChoice)] },
      ]),
    );
  }
  nodes.push(
    buttons(
      [
        { label: "Back", action: "back" },
        { label: "Back to menu", action: "goto:menu", primary: true },
      ],
      undefined,
      "split",
    ),
  );
  return step(
    "push-report",
    "Push report",
    nodes,
    "Here is what happened. Pushed orders landed on Splitwise, and skipped orders stayed out.",
  );
}

export function pushSteps(): Array<Step | StepFn> {
  return [
    (m: Map<string, string[]>) => sourceStep(m, ""),
    namePickStep,
    setupStep,
    groupStep,
    cutoffStep,
    confirmStep,
    reportStep,
  ];
}

// Cutoff step. The field starts at the newest order date in the
// current session, formatted as YYYY-MM-DD. A typed value wins over
// the prefill, and a blank field means no cutoff.
function cutoffStep(m: Map<string, string[]>): Step {
  const nodes = [];
  const note = accessNote();
  if (note !== null) nodes.push(note);
  let prefill = m.get("cutoff")?.[0] ?? "";
  if (prefill === "") {
    let newest: Date | null = null;
    for (const order of session.groups) {
      const date = parseDate(order[0].date);
      if (date && (newest === null || date.getTime() > newest.getTime())) {
        newest = date;
      }
    }
    if (newest !== null) prefill = formatDayISO(newest);
  }
  nodes.push(textEntry("Push orders dated up to", "cutoff", prefill));
  nodes.push(buttons(
    [
      { label: "Back", action: "back" },
      { label: "Next", action: "next", primary: true },
    ],
    undefined,
    "split",
  ));
  return step(
    "push-cutoff",
    "Cutoff date",
    nodes,
    "Include orders up to this date only (YYYY-MM-DD). Later orders stay out. Leave it blank to push every order.",
  );
}
