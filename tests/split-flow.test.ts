// Wizard-level split flow tests: resume, meta updates, validator gate,
// and the currency label from settings.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  collectedPeople,
  countSplitProgress,
  createSplitShareLink,
  currentShareLink,
  exportStep,
  itemStep,
  lastSaveError,
  loadCurrency,
  pendingSaves,
  roleErrors,
  setSaveWriterForTests,
  setSplitRun,
  shareDoneStep,
  summaryStep,
} from "../wizards/expense-split/split.ts";
import { freshState, type SplitStateDoc, writeSplitState } from "../src/splitstate.ts";
import { handleBoardRoute } from "../wizards/expense-split/board-routes.ts";
import {
  buildPatch,
  personForDigit,
  repeatOnto,
  round2,
  seedCheckpointLine,
  shareEqual,
  sharePercent,
  shareSingle,
} from "../wizards/expense-split/split-board.js";
import type { Node } from "../wizardkit/mod.ts";
import type { Order } from "../src/common.ts";

// One order with one 10.00 item and no fees.
const ORDERS: Order[] = [{
  id: "o1",
  platform: "swiggy",
  date: "2026-09-01 10:00 AM",
  paid: 10,
  items: [{ name: "Pizza", price: 10, quantity: 1 }],
  fees: { delivery: 0, packaging: 0 },
}];

// One order with one 10.00 item and a 5.00 delivery fee.
const FEE_ORDERS: Order[] = [{
  id: "o1",
  platform: "swiggy",
  date: "2026-09-01 10:00 AM",
  paid: 15,
  items: [{ name: "Pizza", price: 10, quantity: 1 }],
  fees: { delivery: 5, packaging: 0 },
}];
// A saved doc with line 0 split evenly between Ann and Ben.
function savedDoc(payer: string, amounts?: [number, number]): SplitStateDoc {
  const doc = freshState(["Ann", "Ben"], payer);
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Ann", "Ben"],
    amounts: { Ann: amounts?.[0] ?? 5, Ben: amounts?.[1] ?? 5 },
  };
  return doc;
}

// Build one run dir with orders.json and an optional split-state.json.
function makeRun(
  root: string,
  name: string,
  state: SplitStateDoc | null,
  orders: Order[] = ORDERS,
): string {
  const dir = root + "/" + name;
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(
    dir + "/orders.json",
    JSON.stringify(orders) + "\n",
  );
  if (state !== null) {
    Deno.writeTextFileSync(
      dir + "/split-state.json",
      JSON.stringify(state, null, 2) + "\n",
    );
  }
  return dir;
}

// Read meta.json from a run dir.
function readMeta(dir: string): Record<string, unknown> {
  return JSON.parse(Deno.readTextFileSync(dir + "/meta.json"));
}

// Text of a node plus any nested item text, joined.
function nodeText(node: Node): string {
  const rec = node as unknown as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof rec["text"] === "string") parts.push(rec["text"] as string);
  if (typeof rec["label"] === "string") parts.push(rec["label"] as string);
  if (Array.isArray(rec["items"])) {
    for (const item of rec["items"] as unknown[]) {
      if (item !== null && typeof item === "object") {
        const ir = item as Record<string, unknown>;
        if (typeof ir["text"] === "string") parts.push(ir["text"] as string);
      }
    }
  }
  if (Array.isArray(rec["rows"])) {
    for (const row of rec["rows"] as unknown[]) {
      if (row !== null && typeof row === "object") {
        const rr = row as Record<string, unknown>;
        if (typeof rr["text"] === "string") parts.push(rr["text"] as string);
      }
    }
  }
  return parts.join("\n");
}

// Mount data of one item step, by mount id.
function mountData(nodes: Node[], id: string): Record<string, unknown> {
  for (const node of nodes) {
    const rec = node as unknown as Record<string, unknown>;
    if (rec["kind"] === "mount" && rec["id"] === id) {
      return rec["data"] as Record<string, unknown>;
    }
  }
  throw new Error("no mount named " + id);
}

// Items list of one board mount.
function mountItems(board: Record<string, unknown>): Array<Record<string, unknown>> {
  return board["items"] as Array<Record<string, unknown>>;
}

// Text of every node in a step, joined.
function stepText(nodes: Node[]): string {
  return nodes.map(nodeText).join("\n");
}

// Answers map with the run typed, the resume question answered, and
// an optional me name.
function answers(run: string, resume?: string, me?: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  m.set("run", [run]);
  if (resume !== undefined) m.set("resume", [resume]);
  if (me !== undefined) m.set("me", [me]);
  return m;
}

Deno.test("resume mid-way keeps saved assignments", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r1", savedDoc("Ann"));
  // First render asks the resume question.
  const ask = itemStep(answers(dir), { sessionId: "t-split-1" });
  assertStringIncludes(stepText(ask.nodes), "Continue where you left off?");
  // Nothing overwrote the saved state while asking.
  const onDisk = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
  assertEquals(onDisk.assignments["0"].amounts, { Ann: 5, Ben: 5 });
  // Continue renders the mount, line 0 stays assigned.
  const done = itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-1" });
  const kept = mountData(done.nodes, "split-board")["assignments"] as Record<string, unknown>;
  assertEquals(kept["0"], {
    splitType: "equal",
    people: ["Ann", "Ben"],
    amounts: { Ann: 5, Ben: 5 },
  });
  const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
  assertEquals(after.assignments["0"].amounts, { Ann: 5, Ben: 5 });
  assertEquals(after.payer, "Ann");
});

