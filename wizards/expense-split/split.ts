// Expense split wizard steps.
// Loads a real run, splits one flat line per post, and previews the export.

import {
  answers,
  markdown,
  mount,
  type NavHandler,
  type Node,
  radio,
  repeating,
  type Step,
  step,
  type StepFn,
  textarea,
  textEntry,
} from "../../wizardkit/mod.ts";
import {
  buildOutputDoc,
  countDoneOrders,
  firstUnfinished,
  type FlatItem,
  flattenOrders,
  freshState,
  type ItemAssignment,
  loadSplitStateSync,
  patchRunMeta,
  remapPeople,
  type SplitStateDoc,
  statePath,
  writeOutputDocSync,
  writeSplitState,
} from "../../src/splitstate.ts";
import { loadSettings } from "../../src/settings.ts";
import { formatMoney } from "../../src/common.ts";
import { buildAggregateSummary, groupOrders } from "../../src/render.ts";
import { createShareLink, type ShareLink } from "../../src/share.ts";
import {
  isDryMap,
  listRunsSync,
  readRunMetaSync,
  readRunOrders,
  runHint,
  type RunMeta,
  runsDir,
} from "../../src/runstate.ts";
import { answer, answerList } from "../../src/answers.ts";
import { sessionStore, sidOf } from "../../src/sessionstore.ts";
import { listResumableDrafts } from "../expense-split.ts";
import type { WizardCtx } from "../../wizardkit/mod.ts";
import { dryBox, dryNote } from "./dry.ts";

// Live split session for one run dir. The doc is the source of truth
// between posts; writeSplitState mirrors it to disk after each commit.
interface Session {
  runDir: string;
  flat: FlatItem[];
  doc: SplitStateDoc;
  baseline: number;
  exported: boolean;
  error: string;
  // Number of source orders, for the meta progress fields.
  orderCount: number;
  // True while the saved-progress question still waits for an answer.
  pendingResume: boolean;
  // Last ordersDone count written to meta.json, so renders stay quiet.
  metaDone: number;
  // Validation output from the last export attempt. Empty when clean.
  validateError: string;
  // Chain of saves. Each save starts after the save before it settles.
  saveChain: Promise<void>;
  // Reason the last save missed. Empty when the last save landed.
  saveError: string;
}

// Live split sessions, one per browser session. Each doc is the source
// of truth between posts; writeSplitState mirrors it to disk after each
// commit. The store replaces the module level session value, which two
// browsers used to share.
const splitSessions = sessionStore((): {
  current: Session | null;
} => ({ current: null }));

// Read the live session for one session id.
function sessionFor(sessionId: string): Session | null {
  return splitSessions.for(sidOf({ sessionId })).current;
}

// Store the live session for one session id.
function setSessionFor(sessionId: string, value: Session | null): void {
  splitSessions.for(sidOf({ sessionId })).current = value;
}

// Currency labels, one per browser session. The store replaces the
// module level currency value, which two browsers used to share. Loads
// once at startup for the default session, and tests can reload it
// after they change SPLIT_UTILS_STATE.
const currencies = sessionStore((): { value: string } => ({ value: "INR" }));

// Read the currency label for one session id.
function currencyFor(sessionId: string): string {
  return currencies.for(sidOf({ sessionId })).value;
}

// Read the currency label from settings. Falls back to INR.
export async function loadCurrency(sessionId: string): Promise<string> {
  const sid = sidOf({ sessionId });
  try {
    currencies.for(sid).value = (await loadSettings()).currency;
  } catch {
    currencies.for(sid).value = "INR";
  }
  return currencies.for(sid).value;
}

// People from the people step, blanks dropped. The step posts a
// dynamic person list; the three fixed keys stay for old drafts.
export function collectedPeople(m: Map<string, string[]>): string[] {
  const names = [
    ...(answerList(m, "person")),
    ...["person-1", "person-2", "person-3"].map(
      (key) => m.get(key)?.[0] ?? "",
    ),
  ];
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name.length > 0 && !out.includes(name)) out.push(name);
  }
  return out;
}

// True when a saved doc holds real progress worth a resume question.
function hasProgress(doc: SplitStateDoc): boolean {
  return Object.keys(doc.assignments).length > 0 ||
    Object.keys(doc.skipped).length > 0;
}

// Resolve a typed run id or dir path to a real directory. Answers may
// hold a bare id, so meta and state writes must land in the real dir.
function resolveRunDir(run: string): string {
  const clean = run.replace(/\/+$/, "");
  for (const path of [clean, runsDir() + "/" + clean]) {
    try {
      Deno.statSync(path);
      return path;
    } catch {
      // Try the next candidate.
    }
  }
  return clean;
}

