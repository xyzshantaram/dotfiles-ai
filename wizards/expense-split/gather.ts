// Gather stage steps for the expense-split wizard.

import {
  action,
  answers,
  checkbox,
  markdown,
  type Node,
  numberEntry,
  repeating,
  type Step,
  step,
  type StepFn,
  textEntry,
} from "../../wizardkit/mod.ts";
import {
  isDryMap,
  listRunsSync,
  readRunMetaSync,
  readRunOrders,
  runsDir,
  setRunPicked,
  stateRoot,
} from "../../src/runstate.ts";
import { answer, answerList } from "../../src/answers.ts";
import { sessionStore, sidOf } from "../../src/sessionstore.ts";
import { setSplitRun } from "./split.ts";
import type { WizardCtx } from "../../wizardkit/mod.ts";
import { dryBox, dryNote } from "./dry.ts";
import { fmtRs, formatDayISO, isLedgerRow, itemSummary, parseDate } from "../../src/common.ts";
import { DEFAULT_LOCATION, hasTokensSync } from "../../src/zomato.ts";
import type { Order } from "../../src/common.ts";

// Platform ids the gather stage knows, in checkbox order.
const PLATFORMS = ["zepto", "blinkit", "zomato", "swiggy", "manual"] as const;
export type PlatformId = (typeof PLATFORMS)[number];

// Title-case name for one platform id.
function platformName(id: PlatformId): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// Profile dir for one browser platform under the active state root.
function profileDir(id: string): string {
  return stateRoot() + "/share/profiles/" + id;
}

// True when a platform holds cached credentials, the same way the
// gatherer detects them: profile storage for browser platforms,
// token files for Zomato, and Manual needs nothing.
function hasCached(id: PlatformId): boolean {
  if (id === "manual") return true;
  if (id === "zomato") return hasTokensSync();
  try {
    Deno.statSync(profileDir(id));
    return true;
  } catch {
    return false;
  }
}

// Build the gather-accounts step from the picked platforms.
function accountsStep(answerMap: Map<string, string[]>): Step {
  const dry = isDryMap(answerMap);
  const picked = (answerList(answerMap, "platforms"))
    .map((value) => value.toLowerCase())
    .filter((value): value is PlatformId => (PLATFORMS as readonly string[]).includes(value))
    .filter((id, index, all) => all.indexOf(id) === index);
  const nodes: Node[] = [];
  for (const id of picked) {
    if (dry) {
      // Dry plan names the sign-in without opening any window.
      nodes.push(
        markdown(platformName(id) + ": would sign in, then read its order pages."),
      );
      continue;
    }
    if (id === "zomato") {
      // Phone login on this screen. Markers fill from the typed
      // entries when the action runs. The city block below shows in
      // both states so a user can accept Bengaluru with one press.
      // Every other platform names itself in one line. Zomato owns a
      // block of entries instead, so it takes a heading. Without it the
      // phone and city boxes read as fields of no platform at all.
      nodes.push(markdown("### Zomato"));
      if (hasTokensSync()) {
        nodes.push(markdown("Signed in and ready."));
      } else {
        nodes.push(textEntry("Phone number", "zomato-phone"));
        nodes.push(
          action(
            "Send the code",
            "gather-zomato-login-start",
            [
              "deno",
              "run",
              "--no-lock",
              "--allow-read",
              "--allow-write",
              "--allow-run",
              "--allow-env",
              "--allow-sys",
              "--allow-net",
              "wizards/gatherer.ts",
              "--zomato-login-start",
              "--phone={zomato-phone}",
            ],
            "now",
            true,
          ),
        );
        nodes.push(textEntry("Code from the message", "zomato-otp"));
        nodes.push(
          action(
            "Verify the code",
            "gather-zomato-login-finish",
            [
              "deno",
              "run",
              "--no-lock",
              "--allow-read",
              "--allow-write",
              "--allow-run",
              "--allow-env",
              "--allow-sys",
              "--allow-net",
              "wizards/gatherer.ts",
              "--zomato-login-finish",
              "--phone={zomato-phone}",
              "--otp={zomato-otp}",
            ],
            "now",
            true,
          ),
        );
      }
      nodes.push(textEntry("City code", "zomato-city-code", DEFAULT_LOCATION.cityId));
      nodes.push(textEntry("City name", "zomato-city-name", DEFAULT_LOCATION.city));
      nodes.push(textEntry("City lat", "zomato-city-lat", DEFAULT_LOCATION.lat));
      nodes.push(textEntry("City lon", "zomato-city-lon", DEFAULT_LOCATION.long));
      nodes.push(
        action(
          "Save the city",
          "gather-zomato-city",
          [
            "deno",
            "run",
            "--no-lock",
            "--allow-read",
            "--allow-write",
            "--allow-run",
            "--allow-env",
            "--allow-sys",
            "--allow-net",
            "wizards/gatherer.ts",
            "--zomato-city",
            "--code={zomato-city-code}",
            "--name={zomato-city-name}",
            "--lat={zomato-city-lat}",
            "--lon={zomato-city-lon}",
          ],
          "now",
          true,
        ),
      );
      continue;
    }
    if (hasCached(id)) {
      nodes.push(markdown(platformName(id) + ": ready."));
    } else {
      nodes.push(
        markdown(platformName(id) + ": a sign-in window opens on submit."),
      );
      // Press-to-login. Same runtime argv as the gatherer shebang,
      // scoped to this one platform through --platforms.
      nodes.push(
        action(
          "Sign in to " + platformName(id),
          "gather-login-" + id,
          [
            "deno",
            "run",
            "--no-lock",
            "--allow-read",
            "--allow-write",
            "--allow-run",
            "--allow-env",
            "--allow-sys",
            "--allow-net",
            "wizards/gatherer.ts",
            "--login=" + id,
          ],
          "now",
          true,
        ),
      );
    }
  }
  return {
    ...step(
      "gather-accounts",
      "Accounts",
      [
        ...nodes,
        ...(dry ? [dryNote()] : []),
      ],
      "Press the button below to open the sign-in window. The app continues by itself once the sign in lands.",
    ),
    nav: { back: true, next: "Next" },
  };
}