Deno.test("start over clears saved assignments", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r2", savedDoc("Ann"));
  itemStep(answers(dir), { sessionId: "t-split-2" });
  const fresh = itemStep(answers(dir, "Start over"), { sessionId: "t-split-2" });
  assertEquals(mountData(fresh.nodes, "split-board")["runId"], "r2");
  // saveState writes in the background, so wait for the cleared file.
  for (let i = 0; i < 50; i++) {
    const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
    if (Object.keys(after.assignments as string[]).length === 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("start over never cleared the saved assignments");
});

Deno.test("finished split updates meta to assigned", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r3", savedDoc("Ann"));
  itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-3" });
  const out = exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-3" });
  assertStringIncludes(stepText(out.nodes), "pays Ann"); // settlements render
  const meta = readMeta(dir);
  assertEquals(meta["status"], "assigned");
  assertEquals(meta["outputFile"], "output.json");
  assertEquals(meta["ordersDone"], 1);
  assertEquals(meta["ordersTotal"], 1);
  assertEquals(meta["lastPayer"], "Ann");
  assertEquals(JSON.parse(Deno.readTextFileSync(dir + "/output.json")).people, [
    "Ann",
    "Ben",
  ]);
});

Deno.test("validator failure blocks finish and assigned", async () => {
  const root = await Deno.makeTempDir();
  // Amounts 3 + 3 do not cover the 10.00 price, so validation must fail.
  const dir = makeRun(root, "r4", savedDoc("Ann", [3, 3]));
  itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-4" });
  const out = exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-4" });
  assertStringIncludes(stepText(out.nodes), "failed its own check");
  assertStringIncludes(stepText(out.nodes), "FAIL");
  const meta = readMeta(dir);
  if (meta["status"] !== undefined) {
    assertEquals(meta["status"], "gathered");
  }
});