// Load one run into a live session. A saved splitstate wins over a
// fresh doc, so a mid-way run resumes with its assignments intact.
function loadSession(runDir: string, people: string[], payer: string): Session {
  const flat = flattenOrders(readRunOrders(runDir));
  if (flat.length === 0) throw new Error("the run holds no items");
  const dir = resolveRunDir(runDir);
  let baseline = 0;
  try {
    baseline = Deno.statSync(statePath(dir)).mtime?.getTime() ?? 0;
  } catch {
    // Fresh run, no saved state yet.
  }
  const saved = loadSplitStateSync(dir);
  const doc = saved ?? freshState(people, payer);
  if (saved === null) {
    // A fresh session honours the gather pick list. Saved work stays untouched.
    // A missing or unreadable record leaves every line open.
    const meta = readRunMetaSync(dir);
    if (meta !== null && Array.isArray(meta.picked)) {
      const keep = new Set(
        meta.picked.filter((n): n is number => typeof n === "number" && Number.isInteger(n)),
      );
      flat.forEach((line, index) => {
        if (!keep.has(line.orderPos)) doc.skipped[String(index)] = true;
      });
    }
  }
  const orderCount = flat.length > 0 ? flat[flat.length - 1].orderPos + 1 : 0;
  const done = countDoneOrders(flat, orderCount, doc);
  const lastPayer = doc.payer.length > 0 ? doc.payer : payer;
  patchRunMeta(dir, {
    lastPayer,
    ordersDone: done,
    ordersTotal: orderCount,
  });
  return {
    runDir: dir,
    flat,
    doc,
    baseline,
    exported: false,
    error: "",
    orderCount,
    pendingResume: saved !== null && hasProgress(saved),
    metaDone: done,
    validateError: "",
    saveChain: Promise.resolve(),
    saveError: "",
  };
}

// Writer saveState uses. Tests can swap it to force a failure.
let saveWriter: typeof writeSplitState = writeSplitState;

// Swap the save writer. Tests use this to force a failed save.
export function setSaveWriterForTests(fn: typeof writeSplitState): void {
  saveWriter = fn;
}

// Promise for the saves queued so far. Tests await it.
export function pendingSaves(sessionId: string): Promise<void> {
  return sessionFor(sessionId)?.saveChain ?? Promise.resolve();
}

// Reason the last save missed. Empty when the last save landed.
export function lastSaveError(sessionId: string): string {
  return sessionFor(sessionId)?.saveError ?? "";
}

// Persist the session through the splitstate writer. Fire and forget;
// the in-memory doc stays the live copy between posts. Each call
// appends its write to the session chain, so one write runs at a
// time. A failed write records its reason and never breaks the chain.
function saveState(s: Session): void {
  const run = async (): Promise<void> => {
    try {
      const result = await saveWriter(s.runDir, s.doc, s.baseline);
      // Carry the writer time into the next baseline.
      s.baseline = result.at;
      s.saveError = "";
    } catch (err) {
      s.saveError = err instanceof Error ? err.message : String(err);
    }
  };
  s.saveChain = s.saveChain.then(run, run);
}

// Mirror split progress into meta.json. Runs stay findable mid-way.
function updateProgressMeta(s: Session): void {
  const done = countDoneOrders(s.flat, s.orderCount, s.doc);
  if (done === s.metaDone) return;
  s.metaDone = done;
  const lastPayer = s.doc.payer.length > 0 ? s.doc.payer : undefined;
  patchRunMeta(s.runDir, {
    lastPayer,
    ordersDone: done,
    ordersTotal: s.orderCount,
  });
}

// Names the saved split state doc already holds for the picked run.
function savedPeople(m: Map<string, string[]>, sessionId?: string): string[] {
  const run = pickedRun(m, sessionId);
  if (run.length === 0) return [];
  return loadSplitStateSync(resolveRunDir(run))?.people ?? [];
}

// Name the person gave for themselves on the People step.
function meName(m: Map<string, string[]>): string {
  return answer(m, "me");
}

// People, payer, and you in one step. Saved names come back as filled
// text entries named person, so they merge with the repeating rows.
// Names, payer, and you from the most recent People post, one map per
// browser session. A rejected post never reaches the answers map, so
// without this the re-render drops every name the user just typed, and
// the step can never pass. The store replaces the module level
// lastPeoplePost value, which two browsers used to share.
const peoplePosts = sessionStore((): {
  current: { names: string[]; payer: string; me: string } | null;
} => ({ current: null }));