export function gatherSteps(): Array<Step | StepFn> {
  return [
    (answerMap: Map<string, string[]>): Step => ({
      ...step(
        "gather-platforms",
        "Pick platforms",
        [
          checkbox(
            "Orders from",
            "platforms",
            ["Zepto", "Blinkit", "Zomato", "Swiggy", "Manual"],
            [],
          ),
          dryBox(isDryMap(answerMap)),
        ],
        "Pick where your orders come from. Zepto, Blinkit, Zomato, Swiggy, or enter expenses by hand.",
      ),
      nav: { back: true, next: "Next" },
    }),
    {
      ...step(
        "gather-range",
        "Day range",
        [
          numberEntry("Days back", "range", 30),
        ],
        "Gather collects orders from the last days you type here.",
      ),
      nav: { back: true, next: "Next" },
    },
    accountsStep,
    manualStep,
    reviewStep,
    pickStep,
  ];
}

// One manual expense row posted from the repeating node.
interface ManualRow {
  store: string;
  date: string;
  item: string;
  amount: number;
}

// The run this wizard wrote for the posted manual rows, one per
// session. The step builder re-runs on every request, so the signature
// keeps the write to once per distinct set of rows. The store replaces
// the module level manualRun value, which two browsers used to share.
const manualRuns = sessionStore((): {
  current: { signature: string; id: string; count: number } | null;
} => ({ current: null }));

// Read the manual run for one session id.
function manualRunFor(sessionId: string): {
  signature: string;
  id: string;
  count: number;
} | null {
  return manualRuns.for(sidOf({ sessionId })).current;
}

// Faults in the posted manual rows, in row order. Row numbers count
// every posted row from one, so they match the rows the user sees.
export function manualRowProblems(m: Map<string, string[]>): string[] {
  const stores = answerList(m, "store");
  const amounts = answerList(m, "amount");
  const problems: string[] = [];
  for (let i = 0; i < stores.length; i++) {
    const store = (stores[i] ?? "").trim();
    const raw = (amounts[i] ?? "").trim();
    // Skip spare rows: nothing typed at all.
    if (store === "" && raw === "") continue;
    const n = i + 1;
    if (store === "") problems.push("Row " + n + " needs a store name.");
    const amount = Math.round(Number(raw) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      problems.push("Row " + n + " needs an amount above zero.");
    }
  }
  return problems;
}

