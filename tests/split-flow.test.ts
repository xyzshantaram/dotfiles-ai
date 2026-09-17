// Wizard-level split flow tests: resume, meta updates, validator gate,
// and the currency label from settings.

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  collectedPeople,
  createSplitShareLink,
  currentShareLink,
  exportStep,
  itemStep,
  lastSaveError,
  loadCurrency,
  pendingSaves,
  roleErrors,
  setSaveWriterForTests,
  shareDoneStep,
  summaryStep,
} from "../wizards/expense-split/split.ts";
import { freshState, type SplitStateDoc, writeSplitState } from "../src/splitstate.ts";
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
  // Continue renders the finished state, line 0 stays assigned.
  const done = itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-1" });
  assertStringIncludes(stepText(done.nodes), "All 1 lines are split");
  const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
  assertEquals(after.assignments["0"].amounts, { Ann: 5, Ben: 5 });
  assertEquals(after.payer, "Ann");
});

Deno.test("start over clears saved assignments", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r2", savedDoc("Ann"));
  itemStep(answers(dir), { sessionId: "t-split-2" });
  const fresh = itemStep(answers(dir, "Start over"), { sessionId: "t-split-2" });
  assertStringIncludes(stepText(fresh.nodes), "Line 1 of 1");
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
    assertStringIncludes(stepText(item.nodes), "USD 10.00");
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
  const { onSubmit } = await import("../wizards/expense-split.ts");
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
    await onSubmit(
      { source: ["Assigned run"], "run-id": ["r-a"], "run-id-other": ["r-b"] },
      "push-source",
      "",
      { sessionId: "t-split-7" },
    );
    assertEquals(pushSessionFor("t-split-7").runId, "r-b");
    resetPush("t-split-7");
    await onSubmit(
      { source: ["Assigned run"], "run-id": ["r-a"], "run-id-other": [""] },
      "push-source",
      "",
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

// Ticked values of one checkbox node, by field name.
function tickedOf(nodes: Node[], name: string): string[] {
  for (const node of nodes) {
    const rec = node as unknown as Record<string, unknown>;
    if (rec["name"] === name) return (rec["ticked"] as string[]) ?? [];
  }
  throw new Error("no checkbox named " + name);
}

// Picked value of one radio node, by field name.
function pickedOf(nodes: Node[], name: string): string | undefined {
  for (const node of nodes) {
    const rec = node as unknown as Record<string, unknown>;
    if (rec["name"] === name) return rec["picked"] as string | undefined;
  }
  throw new Error("no radio named " + name);
}

Deno.test("a fresh line ticks the me person by default", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "r7", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const step = itemStep(m, { sessionId: "t-split-10" });
  assertEquals(tickedOf(step.nodes, "who-0"), ["Ben"]);
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

Deno.test("fresh item line still ticks only the me person", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "fee-item", null, FEE_ORDERS);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-15" });
  assertEquals(tickedOf(found.nodes, "who-0"), ["Ben"]);
  assertEquals(pickedOf(found.nodes, "mode-0"), "Equal");
  assertEquals(stepText(found.nodes).includes("Fee default"), false);
});

Deno.test("fresh fee line ticks everyone and preselects equal", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "fee-fresh", null, FEE_ORDERS);
  const first = answers(dir);
  first.set("person", ["Ann", "Ben"]);
  first.set("me", ["Ben"]);
  // Line 0 is the Pizza item: only the me person ticks.
  const item = itemStep(first, { sessionId: "t-split-16" });
  assertEquals(tickedOf(item.nodes, "who-0"), ["Ben"]);
  // Commit line 0 to Ben alone, so line 1 renders the delivery fee.
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  m.set("mode-0", ["Equal"]);
  m.set("who-0", ["Ben"]);
  const fee = itemStep(m, { sessionId: "t-split-16" });
  assertEquals(tickedOf(fee.nodes, "who-1"), ["Ann", "Ben"]);
  assertEquals(pickedOf(fee.nodes, "mode-1"), "Equal");
  assertStringIncludes(stepText(fee.nodes), "Fee default");
  assertStringIncludes(stepText(fee.nodes), "2.50");
  assertStringIncludes(stepText(fee.nodes), "You may change it");
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
  const done = itemStep(answers(dir, "Continue where you left off?"), { sessionId: "t-split-17" });
  assertStringIncludes(stepText(done.nodes), "All 2 lines are split");
  assertEquals(stepText(done.nodes).includes("Fee default"), false);
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
    m.set("mode-0", ["Equal"]);
    m.set("who-0", ["Ben"]);
    const fee = itemStep(m, { sessionId: "t-split-18" });
    // The 5.00 fee split two ways names EUR 2.50 each.
    assertStringIncludes(
      stepText(fee.nodes),
      "Fee default: everyone pays EUR 2.50 each.",
    );
    assertStringIncludes(stepText(fee.nodes), "You may change it");
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
  const done = itemStep(m, { sessionId: "t-split-20" });
  assertStringIncludes(stepText(done.nodes), "All 1 lines are split");
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

Deno.test("a failed save shows its reason until the next save lands", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "save-warn", null, FEE_ORDERS);
  // First render opens the session on line 0.
  itemStep(freshFeeAnswers(dir), { sessionId: "t-split-21" });
  assertEquals(lastSaveError("t-split-21"), "");
  // Force the next save to fail.
  setSaveWriterForTests(() => Promise.reject(new Error("disk is full")));
  try {
    // Post line 0. The commit saves in the background and misses.
    const first = freshFeeAnswers(dir);
    first.set("mode-0", ["Equal"]);
    first.set("who-0", ["Ben"]);
    itemStep(first, { sessionId: "t-split-21" });
    await pendingSaves("t-split-21");
    // Check the session holds the reason.
    assertEquals(lastSaveError("t-split-21"), "disk is full");
    // Check the item step shows one muted warning line.
    const warned = itemStep(first, { sessionId: "t-split-21" });
    assertStringIncludes(
      stepText(warned.nodes),
      "The last save did not land: disk is full. Your answers stay in this window until a save lands.",
    );
  } finally {
    setSaveWriterForTests(writeSplitState);
  }
  // Post line 1 with the real writer. The save lands and clears the error.
  const second = freshFeeAnswers(dir);
  second.set("mode-0", ["Equal"]);
  second.set("who-0", ["Ben"]);
  second.set("mode-1", ["Equal"]);
  second.set("who-1", ["Ann", "Ben"]);
  itemStep(second, { sessionId: "t-split-21" });
  await pendingSaves("t-split-21");
  assertEquals(lastSaveError("t-split-21"), "");
  const clean = itemStep(second, { sessionId: "t-split-21" });
  assertStringIncludes(stepText(clean.nodes), "All 2 lines are split");
  assertEquals(stepText(clean.nodes).includes("did not land"), false);
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
  const shownA = stepText(itemStep(mapFor(dirA), { sessionId: sidA }).nodes);
  const shownB = stepText(itemStep(mapFor(dirB), { sessionId: sidB }).nodes);
  assertStringIncludes(shownA, "PizzaA-x1");
  assertStringIncludes(shownB, "PizzaB-y2");
  // Re-render A after B opened: A still shows its own run.
  const againA = stepText(itemStep(mapFor(dirA), { sessionId: sidA }).nodes);
  assertStringIncludes(againA, "PizzaA-x1");
  assertEquals(againA.includes("PizzaB-y2"), false);
  assertEquals(shownB.includes("PizzaA-x1"), false);
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
  const text = stepText(found.nodes);
  // Line 0 belongs to the unpicked order, so the session opens on line 2.
  assertStringIncludes(text, "Line 2 of 2");
  assertStringIncludes(text, "MilkB-pick");
});