/** Remember one People post before the completeness check runs. */
export function rememberPeoplePost(
  sessionId: string,
  fields: Record<string, string[]>,
): void {
  const sid = sidOf({ sessionId });
  const names: string[] = [];
  for (const key of ["person", "person-1", "person-2", "person-3"]) {
    for (const raw of fields[key] ?? []) {
      const name = raw.trim();
      if (name.length > 0 && !names.includes(name)) names.push(name);
    }
  }
  peoplePosts.for(sid).current = {
    names,
    payer: (fields["payer"]?.[0] ?? "").trim(),
    me: (fields["me"]?.[0] ?? "").trim(),
  };
}

// Read the last People post for one session id.
function lastPeoplePostFor(
  sessionId: string,
): { names: string[]; payer: string; me: string } | null {
  return peoplePosts.for(sidOf({ sessionId })).current;
}

// Next handler for the People step. It remembers the post before the
// check runs, then rejects gaps with errors. The bar never sends Back
// here, so no extra guard is needed.
export function peopleNext(
  _answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
): { errors?: string[] } | void {
  rememberPeoplePost(ctx.sessionId, fields);
  const problems = roleErrors(fields);
  if (problems.length > 0) return { errors: problems };
}

function peopleStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const lastPeoplePost = lastPeoplePostFor(sessionId);
  const known = collectedPeople(m);
  // Order of truth: answers already recorded, then the post this step
  // just rejected, then the names saved with the run.
  const held = lastPeoplePost !== null && lastPeoplePost.names.length > 0
    ? lastPeoplePost.names
    : savedPeople(m, sessionId);
  const seeded = known.length > 0 ? known : held;
  // The repeating block carries the known names as its own rows. Plain
  // entries beside an empty block were a workaround for a block that
  // took no initial values, and they left the names unremovable.
  const nodes: Node[] = [
    repeating(
      "People",
      "people",
      [{ kind: "text", label: "Name", name: "person" }],
      seeded.map((name) => ({ person: name })),
    ),
  ];
  if (seeded.length > 0) {
    const heldPayer = lastPeoplePost?.payer ?? "";
    const heldMe = lastPeoplePost?.me ?? "";
    nodes.push(
      radio(
        "Who paid",
        "payer",
        seeded,
        seeded.includes(heldPayer) ? heldPayer : undefined,
      ),
    );
    nodes.push(
      radio(
        "Which name is you",
        "me",
        seeded,
        seeded.includes(heldMe) ? heldMe : undefined,
      ),
    );
  }
  return {
    ...step(
      "split-people",
      "People",
      nodes,
      "Check the names. Add a row per new person. Then pick who paid and which name is you.",
    ),
    nav: { back: true, next: { label: "Next", run: peopleNext } },
  };
}

// Completeness check for the People step. The orchestrator calls this
// from the submit hook and re-renders the step with the messages.
export function roleErrors(fields: Record<string, string[]>): string[] {
  const names: string[] = [];
  for (const key of ["person", "person-1", "person-2", "person-3"]) {
    for (const raw of fields[key] ?? []) {
      const name = raw.trim();
      if (name.length > 0 && !names.includes(name)) names.push(name);
    }
  }
  if (names.length === 0) {
    return ["Type at least one name, so the split knows who shares the cost."];
  }
  const payer = fields["payer"]?.[0]?.trim() ?? "";
  const me = fields["me"]?.[0]?.trim() ?? "";
  if (payer.length === 0 || me.length === 0) {
    return ["Pick who paid and which name is you, then press Next."];
  }
  return [];
}

// Hold the run id this browser splits, one per session.
// Carry the gather pick across the run question.
const splitRuns = sessionStore((): { id: string | null } => ({ id: null }));

// Remember the run id this browser splits.
// Call this after the gather pick saves.
export function setSplitRun(sessionId: string, runId: string): void {
  splitRuns.for(sidOf({ sessionId })).id = runId;
}

// Read the stored split run for one session id.
// Return empty when the session holds none.
function storedSplitRun(sessionId?: string): string {
  if (sessionId === undefined || sessionId.length === 0) return "";
  const held = splitRuns.for(sidOf({ sessionId })).id;
  return held ?? "";
}