// Zip the posted repeating fields into rows. A row counts when it
// holds a store or an amount; blanks from spare rows drop out.
export function manualRows(m: Map<string, string[]>): ManualRow[] {
  const stores = answerList(m, "store");
  const dates = answerList(m, "date");
  const items = answerList(m, "item");
  const amounts = answerList(m, "amount");
  const rows: ManualRow[] = [];
  for (let i = 0; i < stores.length; i++) {
    const store = (stores[i] ?? "").trim();
    const raw = (amounts[i] ?? "").trim();
    // Skip spare rows: nothing typed at all.
    if (store === "" && raw === "") continue;
    const amount = Math.round(Number(raw) * 100) / 100;
    // Drop rows with no usable amount. manualRowProblems reports the fault to the user.
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const today = new Date().toISOString().slice(0, 10);
    const day = (dates[i] ?? "").trim();
    // Keep only a real YYYY-MM-DD date. The noon parse keeps the check
    // in local time, and the round trip rejects impossible dates.
    const checked = parseDate(day + " 12:00 PM");
    const date = checked !== null && formatDayISO(checked) === day ? day : today;
    rows.push({
      store: store || "Manual",
      date,
      item: (items[i] ?? "").trim() || "Expense",
      amount,
    });
  }
  return rows;
}

// Write the manual orders to a fresh run dir. The file layout mirrors
// createRun plus the writeRun orders write: meta.json with status
// gathered, then orders.json beside it. Sync writes keep the submit
// hook able to write before the review step renders.
function writeManualRunSync(rows: ManualRow[], days: number): string {
  const unix = Math.floor(Date.now() / 1000);
  let id = unix + "-manual";
  let n = 2;
  while (true) {
    try {
      Deno.statSync(runsDir() + "/" + id);
      id = unix + "-manual-" + n;
      n += 1;
    } catch {
      break;
    }
  }
  const dir = runsDir() + "/" + id;
  Deno.mkdirSync(dir, { recursive: true });
  const meta = {
    id,
    label: "manual",
    createdAt: new Date().toISOString(),
    platforms: ["manual"],
    rangeDays: days,
    status: "gathered",
    logFile: "",
  };
  Deno.writeTextFileSync(dir + "/meta.json", JSON.stringify(meta, null, 2) + "\n");
  const orders: Order[] = rows.map((row, i) => ({
    id: "manual-" + (i + 1),
    platform: "manual",
    date: row.date,
    paid: row.amount,
    items: [
      {
        name: row.store + ": " + row.item,
        price: row.amount,
        quantity: 1,
        estimated: false,
        source: "hand",
      },
    ],
    fees: { delivery: 0, packaging: 0 },
  }));
  Deno.writeTextFileSync(
    dir + "/orders.json",
    JSON.stringify(orders, null, 2) + "\n",
  );
  return id;
}

// Persist posted manual rows once, and remember the run for review.
export function persistManualRun(
  sessionId: string,
  m: Map<string, string[]>,
): void {
  const sid = sidOf({ sessionId });
  const rows = manualRows(m);
  const days = Number(m.get("range")?.[0] ?? "") || 30;
  const signature = JSON.stringify([rows, days]);
  const held = manualRuns.for(sid);
  if (held.current !== null && held.current.signature === signature) return;
  if (rows.length === 0) {
    held.current = null;
    return;
  }
  const id = writeManualRunSync(rows, days);
  held.current = { signature, id, count: rows.length };
}

// True when the platforms answer holds Manual.
export function manualPicked(m: Map<string, string[]>): boolean {
  return (answerList(m, "platforms"))
    .map((value) => value.toLowerCase())
    .includes("manual");
}

// Validate manual rows on Next.
// Reject bad rows with errors.
// Save good rows unless dry runs.
export function manualNext(
  answers: Map<string, string[]>,
  _fields: Record<string, string[]>,
  ctx: WizardCtx,
): { errors?: string[] } | void {
  const problems = manualRowProblems(answers);
  if (problems.length > 0) return { errors: problems };
  if (!isDryMap(answers)) persistManualRun(ctx.sessionId, answers);
}