Deno.test("currency label follows settings", async () => {
  const root = await Deno.makeTempDir();
  Deno.mkdirSync(root + "/config", { recursive: true });
  Deno.writeTextFileSync(
    root + "/config/settings.json",
    JSON.stringify({ currency: "USD" }) + "\n",
  );
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    assertEquals(await loadCurrency("t-split-5"), "USD");
    const dir = makeRun(root, "r5", savedDoc("Ann"));
    const item = itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-5" });
    const board = mountData(item.nodes, "split-board");
    assertEquals(board["currency"], "USD");
    assertEquals(mountItems(board)[0]["price"], 10);
    const out = exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-5" });
    assertStringIncludes(stepText(out.nodes), "USD 5.00");
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

// Run id picked value of the push source step.
function runIdValue(step: { id: string; nodes: Node[] }): string {
  assertEquals(step.id, "push-source");
  for (const node of step.nodes) {
    const rec = node as unknown as Record<string, unknown>;
    if (rec["name"] === "run-id") {
      if (rec["kind"] === "radio") return String(rec["picked"] ?? "");
      return String(rec["value"] ?? "");
    }
  }
  return "";
}

// Other run entry value of the push source step.
function otherRunValue(step: { id: string; nodes: Node[] }): string {
  assertEquals(step.id, "push-source");
  for (const node of step.nodes) {
    const rec = node as unknown as Record<string, unknown>;
    if (rec["name"] === "run-id-other") return String(rec["value"] ?? "");
  }
  return "";
}

Deno.test("export handoff lands on push-source with the run preloaded", async () => {
  const { pushSourceStep } = await import(
    "../wizards/expense-split.ts"
  );
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const runsRoot = root + "/share/runs";
    const dir = makeRun(runsRoot, "r6", savedDoc("Ann"));
    Deno.writeTextFileSync(
      dir + "/meta.json",
      JSON.stringify({
        id: "r6",
        label: "shop r6",
        createdAt: "2026-01-06T09:00:00Z",
        platforms: ["swiggy"],
        rangeDays: 7,
        status: "gathered",
      }) + "\n",
    );
    itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-6" });
    const out = exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-6" });
    // The export step offers the jump into the push flow.
    assertStringIncludes(stepText(out.nodes), "Send these to Splitwise now?");
    const pushJump = (out.nav?.actions ?? []).find((entry) => entry.id === "push-source");
    assertEquals(pushJump?.label, "Push to Splitwise");
    // Following the handoff: the push-source step carries the run id.
    assertEquals(runIdValue(pushSourceStep(new Map(), { sessionId: "t-split-6" })), "r6");
    // The Other run entry starts empty beside the list.
    assertEquals(otherRunValue(pushSourceStep(new Map(), { sessionId: "t-split-6" })), "");
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("push source prefers the typed other run over the radio pick", async () => {
  // The source step owns this rule now, through its own nav handler.
  const { pushSourceNext } = await import("../wizards/expense-split/push.ts");
  const { pushSessionFor, resetPush } = await import(
    "../wizards/expense-split/push-engine.ts"
  );
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  resetPush("t-split-7");
  try {
    for (const id of ["r-a", "r-b"]) {
      const dir = root + "/share/runs/" + id;
      Deno.mkdirSync(dir, { recursive: true });
      Deno.writeTextFileSync(
        dir + "/meta.json",
        JSON.stringify({
          id,
          label: "shop " + id,
          createdAt: "2026-01-06T09:00:00Z",
          platforms: ["zepto"],
          rangeDays: 7,
          status: "assigned",
          outputFile: "output.json",
        }) + "\n",
      );
      Deno.writeTextFileSync(
        dir + "/output.json",
        JSON.stringify({
          split_at: "2026-01-06T09:00:00Z",
          people: ["Ann", "Bob"],
          splits: [{
            item: "Milk",
            platform: "zepto",
            order_id: "o1",
            date: "2026-01-01T10:00:00",
            price: 100,
            split_type: "custom",
            assignments: { Ann: 60, Bob: 40 },
          }],
          totals: { Ann: 60, Bob: 40 },
          settlements: [{ from: "Bob", to: "Ann", amount: 40 }],
        }) + "\n",
      );
    }
    await pushSourceNext(
      new Map(),
      { source: ["Assigned run"], "run-id": ["r-a"], "run-id-other": ["r-b"] },
      { sessionId: "t-split-7" },
    );
    assertEquals(pushSessionFor("t-split-7").runId, "r-b");
    resetPush("t-split-7");
    await pushSourceNext(
      new Map(),
      { source: ["Assigned run"], "run-id": ["r-a"], "run-id-other": [""] },
      { sessionId: "t-split-7" },
    );
    assertEquals(pushSessionFor("t-split-7").runId, "r-a");
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("people step takes a dynamic list", () => {
  // Four names with blanks and a repeat: blanks drop, repeats merge.
  const m = new Map<string, string[]>([
    ["person", ["Ann", "", "Ben", "Cara", "Ann", "Dev"]],
  ]);
  assertEquals(collectedPeople(m), ["Ann", "Ben", "Cara", "Dev"]);
  // Old fixed keys still feed the list for saved drafts.
  const legacy = new Map<string, string[]>([["person-2", ["Ben"]]]);
  assertEquals(collectedPeople(legacy), ["Ben"]);
});

Deno.test("roleErrors covers the empty, missing role, and complete cases", () => {
  // No name at all: one plain message.
  const empty = roleErrors({});
  assertEquals(empty.length, 1);
  assertStringIncludes(empty[0], "at least one name");
  // A name exists but me is missing: one message naming both roles.
  const noMe = roleErrors({ person: ["Ann"], payer: ["Ann"] });
  assertEquals(noMe.length, 1);
  assertStringIncludes(noMe[0], "who paid");
  assertStringIncludes(noMe[0], "which name is you");
  // Both roles picked: the step is complete.
  assertEquals(roleErrors({ person: ["Ann"], payer: ["Ann"], me: ["Ann"] }), []);
});

Deno.test("a fresh line names the me person in the board data", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r7", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-10" });
  const board = mountData(found.nodes, "split-board");
  assertEquals(board["me"], "Ben");
  assertEquals(board["people"], ["Ann", "Ben"]);
  assertEquals(mountItems(board).length, 1);
});

// Names of the answers node entries, in order.
function answerNames(nodes: Node[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const rec = node as unknown as Record<string, unknown>;
    if (rec["kind"] !== "answers") continue;
    for (const entry of (rec["entries"] as Array<Record<string, unknown>>) ?? []) {
      out.push(String(entry["name"] ?? ""));
    }
  }
  return out;
}

Deno.test("settlement rows read in second person for the me person", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r8", savedDoc("Ann"));
  itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-11" });
  const out = exportStep(answers(dir, "Continue where you left off?", "Ann"), { sessionId: "t-split-11" });
  const text = stepText(out.nodes);
  // Ann is the me person: her row reads in second person and her
  // total comes first under her own label.
  assertStringIncludes(text, "Ben pays you");
  assertEquals(answerNames(out.nodes), ["Payer", "Your total", "Total Ben"]);
});

// Value of one textarea node, by field name.
function textareaValue(nodes: Node[], name: string): string {
  for (const node of nodes) {
    const rec = node as unknown as Record<string, unknown>;
    if (rec["kind"] === "textarea" && rec["name"] === name) {
      return String(rec["value"] ?? "");
    }
  }
  throw new Error("no textarea named " + name);
}

Deno.test("export offers push, summary, and share finish paths", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r9", savedDoc("Ann"));
  itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-12" });
  const out = exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-12" });
  const bar = out.nav;
  const jumpIds = (bar?.actions ?? []).map((entry) => entry.id);
  assertEquals(jumpIds, ["push-source", "split-summary", "split-share"]);
  assertEquals(bar?.goto, { step: "menu", label: "Back to menu" });
  assertStringIncludes(stepText(out.nodes), "need no Splitwise account");
});

Deno.test("split-summary renders the summary text in a textarea", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r10", savedDoc("Ann"));
  itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-13" });
  exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-13" });
  const found = summaryStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-13" });
  assertEquals(found.id, "split-summary");
  assertStringIncludes(
    textareaValue(found.nodes, "summary-text"),
    "Summary expense",
  );
  assertStringIncludes(stepText(found.nodes), "one expense");
});

Deno.test("split-share-done renders a stored link", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r11", savedDoc("Ann"));
  itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-14" });
  exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-14" });
  // Stub the paste upload so no network call happens in a test.
  const realFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(new Response("https://paste.rs/abc123\n", { status: 200 }));
  try {
    const made = await createSplitShareLink("t-split-14", 
      answers(dir, "Continue where you left off?"),
    );
    assertEquals(made, { ok: true });
  } finally {
    globalThis.fetch = realFetch;
  }
  const done = shareDoneStep(new Map(), { sessionId: "t-split-14" });
  assertEquals(done.id, "split-share-done");
  const value = textareaValue(done.nodes, "share-link-out");
  assertStringIncludes(value, "https://paste.rs/abc123");
  assertStringIncludes(value, "#");
  assertEquals(currentShareLink("t-split-14"), value);
});

