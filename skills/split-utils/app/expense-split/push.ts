// Push wizard steps for the expense-split flow.
// Source choice, cutoff handling, and the per-order Push/Skip
// shape come from the deleted wizards/pusher.ts. The real push logic lives in
// push-engine.ts; these steps only show its state and collect choices.

import {
  answers,
  copyable,
  markdown,
  type Node,
  radio,
  type Step,
  step,
  type StepFn,
  textEntry,
} from "jsr:@xyzshantaram/wizardkit@^0.1.0";
import { buildAggregateSummary, orderFingerprint } from "../../src/render.ts";
import { fmtRs, formatDayISO, formatMoney, itemSummary, parseDate } from "../../src/common.ts";
import { isDryMap, listRunsSync, runHint } from "../../src/runstate.ts";
import { dryBox, dryNote } from "./dry.ts";
import {
  applyCutoff,
  executePush,
  prepareShareImport,
  prepareSource,
  prepareSplitwise,
  pushSessionFor,
  resolveNamePicks,
  SHARE_SOURCE,
} from "./push-engine.ts";
import { field } from "../../src/answers.ts";
import { sidOf } from "../../src/sessionstore.ts";
import type { WizardCtx } from "jsr:@xyzshantaram/wizardkit@^0.1.0";

// Choices for the source stage: an assigned run, a split file, or a
// friend's share link, as pusher.ts reads them.
const SOURCE_CHOICES = ["Assigned run", "Split JSON file", SHARE_SOURCE];

// One line naming the Splitwise access state for the current session.
// Null when nothing is known yet.
export function accessNote(sessionId: string): Node | null {
  const live = pushSessionFor(sidOf({ sessionId }));
  if (live.mode === "live") {
    return markdown("Signed in as " + live.signedInAs + ".");
  }
  if (live.mode === "aggregate") {
    const fallback = "No Splitwise access is configured. The push writes one summary file instead.";
    if (live.setupError !== null) {
      return markdown(live.setupError + "\n\n" + fallback);
    }
    return markdown(fallback);
  }
  return null;
}

// Stage the picked source for this session.
export async function pushSourceNext(
  _answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
): Promise<{ errors?: string[]; goto?: string } | void> {
  const sessionId = ctx.sessionId;
  const source = fields["source"]?.[0] ?? "";
  if (source === SHARE_SOURCE) {
    const imported = await prepareShareImport(sessionId, fields["share-link"]?.[0] ?? "");
    if (!imported.ok) return { errors: [imported.error] };
  } else {
    const typed = field(fields, "run-id-other");
    const listed = field(fields, "run-id");
    const runId = typed !== "" ? typed : listed;
    const prepared = await prepareSource(
      sessionId,
      source,
      runId,
      fields["split-file"]?.[0] ?? "",
    );
    if (!prepared.ok) return { errors: [prepared.error] };
  }
  const sw = await prepareSplitwise(sessionId);
  if (!sw.ok) {
    if (sw.needsNamePick) return { goto: "push-names" };
    return { errors: [sw.error] };
  }
  return { goto: pushSessionFor(sessionId).mode === "live" ? "push-group" : "push-setup" };
}

// Resolve the posted name picks for this session.
export async function pushNamesNext(
  _answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
): Promise<{ errors?: string[]; goto?: string } | void> {
  const sessionId = ctx.sessionId;
  const picked = resolveNamePicks(sessionId, fields);
  if (!picked.ok) return { errors: [picked.error] };
  const sw = await prepareSplitwise(sessionId);
  if (!sw.ok) return { errors: [sw.error] };
  return { goto: pushSessionFor(sessionId).mode === "live" ? "push-group" : "push-setup" };
}

// Route live access toward the group screen.
export function pushSetupNext(
  _answers: Map<string, string[]>,
  _fields: Record<string, string[]>,
  ctx: WizardCtx,
): { errors?: string[]; goto?: string } | void {
  const sessionId = ctx.sessionId;
  return { goto: pushSessionFor(sessionId).mode === "live" ? "push-group" : "push-cutoff" };
}

// Store the picked group for this session.
export function pushGroupNext(
  _answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
): { errors?: string[]; goto?: string } | void {
  const sessionId = ctx.sessionId;
  const picked = Number(fields["push-group"]?.[0] ?? "0");
  pushSessionFor(sessionId).groupId = Number.isFinite(picked) ? picked : 0;
  return { goto: "push-cutoff" };
}

// Apply the posted cutoff for this session.
export function pushCutoffNext(
  _answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
): { errors?: string[]; goto?: string } | void {
  const sessionId = ctx.sessionId;
  const cut = applyCutoff(sessionId, fields["cutoff"]?.[0] ?? "");
  if (!cut.ok) return { errors: [cut.error] };
  return { goto: "push-confirm" };
}