Deno.test("resumed split session keeps its saved skipped map", async () => {
  const root = await Deno.makeTempDir();
  const doc = freshState(["Ann", "Ben"], "Ann");
  doc.skipped["0"] = true;
  const dir = makeRun(root, "pick-resume", doc, pickOrders());
  writePickedMeta(dir, "pick-resume", [0]);
  const m = answers(dir, "Continue where you left off?");
  const found = itemStep(m, { sessionId: "t-pick-7" });
  const text = stepText(found.nodes);
  // The saved skip on line 0 stays. Line 1 stays open.
  assertStringIncludes(text, "Line 2 of 2");
  assertEquals(text.includes("All 2 lines are split"), false);
  const after = JSON.parse(Deno.readTextFileSync(dir + "/split-state.json"));
  assertEquals(after.skipped, { "0": true });
});

Deno.test("split item bar holds Next line plus Repeat Last", async () => {
  const root = await Deno.makeTempDir();
  const dir = makeRun(root, "nav-item", null);
  const m = answers(dir);
  m.set("person", ["Ann", "Ben"]);
  m.set("me", ["Ben"]);
  const found = itemStep(m, { sessionId: "t-split-nav" });
  assertEquals(found.id, "split-item");
  assertEquals(found.nav?.back, true);
  // Next line is the forward button.
  const fwd = found.nav?.next as unknown as Record<string, unknown> | string;
  assertEquals(typeof fwd === "string" ? fwd : String(fwd["label"]), "Next line");
  // Repeat Last is a screen wide action.
  const repeat = (found.nav?.actions ?? []).find((entry) => entry.id === "repeat");
  assertEquals(repeat?.label, "Repeat Last");
  // The bar replaces the buttons node: no buttons node remains.
  for (const node of found.nodes) {
    const rec = node as unknown as Record<string, unknown>;
    assertEquals(rec["kind"] === "buttons", false);
  }
  // Next line holds the screen on the item step. Repeat Last re-renders.
  type RunFn = (
    answers: Map<string, string[]>,
    fields: Record<string, string[]>,
    ctx: { sessionId: string },
  ) => unknown;
  const nextRun = (fwd as { run?: unknown }).run as RunFn;
  assertEquals(
    await nextRun(new Map(), {}, { sessionId: "t-split-nav" }),
    { goto: "split-item" },
  );
  const repeatRun = repeat?.run as RunFn;
  assertEquals(
    await repeatRun(new Map(), {}, { sessionId: "t-split-nav" }),
    undefined,
  );
});