Deno.test("a fresh item line reaches the board as an item", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "fee-item", null, FEE_ORDERS);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-15" });
  const items = mountItems(mountData(found.nodes, "split-board"));
  assertEquals(items.length, 2);
  assertEquals(items[0]["name"], "Pizza");
  assertEquals(items[0]["price"], 10);
  assertEquals(items[0]["isFee"], false);
});

Deno.test("a fresh fee line reaches the board flagged as a fee", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "fee-fresh", null, FEE_ORDERS);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-16" });
  const board = mountData(found.nodes, "split-board");
  const items = mountItems(board);
  assertEquals(items.length, 2);
  assertEquals(items[0]["isFee"], false);
  assertEquals(items[1]["isFee"], true);
  assertEquals(items[1]["price"], 5);
  assertEquals(board["skipped"], {});
});

Deno.test("fee line with a saved assignment keeps the saved people", async () => {
  const root = await Deno.makeTempDir();
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Ann", "Ben"],
    amounts: { Ann: 5, Ben: 5 },
  };
  // The 5.00 delivery fee stays with Ann alone, not the equal default.
  doc.assignments["1"] = {
    splitType: "single",
    people: ["Ann"],
    amounts: { Ann: 5 },
  };
  const dir = makeRun(root, "fee-saved", doc, FEE_ORDERS);
  const board = mountData(
    itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-17" }).nodes,
    "split-board",
  );
  const kept = board["assignments"] as Record<string, unknown>;
  assertEquals((kept["1"] as Record<string, unknown>)["people"], ["Ann"]);
  const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
  assertEquals(after.assignments["1"].people, ["Ann"]);
  assertEquals(after.assignments["1"].amounts, { Ann: 5 });
  exportStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-17" });
  assertEquals(
    JSON.parse(Deno.readTextFileSync(dir + "/output.json")).totals,
    { Ann: 10, Ben: 5 },
  );
});

Deno.test("fee copy names the per person amount with the settings currency", async () => {
  const root = await Deno.makeTempDir();
  Deno.mkdirSync(root + "/config", { recursive: true });
  Deno.writeTextFileSync(
    root + "/config/settings.json",
    JSON.stringify({ currency: "EUR" }) + "\n",
  );
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    assertEquals(await loadCurrency("t-split-18"), "EUR");
    const dir = makeRun(root, "fee-copy", null, FEE_ORDERS);
    const m = answers(dir);
    m.set("person", ["Ann", "Ben"]);
    m.set("me", ["Ben"]);
    const board = mountData(itemStep(m, { sessionId: "t-split-18" }).nodes, "split-board");
    // The 5.00 fee reaches the board flagged as a fee in EUR.
    assertEquals(board["currency"], "EUR");
    assertEquals(mountItems(board)[1]["price"], 5);
    assertEquals(mountItems(board)[1]["isFee"], true);
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
    await loadCurrency("t-split-18");
  }
});

Deno.test("empty run branch asks nothing", async () => {
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const { splitSteps } = await import("../wizards/expense-split/split.ts");
    const entry = splitSteps()[0];
    const found = typeof entry === "function" ? entry(new Map()) : entry;
    assertEquals(found.id, "split-run");
    assertStringIncludes(stepText(found.nodes), "No gathered runs exist yet");
    for (const node of found.nodes) {
      const rec = node as unknown as Record<string, unknown>;
      if (rec["kind"] === "checkbox" && rec["name"] === "dry") {
        throw new Error("empty run branch still shows the Dry run box");
      }
    }
    assertEquals(found.nav?.back, true);
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("rename through the save path keeps the assignment reachable", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "rename-keep", savedDoc("Ann"));
  const m = answers(dir, "Continue where you left off?");
  m.set("person", ["Ann", "Bobby"]);
  m.set("me", ["Ann"]);
  const board = mountData(itemStep(m, { sessionId: "t-split-20" }).nodes, "split-board");
  assertEquals(board["people"], ["Ann", "Bobby"]);
  const out = exportStep(m, { sessionId: "t-split-20" });
  assertStringIncludes(stepText(out.nodes), "Bobby pays you");
  const written = JSON.parse(Deno.readTextFileSync(dir + "/output.json"));
  assertEquals(written.people, ["Ann", "Bobby"]);
  assertEquals(written.totals, { Ann: 5, Bobby: 5 });
});

// Answers for a fresh two line run with the people filled in.
function freshFeeAnswers(dir: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  m.set("run", [dir]);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  return m;
}

Deno.test("a failed save keeps its reason until the next save lands", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "save-warn", null, FEE_ORDERS);
  const sid = "t-split-21";
  // First render opens the session on the fresh run.
  itemStep(freshFeeAnswers(dir), { sessionId: sid });
  assertEquals(lastSaveError(sid), "");
  // Force the next save to fail.
  setSaveWriterForTests(() => Promise.reject(new Error("disk is full")));
  try {
    // Rename one person. The remap saves in the background and misses.
    const renamed = freshFeeAnswers(dir);
    renamed.set("person", ["Ann", "Bobby"]);
    const board = mountData(itemStep(renamed, { sessionId: sid }).nodes, "split-board");
    assertEquals(board["people"], ["Ann", "Bobby"]);
    await pendingSaves(sid);
    // Check the session holds the reason.
    assertEquals(lastSaveError(sid), "disk is full");
  } finally {
    setSaveWriterForTests(writeSplitState);
  }
  // Rename back with the real writer. The save lands and clears the error.
  itemStep(freshFeeAnswers(dir), { sessionId: sid });
  await pendingSaves(sid);
  assertEquals(lastSaveError(sid), "");
});

