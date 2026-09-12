// Proof tests for ticket F6: dry mode across flows, failed-run
// surface, and resume routing by run status. A fake PushApi stands in
// for Splitwise, so no network call happens. Each test owns its state
// root and pushed map, and restores the env after itself.
import { onSubmit } from "../wizards/expense-split.ts";
import { gatherSteps } from "../wizards/expense-split/gather.ts";
import { exportStep, itemStep, routeStatus } from "../wizards/expense-split/split.ts";
import { pushSteps } from "../wizards/expense-split/push.ts";
import {
  applyCutoff,
  executePush,
  prepareSource,
  prepareSplitwise,
  type PushApi,
  resetPush,
  session,
} from "../wizards/expense-split/push-engine.ts";
import { backupFailedRun, isDryMap, listRunsSync } from "../src/runstate.ts";
import type { Step } from "../wizardkit/mod.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

// Text of one node plus nested option, item, row, and button text.
function texts(node: unknown): string[] {
  const parts: string[] = [];
  if (typeof node === "string") return [node];
  if (node === null || typeof node !== "object") return [];
  const rec = node as Record<string, unknown>;
  for (const key of ["text", "label", "hint", "name", "value", "action"]) {
    if (typeof rec[key] === "string") parts.push(rec[key] as string);
  }
  for (const key of ["items", "rows", "options", "nodes", "buttons"]) {
    const arr = rec[key];
    if (Array.isArray(arr)) {
      for (const item of arr) parts.push(...texts(item));
    }
  }
  return parts;
}

// Text of every node in a step, joined.
function stepText(step: Step): string {
  return step.nodes.flatMap((node) => texts(node)).join("\n");
}

// Node kinds of a step, joined.
function nodeKinds(step: Step): string {
  return step.nodes.map((node) =>
    String((node as unknown as Record<string, unknown>)["kind"] ?? "")
  ).join("\n");
}

// Env keys this file touches, saved and restored around each test.
const ENV_KEYS = [
  "SPLIT_UTILS_STATE",
  "SPLITWISE_PUSHED_FILE",
  "SPLITWISE_TOKEN_FILE",
  "SPLITWISE_ENV",
];

function saveEnv(): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) out.set(key, Deno.env.get(key));
  return out;
}

function restoreEnv(saved: Map<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
}

// Fresh state root plus an empty pushed map. Returns the root.
async function freshRoot(prefix: string): Promise<string> {
  const root = await Deno.makeTempDir({ prefix });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  Deno.env.set("SPLITWISE_PUSHED_FILE", root + "/pushed.json");
  Deno.env.set("SPLITWISE_TOKEN_FILE", root + "/token.json");
  Deno.env.delete("SPLITWISE_ENV");
  resetPush();
  return root;
}

// One split line for the push doc.
function line(
  item: string,
  orderId: string,
  date: string,
  price: number,
  a: number,
  b: number,
) {
  return {
    item,
    platform: "zepto",
    order_id: orderId,
    date,
    price,
    split_type: "custom",
    assignments: { Ann: a, Bob: b },
  };
}

// Finished output doc with three orders.
function pushDoc() {
  return {
    split_at: "2026-01-06T09:00:00Z",
    people: ["Ann", "Bob"],
    splits: [
      line("Milk", "o1", "2026-01-01T10:00:00", 100, 60, 40),
      line("Eggs", "o2", "2026-01-02T11:00:00", 50, 25, 25),
      line("Chips", "o3", "2026-01-05T12:00:00", 30, 30, 0),
    ],
    totals: { Ann: 115, Bob: 65 },
    settlements: [{ from: "Bob", to: "Ann", amount: 65 }],
  };
}

// Fake API. Records createExpense payloads, hands out expense ids.
function fakeApi() {
  const expenses: Record<string, string>[] = [];
  const api: PushApi = {
    getCurrentUser: () => Promise.resolve({ first_name: "Ann", last_name: "", id: 1 }),
    getFriends: () => Promise.resolve([{ first_name: "Bob", last_name: "", id: 2 }]),
    getGroups: () => Promise.resolve([{ name: "Trip", id: 7 }]),
    createExpense: (data) => {
      expenses.push({ ...data });
      return Promise.resolve({ expenses: [{ id: 101 }] });
    },
    createComment: () => Promise.resolve(),
  };
  return { api, expenses };
}

// Step function entries of a steps array, called with the answers map.
function callStep(
  entries: Array<Step | ((m: Map<string, string[]>) => Step)>,
  index: number,
  m: Map<string, string[]>,
): Step {
  const entry = entries[index];
  if (typeof entry === "function") return entry(m);
  return entry;
}