// The picked run. A value typed into Other run wins over the list
// pick. A run picked on the resume screen comes last, so a user who
// resumes a session never answers the same question twice.
function pickedRun(m: Map<string, string[]>, sessionId?: string): string {
  const other = answer(m, "run-other");
  if (other.length > 0) return other;
  const picked = answer(m, "run");
  if (picked.length > 0) return picked;
  const resumed = answer(m, "resume-pick");
  if (resumed.length > 0) return resumed;
  return storedSplitRun(sessionId);
}

// Run picker. Lists every live run, plus a free text entry for a run
// the list misses.
function runStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const runs = listRunsSync();
  if (runs.length === 0) {
    return {
      ...step(
        "split-run",
        "Run",
        [
          markdown("No gathered runs exist yet. The gather flow creates one."),
        ],
        "Collect orders first. The gather flow creates a run you can split.",
      ),
      nav: { back: true },
    };
  }
  return {
    ...step(
      "split-run",
      "Run",
      [
        radio(
          "Run",
          "run",
          runs.map((run) => ({ value: run.id, hint: runHint(run) })),
          // A run carried in from the resume screen shows as picked, so a
          // user who already chose one does not choose again. Otherwise
          // the newest run leads.
          runs.some((run) => run.id === pickedRun(m, sessionId))
            ? pickedRun(m, sessionId)
            : runs[0].id,
        ),
        textEntry("Other run", "run-other", ""),
        dryBox(isDryMap(m)),
      ],
      "Pick the run to split. Other run covers a run the list misses.",
    ),
    nav: { back: true, next: "Next" },
  };
}

// Silent action handler. It changes nothing and returns nothing, so the
// bar re-renders the same step. Check again uses it.
function rerenderOnly(
  _answers: Map<string, string[]>,
  _fields: Record<string, string[]>,
  _ctx: WizardCtx,
): void {}

// Return the last saved assignment for a run.
// Scan saved keys for the highest line index.
// Return null when the run holds no assignment.
export function lastSavedAssignment(doc: SplitStateDoc): ItemAssignment | null {
  let best = -1;
  let found: ItemAssignment | null = null;
  for (const key of Object.keys(doc.assignments)) {
    const at = Number(key);
    if (!Number.isInteger(at)) continue;
    if (at > best) {
      best = at;
      found = doc.assignments[key] ?? null;
    }
  }
  return found;
}