Deno.test("a split session opened under A does not serve B", async () => {
  const root = await Deno.makeTempDir();
  const dirA = makeRun(root, "iso-split-a", null, [{
    id: "o1",
    platform: "swiggy",
    date: "2026-09-01 10:00 AM",
    paid: 10,
    items: [{ name: "PizzaA-x1", price: 10, quantity: 1 }],
    fees: { delivery: 0, packaging: 0 },
  }]);
  const dirB = makeRun(root, "iso-split-b", null, [{
    id: "o1",
    platform: "swiggy",
    date: "2026-09-01 10:00 AM",
    paid: 10,
    items: [{ name: "PizzaB-y2", price: 10, quantity: 1 }],
    fees: { delivery: 0, packaging: 0 },
  }]);
  const sidA = "iso-split-A";
  const sidB = "iso-split-B";
  const mapFor = (dir: string) => {
    const m = new Map<string, string[]>();
    m.set("run", [dir]);
    m.set("person", ["Ann", "Ben"]);
    m.set("me", ["Ann"]);
    return m;
  };
  const shownA = mountItems(
    mountData(itemStep(mapFor(dirA), { sessionId: sidA }).nodes, "split-board"),
  );
  const shownB = mountItems(
    mountData(itemStep(mapFor(dirB), { sessionId: sidB }).nodes, "split-board"),
  );
  assertEquals(shownA[0]["name"], "PizzaA-x1");
  assertEquals(shownB[0]["name"], "PizzaB-y2");
  // Re-render A after B opened: A still shows its own run.
  const againA = mountItems(
    mountData(itemStep(mapFor(dirA), { sessionId: sidA }).nodes, "split-board"),
  );
  assertEquals(againA[0]["name"], "PizzaA-x1");
  assertEquals(shownB[0]["name"] === "PizzaA-x1", false);
  assertEquals(shownA[0]["name"] === "PizzaB-y2", false);
});

// Two one line orders with distinct item names for the pick tests.
function pickOrders(): Order[] {
  return [
    {
      id: "o1",
      platform: "zepto",
      date: "2026-09-08",
      paid: 100,
      items: [{ name: "MilkA-pick", price: 100, quantity: 1 }],
      fees: { delivery: 0, packaging: 0 },
    },
    {
      id: "o2",
      platform: "zepto",
      date: "2026-09-09",
      paid: 50,
      items: [{ name: "MilkB-pick", price: 50, quantity: 1 }],
      fees: { delivery: 0, packaging: 0 },
    },
  ];
}

// Write meta.json with a picked list for one run dir.
function writePickedMeta(dir: string, id: string, picked: number[]): void {
  Deno.writeTextFileSync(
    dir + "/meta.json",
    JSON.stringify({
      id,
      label: "shop " + id,
      createdAt: "2026-09-08T09:00:00Z",
      platforms: ["zepto"],
      rangeDays: 7,
      status: "gathered",
      picked,
    }) + "\n",
  );
}

Deno.test("fresh split session skips the lines of unpicked orders", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "pick-fresh", null, pickOrders());
  writePickedMeta(dir, "pick-fresh", [1]);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ann"]);
  const found = itemStep(m, { sessionId: "t-pick-6" });
  const board = mountData(found.nodes, "split-board");
  const items = mountItems(board);
  // Line 0 belongs to the unpicked order, so it stays skipped.
  assertEquals(items.length, 2);
  assertEquals(board["skipped"], { "0": true });
  assertEquals(items[1]["name"], "MilkB-pick");
});

Deno.test("resumed split session keeps its saved skipped map", async () => {
  const root = await Deno.makeTempDir();
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.skipped["0"] = true;
  const dir = makeRun(root, "pick-resume", doc, pickOrders());
  writePickedMeta(dir, "pick-resume", [0]);
  const m = answers(dir, "Continue where you left off?");
  const board = mountData(itemStep(m, { sessionId: "t-pick-7" }).nodes, "split-board");
  // The saved skip on line 0 stays. Line 1 stays open.
  assertEquals(mountItems(board).length, 2);
  assertEquals(board["skipped"], { "0": true });
  assertEquals(board["assignments"], {});
  const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
  assertEquals(after.skipped, { "0": true });
});

Deno.test("split item bar holds Back", async () => {
  // Open a fresh one line run.
  // Check the bar keeps Back.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "nav-back", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-nav-back" });
  assertEquals(found.id, "split-item");
  assertEquals(found.nav?.back, true);
});

Deno.test("split item bar finishes to split-export", async () => {
  // Open a fresh one line run.
  // Check the forward control names the export step.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "nav-finish", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-nav-finish" });
  const goto = found.nav?.goto as unknown as Record<string, unknown>;
  assertEquals(goto["step"], "split-export");
  assertEquals(goto["label"], "Finish splitting");
});

Deno.test("split item bar declares no action", async () => {
  // Open a two line run with line 0 saved.
  // Check the bar lists no action even with saved work.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "nav-no-action", savedDoc("Ann"), FEE_ORDERS);
  const m = answers(dir, "Continue where you left off?");
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-nav-actions" });
  assertEquals(found.nav?.back, true);
  assertEquals(found.nav?.actions ?? [], []);
  assertEquals(found.nav?.next, undefined);
});