Deno.test("f6 dry push writes no expense and no fingerprint", async () => {
  const saved = saveEnv();
  try {
    const root = await freshRoot("f6-dry-push-");
    const file = root + "/output.json";
    await Deno.writeTextFile(file, JSON.stringify(pushDoc()));
    const src = await prepareSource("Split JSON file", "", file);
    assert(src.ok, "source loads");
    const { api, expenses } = fakeApi();
    const sw = await prepareSplitwise(api);
    assert(sw.ok, "splitwise prepares");
    const cut = applyCutoff("2026-01-06");
    assert(cut.ok, "cutoff valid");
    session.groupId = 7;
    const done = await executePush({ o1: "Push", o2: "Push" }, { dry: true });
    assert(done.ok, "dry run ok");
    const out = session.outcome!;
    assert(out.dry, "outcome marked dry");
    assert(out.pushed === 2, "two orders would push, got " + out.pushed);
    assert(out.skippedByChoice === 1, "o3 skipped by choice");
    assert(out.totalRs === 150, "total is the would-push orders only");
    assert(expenses.length === 0, "no createExpense call");
    const pushedText = await Deno.readTextFile(root + "/pushed.json").catch(() => "{}");
    assert(pushedText === "{}" || JSON.parse(pushedText) !== null, "pushed file read");
    assert(
      Object.keys(JSON.parse(pushedText)).length === 0,
      "no fingerprint saved",
    );
    assert(out.aggregateFile === null, "no summary file");
    assert(out.archived === false, "no archive");
    // The report step shows the dry plan, not a live landing.
    const report = callStep(pushSteps(), 6, new Map());
    assert(report.id === "push-report", "report step found");
    const body = stepText(report);
    assert(body.includes("Dry run"), "report names the dry run");
    assert(body.includes("Would push: 2 order(s)."), "report shows the plan count");
  } finally {
    restoreEnv(saved);
  }
});

Deno.test("f6 failed run surfaces with reason and routes to gather", async () => {
  const saved = saveEnv();
  try {
    const root = await freshRoot("f6-failed-");
    const dir = root + "/share/runs/r-fail";
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(
      dir + "/meta.json",
      JSON.stringify({
        id: "r-fail",
        label: "weekly shop",
        createdAt: "2026-01-06T09:00:00Z",
        platforms: ["zepto"],
        rangeDays: 7,
        status: "gathered",
      }),
    );
    await backupFailedRun("r-fail", "scrape timed out");
    const runs = listRunsSync();
    assert(runs.length === 1, "one live run listed");
    assert(runs[0].status === "failed", "run marked failed");
    assert(runs[0].failureReason === "scrape timed out", "reason kept");
    // The resume picker shows the id plus the reason.
    const { resumeStep } = await import("../wizards/expense-split/split.ts");
    const body = stepText(resumeStep());
    assert(body.includes("r-fail"), "picker names the failed run");
    assert(body.includes("scrape timed out"), "picker shows the reason");
    // Status routing mirrors meta.ts: failed restarts at gather.
    assert(routeStatus("failed") === "gather-platforms", "failed routes to gather");
    const res = await onSubmit({ "resume-pick": ["r-fail"] }, "resume");
    assert(res?.goto === "gather-platforms", "submit routes failed to gather");
  } finally {
    restoreEnv(saved);
  }
});

Deno.test("f6 each status routes to its next step", async () => {
  const saved = saveEnv();
  try {
    const root = await freshRoot("f6-route-");
    const cases: Array<[string, string, string]> = [
      // The split flow asks which run first, so a gathered run opens
      // that step, and the resume pick carries into it.
      ["r-gathered", "gathered", "split-run"],
      ["r-assigned", "assigned", "push-source"],
      ["r-pushed", "pushed", "resume-done"],
    ];
    for (const [id, status, _want] of cases) {
      const dir = root + "/share/runs/" + id;
      await Deno.mkdir(dir, { recursive: true });
      await Deno.writeTextFile(
        dir + "/meta.json",
        JSON.stringify({
          id,
          label: "case " + id,
          createdAt: "2026-01-06T09:00:00Z",
          platforms: ["zepto"],
          rangeDays: 7,
          status,
        }),
      );
    }
    assert(routeStatus("gathered") === "split-run", "gathered routes to the run step");
    assert(routeStatus("assigned") === "push-source", "assigned routes to push");
    assert(routeStatus("pushed") === "resume-done", "pushed routes to done");
    for (const [id, _status, want] of cases) {
      const res = await onSubmit({ "resume-pick": [id] }, "resume");
      assert(res?.goto === want, id + " routes to " + want);
    }
    const gone = await onSubmit({ "resume-pick": ["no-such-run"] }, "resume");
    assert(
      (gone?.errors ?? []).join("").includes("gone"),
      "missing run errors out",
    );
  } finally {
    restoreEnv(saved);
  }
});