// Item step. The browser board owns the run now, so this step hands
// the board the whole run as mount data and draws nothing per item.
// The bar carries flow controls only: leave, or finish and export.
export function itemStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const currency = currencyFor(sessionId);
  const fieldPeople = collectedPeople(m);
  const dir = pickedRun(m, sessionId);
  if (dir.length === 0) {
    return {
      ...step(
        "split-item",
        "Split item",
        [
          markdown("Pick a run in the Run step first."),
        ],
        "Go back and pick a run, then return here.",
      ),
      nav: { back: true },
    };
  }
  let live = sessionFor(sessionId);
  if (live === null || live.runDir !== resolveRunDir(dir)) {
    try {
      live = loadSession(
        dir,
        fieldPeople,
        m.get("payer")?.[0] ?? "",
      );
      setSessionFor(sessionId, live);
    } catch {
      return {
        ...step(
          "split-item",
          "Split item",
          [
            markdown("That run does not match a saved run. Pick one from the list."),
          ],
          "Go back and pick a run from the list.",
        ),
        nav: { back: true },
      };
    }
  }
  const s = live;
  const people = fieldPeople.length > 0 ? fieldPeople : s.doc.people;
  // True while this render clears the run. A fresh clear keeps its
  // empty doc even when the disk holds a newer board checkpoint.
  let reset = false;
  // Ask once when a saved run holds progress. The answer decides
  // between resume and a clean start.
  if (s.pendingResume && (m.get("resume")?.[0] ?? "").length === 0) {
    return {
      ...step(
        "split-item",
        "Split item",
        [
          markdown("This run holds a saved split in progress."),
          radio(
            "Continue where you left off?",
            "resume",
            ["Continue where you left off?", "Start over"],
            "Continue where you left off?",
          ),
        ],
        "Pick Continue to keep the saved assignments. Pick Start over to clear them.",
      ),
      nav: { back: true, next: "Next" },
    };
  }
  if (s.pendingResume) {
    s.pendingResume = false;
    if (m.get("resume")?.[0] === "Start over") {
      const payer = answer(m, "payer");
      s.doc = freshState(people, payer.length > 0 ? payer : s.doc.payer);
      saveState(s);
      reset = true;
    }
    updateProgressMeta(s);
  }
  // A newer state file wins over the cached doc, because the board
  // checkpoints straight to disk. A queued wizard save keeps the
  // cached doc until that save lands. A fresh clear skips this.
  if (!reset) {
    let diskAt = 0;
    try {
      diskAt = Deno.statSync(statePath(s.runDir)).mtime?.getTime() ?? 0;
    } catch {
      diskAt = 0;
    }
    if (diskAt > s.baseline) {
      const fresh = loadSplitStateSync(s.runDir);
      if (fresh !== null) {
        s.doc = fresh;
        s.baseline = diskAt;
      }
    }
  }
  // A rename through the People step keeps every saved assignment.
  // A resume with blank people fields keeps the saved names.
  if (
    people.length > 0 &&
    (people.length !== s.doc.people.length ||
      people.some((name, at) => name !== s.doc.people[at]))
  ) {
    s.doc = remapPeople(s.doc, people);
    s.doc.people = [...people];
    const payer = answer(m, "payer");
    if (payer.length > 0) s.doc.payer = payer;
    saveState(s);
    updateProgressMeta(s);
  }
  // The patch endpoint answers 409 while no state file exists, so the
  // first render writes the fresh doc. Later renders find the file.
  try {
    Deno.statSync(statePath(s.runDir));
  } catch {
    const stamped: SplitStateDoc = {
      ...s.doc,
      updatedAt: new Date().toISOString(),
    };
    Deno.writeTextFileSync(
      statePath(s.runDir),
      JSON.stringify(stamped, null, 2) + "\n",
    );
  }
  // Read the state file time for the board baseline. Steps run sync,
  // so this reads the same time the async snapshot helper reads.
  let at = s.baseline;
  try {
    at = Deno.statSync(statePath(s.runDir)).mtime?.getTime() ?? 0;
  } catch {
    at = s.baseline;
  }
  s.baseline = at;
  const payer = answer(m, "payer");
  const runId = s.runDir.replace(/\/+$/, "").split("/").pop() ?? "";
  const data = {
    runId,
    currency,
    payer: payer.length > 0 ? payer : s.doc.payer,
    me: meName(m),
    people: [...people],
    items: s.flat.map((line, index) => ({
      index,
      name: line.name,
      price: line.price,
      platform: line.platform,
      orderId: line.orderId,
      isFee: line.isFee,
    })),
    assignments: s.doc.assignments,
    skipped: s.doc.skipped,
    at,
  };
  // The board owns movement between items now, and it binds Repeat Last
  // to the r key on the screen itself. So the bar carries flow controls
  // only: leave, or finish and go to the export. A Next item button here
  // would fight the board's own Next and move nothing.
  return {
    ...step(
      "split-item",
      "Split item",
      [mount("split-board", data)],
      "Pick who shares this item and how the price splits. Tick Skip for items nobody owes.",
    ),
    nav: {
      back: true,
      goto: { step: "split-export", label: "Finish splitting" },
    },
  };
}

// Run the output validator over a written output.json. Mirrors the old
// flow: a failure is a bug, so the export step shows it and blocks.
function runValidatorSync(outPath: string): { ok: boolean; output: string } {
  const script = new URL("../../scripts/validate.ts", import.meta.url).pathname;
  try {
    const res = new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-lock", "--allow-read", script, outPath],
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    const text = new TextDecoder().decode(res.stdout) +
      new TextDecoder().decode(res.stderr);
    return { ok: res.success, output: text.trim() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, output: message };
  }
}

// One settlement line. Rows that name the me person read in second
// person; other rows keep the plain wording.
function settlementLine(
  row: { from: string; to: string; amount: number },
  me: string,
  currency: string,
): string {
  if (me.length > 0 && row.from === me) {
    return "You pay " + row.to + " " + formatMoney(row.amount, currency);
  }
  if (me.length > 0 && row.to === me) {
    return row.from + " pays you " + formatMoney(row.amount, currency);
  }
  return row.from + " pays " + row.to + " " + formatMoney(row.amount, currency);
}

// Jump handler for one bar action. It moves to the named step, so one
// finish path keeps its target without its own function.
function goTo(target: string): NavHandler {
  return () => ({ goto: target });
}