Deno.test("repeatOnto copies single split with fresh amounts", () => {
  // Repeat a single Ben line onto a higher price.
  // Check the type and the people stay.
  // Check the amounts recompute for the new price.
  const made = repeatOnto(
    { splitType: "single", people: ["Ben"], amounts: { Ben: 10 } },
    ["Ann", "Ben"],
    20,
  );
  assertEquals(made?.splitType, "single");
  assertEquals(made?.people, ["Ben"]);
  assertEquals(made?.amounts, { Ben: 20 });
});

Deno.test("repeatOnto drops unknown names and returns null with nobody", () => {
  // Repeat an equal line after Ben left the run.
  // Check Ann stays alone with a fresh amount.
  const kept = repeatOnto(
    { splitType: "equal", people: ["Ann", "Ben"], amounts: { Ann: 5, Ben: 5 } },
    ["Ann"],
    10,
  );
  assertEquals(kept?.splitType, "equal");
  assertEquals(kept?.people, ["Ann"]);
  assertEquals(kept?.amounts, { Ann: 10 });
  // Repeat with no saved names.
  // Check the helper returns null.
  assertEquals(
    repeatOnto({ splitType: "equal", people: [], amounts: {} }, ["Ann", "Ben"], 10),
    null,
  );
});

Deno.test("board data names the product and price", async () => {
  // Open a fresh one line run.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "header-alone", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ann"]);
  const found = itemStep(m, { sessionId: "t-header-1" });
  // Check the island names the product and price.
  const items = mountItems(mountData(found.nodes, "split-board"));
  assertEquals(items.length, 1);
  assertEquals(items[0]["name"], "Pizza");
  assertEquals(items[0]["price"], 10);
});

Deno.test("board data carries the platform and order of every item", async () => {
  // Open a fresh one line run.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "header-table", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ann"]);
  const found = itemStep(m, { sessionId: "t-header-2" });
  // Check the island holds the counter platform and order.
  const items = mountItems(mountData(found.nodes, "split-board"));
  assertEquals(items.length, 1);
  assertEquals(items[0]["index"], 0);
  assertEquals(items[0]["platform"], "swiggy");
  assertEquals(items[0]["orderId"], "o1");
});

Deno.test("board data keeps skipped lines flagged in place", async () => {
  // Build a two line run with line 0 skipped.
  const orders: Order[] = [{
    id: "o1",
    platform: "swiggy",
    date: "2026-09-01 10:00 AM",
    paid: 30,
    items: [{ name: "Pizza", price: 10, quantity: 1 }, { name: "Burger", price: 20, quantity: 1 }],
    fees: { delivery: 0, packaging: 0 },
  }];
  const root = await Deno.makeTempDir();
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.skipped["0"] = true;
  const dir = makeRun(root, "skip-hide", doc, orders);
  const board = mountData(
    itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-skip-1" }).nodes,
    "split-board",
  );
  // Check the island holds both lines with the skip flagged.
  const items = mountItems(board);
  assertEquals(items.length, 2);
  assertEquals(items[0]["name"], "Pizza");
  assertEquals(items[1]["name"], "Burger");
  assertEquals(board["skipped"], { "0": true });
});

Deno.test("board data carries the open line alongside the skip", async () => {
  // Build a two line run with line 0 skipped.
  const orders: Order[] = [{
    id: "o1",
    platform: "swiggy",
    date: "2026-09-01 10:00 AM",
    paid: 30,
    items: [{ name: "Pizza", price: 10, quantity: 1 }, { name: "Burger", price: 20, quantity: 1 }],
    fees: { delivery: 0, packaging: 0 },
  }];
  const root = await Deno.makeTempDir();
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.skipped["0"] = true;
  const dir = makeRun(root, "skip-current", doc, orders);
  const board = mountData(
    itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-skip-2" }).nodes,
    "split-board",
  );
  // Check the skipped map stays while line 1 stays open.
  assertEquals(mountItems(board).length, 2);
  assertEquals(board["skipped"], { "0": true });
  assertEquals(board["assignments"], {});
});

Deno.test("stored split run opens the item step with no run answer", async () => {
  // Build one fresh run.
  // Store it for this session.
  // Open the item step with no run answer.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "store-fallback", null);
  const sid = "t-split-store-1";
  setSplitRun(sid, dir);
  const m = new Map<string, string[]>();
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ann"]);
  const found = itemStep(m, { sessionId: sid });
  assertEquals(found.id, "split-item");
  const board = mountData(found.nodes, "split-board");
  assertEquals(board["runId"], "store-fallback");
  assertEquals(mountItems(board)[0]["name"], "Pizza");
});

Deno.test("item step mounts the board node", async () => {
  // Open a fresh one line run.
  // Read the mount node id.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "item-label", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ann"]);
  const found = itemStep(m, { sessionId: "t-item-label-1" });
  assertEquals(mountData(found.nodes, "split-board")["runId"], "item-label");
});

Deno.test("item bar forward button reads Finish splitting", async () => {
  // Open a fresh one line run.
  // Read the forward control target.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "next-item", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-next-item-1" });
  const goto = found.nav?.goto as unknown as Record<string, unknown>;
  assertEquals(String(goto["label"]), "Finish splitting");
  assertEquals(String(goto["step"]), "split-export");
});

// Build one run under the live runs dir with meta plus state.
function makeBoardRun(
  root: string,
  id: string,
  state: SplitStateDoc | null,
): string {
  const dir = root + "/share/runs/" + id;
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(
    dir + "/meta.json",
    JSON.stringify({
      id,
      label: "shop " + id,
      createdAt: "2026-01-06T09:00:00Z",
      platforms: ["swiggy"],
      rangeDays: 7,
      status: "gathered",
    }) + "\n",
  );
  Deno.writeTextFileSync(dir + "/orders.json", JSON.stringify(ORDERS) + "\n");
  if (state !== null) {
    Deno.writeTextFileSync(
      dir + "/split-state.json",
      JSON.stringify(state, null, 2) + "\n",
    );
  }
  return dir;
}

