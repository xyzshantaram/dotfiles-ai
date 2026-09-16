// Gather stage steps for the expense-split wizard.

import {
  action,
  answers as showAnswers,
  buttons,
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
import { isDryMap, listRunsSync, readRunOrders, runsDir, stateRoot } from "../../src/runstate.ts";
import { answers } from "../../src/answers.ts";
import {
  sessionStore,
  sidOf,
} from "../../src/sessionstore.ts";
import type { WizardCtx } from "../../wizardkit/mod.ts";
import { dryBox, dryNote } from "./dry.ts";
import { fmtRs, formatDayISO, parseDate } from "../../src/common.ts";
import { DEFAULT_LOCATION, TOKENS_FILE } from "../../src/zomato.ts";
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

// Old Zomato token path beside the repo state dir.
const LEGACY_TOKENS_FILE = decodeURIComponent(
  new URL("../../state/zomato-tokens.json", import.meta.url).pathname,
);

// True when one token file holds both tokens. Mirrors loadTokens
// with sync reads so the step builder stays synchronous.
function hasTokens(): boolean {
  const paths = [
    stateRoot() + "/share/zomato-tokens.json",
    TOKENS_FILE,
    LEGACY_TOKENS_FILE,
  ];
  for (const path of paths) {
    try {
      const data = JSON.parse(Deno.readTextFileSync(path)) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (data.access_token && data.refresh_token) return true;
    } catch {
      // Try the next path.
    }
  }
  return false;
}

// True when a platform holds cached credentials, the same way the
// gatherer detects them: profile storage for browser platforms,
// token files for Zomato, and Manual needs nothing.
function hasCached(id: PlatformId): boolean {
  if (id === "manual") return true;
  if (id === "zomato") return hasTokens();
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
  const picked = (answers(answerMap, "platforms"))
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
      if (hasTokens()) {
        nodes.push(markdown("Zomato: ready."));
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
  return step(
    "gather-accounts",
    "Accounts",
    [
      ...nodes,
      ...(dry ? [dryNote()] : []),
      buttons(
        [
          { label: "Back", action: "back" },
          { label: "Next", action: "next", primary: true },
        ],
        undefined,
        "split",
      ),
    ],
    "Press the button below to open the sign-in window. The app continues by itself once the sign in lands.",
  );
}

export function gatherSteps(): Array<Step | StepFn> {
  return [
    (answerMap: Map<string, string[]>): Step =>
      step(
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
          buttons(
            [
              { label: "Back", action: "back" },
              { label: "Next", action: "next", primary: true },
            ],
            undefined,
            "split",
          ),
        ],
        "Pick where your orders come from. Zepto, Blinkit, Zomato, Swiggy, or enter expenses by hand.",
      ),
    step(
      "gather-range",
      "Day range",
      [
        numberEntry("Days back", "range", 30),
        buttons(
          [
            { label: "Back", action: "back" },
            { label: "Next", action: "next", primary: true },
          ],
          undefined,
          "split",
        ),
      ],
      "Gather collects orders from the last days you type here.",
    ),
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
  const stores = answers(m, "store");
  const amounts = answers(m, "amount");
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
  const stores = answers(m, "store");
  const dates = answers(m, "date");
  const items = answers(m, "item");
  const amounts = answers(m, "amount");
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
  return (answers(m, "platforms"))
    .map((value) => value.toLowerCase())
    .includes("manual");
}

// Manual expenses step. Rows save when the user presses Next, so the
// orchestrator calls persistManualRun from the submit hook. Render
// writes nothing.
function manualStep(m: Map<string, string[]>): Step {
  const dry = isDryMap(m);
  return step(
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
      buttons(
        [
          { label: "Back", action: "back" },
          { label: "Next", action: "next", primary: true },
        ],
        undefined,
        "split",
      ),
    ],
    "Type each expense by hand: store, date, item, and amount. Add a row per expense. The rows save into a Run when you press Next.",
    // Only a user who picked Manual walks this screen. The flow used to
    // jump over it from the accounts step instead.
    (answers) => manualPicked(answers),
  );
}

// Build the gather-review step from the picked platforms. A ticked
// dry box renders the would-do plan in the live shape and drops the
// scrape actions, so dry output matches live shape and writes nothing.
function reviewStep(answerMap: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const picked = (answers(answerMap, "platforms"))
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
    return step(
      "gather-review",
      "Review gather",
      [
        ...plan,
        dryNote(),
        buttons(
          [
            { label: "Back", action: "back" },
            { label: "Next", action: "next", primary: true },
          ],
          undefined,
          "split",
        ),
      ],
      "Dry run is on. This is the plan only. Press Back to the first screen of this flow to change it.",
    );
  }
  // State the picks this review acts on. An empty answers node drew a
  // heading with nothing under it.
  const nodes: Node[] = [
    showAnswers("Gather", [
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
  if (picked.includes("zomato") && !hasTokens()) {
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
  return step(
    "gather-review",
    "Review gather",
    [
      ...nodes,
      buttons(
        [
          { label: "Back", action: "back" },
          { label: "Next", action: "next", primary: true },
        ],
        undefined,
        "split",
      ),
    ],
    "Press Fetch on each platform below to load your orders. The output shows under the button while it runs, and it can take a while. Wait for every one to finish, then press Next. Manual rows are already saved.",
  );
}

// Select all or Select none override for one browser session.
// One press affects one render. The builder clears it after it reads it.
const pickOverrides = sessionStore((): { value: "all" | "none" | null } => ({ value: null }));

// Set the pick override for one session.
export function setPickOverride(sessionId: string, mode: "all" | "none"): void {
  pickOverrides.for(sidOf({ sessionId })).value = mode;
}

// Run id the pick step shows. Manual uses the manual run.
// Other platforms use the newest run covering a picked platform.
export function gatherPickRunId(
  m: Map<string, string[]>,
  sessionId: string,
): string | null {
  const sid = sidOf({ sessionId });
  if (manualPicked(m)) {
    const manual = manualRunFor(sid);
    return manual !== null ? manual.id : null;
  }
  const picked = (answers(m, "platforms")).map((value) => value.toLowerCase());
  if (picked.length === 0) return null;
  for (const run of listRunsSync()) {
    if (run.platforms.some((p) => picked.includes(p.toLowerCase()))) return run.id;
  }
  return null;
}

// Label for one order on the pick screen.
function pickLabel(platform: string, date: string, paid: number, count: number): string {
  const name = platform.charAt(0).toUpperCase() + platform.slice(1);
  const unit = count === 1 ? " item" : " items";
  return name + " · " + date + " · " + fmtRs(paid) + " · " + count + unit;
}

// Pick step. It lists one checkbox per order of the gathered run.
// No row starts ticked. Dry runs skip this screen.
function pickStep(answerMap: Map<string, string[]>, ctx?: WizardCtx): Step {
  const sessionId = sidOf(ctx);
  const runId = gatherPickRunId(answerMap, sessionId);
  if (runId === null) {
    return step(
      "gather-pick",
      "Pick orders",
      [
        markdown("The gather produced no run yet."),
        buttons([{ label: "Back", action: "back" }], undefined, "split"),
      ],
      "Tick the orders to split. The gather produced no run yet.",
      (m) => !isDryMap(m),
    );
  }
  let orders: Order[];
  try {
    orders = readRunOrders(runId);
  } catch {
    return step(
      "gather-pick",
      "Pick orders",
      [
        markdown("The gather produced no run yet."),
        buttons([{ label: "Back", action: "back" }], undefined, "split"),
      ],
      "Tick the orders to split. The gather produced no run yet.",
      (m) => !isDryMap(m),
    );
  }
  if (orders.length === 0) {
    return step(
      "gather-pick",
      "Pick orders",
      [
        markdown("The run holds no orders."),
        buttons([{ label: "Back", action: "back" }], undefined, "split"),
      ],
      "Tick the orders to split. The run holds no orders.",
      (m) => !isDryMap(m),
    );
  }
  const held = pickOverrides.for(sessionId);
  const mode = held.value;
  held.value = null;
  const options = orders.map((order, index) => ({
    value: String(index),
    label: pickLabel(
      order.platform ?? "",
      order.date ?? "",
      order.paid ?? 0,
      (order.items ?? []).length,
    ),
  }));
  const valid = new Set(options.map((option) => option.value));
  let ticked: string[];
  if (mode === "all") {
    ticked = options.map((option) => option.value);
  } else if (mode === "none") {
    ticked = [];
  } else {
    ticked = (answers(answerMap, "pick")).filter((value) => valid.has(value));
  }
  return step(
    "gather-pick",
    "Pick orders",
    [
      checkbox("", "pick", options, ticked),
      buttons(
        [
          { label: "Back", action: "back" },
          { label: "Select all", action: "pick-all" },
          { label: "Select none", action: "pick-none" },
          { label: "Next", action: "next", primary: true },
        ],
        undefined,
        "split",
      ),
    ],
    "Tick each order to split. Only ticked orders reach the split flow.",
    (m) => !isDryMap(m),
  );
}