// Export step. Finish writes output.json for the run dir, runs the
// validator over it, then marks the run assigned. A validator failure
// renders as a step error and blocks Finish.
export function exportStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const currency = currencyFor(sessionId);
  const people = collectedPeople(m);
  const payer = answer(m, "payer");
  const live = sessionFor(sessionId);
  if (live === null) {
    return {
      ...step(
        "split-export",
        "Export",
        [
          markdown("Split a run first."),
        ],
        "There is nothing to export yet. Split a run first.",
      ),
      nav: { back: true },
    };
  }
  const s = live;
  // The board checkpoints straight to disk while the wizard idles, so
  // a newer file wins over the cached doc here. A queued wizard save
  // keeps the cached doc until that save lands.
  let diskAt = 0;
  try {
    diskAt = Deno.statSync(statePath(s.runDir)).mtime?.getTime() ?? 0;
  } catch {
    diskAt = 0;
  }
  if (diskAt > s.baseline) {
    const fresh = loadSplitStateSync(s.runDir);
    if (fresh !== null) {
      s.doc = fresh;
      s.baseline = diskAt;
    }
  }
  // Dry plan first, before any write. It mirrors the live shape
  // (counts, payloads, totals) and writes nothing: no output.json,
  // no validator run, no meta patch.
  if (isDryMap(m)) {
    const names = people.length > 0 ? people : s.doc.people;
    const doc = buildOutputDoc({
      flat: s.flat,
      assignments: s.doc.assignments,
      skipped: s.doc.skipped,
      people: names,
      payer: payer.length > 0 ? payer : s.doc.payer,
    });
    const lines = [
      "Split dry run. Nothing is written.",
      "",
      "Items: " + s.flat.length + ". Assigned: " +
      Object.keys(s.doc.assignments).length + ". Skipped: " +
      Object.keys(s.doc.skipped).length + ".",
      ...Object.keys(doc.totals).map((name) =>
        "Total " + name + ": " + formatMoney(doc.totals[name] ?? 0, currency)
      ),
      ...doc.settlements.map((row) => settlementLine(row, meName(m), currency)),
      "",
      "Would write output.json and mark the run assigned.",
    ];
    return {
      ...step(
        "split-export",
        "Export",
        [
          markdown(lines.join("\n")),
          dryNote(),
        ],
        "Dry run is on. This is the plan only. Press Back to the first screen of this flow to change it.",
      ),
      nav: { back: true, goto: { step: "menu", label: "Back to menu" } },
    };
  }
  // Step functions rebuild eagerly on every post, so this runs before
  // the split is done. Export only once every line is assigned or
  // skipped, or after a clean export already happened.
  const done = firstUnfinished(
    s.flat.length,
    s.doc.assignments,
    s.doc.skipped,
  );
  if (!s.exported && done < s.flat.length) {
    return {
      ...step(
        "split-export",
        "Export",
        [
          markdown(
            "Finish the split items first. " +
              (s.flat.length - done) +
              " items still wait.",
          ),
        ],
        "Go back and split every remaining item, then return here.",
      ),
      nav: { back: true },
    };
  }
  const names = people.length > 0 ? people : s.doc.people;
  const doc = buildOutputDoc({
    flat: s.flat,
    assignments: s.doc.assignments,
    skipped: s.doc.skipped,
    people: names,
    payer: payer.length > 0 ? payer : s.doc.payer,
  });
  // Retry on every render while the last validation failed, so a Retry
  // press rewrites and rechecks without any hidden state.
  if (!s.exported) {
    const outPath = writeOutputDocSync(s.runDir, doc);
    const verdict = runValidatorSync(outPath);
    if (verdict.ok) {
      s.validateError = "";
      s.exported = true;
      patchRunMeta(s.runDir, {
        lastPayer: payer.length > 0 ? payer : s.doc.payer,
        ordersDone: s.orderCount,
        ordersTotal: s.orderCount,
        status: "assigned",
        outputFile: "output.json",
      });
    } else {
      s.validateError = verdict.output;
    }
  }
  if (s.validateError.length > 0) {
    return {
      ...step(
        "split-export",
        "Export",
        [
          markdown(
            "The export failed its own check. Press Check again, or report this.\n\n" +
              s.validateError,
          ),
        ],
        "The check runs again when you press Check again. Fix nothing by hand here.",
      ),
      nav: {
        back: true,
        actions: [{ id: "retry", label: "Check again", run: rerenderOnly }],
      },
    };
  }
  const me = meName(m);
  const totals = Object.keys(doc.totals);
  const entries = [
    { name: "Payer", values: [payer.length > 0 ? payer : s.doc.payer] },
    ...(me.length > 0 && totals.includes(me)
      ? [{ name: "Your total", values: [formatMoney(doc.totals[me] ?? 0, currency)] }]
      : []),
    ...totals.filter((name) => name !== me).map((name) => ({
      name: "Total " + name,
      values: [formatMoney(doc.totals[name] ?? 0, currency)],
    })),
  ];
  const rows = doc.settlements.map((row) => settlementLine(row, me, currency));
  return {
    ...step(
      "split-export",
      "Export",
      [
        answers("Totals", entries),
        markdown(
          "## Settlements\n" +
            (rows.length > 0 ? rows.join("\n") : "Nothing to settle."),
        ),
        markdown("Send these to Splitwise now?"),
        markdown(
          "Any one of the three ways below settles the bill, and the summary and the share path need no Splitwise account.",
        ),
        ...(isDryMap(m) ? [dryNote()] : []),
      ],
      "The split is done. Push opens the push flow with this run loaded. Back to menu returns to the menu.",
    ),
    nav: {
      back: true,
      actions: [
        { id: "push-source", label: "Push to Splitwise", run: goTo("push-source") },
        { id: "split-summary", label: "Summary to copy", run: goTo("split-summary") },
        { id: "split-share", label: "Share with a friend", run: goTo("split-share") },
      ],
      goto: { step: "menu", label: "Back to menu" },
    },
  };
}