// Post one patch body to the board route.
function postPatch(body: unknown): Request {
  return new Request("http://localhost/app/split-patch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("board routes ignore an unknown path", async () => {
  // Ask for a path the board never serves.
  // Check the wizard keeps it.
  assertEquals(
    await handleBoardRoute(new Request("http://localhost/nope")),
    null,
  );
});

Deno.test("board file serves the component", async () => {
  // Ask for the component file the board ticket wrote.
  // Check the route answers 200 as JavaScript.
  const res = await handleBoardRoute(
    new Request("http://localhost/app/split-board.js"),
  );
  assert(res !== null);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
  assertStringIncludes(await res.text(), "shareEqual");
});

Deno.test("board patch names an unknown run with 404", async () => {
  // Point the state root at a fresh temp dir.
  // Patch a run id that holds no meta.
  // Check the route answers 404.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const res = await handleBoardRoute(
      postPatch({ runId: "no-such-run", assignments: {} }),
    );
    assert(res !== null);
    assertEquals(res.status, 404);
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("board patch names no run with 400", async () => {
  // Send a body with no run id.
  // Check the route answers 400.
  const res = await handleBoardRoute(postPatch({ assignments: {} }));
  assert(res !== null);
  assertEquals(res.status, 400);
});

Deno.test("board patch writes the named assignment alone", async () => {
  // Seed line 1 and patch line 0.
  // Check line 0 lands and line 1 stays.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const seed = savedDoc("Ann");
    seed.assignments["1"] = {
      splitType: "single",
      people: ["Ben"],
      amounts: { Ben: 7 },
    };
    const dir = makeBoardRun(root, "board-write", seed);
    const patch = {
      runId: "board-write",
      assignments: {
        "0": { splitType: "equal", people: ["Ann"], amounts: { Ann: 10 } },
      },
      baseline: Date.now(),
    };
    const res = await handleBoardRoute(postPatch(patch));
    assert(res !== null);
    assertEquals(res.status, 200);
    const reply = await res.json();
    assertEquals(reply.ok, true);
    assertEquals(reply.conflicted, false);
    const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
    assertEquals(after.assignments["0"], patch.assignments["0"]);
    assertEquals(after.assignments["1"], seed.assignments["1"]);
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("board patch drops a skip set false", async () => {
  // Seed two skips and clear one.
  // Check the cleared skip leaves and the other stays.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const seed = savedDoc("Ann");
    seed.skipped["2"] = true;
    seed.skipped["3"] = true;
    const dir = makeBoardRun(root, "board-skip", seed);
    const res = await handleBoardRoute(postPatch({
      runId: "board-skip",
      skipped: { "2": false },
      baseline: Date.now(),
    }));
    assert(res !== null);
    assertEquals(res.status, 200);
    const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
    assertEquals(after.skipped, { "3": true });
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("equal split with a remainder still adds up", () => {
  // Split 10.00 three ways. The parts must total the price exactly.
  const parts: Record<string, number> = shareEqual(10, ["Ann", "Ben", "Cara"]);
  const sum = round2(Object.values(parts).reduce((a, b) => a + b, 0));
  assertEquals(sum, 10);
  // The remainder lands on the first person.
  assertEquals(parts["Ann"], 3.34);
  assertEquals(parts["Ben"], 3.33);
});

Deno.test("percent split turns percents into money", () => {
  // Split 10.00 by 60 and 40. The money must match the percents.
  assertEquals(sharePercent(10, { Ann: 60, Ben: 40 }), { Ann: 6, Ben: 4 });
});

Deno.test("single split puts the whole price on one person", () => {
  // Split 10.00 onto Ann alone. She carries the whole price.
  assertEquals(shareSingle(10, "Ann"), { Ann: 10 });
});

Deno.test("buildPatch carries only the changed lines plus a set skip", () => {
  // Mark line 1 dirty with a skip set. Line 0 stays out.
  const patch = buildPatch(
    new Set([1]),
    {
      "0": { splitType: "equal", people: ["Ann"], amounts: { Ann: 10 } },
      "1": { splitType: "single", people: ["Ben"], amounts: { Ben: 10 } },
    },
    { "1": true },
  );
  assertEquals(Object.keys(patch.assignments), ["1"]);
  assertEquals(patch.assignments["1"], {
    splitType: "single",
    people: ["Ben"],
    amounts: { Ben: 10 },
  });
  assertEquals(patch.skipped, { "1": true });
});

Deno.test("board exports repeatOnto as a function", () => {
  // Check the board keeps the repeat helper exported.
  // Guard later changes from dropping it quietly.
  assertEquals(typeof repeatOnto, "function");
});

Deno.test("item step mounts the board with the run people and items", async () => {
  // Open a fresh one line run with the people filled in.
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "board-mount", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ann"]);
  m.set("payer", ["Ann"]);
  const found = itemStep(m, { sessionId: "t-board-mount" });
  // Check the step keeps its id plus its bar.
  assertEquals(found.id, "split-item");
  assertEquals(found.title, "Split item");
  assertEquals(found.nav?.back, true);
  // Check the island names the run, the people and every item.
  const board = mountData(found.nodes, "split-board");
  assertEquals(board["runId"], "board-mount");
  assertEquals(board["currency"], "INR");
  assertEquals(board["payer"], "Ann");
  assertEquals(board["me"], "Ann");
  assertEquals(board["people"], ["Ann", "Ben"]);
  const items = mountItems(board);
  assertEquals(items.length, 1);
  assertEquals(items[0], {
    index: 0,
    name: "Pizza",
    price: 10,
    platform: "swiggy",
    orderId: "o1",
    isFee: false,
  });
  assertEquals(board["assignments"], {});
  assertEquals(board["skipped"], {});
  assertEquals(typeof board["at"], "number");
});

Deno.test("digit keys map onto people in order", () => {
  // Map digit 1 onto Ann.
  // Map digit 2 onto Ben.
  // Check a digit past the end maps onto nothing.
  assertEquals(personForDigit(["Ann", "Ben"], "1"), "Ann");
  assertEquals(personForDigit(["Ann", "Ben"], "2"), "Ben");
  assertEquals(personForDigit(["Ann", "Ben"], "3"), null);
  assertEquals(personForDigit(["Ann", "Ben"], "9"), null);
});

Deno.test("checkpoint seed names the saved time", () => {
  // Seed from an island time with one saved line.
  // Check the line names the saved time.
  // Check an empty run seeds an empty string.
  const at = new Date(2026, 8, 17, 9, 4, 7).getTime();
  const line = seedCheckpointLine(
    { "0": { splitType: "equal", people: ["Ann"], amounts: { Ann: 10 } } },
    {},
    at,
  );
  assertStringIncludes(line, "Run last saved");
  assertEquals(line.endsWith("."), true);
  assertEquals(seedCheckpointLine({}, {}, at), "");
  assertStringIncludes(seedCheckpointLine({}, { "0": true }, at), "Run last saved");
});

Deno.test("two board patches in a row leave no conflict copy", async () => {
  // Patch line 0, then patch line 1 with the first reply time.
  // Check no conflict copy lands beside the state file.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const dir = makeBoardRun(root, "board-chain", savedDoc("Ann"));
    const first = await handleBoardRoute(postPatch({
      runId: "board-chain",
      assignments: {
        "0": { splitType: "equal", people: ["Ann"], amounts: { Ann: 10 } },
      },
      baseline: Date.now(),
    }));
    assert(first !== null);
    const at = (await first.json()).at;
    const second = await handleBoardRoute(postPatch({
      runId: "board-chain",
      assignments: {
        "1": { splitType: "single", people: ["Ben"], amounts: { Ben: 7 } },
      },
      baseline: at,
    }));
    assert(second !== null);
    assertEquals((await second.json()).conflicted, false);
    const names: string[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (entry.name.startsWith("split-state.conflict-")) names.push(entry.name);
    }
    assertEquals(names.length, 0);
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("progress helper counts each state", () => {
  // Build a three line doc with one of each state.
  // Check each count.
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Ann", "Ben"],
    amounts: { Ann: 5, Ben: 5 },
  };
  doc.skipped["1"] = true;
  assertEquals(countSplitProgress(3, doc), {
    assigned: 1,
    skipped: 1,
    waiting: 1,
  });
});

Deno.test("progress helper ignores indexes outside the run", () => {
  // Build a two line doc with stale entries past the end.
  // Check stale entries count for nothing.
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Ann", "Ben"],
    amounts: { Ann: 5, Ben: 5 },
  };
  doc.assignments["5"] = {
    splitType: "single",
    people: ["Ann"],
    amounts: { Ann: 10 },
  };
  doc.skipped["1"] = true;
  doc.skipped["9"] = true;
  assertEquals(countSplitProgress(2, doc), {
    assigned: 1,
    skipped: 1,
    waiting: 0,
  });
});

Deno.test("resume question names progress and keeps both choices", async () => {
  // Build a three line run with one assigned and one skipped.
  // Check the question names the numbers.
  // Check both choices stay word for word.
  const orders: Order[] = [{
    id: "o1",
    platform: "swiggy",
    date: "2026-09-01 10:00 AM",
    paid: 30,
    items: [
      { name: "Pizza", price: 10, quantity: 1 },
      { name: "Burger", price: 10, quantity: 1 },
      { name: "Salad", price: 10, quantity: 1 },
    ],
    fees: { delivery: 0, packaging: 0 },
  }];
  const root = await Deno.makeTempDir();
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.assignments["0"] = {
    splitType: "equal",
    people: ["Ann", "Ben"],
    amounts: { Ann: 5, Ben: 5 },
  };
  doc.skipped["1"] = true;
  const dir = makeRun(root, "progress-resume", doc, orders);
  const found = itemStep(answers(dir), { sessionId: "t-split-progress" });
  const body = stepText(found.nodes);
  assertStringIncludes(body, "This run holds a saved split in progress.");
  assertStringIncludes(
    body,
    "It holds 1 assigned item, 1 skipped and 1 waiting out of 3 items.",
  );
  const radioNode = found.nodes.find((node) => {
    const rec = node as unknown as Record<string, unknown>;
    return rec["kind"] === "radio" && rec["name"] === "resume";
  }) as unknown as Record<string, unknown>;
  assert(radioNode !== undefined);
  assertEquals(radioNode["label"], "Continue where you left off?");
  const options = (radioNode["options"] as unknown[]).map((option) =>
    typeof option === "string"
      ? option
      : (option as Record<string, unknown>)["value"]
  );
  assertEquals(options, ["Continue where you left off?", "Start over"]);
});