Deno.test("f6 dry gather review shows the plan and keeps every action out", async () => {
  const saved = saveEnv();
  try {
    await freshRoot("f6-dry-gather-");
    const m = new Map<string, string[]>([
      ["platforms", ["Zepto", "Manual"]],
      ["range", ["30"]],
      ["dry", ["dry"]],
    ]);
    const entries = gatherSteps();
    // Accounts step: no sign-in action opens under dry.
    const accounts = callStep(entries, 2, m);
    assert(!nodeKinds(accounts).includes("action"), "no action opens under dry");
    assert(
      stepText(accounts).includes("would sign in"),
      "accounts names the would-do sign-in",
    );
    // Review step: plan in the live shape, no scrape actions.
    const review = callStep(entries, 4, m);
    assert(review.id === "gather-review", "review step found");
    const body = stepText(review);
    assert(body.includes("Gather dry run"), "plan names the dry run");
    assert(body.includes("Nothing opens and nothing is written"), "plan writes nothing");
    assert(body.includes("Zepto"), "plan names the platform");
    assert(!nodeKinds(review).includes("action"), "no scrape action under dry");
    assert(isDryMap(m), "dry flag reads from the answers map");
  } finally {
    restoreEnv(saved);
  }
});

Deno.test("f6 dry manual step writes no run dir", async () => {
  const saved = saveEnv();
  try {
    const root = await freshRoot("f6-dry-manual-");
    const m = new Map<string, string[]>([
      ["platforms", ["Manual"]],
      ["range", ["30"]],
      ["store", ["F6 Dry Store"]],
      ["date", ["2026-01-02"]],
      ["item", ["F6 Dry Item"]],
      ["amount", ["42"]],
      ["dry", ["dry"]],
    ]);
    const manual = callStep(gatherSteps(), 3, m);
    assert(manual.id === "gather-manual", "manual step found");
    // The manual step no longer writes during render, so it carries no
    // saved preview line. Later screens show the dry note instead of
    // the box, and the render must leave the disk alone either way.
    assert(stepText(manual).includes("Dry run is on"), "manual shows the dry note");
    assert(!nodeKinds(manual).includes("checkbox"), "manual shows no dry box");
    const names: string[] = [];
    try {
      for await (const entry of Deno.readDir(root + "/share/runs")) {
        names.push(entry.name);
      }
    } catch {
      // No runs dir at all is the dry shape.
    }
    assert(names.length === 0, "no run dir written under dry");
  } finally {
    restoreEnv(saved);
  }
});

// One order with one 10.00 item and no fees.
const SPLIT_ORDERS = [{
  id: "o1",
  platform: "swiggy",
  date: "2026-09-01 10:00 AM",
  paid: 10,
  items: [{ name: "Pizza", price: 10, quantity: 1 }],
  fees: { delivery: 0, packaging: 0 },
}];

Deno.test("f6 dry split export writes no output and keeps gathered status", async () => {
  const saved = saveEnv();
  try {
    const root = await Deno.makeTempDir({ prefix: "f6-dry-split-" });
    const dir = root + "/f6dry";
    Deno.mkdirSync(dir, { recursive: true });
    Deno.writeTextFileSync(dir + "/orders.json", JSON.stringify(SPLIT_ORDERS) + "\n");
    Deno.writeTextFileSync(
      dir + "/split-state.json",
      JSON.stringify({
        people: ["Ann", "Ben"],
        payer: "Ann",
        assignments: {
          "0": {
            splitType: "equal",
            people: ["Ann", "Ben"],
            amounts: { Ann: 5, Ben: 5 },
          },
        },
        skipped: {},
      }) + "\n",
    );
    Deno.writeTextFileSync(
      dir + "/meta.json",
      JSON.stringify({ status: "gathered" }) + "\n",
    );
    const m = new Map<string, string[]>([
      ["run", [dir]],
      ["resume", ["Continue where you left off?"]],
    ]);
    const item = itemStep(m);
    assert(stepText(item).includes("All 1 lines are split"), "split reads done");
    const dryM = new Map(m);
    dryM.set("dry", ["dry"]);
    const out = exportStep(dryM);
    assert(out.id === "split-export", "export step found");
    const body = stepText(out);
    assert(body.includes("Split dry run"), "export names the dry run");
    assert(body.includes("Nothing is written"), "export writes nothing");
    assert(body.includes("Would write output.json"), "export names the would-do write");
    let wrote = false;
    try {
      Deno.statSync(dir + "/output.json");
      wrote = true;
    } catch {
      // Absent is the dry shape.
    }
    assert(!wrote, "no output.json under dry");
    const meta = JSON.parse(Deno.readTextFileSync(dir + "/meta.json"));
    assert(meta["status"] === "gathered", "status stays gathered under dry");
  } finally {
    restoreEnv(saved);
  }
});

Deno.test("f6 dry confirm step names the plan before submit", async () => {
  const saved = saveEnv();
  try {
    await freshRoot("f6-dry-confirm-");
    const confirm = callStep(pushSteps(), 5, new Map([["dry", ["dry"]]]));
    assert(confirm.id === "push-confirm", "confirm step found");
    assert(
      stepText(confirm).includes("Dry run is on"),
      "confirm names the dry run",
    );
  } finally {
    restoreEnv(saved);
  }
});