// Stored share links, one per browser session. The orchestrator fills
// one through createSplitShareLink, and split-share-done reads it back.
// The store replaces the module level storedShare value, which two
// browsers used to share.
const shareLinks = sessionStore((): {
  current: ShareLink | null;
} => ({ current: null }));

// Summary text for the finished split, built without writing files.
function finishedSummaryText(m: Map<string, string[]>, sessionId: string): string | null {
  const live = sessionFor(sessionId);
  if (live === null || !live.exported) return null;
  const s = live;
  const currency = currencyFor(sessionId);
  const fieldPeople = collectedPeople(m);
  const names = fieldPeople.length > 0 ? fieldPeople : s.doc.people;
  const payer = answer(m, "payer") || s.doc.payer;
  const doc = buildOutputDoc({
    flat: s.flat,
    assignments: s.doc.assignments,
    skipped: s.doc.skipped,
    people: names,
    payer,
  });
  return buildAggregateSummary(
    groupOrders(doc.splits),
    names,
    payer,
    doc.settlements,
    currency + " ",
  );
}

// Rows for a textarea that shows a block of text.
function rowsFor(text: string): number {
  return Math.max(8, Math.min(30, text.split("\n").length + 2));
}

// Summary step. Shows the aggregate summary text for the finished
// split inside a textarea, so the user can copy it by hand.
export function summaryStep(m: Map<string, string[]>, ctx?: WizardCtx): Step {
  const text = finishedSummaryText(m, sidOf(ctx));
  if (text === null) {
    return {
      ...step(
        "split-summary",
        "Summary to copy",
        [
          markdown("A split must finish first, then this step shows the summary."),
        ],
        "Finish the split items and the export first, then return here.",
      ),
      nav: { back: true },
    };
  }
  return {
    ...step(
      "split-summary",
      "Summary to copy",
      [
        markdown(
          "Select the text, copy it, and add it to Splitwise as one expense. No account or API key is needed.",
        ),
        textarea("Summary", "summary-text", { value: text, rows: rowsFor(text) }),
      ],
      "Copy the text and add it to Splitwise as one expense. Nothing else is needed.",
    ),
    nav: { back: true, goto: { step: "menu", label: "Back to menu" } },
  };
}

// Next handler for the Share step. It uploads the finished split and
// moves to the link step. It reads earlier answers for the run, so no
// merged map is needed.
export async function shareNext(
  answers: Map<string, string[]>,
  _fields: Record<string, string[]>,
  ctx: WizardCtx,
): Promise<{ errors?: string[]; goto?: string } | void> {
  const made = await createSplitShareLink(ctx.sessionId, answers);
  if (!made.ok) return { errors: [made.error] };
  return { goto: "split-share-done" };
}

// Share step. Explains the encrypted share link before the upload.
export function shareStep(_m: Map<string, string[]>): Step {
  return {
    ...step(
      "split-share",
      "Share with a friend",
      [
        markdown(
          "The app uploads the split as encrypted text and makes a share link. " +
            "The link holds no readable data without its code, so send the link and the code together.",
        ),
        markdown(
          "A friend with Splitwise access opens the link under Upload orders to Splitwise. " +
            "The link expires, so the friend should open it soon.",
        ),
      ],
      "Press Next to make the link. Then send the link and the code to your friend.",
    ),
    nav: { back: true, next: { label: "Next", run: shareNext } },
  };
}