// Manual expenses step. Rows save when the user presses Next, through
// the manualNext handler on its own nav bar. Render writes nothing.
function manualStep(m: Map<string, string[]>): Step {
  const dry = isDryMap(m);
  return {
    ...step(
      "gather-manual",
      "Manual expenses",
      [
        repeating("Expense", "expenses", [
          { kind: "text", label: "Store", name: "store" },
          { kind: "text", label: "Date", name: "date" },
          { kind: "text", label: "Item", name: "item" },
          { kind: "number", label: "Amount", name: "amount" },
        ]),
        ...(dry ? [dryNote()] : []),
      ],
      "Type each expense by hand: store, date, item, and amount. Add a row per expense. The rows save into a Run when you press Next.",
      // Only a user who picked Manual walks this screen. The flow used to
      // jump over it from the accounts step instead.
      (answers) => manualPicked(answers),
    ),
    nav: { back: true, next: { label: "Next", run: manualNext } },
  };
}

// Gate Review Next on gathered runs.
// Let dry plans pass through.
// Block missing platforms with errors.
export function reviewNext(
  answers: Map<string, string[]>,
  _fields: Record<string, string[]>,
  _ctx: WizardCtx,
): { errors?: string[] } | void {
  if (isDryMap(answers)) return;
  const picked = (answerList(answers, "platforms"))
    .map((value) => value.toLowerCase())
    .filter((value, index, all) => all.indexOf(value) === index);
  const runs = listRunsSync();
  const missing = picked.filter((id) => {
    if (id === "manual") return manualRows(answers).length === 0;
    return !runs.some((run) => run.platforms.includes(id));
  });
  if (missing.length > 0) {
    return {
      errors: [
        "No orders loaded for " + missing.join(", ") +
        " yet. Press Fetch on each one, wait for it to finish, then press Next.",
      ],
    };
  }
}

// Build the gather-review step from the picked platforms. A ticked
// dry box renders the would-do plan in the live shape and drops the
// scrape actions, so dry output matches live shape and writes nothing.
function reviewStep(answerMap: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const picked = (answerList(answerMap, "platforms"))
    .map((value) => value.toLowerCase())
    .filter((value): value is PlatformId => (PLATFORMS as readonly string[]).includes(value))
    .filter((id, index, all) => all.indexOf(id) === index);
  const range = answerMap.get("range")?.[0];
  const days = range ? Number(range) : 30;
  const dry = isDryMap(answerMap);
  if (dry) {
    // The markdown below names the platforms and the day range. An
    // answers node here would draw an empty heading over the same facts.
    const plan: Node[] = [
      markdown(
        "Gather dry run. Nothing opens and nothing is written.\n\n" +
          "Platforms: " +
          (picked.length > 0 ? picked.map(platformName).join(", ") : "none picked") +
          ".\nDays back: " + days + ".",
      ),
    ];
    for (const id of picked) {
      if (id === "manual") {
        const rows = manualRows(answerMap);
        plan.push(
          markdown(
            "Manual: " + rows.length +
              " expenses would save to a fresh Run with status gathered.",
          ),
        );
        continue;
      }
      plan.push(
        markdown(
          platformName(id) + ": would sign in once, then load the last " +
            days + " days into a fresh Run with status gathered.",
        ),
      );
    }
    return {
      ...step(
        "gather-review",
        "Review gather",
        [
          ...plan,
          dryNote(),
        ],
        "Dry run is on. This is the plan only. Press Back to the first screen of this flow to change it.",
      ),
      nav: { back: true, next: { label: "Next", run: reviewNext } },
    };
  }
  // State the picks this review acts on. An empty answers node drew a
  // heading with nothing under it.
  const nodes: Node[] = [
    answers("Gather", [
      {
        name: "Platforms",
        values: picked.length > 0 ? picked.map(platformName) : ["none picked"],
      },
      { name: "Days back", values: [String(days)] },
    ]),
  ];
  // Manual rows already live in a written run. Name it here so the
  // split stage can find it; a scrape action would be dead.
  if (picked.includes("manual")) {
    const manualRun = manualRunFor(sessionId);
    nodes.push(
      markdown(
        manualRun !== null
          ? "Manual expenses: " +
            manualRun.count +
            " orders saved to run " +
            manualRun.id +
            "."
          : "Manual expenses: none typed yet. Go back and add rows, or drop Manual on the Platforms step.",
      ),
    );
  }
  if (picked.includes("zomato") && !hasTokensSync()) {
    nodes.push(
      markdown(
        "Zomato: the fetch uses your saved sign in. Without it the fetch reports what is missing instead of orders.",
      ),
    );
  }
  if (picked.includes("zomato")) {
    nodes.push(
      markdown(
        "Zomato orders come from your saved city. With no saved city the fetch uses Bengaluru.",
      ),
    );
  }
  for (const id of picked) {
    // Manual has nothing to fetch. Its run is already on disk.
    if (id === "manual") continue;
    // Press to fetch. Same runtime argv as the gatherer shebang,
    // scoped to this one platform through --platforms.
    nodes.push(
      action(
        "Fetch " + platformName(id) + " orders",
        "gather-scrape-" + id,
        [
          "deno",
          "run",
          "--no-lock",
          "--allow-read",
          "--allow-write",
          "--allow-run",
          "--allow-env",
          "--allow-sys",
          "--allow-net",
          "wizards/gatherer.ts",
          "--platforms=" + id,
          "--emit",
          "--days=" + days,
        ],
        "now",
        true,
      ),
    );
  }
  return {
    ...step(
      "gather-review",
      "Review gather",
      [
        ...nodes,
      ],
      "Press Fetch on each platform below to load your orders. The output shows under the button while it runs, and it can take a while. Wait for every one to finish, then press Next. Manual rows are already saved.",
    ),
    nav: { back: true, next: { label: "Next", run: reviewNext } },
  };
}