// Run the push loop for this session.
export async function pushConfirmNext(
  _answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
): Promise<{ errors?: string[]; goto?: string } | void> {
  const sessionId = ctx.sessionId;
  const dry = (fields["dry"] ?? []).includes("dry");
  const choices: Record<string, string> = {};
  for (const [name, values] of Object.entries(fields)) {
    if (name.startsWith("order-")) choices[name.slice("order-".length)] = values[0] ?? "";
  }
  const done = await executePush(sessionId, choices, dry ? { dry: true } : undefined);
  if (!done.ok) return { errors: [done.error] };
  return { goto: "push-report" };
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
      const start = assigned.some((run) => run.id === prefillRunId) ? prefillRunId : assigned[0].id;
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
  return {
    ...step(
      "push-source",
      "Pick source",
      nodes,
      "Choose an assigned run, a saved split file, or a share link from a friend. Then type or paste the matching value below.",
    ),
    nav: { back: true, next: { label: "Next", run: pushSourceNext } },
  };
}

// Splitwise access status, from pusher.ts splitwise stage. Shows the
// signed-in name in live mode, or the no-access fallback note.
function setupStep(_m?: Map<string, string[]>, ctx?: WizardCtx): Step {
  const live = pushSessionFor(sidOf(ctx));
  const nodes = [];
  if (live.shareNote !== null) {
    nodes.push(markdown(live.shareNote));
  }
  if (live.mode === "live") {
    nodes.push(markdown(
      "Signed in as " + live.signedInAs + ".\n\n" +
        "Each person maps to one Splitwise member. Push target currency is " +
        live.currency + ".",
    ));
  } else if (live.mode === "aggregate") {
    if (live.setupError !== null) {
      nodes.push(markdown(live.setupError));
    }
    nodes.push(markdown(
      "No Splitwise access is configured.\n\n" +
        "The push writes one summary file instead. You enter the amounts in Splitwise by hand. " +
        "To push directly, run Set up Splitwise access in Settings first, then push again.",
    ));
  } else {
    nodes.push(markdown(
      live.setupError ??
        "Pick a source in the step before this one, then come back.",
    ));
  }
  return {
    ...step(
      "push-setup",
      "Splitwise access",
      nodes,
      "One-time check that this app may talk to Splitwise. The approval from Settings owns the sign-in, so this step only reports it.",
    ),
    nav: { back: true, next: { label: "Next", run: pushSetupNext } },
  };
}