// Share done step. Shows the created link and its code.
export function shareDoneStep(_m: Map<string, string[]>, ctx?: WizardCtx): Step {
  const storedShare = shareLinks.for(sidOf(ctx)).current;
  if (storedShare === null) {
    return {
      ...step(
        "split-share-done",
        "Share link",
        [
          markdown("No link exists yet. Press Next on the previous step first."),
        ],
        "Go back one step and press Next to make the link.",
      ),
      nav: { back: true },
    };
  }
  const nodes: Node[] = [
    markdown(
      "Send this link to your friend. The friend opens it under Upload orders to Splitwise.",
    ),
    textarea("Share link", "share-link-out", {
      value: storedShare.link,
      rows: 4,
    }),
  ];
  if (storedShare.keyFragment.length > 0) {
    nodes.push(markdown("Code: " + storedShare.keyFragment));
  }
  return {
    ...step(
      "split-share-done",
      "Share link",
      nodes,
      "Send the link and the code to your friend before the link expires.",
    ),
    nav: { goto: { step: "menu", label: "Back to menu" } },
  };
}

// Upload the finished output.json as an encrypted share link. The
// orchestrator calls this from the submit hook for split-share. It
// stores the link for split-share-done and never logs secrets.
export async function createSplitShareLink(
  sessionId: string,
  m: Map<string, string[]>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = sidOf({ sessionId });
  try {
    const picked = pickedRun(m, sessionId);
    const dir = picked.length > 0 ? resolveRunDir(picked) : sessionFor(sid)?.runDir ?? "";
    if (dir.length === 0) {
      return { ok: false, error: "Finish a split first, then share it." };
    }
    const jsonText = await Deno.readTextFile(dir + "/output.json");
    shareLinks.for(sid).current = await createShareLink(jsonText);
    return { ok: true };
  } catch {
    return { ok: false, error: "The share upload failed. Try again later." };
  }
}

// Link text stored by createSplitShareLink, or null before upload.
export function currentShareLink(sessionId: string): string | null {
  const held = shareLinks.for(sidOf({ sessionId })).current;
  return held === null ? null : held.link;
}

// Run id of the live split session, or "" when no session runs. The
// export step hands this to the push flow, and the push source step
// prefills its run id entry with it.
export function splitRunId(sessionId: string): string {
  const live = sessionFor(sessionId);
  if (live === null) return "";
  const parts = live.runDir.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] ?? "";
}

// Next step for one run status. A gathered run opens gather-pick
// so the user picks orders before the split flow opens. Assigned
// runs push, failed runs restart at gather, pushed runs are done.
export function routeStatus(status: RunMeta["status"]): string {
  // A gathered run opens the pick step. The user picks which orders
  // to split before the split flow opens.
  if (status === "gathered") return "gather-pick";
  if (status === "assigned") return "push-source";
  if (status === "failed") return "gather-platforms";
  return "resume-done";
}

// Resume picker. Lists every live run newest first with its status,
// so failed runs surface with their reason instead of hiding.
export function resumeStep(): Step {
  const drafts = listResumableDrafts();
  if (drafts.length === 0) {
    return {
      ...step(
        "resume",
        "Pick up where you left off",
        [
          markdown("You have no saved sessions yet. Collect orders first to start one."),
        ],
        "No sessions yet. Go back and collect orders first.",
      ),
      nav: { back: true },
    };
  }
  return {
    ...step(
      "resume",
      "Pick up where you left off",
      [
        radio(
          "Session",
          "resume-pick",
          drafts.map((entry) => ({ value: entry.id, hint: entry.hint })),
          drafts[0].id,
        ),
      ],
      "Pick a session. Each one opens at its next step. Failed runs name their reason.",
    ),
    nav: { back: true, next: "Next" },
  };
}

// Landing step for runs that already pushed. Nothing left to do.
function resumeDoneStep(): Step {
  return {
    ...step(
      "resume-done",
      "Session complete",
      [
        markdown("That session already pushed. Nothing left to do."),
      ],
      "This run is done. Pick another session or start a new one.",
    ),
    nav: { back: true, goto: { step: "menu", label: "Back to menu" } },
  };
}

export function splitSteps(): Array<Step | StepFn> {
  return [
    runStep,
    peopleStep,
    itemStep,
    exportStep,
    summaryStep,
    shareStep,
    shareDoneStep,
    resumeStep,
    resumeDoneStep(),
  ];
}