// Select all or Select none override for one browser session.
// One press affects one render. The builder clears it after it reads it.
const pickOverrides = sessionStore((): { value: "all" | "none" | null } => ({ value: null }));

// Set the pick override for one session.
export function setPickOverride(sessionId: string, mode: "all" | "none"): void {
  pickOverrides.for(sidOf({ sessionId })).value = mode;
}

// Hold one draft resumed run id per browser session.
// Keep the value until a new draft resume replaces it.
const resumedRuns = sessionStore((): { id: string | null } => ({ id: null }));

// Remember one draft resumed run id for one session.
// Call this from the drafts resume hook before the pick screen opens.
export function setResumedRun(sessionId: string, runId: string): void {
  resumedRuns.for(sidOf({ sessionId })).id = runId;
}

// Run id the pick step shows. Manual uses the manual run.
// Other platforms use the newest run covering a picked platform.
export function gatherPickRunId(
  m: Map<string, string[]>,
  sessionId: string,
): string | null {
  const sid = sidOf({ sessionId });
  // Read the draft resume first before the posted answer path.
  const draftResumed = resumedRuns.for(sid).id;
  if (draftResumed !== null && draftResumed.length > 0) return draftResumed;
  // A run carried in from the resume screen wins over every rule.
  const resumed = answer(m, "resume-pick");
  if (resumed.length > 0) return resumed;
  if (manualPicked(m)) {
    const manual = manualRunFor(sid);
    return manual !== null ? manual.id : null;
  }
  const picked = (answerList(m, "platforms")).map((value) => value.toLowerCase());
  if (picked.length === 0) return null;
  for (const run of listRunsSync()) {
    if (run.platforms.some((p) => picked.includes(p.toLowerCase()))) return run.id;
  }
  return null;
}

// Tick every order on Select all.
// Return nothing to re-render.
export function pickAll(
  _answers: Map<string, string[]>,
  _fields: Record<string, string[]>,
  ctx: WizardCtx,
): void {
  setPickOverride(ctx.sessionId, "all");
}

// Clear every tick on Select none.
// Return nothing to re-render.
export function pickNone(
  _answers: Map<string, string[]>,
  _fields: Record<string, string[]>,
  ctx: WizardCtx,
): void {
  setPickOverride(ctx.sessionId, "none");
}