// Name picker, from pusher.ts:213-240. Ambiguous people show their
// Splitwise matches as a radio plus a hand-typed id entry. Unmatched
// people show the carried no-match copy plus the id entry. The posted
// answers go through resolveNamePicks in the engine.
function namePickStep(_m?: Map<string, string[]>, ctx?: WizardCtx): Step {
  const live = pushSessionFor(sidOf(ctx));
  const nodes = [];
  if (live.namePicks.length === 0) {
    nodes.push(markdown(
      "Every person maps to one Splitwise member. Nothing to pick here.",
    ));
  }
  for (const pick of live.namePicks) {
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
  return {
    ...step(
      "push-names",
      "Splitwise members",
      nodes,
      "More than one Splitwise member shares a name, or a person has no match. Pick the right member, or type their id number.",
    ),
    nav: { back: true, next: { label: "Next", run: pushNamesNext } },
  };
}

// Group picker, from pusher.ts group select. Live mode only.
function groupStep(_m?: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const live = pushSessionFor(sessionId);
  const nodes = [];
  const note = accessNote(sessionId);
  if (note !== null) nodes.push(note);
  if (live.mode !== "live") {
    nodes.push(markdown("Splitwise is not connected, so no group pick is needed."));
  } else {
    nodes.push(
      radio(
        "Push into which group",
        "push-group",
        [
          { value: "0", hint: "No group, a plain expense" },
          ...live.groupChoices.map((group) => ({
            value: String(group.id),
            hint: group.name + " (id " + group.id + ")",
          })),
        ],
        "0",
      ),
    );
  }
  return {
    ...step(
      "push-group",
      "Splitwise group",
      nodes,
      "Expenses land in this group. Leave it on no group for plain expenses.",
    ),
    nav: { back: true, next: { label: "Next", run: pushGroupNext } },
  };
}

// Confirm step. Orders already sent show as auto-skips from the
// fingerprint set the engine staged. Everything else shows one
// Push/Skip choice per order, and the choices drive the real
// push outcomes. A ticked dry box marks the answers, so the submit
// runs the dry plan instead of the live push.
function confirmStep(m?: Map<string, string[]>, ctx?: WizardCtx): Step {
  const live = pushSessionFor(sidOf(ctx));
  const dry = m !== undefined && isDryMap(m);
  const nodes = [];
  if (dry) {
    nodes.push(markdown(
      "Dry run is on. Press Next to see the plan. Nothing will be written.",
    ));
  }
  if (live.groups.length === 0 && live.droppedByCutoff === 0) {
    nodes.push(markdown(
      "No orders reached this step. Check the source and cutoff steps.",
    ));
  } else {
    if (live.droppedByCutoff > 0) {
      nodes.push(markdown(
        "Cutoff " + live.cutoff + " leaves out " + live.droppedByCutoff +
          " later order(s).",
      ));
    }
    for (const order of live.groups) {
      const oid = order[0].order_id ?? "unknown";
      const total = order.reduce((sum, item) => sum + item.price, 0);
      const goods = itemSummary(order.map((entry) => ({ name: entry.item })));
      const label = goods !== undefined
        ? goods + " — " + formatMoney(total, live.currency)
        : "Order " + oid + " — " + formatMoney(total, live.currency);
      if (live.dupes.has(orderFingerprint(order))) {
        nodes.push(markdown(
          label + " — already sent to Splitwise. It skips.",
        ));
        continue;
      }
      // An order the payer bought for the payer alone is nobody else's
      // business, so it arrives set to Skip. Splitwise exists to record
      // what other people owe. Anything a second person shares arrives
      // set to Push. A choice the user already posted beats both.
      const owedByOthers = live.people
        .filter((person) => person !== live.payer)
        .reduce(
          (sum, person) => sum + order.reduce((s, item) => s + (item.assignments[person] ?? 0), 0),
          0,
        );
      nodes.push(
        radio(
          label,
          "order-" + oid,
          ["Push", "Skip"],
          m?.get("order-" + oid)?.[0] ?? (owedByOthers >= 0.01 ? "Push" : "Skip"),
          live.people.map((person) => {
            const share = order.reduce((sum, item) => sum + (item.assignments[person] ?? 0), 0);
            return `${person} ${fmtRs(share)}`;
          }).join(" · "),
        ),
      );
    }
  }
  if (dry) {
    nodes.push(dryNote());
  }
  // Show the summary under the notes. Keep the screen read only.
  if (!(live.groups.length === 0 && live.droppedByCutoff === 0)) {
    const summary = aggregateText(sidOf(ctx));
    if (summary !== null) {
      nodes.push(markdown("Read this summary before you push."));
      nodes.push(
        copyable("Summary", "push-summary", summary, {
          mono: true,
          rows: Math.max(8, Math.min(30, summary.split("\n").length + 2)),
        }),
      );
    }
  }
  return {
    ...step(
      "push-confirm",
      "Confirm orders",
      nodes,
      "Pick Push or Skip for each order. Push sends that order to Splitwise as one expense. Unpicked orders stay out.",
    ),
    nav: { back: true, next: { label: "Next", run: pushConfirmNext } },
  };
}

// Summary text for the aggregate report step. The written file wins,
// so the box matches the file. A rebuild covers a missing file.
function aggregateText(sessionId: string): string | null {
  const live = pushSessionFor(sidOf({ sessionId }));
  const file = live.outcome?.aggregateFile ?? null;
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
      live.groups,
      live.people,
      live.payer,
      live.settlements,
      live.currency + " ",
    );
  } catch {
    return null;
  }
}

// Report step. Shows the real counts from the engine outcome, not the
// raw radio counts. A dry outcome leads with its plan banner.
function reportStep(_m?: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const live = pushSessionFor(sessionId);
  const outcome = live.outcome;
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
    if (outcome.archived) {
      lines.push("Run " + (live.runId ?? "") + " is archived.");
    }
    if (outcome.aggregateFile !== null) {
      lines.push("Summary file written to " + outcome.aggregateFile + ".");
    }
    if (outcome.note !== "") {
      lines.push(outcome.note);
    }
    lines.push(
      (outcome.dry ? "Total that would push: " : "Total pushed amount: ") +
        formatMoney(outcome.totalRs, live.currency) + ".",
    );
    nodes.push(markdown(lines.join("\n\n")));
    if (live.mode === "aggregate") {
      const text = aggregateText(sessionId);
      if (text !== null) {
        nodes.push(
          copyable("Summary", "aggregate-summary", text, {
            mono: true,
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
  return {
    ...step(
      "push-report",
      "Push report",
      nodes,
      "Here is what happened. Pushed orders landed on Splitwise, and skipped orders stayed out.",
    ),
    nav: { back: true, goto: { step: "menu", label: "Back to menu" } },
  };
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
function cutoffStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const live = pushSessionFor(sessionId);
  const nodes = [];
  const note = accessNote(sessionId);
  if (note !== null) nodes.push(note);
  let prefill = m.get("cutoff")?.[0] ?? "";
  if (prefill === "") {
    let newest: Date | null = null;
    for (const order of live.groups) {
      const date = parseDate(order[0].date);
      if (date && (newest === null || date.getTime() > newest.getTime())) {
        newest = date;
      }
    }
    if (newest !== null) prefill = formatDayISO(newest);
  }
  nodes.push(textEntry("Push orders dated up to", "cutoff", prefill));
  return {
    ...step(
      "push-cutoff",
      "Cutoff date",
      nodes,
      "Include orders up to this date only (YYYY-MM-DD). Later orders stay out. Leave it blank to push every order.",
    ),
    nav: { back: true, next: { label: "Next", run: pushCutoffNext } },
  };
}