// Save ticked orders on Next.
// Reject empty picks with errors.
// Block missing runs with errors.
// Send the user to the People step.
export function pickNext(
  answers: Map<string, string[]>,
  fields: Record<string, string[]>,
  ctx: WizardCtx,
): { errors?: string[]; goto?: string } | void {
  const picked = (fields["pick"] ?? [])
    .map((value) => Number(value))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b);
  if (picked.length === 0) return { errors: ["Tick at least one order to split."] };
  const runId = gatherPickRunId(answers, ctx.sessionId);
  if (runId === null) {
    return {
      errors: ["The gathered run is gone. Press Back and fetch the orders again."],
    };
  }
  setRunPicked(runId, picked);
  setSplitRun(ctx.sessionId, runId);
  return { goto: "split-people" };
}

// Label for one order on the pick screen.
function pickLabel(platform: string, date: string, paid: number, count: number): string {
  const name = platform.charAt(0).toUpperCase() + platform.slice(1);
  const unit = count === 1 ? " item" : " items";
  return name + " · " + date + " · " + fmtRs(paid) + " · " + count + unit;
}

// Show this screen when this flow cannot name a run, or when the run it
// names holds no orders. A gathered run is expensive to fetch, so the
// screen never claims the run is gone. It points at the saved list.
function pickPlaceholder(sentence: string): Step {
  return {
    ...step(
      "gather-pick",
      "Pick orders",
      [
        markdown(sentence + "\n\nSaved runs stay on disk. Open one from the saved list."),
      ],
      "Tick the orders to split. " + sentence,
      (m) => !isDryMap(m),
    ),
    nav: {
      back: true,
      goto: { step: "resume", label: "Pick a saved run" },
    },
  };
}

// Ticks saved on the run record. Falls back to none when the run
// misses the field or holds an index outside the order range.
function savedPickTicks(runId: string, count: number): string[] {
  const meta = readRunMetaSync(runId);
  if (meta === null || !Array.isArray(meta.picked)) return [];
  const out: string[] = [];
  for (const n of meta.picked) {
    if (typeof n !== "number" || !Number.isInteger(n)) continue;
    if (n < 0 || n >= count) continue;
    const value = String(n);
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

// Pick step. It lists one checkbox per order of the gathered run.
// Rows start ticked from the saved run when this session posted none.
// Dry runs skip this screen.
function pickStep(answerMap: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const runId = gatherPickRunId(answerMap, sessionId);
  if (runId === null) {
    return pickPlaceholder("The gather produced no run yet.");
  }
  let orders: Order[];
  try {
    orders = readRunOrders(runId);
  } catch {
    return pickPlaceholder("The gather produced no run yet.");
  }
  if (orders.length === 0) {
    return pickPlaceholder("The run holds no orders.");
  }
  const held = pickOverrides.for(sessionId);
  const mode = held.value;
  held.value = null;
  const options = orders.map((order, index) => {
    const visible = (order.items ?? []).filter((item) => !isLedgerRow(item.name ?? ""));
    const option: { value: string; label: string; hint?: string } = {
      value: String(index),
      label: pickLabel(
        order.platform ?? "",
        order.date ?? "",
        order.paid ?? 0,
        visible.length,
      ),
    };
    const hint = itemSummary(visible);
    if (hint !== undefined) option.hint = hint;
    return option;
  });
  const valid = new Set(options.map((option) => option.value));
  let ticked: string[];
  if (mode === "all") {
    ticked = options.map((option) => option.value);
  } else if (mode === "none") {
    ticked = [];
  } else {
    const posted = answerList(answerMap, "pick");
    if (posted.length > 0) {
      ticked = posted.filter((value) => valid.has(value));
    } else {
      // No ticks posted in this session. Seed from the saved run.
      ticked = savedPickTicks(runId, orders.length);
    }
  }
  return {
    ...step(
      "gather-pick",
      "Pick orders",
      [
        checkbox("", "pick", options, ticked),
      ],
      "Tick each order to split. Only ticked orders reach the split flow.",
      (m) => !isDryMap(m),
    ),
    nav: {
      back: true,
      actions: [
        { id: "pick-all", label: "Select all", run: pickAll },
        { id: "pick-none", label: "Select none", run: pickNone },
      ],
      next: { label: "Next", run: pickNext },
    },
  };
}
