// End to end drive for ticket F5: manual expenses become orders in a
// written run, then the split stage reads and splits that run. Also
// proves the Zomato phone and OTP fields are gone.

import { createWizard } from "jsr:@xyzshantaram/wizardkit@^0.1.1";
import {
  gatherPickRunId,
  gatherSteps,
  manualPicked,
  manualRowProblems,
  manualRows,
  persistManualRun,
  pickAll,
  pickNext,
  pickNone,
  reviewNext,
} from "@app/app/expense-split/gather.ts";
import { isLedgerRow, itemSummary, tidyProductName } from "@app/src/common.ts";
import { DEFAULT_LOCATION } from "@app/src/zomato.ts";
import { routeStatus, splitSteps } from "@app/app/expense-split/split.ts";
import { runsDir } from "@app/src/runstate.ts";
import { assert, assertStringIncludes, assertMatch } from "@std/assert";

// List manual run names under runsDir. A missing dir counts as empty.
async function manualRunNames(): Promise<string[]> {
  try {
    return (await Array.fromAsync(Deno.readDir(runsDir())))
      .map((e) => e.name)
      .filter((n) => n.includes("manual"));
  } catch {
    return [];
  }
}

// One cookie jar per wizard handle. The toolkit now keys its state by a
// wizard-sid cookie, so a walk that forgets the cookie starts a new
// session on every post and loses every earlier answer.
const jars = new WeakMap<(req: Request) => Promise<Response>, string>();

async function post(
  handle: (req: Request) => Promise<Response>,
  fields: Record<string, string | string[]>,
): Promise<string> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      form.append(key, v);
    }
  }
  const headers = new Headers();
  const held = jars.get(handle);
  if (held !== undefined) headers.set("cookie", held);
  const res = await handle(
    new Request("http://x/step", { method: "POST", body: form, headers }),
  );
  const set = res.headers.get("set-cookie");
  if (set !== null) jars.set(handle, set.split(";")[0]);
  return await res.text();
}

// Session id the wizard handle owns in its cookie jar. Falls back to
// the default session before the first response sets a cookie.
function jarSid(handle: (req: Request) => Promise<Response>): string {
  const held = jars.get(handle);
  if (held === undefined) return "default";
  const found = held.match(/wizard-sid=([^;]+)/);
  return found ? decodeURIComponent(found[1]) : "default";
}

Deno.test("manual expenses become a run and split end to end", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "f5-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const handle = createWizard({
    title: "F5 drive",
    steps: [...gatherSteps(), ...splitSteps()],
  });

  // Pick Manual, set the range, skip accounts.
  await post(handle, { step: "gather-platforms", action: "next", platforms: "Manual" });
  await post(handle, { step: "gather-range", action: "next", range: "30" });
  await post(handle, { step: "gather-accounts", action: "next" });

  // Two manual rows. The second leaves the date blank.
  await post(handle, {
    step: "gather-manual",
    action: "next",
    store: ["Kirana Store", "Fruit Shop"],
    date: ["2026-01-02", ""],
    item: ["Chips", "Apples"],
    amount: ["120", "80"],
  });

  // The posted rows arrive as a form map.
  const rowMap = new Map<string, string[]>([
    ["platforms", ["Manual"]],
    ["store", ["Kirana Store", "Fruit Shop"]],
    ["date", ["2026-01-02", ""]],
    ["item", ["Chips", "Apples"]],
    ["amount", ["120", "80"]],
    ["range", ["30"]],
  ]);
  assert(manualPicked(rowMap), "manualPicked missed Manual");
  assert(!manualPicked(new Map([["platforms", ["Zepto"]]])), "manualPicked fired on Zepto");

  // The write happens here, not during render. The wizard handle owns
  // its own browser session id in the cookie jar, so the save uses
  // that same id and the later review render reads it back.
  persistManualRun(jarSid(handle), rowMap);

  // The run exists with the gathered shape.
  const ids = await manualRunNames();
  assert(ids.length >= 1, "no manual run written");
  const runId = ids[0];
  const dir = runsDir() + "/" + runId;
  const meta = JSON.parse(await Deno.readTextFile(dir + "/meta.json"));
  assertMatch(meta.status, /gathered/);
  assertEqualsRunShape(meta.platforms, ["manual"]);
  const orders = JSON.parse(await Deno.readTextFile(dir + "/orders.json"));
  if (orders.length !== 2) throw new Error("expected 2 orders, got " + orders.length);
  if (orders[0].platform !== "manual") throw new Error("order platform wrong");
  if (orders[0].paid !== 120) throw new Error("order amount wrong");
  if (orders[0].items[0].source !== "hand") throw new Error("item source wrong");

  // Re-posting the same rows writes no second run. The wizard no
  // longer writes during render, so the test drives the save itself.
  await post(handle, { step: "gather-manual", action: "back" });
  await post(handle, {
    step: "gather-manual",
    action: "next",
    store: ["Kirana Store", "Fruit Shop"],
    date: ["2026-01-02", ""],
    item: ["Chips", "Apples"],
    amount: ["120", "80"],
  });
  persistManualRun(jarSid(handle), rowMap);
  const again = await manualRunNames();
  if (again.length !== 1) {
    throw new Error("duplicate manual runs: " + again.join(", "));
  }

  // Review names the run. Posting manual with Next renders review.
  const review = await post(handle, {
    step: "gather-manual",
    action: "next",
    store: ["Kirana Store", "Fruit Shop"],
    date: ["2026-01-02", ""],
    item: ["Chips", "Apples"],
    amount: ["120", "80"],
  });
  assertStringIncludes(review, runId);

  // Split the run. The People step now takes the names plus both roles in
  // one post, and its own handler rejects a post that misses a role. The
  // two follow up posts named steps that no longer exist.
  await post(handle, {
    step: "split-people",
    action: "next",
    "person-1": "Asha",
    "person-2": "Vijay",
    payer: "Asha",
    me: "Asha",
  });
  await post(handle, { step: "split-run", action: "next", run: dir });

  // The board owns the lines now. Render the item step once so the
  // initial state file exists, then checkpoint both lines through
  // the patch endpoint like the browser component does.
  await post(handle, { step: "split-item", action: "next" });
  const { handleBoardRoute } = await import(
    "@app/app/expense-split/board-routes.ts"
  );
  const patch = await handleBoardRoute(
    new Request("http://x/app/split-patch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId,
        assignments: {
          "0": {
            splitType: "equal",
            people: ["Asha", "Vijay"],
            amounts: { Asha: 60, Vijay: 60 },
          },
          "1": {
            splitType: "equal",
            people: ["Asha", "Vijay"],
            amounts: { Asha: 40, Vijay: 40 },
          },
        },
        baseline: Date.now(),
      }),
    }),
  );
  if (patch === null || patch.status !== 200) {
    throw new Error("board patch missed");
  }
  await post(handle, { step: "split-item", action: "next" });

  // The export step writes output.json for the run.
  let output: unknown = undefined;
  for (let i = 0; i < 40 && output === undefined; i++) {
    try {
      output = JSON.parse(await Deno.readTextFile(dir + "/output.json"));
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (output === undefined) throw new Error("output.json never landed");
  const doc = output as { totals: Record<string, number>; settlements: unknown[] };
  if (Math.abs((doc.totals["Asha"] ?? 0) - 100) > 0.01) {
    throw new Error("Asha total wrong: " + doc.totals["Asha"]);
  }
  if (Math.abs((doc.totals["Vijay"] ?? 0) - 100) > 0.01) {
    throw new Error("Vijay total wrong: " + doc.totals["Vijay"]);
  }
  if (doc.settlements.length === 0) throw new Error("no settlements");
  await cleanup(root);
});

Deno.test("manual step render writes no run until persistManualRun runs", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "c3-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const handle = createWizard({ title: "C3 drive", steps: gatherSteps() });
    await post(handle, { step: "gather-platforms", action: "next", platforms: "Manual" });
    await post(handle, { step: "gather-range", action: "next", range: "30" });
    await post(handle, { step: "gather-accounts", action: "next" });
    // Post rows with Next. The bar handler saves them.
    const body = await post(handle, {
      step: "gather-manual",
      action: "next",
      store: ["Kirana Store"],
      date: ["2026-01-02"],
      item: ["Chips"],
      amount: ["120"],
    });
    if (body.includes("Saved")) throw new Error("render still names a saved run");
    const before = await manualRunNames();
    if (before.length !== 1) {
      throw new Error("Next wrote no single run: " + before.join(", "));
    }
    if (body.includes("Saved")) throw new Error("render still names a saved run");
    // Save same rows again. The store keeps one run.
    persistManualRun(
      jarSid(handle),
      new Map([
        ["store", ["Kirana Store"]],
        ["date", ["2026-01-02"]],
        ["item", ["Chips"]],
        ["amount", ["120"]],
        ["range", ["30"]],
      ]),
    );
    const after = await manualRunNames();
    if (after.length !== 1) throw new Error("persist wrote no single run");
    const orders = JSON.parse(
      await Deno.readTextFile(runsDir() + "/" + after[0] + "/orders.json"),
    );
    if (orders.length !== 1) throw new Error("persist wrote wrong order count");
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
    await cleanup(root);
  }
});

// Remove the temp state root. Background split-state saves can still
// hold files for a moment, so retry and give up quietly.
async function cleanup(root: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      await Deno.remove(root, { recursive: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

function assertEqualsRunShape(got: unknown, want: string[]): void {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error("platforms wrong: " + JSON.stringify(got));
  }
}

Deno.test("zomato step offers the live login fields, not the dead ones", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "f5-zom-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const handle = createWizard({ title: "F5 zomato", steps: gatherSteps() });
  await post(handle, {
    step: "gather-platforms",
    action: "next",
    platforms: ["Zomato", "Manual"],
  });
  const body = await post(handle, { step: "gather-range", action: "next", range: "30" });
  if (body.includes('name="phone"')) throw new Error("phone field still present");
  if (body.includes('name="otp"')) throw new Error("otp field still present");
  // Copy names a real path: cached sign in, or the on-screen login actions.
  const liveCopy = body.includes("Signed in and ready.") ||
    body.includes("Send the code");
  assert(liveCopy, "zomato copy names no live path");
  await cleanup(root);
});

Deno.test("gather first screen asks dry once and review shows no dry box", () => {
  const entries = gatherSteps();
  const firstEntry = entries[0];
  const first = typeof firstEntry === "function"
    ? (firstEntry as (m: Map<string, string[]>) => { id: string; nodes: unknown[] })(
      new Map(),
    )
    : (firstEntry as { id: string; nodes: unknown[] });
  if (first.id !== "gather-platforms") throw new Error("first step is not gather-platforms");
  if (!hasDryBox(first)) throw new Error("gather-platforms misses the dry checkbox");
  const reviewEntry = entries[4];
  const reviewOff = typeof reviewEntry === "function"
    ? (reviewEntry as (m: Map<string, string[]>) => { id: string; nodes: unknown[] })(
      new Map([["platforms", ["Zepto"]], ["range", ["30"]]]),
    )
    : (reviewEntry as { id: string; nodes: unknown[] });
  if (reviewOff.id !== "gather-review") throw new Error("last step is not gather-review");
  if (hasDryBox(reviewOff)) throw new Error("gather-review still shows the dry checkbox");
  const reviewOn = typeof reviewEntry === "function"
    ? (reviewEntry as (m: Map<string, string[]>) => { id: string; nodes: unknown[] })(
      new Map([["platforms", ["Zepto"]], ["range", ["30"]], ["dry", ["dry"]]]),
    )
    : (reviewEntry as { id: string; nodes: unknown[] });
  if (hasDryBox(reviewOn)) throw new Error("gather-review still shows the dry checkbox");
});

Deno.test("gather review shows the dry note when dry is on", () => {
  const entries = gatherSteps();
  const reviewEntry = entries[4];
  if (typeof reviewEntry !== "function") throw new Error("review step is not a function");
  const review = (reviewEntry as (m: Map<string, string[]>) => { nodes: unknown[] })(
    new Map([["platforms", ["Zepto"]], ["range", ["30"]], ["dry", ["dry"]]]),
  );
  const body = fullStepText(review);
  if (!body.includes("Dry run is on")) throw new Error("dry note misses the dry marker");
  if (!body.includes("first screen of this flow")) {
    throw new Error("dry note misses the Back pointer");
  }
});

Deno.test("gather review shows no dry note when dry is off", () => {
  const entries = gatherSteps();
  const reviewEntry = entries[4];
  if (typeof reviewEntry !== "function") throw new Error("review step is not a function");
  const review = (reviewEntry as (m: Map<string, string[]>) => { nodes: unknown[] })(
    new Map([["platforms", ["Zepto"]], ["range", ["30"]]]),
  );
  const body = fullStepText(review);
  if (body.includes("Dry run is on")) throw new Error("dry note shows while dry is off");
  if (body.includes("first screen of this flow")) {
    throw new Error("Back pointer shows while dry is off");
  }
});

// True when a step holds the dry checkbox field.
function hasDryBox(step: { nodes: unknown[] }): boolean {
  for (const node of step.nodes) {
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "checkbox" && rec["name"] === "dry") return true;
  }
  return false;
}

// Text of one node plus nested option, item, row, and button text.
function nodeWords(node: unknown): string[] {
  const parts: string[] = [];
  if (typeof node === "string") return [node];
  if (node === null || typeof node !== "object") return [];
  const rec = node as Record<string, unknown>;
  for (const key of ["text", "label", "hint", "name", "value", "action"]) {
    if (typeof rec[key] === "string") parts.push(rec[key] as string);
  }
  for (const key of ["items", "rows", "options", "nodes", "entries"]) {
    const arr = rec[key];
    if (Array.isArray(arr)) {
      for (const item of arr) parts.push(...nodeWords(item));
    }
  }
  // An answers entry carries its text in a values array.
  const values = rec["values"];
  if (Array.isArray(values)) {
    for (const value of values) {
      if (typeof value === "string") parts.push(value);
    }
  }
  return parts;
}

// Text of every node in a step, joined.
function fullStepText(step: { nodes: unknown[] }): string {
  return step.nodes.flatMap((node) => nodeWords(node)).join("\n");
}

Deno.test("review Done needs a run before Continue", async () => {
  const root = await Deno.makeTempDir({ prefix: "b4-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    // No runs on disk: Next is refused and names the Fetch button.
    const bare = await reviewNext(
      new Map([["platforms", ["zepto"]]]),
      {},
      { sessionId: "t-review-1" },
    );
    if (!bare?.errors?.[0]?.includes("Fetch")) {
      throw new Error("expected a Fetch-first error, got " + JSON.stringify(bare));
    }
    // A run holding zepto opens the gate.
    const dir = runsDir() + "/r1";
    Deno.mkdirSync(dir, { recursive: true });
    Deno.writeTextFileSync(
      dir + "/meta.json",
      JSON.stringify({ id: "r1", platforms: ["zepto"] }),
    );
    const open = await reviewNext(
      new Map([["platforms", ["zepto"]]]),
      {},
      { sessionId: "t-review-1" },
    );
    if (open?.errors) {
      throw new Error("expected no errors, got " + JSON.stringify(open.errors));
    }
  } finally {
    Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("manual row with store and no amount needs an amount", () => {
  const problems = manualRowProblems(
    new Map([
      ["store", ["Kirana Store"]],
      ["date", ["2026-01-02"]],
      ["item", ["Chips"]],
      ["amount", [""]],
    ]),
  );
  if (JSON.stringify(problems) !== JSON.stringify(["Row 1 needs an amount above zero."])) {
    throw new Error("wrong problems: " + JSON.stringify(problems));
  }
});

Deno.test("manual row with store and zero amount needs an amount", () => {
  const problems = manualRowProblems(
    new Map([
      ["store", ["Kirana Store"]],
      ["date", ["2026-01-02"]],
      ["item", ["Chips"]],
      ["amount", ["0"]],
    ]),
  );
  if (JSON.stringify(problems) !== JSON.stringify(["Row 1 needs an amount above zero."])) {
    throw new Error("wrong problems: " + JSON.stringify(problems));
  }
});

Deno.test("manual row with store and negative amount needs an amount", () => {
  const problems = manualRowProblems(
    new Map([
      ["store", ["Kirana Store"]],
      ["date", ["2026-01-02"]],
      ["item", ["Chips"]],
      ["amount", ["-5"]],
    ]),
  );
  if (JSON.stringify(problems) !== JSON.stringify(["Row 1 needs an amount above zero."])) {
    throw new Error("wrong problems: " + JSON.stringify(problems));
  }
});

Deno.test("manual row with amount and no store needs a store name", () => {
  const problems = manualRowProblems(
    new Map([
      ["store", [""]],
      ["date", ["2026-01-02"]],
      ["item", ["Chips"]],
      ["amount", ["120"]],
    ]),
  );
  if (JSON.stringify(problems) !== JSON.stringify(["Row 1 needs a store name."])) {
    throw new Error("wrong problems: " + JSON.stringify(problems));
  }
});

Deno.test("manual row with store and non numeric amount needs an amount", () => {
  const problems = manualRowProblems(
    new Map([
      ["store", ["Kirana Store"]],
      ["date", ["2026-01-02"]],
      ["item", ["Chips"]],
      ["amount", ["abc"]],
    ]),
  );
  if (JSON.stringify(problems) !== JSON.stringify(["Row 1 needs an amount above zero."])) {
    throw new Error("wrong problems: " + JSON.stringify(problems));
  }
});

Deno.test("fully blank spare manual row returns no message", () => {
  const problems = manualRowProblems(
    new Map([
      ["store", [""]],
      ["date", [""]],
      ["item", [""]],
      ["amount", [""]],
    ]),
  );
  if (problems.length !== 0) {
    throw new Error("expected no problems, got " + JSON.stringify(problems));
  }
});

Deno.test("two good manual rows return no message", () => {
  const problems = manualRowProblems(
    new Map([
      ["store", ["Kirana Store", "Fruit Shop"]],
      ["date", ["2026-01-02", "2026-01-03"]],
      ["item", ["Chips", "Apples"]],
      ["amount", ["120", "80"]],
    ]),
  );
  if (problems.length !== 0) {
    throw new Error("expected no problems, got " + JSON.stringify(problems));
  }
});

Deno.test("manualRows drops a row whose amount is zero", () => {
  const rows = manualRows(
    new Map([
      ["store", ["Kirana Store", "Fruit Shop"]],
      ["date", ["2026-01-02", "2026-01-03"]],
      ["item", ["Chips", "Apples"]],
      ["amount", ["0", "80"]],
    ]),
  );
  if (rows.length !== 1) throw new Error("expected 1 row, got " + rows.length);
  if (rows[0].store !== "Fruit Shop") throw new Error("wrong row survived");
  if (rows[0].amount !== 80) throw new Error("wrong amount survived");
});
Deno.test("gather review names the platforms and the day range", () => {
  // The review step used to open with an empty Gather heading. It now
  // states the picks it acts on.
  const entries = gatherSteps();
  const reviewEntry = entries[4];
  if (typeof reviewEntry !== "function") throw new Error("review step is not a function");
  const review = (reviewEntry as (m: Map<string, string[]>) => { nodes: unknown[] })(
    new Map([["platforms", ["zepto"]], ["range", ["14"]]]),
  );
  const body = fullStepText(review);
  if (!body.includes("Platforms")) throw new Error("review names no platform row");
  if (!body.includes("Zepto")) throw new Error("review misses the picked platform");
  if (!body.includes("Days back")) throw new Error("review names no day range row");
  if (!body.includes("14")) throw new Error("review misses the day count");
});

// Build the gather-accounts nodes for one answer map.
function accountsNodes(m: Map<string, string[]>): unknown[] {
  const entries = gatherSteps();
  const entry = entries[2];
  if (typeof entry !== "function") throw new Error("accounts step is not a function");
  const made = (entry as (m: Map<string, string[]>) => { id: string; nodes: unknown[] })(m);
  if (made.id !== "gather-accounts") throw new Error("wrong step id: " + made.id);
  return made.nodes;
}

// Read one field from a step node.
function nodeField(node: unknown, key: string): unknown {
  return (node as Record<string, unknown>)[key];
}

// Index of the first node holding the named text entry.
function entryIndex(nodes: unknown[], name: string): number {
  return nodes.findIndex(
    (node) => nodeField(node, "kind") === "text" && nodeField(node, "name") === name,
  );
}

// Index of the first action node holding the label.
function actionIndex(nodes: unknown[], label: string): number {
  return nodes.findIndex(
    (node) => nodeField(node, "kind") === "action" && nodeField(node, "label") === label,
  );
}

// Command array of the first action node holding the label.
function actionCommand(nodes: unknown[], label: string): string[] {
  const node = nodes.find(
    (item) => nodeField(item, "kind") === "action" && nodeField(item, "label") === label,
  );
  if (node === undefined) throw new Error("missing action: " + label);
  return nodeField(node, "command") as string[];
}

Deno.test("zomato accounts without sign in shows phone login and city save", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "zom-acc-off-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const nodes = accountsNodes(
      new Map([["platforms", ["Zomato"]], ["range", ["30"]]]),
    );
    if (entryIndex(nodes, "zomato-phone") < 0) throw new Error("phone entry misses");
    if (actionIndex(nodes, "Send the code") < 0) throw new Error("send action misses");
    if (entryIndex(nodes, "zomato-otp") < 0) throw new Error("otp entry misses");
    if (actionIndex(nodes, "Verify the code") < 0) throw new Error("verify action misses");
    if (actionIndex(nodes, "Save the city") < 0) throw new Error("city action misses");
    // The screen order is phone, send, code, verify, then city fields.
    const order = [
      entryIndex(nodes, "zomato-phone"),
      actionIndex(nodes, "Send the code"),
      entryIndex(nodes, "zomato-otp"),
      actionIndex(nodes, "Verify the code"),
      entryIndex(nodes, "zomato-city-code"),
      entryIndex(nodes, "zomato-city-name"),
      entryIndex(nodes, "zomato-city-lat"),
      entryIndex(nodes, "zomato-city-lon"),
      actionIndex(nodes, "Save the city"),
    ];
    for (let i = 1; i < order.length; i++) {
      if (!(order[i - 1] >= 0 && order[i] > order[i - 1])) {
        throw new Error("accounts nodes out of order at position " + i);
      }
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("zomato accounts with sign in shows ready and no phone entry", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "zom-acc-on-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    await Deno.mkdir(root + "/share", { recursive: true });
    await Deno.writeTextFile(
      root + "/share/zomato-tokens.json",
      JSON.stringify({ access_token: "a", refresh_token: "b" }),
    );
    const nodes = accountsNodes(
      new Map([["platforms", ["Zomato"]], ["range", ["30"]]]),
    );
    const body = nodes.flatMap((node) => nodeWords(node)).join("\n");
    if (!body.includes("Signed in and ready.")) throw new Error("ready line misses");
    if (!body.includes("Zomato")) throw new Error("zomato heading misses");
    if (entryIndex(nodes, "zomato-phone") >= 0) {
      throw new Error("phone entry shows while signed in");
    }
    if (actionIndex(nodes, "Save the city") < 0) {
      throw new Error("city action misses while signed in");
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("zomato login finish command carries phone and otp markers", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "zom-acc-cmd-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const nodes = accountsNodes(
      new Map([["platforms", ["Zomato"]], ["range", ["30"]]]),
    );
    const send = actionCommand(nodes, "Send the code");
    if (!send.includes("--zomato-login-start")) {
      throw new Error("send command misses the start flag");
    }
    if (!send.includes("--phone={zomato-phone}")) {
      throw new Error("send command misses the phone marker");
    }
    const finish = actionCommand(nodes, "Verify the code");
    if (!finish.includes("--zomato-login-finish")) {
      throw new Error("finish command misses the finish flag");
    }
    if (!finish.includes("--phone={zomato-phone}")) {
      throw new Error("finish command misses the phone marker");
    }
    if (!finish.includes("--otp={zomato-otp}")) {
      throw new Error("finish command misses the otp marker");
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("zomato city entries prefill the default city values", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "zom-acc-city-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const nodes = accountsNodes(
      new Map([["platforms", ["Zomato"]], ["range", ["30"]]]),
    );
    const want: Array<[string, string]> = [
      ["zomato-city-code", DEFAULT_LOCATION.cityId],
      ["zomato-city-name", DEFAULT_LOCATION.city],
      ["zomato-city-lat", DEFAULT_LOCATION.lat],
      ["zomato-city-lon", DEFAULT_LOCATION.long],
    ];
    for (const [name, value] of want) {
      const at = entryIndex(nodes, name);
      if (at < 0) throw new Error("city entry misses: " + name);
      if (nodeField(nodes[at], "value") !== value) {
        throw new Error("city entry holds no default: " + name);
      }
    }
    const save = actionCommand(nodes, "Save the city");
    for (
      const entry of [
        "--code={zomato-city-code}",
        "--name={zomato-city-name}",
        "--lat={zomato-city-lat}",
        "--lon={zomato-city-lon}",
      ]
    ) {
      if (!save.includes(entry)) throw new Error("city command misses " + entry);
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("manual rows saved under session A do not appear for session B", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "iso-manual-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const sidA = "iso-manual-A";
    const sidB = "iso-manual-B";
    persistManualRun(
      sidA,
      new Map([
        ["store", ["Store A"]],
        ["date", ["2026-01-02"]],
        ["item", ["Chips"]],
        ["amount", ["111"]],
        ["range", ["30"]],
      ]),
    );
    persistManualRun(
      sidB,
      new Map([
        ["store", ["Store B1", "Store B2"]],
        ["date", ["2026-01-02", "2026-01-03"]],
        ["item", ["Chips", "Apples"]],
        ["amount", ["50", "60"]],
        ["range", ["30"]],
      ]),
    );
    const entries = gatherSteps();
    const reviewEntry = entries[4];
    if (typeof reviewEntry !== "function") throw new Error("review step is not a function");
    const show = (sid: string) => {
      const made = (reviewEntry as (
        m: Map<string, string[]>,
        ctx?: { sessionId: string },
      ) => { nodes: unknown[] })(
        new Map([["platforms", ["Manual"]]]),
        { sessionId: sid },
      );
      return fullStepText(made);
    };
    const bodyA = show(sidA);
    const bodyB = show(sidB);
    if (!bodyA.includes("1 orders saved")) throw new Error("A misses its single order: " + bodyA);
    if (!bodyB.includes("2 orders saved")) throw new Error("B misses its two orders: " + bodyB);
    const idA = bodyA.match(/run (\S+?)\./)?.[1] ?? "";
    const idB = bodyB.match(/run (\S+?)\./)?.[1] ?? "";
    if (idA === "" || idB === "") throw new Error("a review names no run id");
    if (idA === idB) throw new Error("both sessions share one run id");
    // The trailing period pins the full id: B's id extends A's prefix
    // with a counter suffix, so a bare substring check misfires.
    if (bodyA.includes(idB + ".")) throw new Error("A leaks the B run id");
    if (bodyB.includes(idA + ".")) throw new Error("B leaks the A run id");
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

// Write one pick run with meta plus orders under the live runs dir.
function writePickRun(id: string, platforms: string[], orders: unknown[]): string {
  const dir = runsDir() + "/" + id;
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(
    dir + "/meta.json",
    JSON.stringify({
      id,
      label: "shop " + id,
      createdAt: "2026-09-08T09:00:00Z",
      platforms,
      rangeDays: 7,
      status: "gathered",
    }) + "\n",
  );
  Deno.writeTextFileSync(dir + "/orders.json", JSON.stringify(orders) + "\n");
  return dir;
}

// One pick order with a fixed shape.
function pickOrder(platform: string, date: string, paid: number, names: string[]) {
  return {
    id: platform + "-" + date,
    platform,
    date,
    paid,
    items: names.map((name) => ({ name, price: 10, quantity: 1 })),
    fees: { delivery: 0, packaging: 0 },
  };
}

// Build the gather-pick step for one answers map plus session id.
function pickStepFor(
  m: Map<string, string[]>,
  sid: string,
): { id: string; nodes: unknown[]; when?: (m: Map<string, string[]>) => boolean } {
  const entries = gatherSteps();
  const entry = entries[entries.length - 1];
  if (typeof entry !== "function") throw new Error("pick step is not a function");
  return (entry as (
    m: Map<string, string[]>,
    ctx?: { sessionId: string },
  ) => { id: string; nodes: unknown[]; when?: (m: Map<string, string[]>) => boolean })(m, {
    sessionId: sid,
  });
}

// Checkbox node named pick in one step.
function pickBox(step: { nodes: unknown[] }): Record<string, unknown> {
  for (const node of step.nodes) {
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "checkbox" && rec["name"] === "pick") return rec;
  }
  throw new Error("no checkbox named pick");
}

Deno.test("pick step lists one option per order with nothing ticked", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-list-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-r1", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A", "B", "C", "D"]),
      pickOrder("zepto", "2026-09-09", 120, ["E"]),
      pickOrder("blinkit", "2026-09-10", 80, ["F", "G"]),
    ]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-list-1");
    if (found.id !== "gather-pick") throw new Error("wrong step id: " + found.id);
    const box = pickBox(found);
    const options = box["options"] as Array<Record<string, unknown>>;
    const ticked = box["ticked"] as string[];
    if (options.length !== 3) throw new Error("expected 3 options, got " + options.length);
    if (ticked.length !== 0) throw new Error("a row starts ticked");
    const labels = options.map((o) => String(o["label"] ?? ""));
    const values = options.map((o) => String(o["value"] ?? ""));
    if (JSON.stringify(values) !== JSON.stringify(["0", "1", "2"])) {
      throw new Error("option values wrong: " + JSON.stringify(values));
    }
    if (!labels.includes("Zepto · 2026-09-08 · 530.00 · 4 items")) {
      throw new Error("first label wrong: " + JSON.stringify(labels));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick next with nothing ticked returns the tick error", async () => {
  const out = await pickNext(new Map(), {}, { sessionId: "t-pick-err-1" });
  if (
    JSON.stringify(out?.errors ?? null) !== JSON.stringify(["Tick at least one order to split."])
  ) {
    throw new Error("wrong errors: " + JSON.stringify(out));
  }
});

Deno.test("pick next with two orders ticked writes the indexes", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-save-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const sid = "t-pick-save-1";
    writePickRun("pick-r2", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A"]),
      pickOrder("zepto", "2026-09-09", 120, ["B"]),
      pickOrder("zepto", "2026-09-10", 80, ["C"]),
    ]);
    const out = await pickNext(
      new Map([["platforms", ["zepto"]]]),
      { pick: ["2", "0"] },
      { sessionId: sid },
    );
    if (out?.errors) throw new Error("expected no errors, got " + JSON.stringify(out.errors));
    const meta = JSON.parse(await Deno.readTextFile(runsDir() + "/pick-r2/meta.json"));
    if (JSON.stringify(meta.picked) !== JSON.stringify([0, 2])) {
      throw new Error("picked wrong: " + JSON.stringify(meta.picked));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick-all re-renders the same step with every option ticked", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-all-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const sid = "t-pick-all-1";
    writePickRun("pick-r3", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A"]),
      pickOrder("zepto", "2026-09-09", 120, ["B"]),
    ]);
    const out = await pickAll(new Map(), {}, { sessionId: sid });
    if (out !== undefined) {
      throw new Error("pick-all misses the silent re-render: " + JSON.stringify(out));
    }
    const found = pickStepFor(new Map([["platforms", ["zepto"]]]), sid);
    const ticked = pickBox(found)["ticked"] as string[];
    if (JSON.stringify(ticked) !== JSON.stringify(["0", "1"])) {
      throw new Error("pick-all ticks wrong: " + JSON.stringify(ticked));
    }
    const meta = JSON.parse(await Deno.readTextFile(runsDir() + "/pick-r3/meta.json"));
    if ("picked" in meta) throw new Error("pick-all saved the pick");
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick-none re-renders with nothing ticked", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-none-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const sid = "t-pick-none-1";
    writePickRun("pick-r4", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A"]),
      pickOrder("zepto", "2026-09-09", 120, ["B"]),
    ]);
    const out = await pickNone(new Map(), { pick: ["0", "1"] }, { sessionId: sid });
    if (out !== undefined) {
      throw new Error("pick-none misses the silent re-render: " + JSON.stringify(out));
    }
    const found = pickStepFor(
      new Map([["platforms", ["zepto"]], ["pick", ["0", "1"]]]),
      sid,
    );
    const ticked = pickBox(found)["ticked"] as string[];
    if (ticked.length !== 0) throw new Error("pick-none leaves a tick: " + JSON.stringify(ticked));
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick screen declares its bar with both actions and next", async () => {
  // Build one run. Read its bar. Check both actions plus Next.
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-bar-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-bar-1", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A"]),
    ]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-bar-1") as unknown as {
      id: string;
      nav?: {
        back?: boolean;
        actions?: Array<{ id: string; label: string; run?: unknown }>;
        next?: { label: string; run?: unknown };
      };
    };
    if (found.id !== "gather-pick") throw new Error("wrong step id: " + found.id);
    const nav = found.nav;
    if (nav?.back !== true) throw new Error("bar misses Back");
    const actions = nav.actions ?? [];
    if (actions.length !== 2) throw new Error("bar misses one action");
    if (actions[0].id !== "pick-all") throw new Error("first action misses its id");
    if (actions[0].label !== "Select all") throw new Error("first action misses its label");
    if (typeof actions[0].run !== "function") throw new Error("first action misses its run");
    if (actions[1].id !== "pick-none") throw new Error("second action misses its id");
    if (actions[1].label !== "Select none") throw new Error("second action misses its label");
    if (typeof actions[1].run !== "function") throw new Error("second action misses its run");
    if (nav.next?.label !== "Next") throw new Error("bar misses Next");
    if (typeof nav.next?.run !== "function") throw new Error("Next misses its run");
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick screen with no run points at the saved list", () => {
  // A gather costs a real fetch, so this screen never leaves the reader
  // stuck. It offers the resume picker beside Back.
  const empty = pickStepFor(new Map(), "t-pick-empty-1") as unknown as {
    id: string;
    nodes: Array<{ kind: string; text?: string }>;
    nav?: { back?: boolean; goto?: { step: string; label: string } };
  };
  if (empty.id !== "gather-pick") throw new Error("wrong step id: " + empty.id);
  if (empty.nav?.back !== true) throw new Error("placeholder misses Back");
  if (empty.nav?.goto?.step !== "resume") {
    throw new Error("placeholder misses the resume route");
  }
  if (empty.nav?.goto?.label !== "Pick a saved run") {
    throw new Error("placeholder misses the route label");
  }
  const text = empty.nodes.map((node) => node.text ?? "").join(" ");
  if (!text.includes("Saved runs stay on disk")) {
    throw new Error("placeholder misses the reassurance line");
  }
});

Deno.test("pick step is skipped when the dry run box is ticked", () => {
  const live = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-dry-1");
  if (live.id !== "gather-pick") throw new Error("pick step misses its id");
  if (typeof live.when !== "function") throw new Error("pick step misses its condition");
  if (live.when(new Map([["dry", ["dry"]]])) !== false) {
    throw new Error("dry run does not skip the pick step");
  }
  if (live.when(new Map()) !== true) throw new Error("live run skips the pick step");
});

Deno.test("sign in action for zepto carries the login flag", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-login-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const nodes = accountsNodes(new Map([["platforms", ["Zepto"]]]));
    const command = actionCommand(nodes, "Sign in to Zepto");
    if (!command.includes("--login=zepto")) {
      throw new Error("sign in misses the login flag: " + JSON.stringify(command));
    }
    if (command.some((part) => part.startsWith("--platforms="))) {
      throw new Error("sign in still carries a platforms flag: " + JSON.stringify(command));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick option hint names the first five items plus the rest", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-hint-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-h1", ["zepto"], [{
      id: "zepto-2026-09-08",
      platform: "zepto",
      date: "2026-09-08",
      paid: 530,
      items: [
        { name: "Milk", price: 10, quantity: 2 },
        { name: "Bread", price: 10, quantity: 1 },
        { name: "Eggs", price: 10, quantity: 3 },
        { name: "Butter", price: 10, quantity: 1 },
        { name: "Rice", price: 10, quantity: 1 },
        { name: "Sugar", price: 10, quantity: 1 },
      ],
      fees: { delivery: 0, packaging: 0 },
    }]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-hint-1");
    const options = pickBox(found)["options"] as Array<Record<string, unknown>>;
    if (options.length !== 1) throw new Error("expected 1 option");
    if (options[0]["label"] !== "Zepto · 2026-09-08 · 530.00 · 6 items") {
      throw new Error("label changed: " + JSON.stringify(options[0]["label"]));
    }
    if (options[0]["hint"] !== "2 Milk, Bread, 3 Eggs, Butter, Rice +1 more") {
      throw new Error("hint wrong: " + JSON.stringify(options[0]["hint"]));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick option hint for a single item names it with no plus marker", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-hint-one-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-h2", ["zepto"], [{
      id: "zepto-2026-09-08",
      platform: "zepto",
      date: "2026-09-08",
      paid: 40,
      items: [{ name: "Bread", price: 40, quantity: 1 }],
      fees: { delivery: 0, packaging: 0 },
    }]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-hint-2");
    const options = pickBox(found)["options"] as Array<Record<string, unknown>>;
    if (options[0]["hint"] !== "Bread") {
      throw new Error("hint wrong: " + JSON.stringify(options[0]["hint"]));
    }
    if (String(options[0]["hint"] ?? "").includes("+")) {
      throw new Error("single item hint carries a plus marker");
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick option for an order with no items has no hint", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-hint-empty-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-h3", ["zepto"], [{
      id: "zepto-2026-09-08",
      platform: "zepto",
      date: "2026-09-08",
      paid: 0,
      items: [],
      fees: { delivery: 0, packaging: 0 },
    }]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-hint-3");
    const options = pickBox(found)["options"] as Array<Record<string, unknown>>;
    if ("hint" in options[0]) {
      throw new Error("empty order carries a hint: " + JSON.stringify(options[0]["hint"]));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("gatherPickRunId prefers the resume choice over the newest run", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-resume-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-rs-a", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A"]),
    ]);
    writePickRun("pick-rs-b", ["zepto"], [
      pickOrder("zepto", "2026-09-09", 120, ["B"]),
    ]);
    const found = gatherPickRunId(
      new Map([["platforms", ["zepto"]], ["resume-pick", ["pick-rs-a"]]]),
      "t-pick-resume-1",
    );
    if (found !== "pick-rs-a") {
      throw new Error("resume choice lost: " + JSON.stringify(found));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick step seeds ticks from the saved run when none were posted", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-seed-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-s1", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A"]),
      pickOrder("zepto", "2026-09-09", 120, ["B"]),
      pickOrder("zepto", "2026-09-10", 80, ["C"]),
    ]);
    const metaPath = runsDir() + "/pick-s1/meta.json";
    const meta = JSON.parse(await Deno.readTextFile(metaPath));
    meta.picked = [0, 2, 9];
    await Deno.writeTextFile(metaPath, JSON.stringify(meta, null, 2) + "\n");
    const found = pickStepFor(new Map([["platforms", ["zepto"]]]), "t-pick-seed-1");
    const ticked = pickBox(found)["ticked"] as string[];
    if (JSON.stringify(ticked) !== JSON.stringify(["0", "2"])) {
      throw new Error("seeded ticks wrong: " + JSON.stringify(ticked));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

// The routeStatus tests live in tests/expense-split-f6.test.ts, which this
// pass leaves untouched. This one covers the new gathered route here.
Deno.test("gathered runs resume on the pick orders screen", () => {
  if (routeStatus("gathered") !== "gather-pick") {
    throw new Error("gathered misses gather-pick: " + routeStatus("gathered"));
  }
});

// The manual screen states its own condition now. A jump from the
// accounts step used to skip it, which kept the rule in the submit hook
// rather than on the step it governs.
Deno.test("the manual screen applies only when Manual is picked", () => {
  const built = gatherSteps().map((entry) =>
    typeof entry === "function" ? entry(new Map([["platforms", ["Manual"]]])) : entry
  );
  const manual = built.find((s) => (s as { id: string }).id === "gather-manual") as
    | { when?: (m: Map<string, string[]>) => boolean }
    | undefined;
  if (manual === undefined) throw new Error("no gather-manual step");
  if (manual.when === undefined) throw new Error("gather-manual carries no condition");
  if (manual.when(new Map([["platforms", ["Manual"]]])) !== true) {
    throw new Error("the screen must apply when Manual is picked");
  }
  if (manual.when(new Map([["platforms", ["Zepto"]]])) !== false) {
    throw new Error("the screen must not apply without Manual");
  }
});

// Prove the tidy helper drops pack, weight and volume text.
Deno.test("tidy product name drops pack weight and volume", () => {
  const cases: Array<[string, string]> = [
    ["Latte (250 ml)", "Latte"],
    ["Desi Nachos (100g)", "Desi Nachos"],
    ["Marlboro Advance Compact (1 pack (10 pcs))", "Marlboro Advance Compact"],
    [
      "Nissin Carbonara Korean Ramen with Bull's-eye Eggs (2 Pcs) (2 combo)",
      "Nissin Carbonara Korean Ramen with Bull's-eye Eggs",
    ],
    [
      "Decathlon Nabaiji Adult UV Protected Swimming Goggles | Black | L (1 pc)",
      "Decathlon Nabaiji Adult UV Protected Swimming Goggles | Black | L",
    ],
    ["Latte (Iced)", "Latte (Iced)"],
  ];
  for (const [input, want] of cases) {
    const got = tidyProductName(input);
    if (got !== want) throw new Error("tidy wrong for " + input + ": " + got);
  }
  if (!isLedgerRow("[Fees]")) throw new Error("ledger check misses [Fees]");
});

// Prove the hint names only the product beside a fee row.
Deno.test("pick hint drops the fee row and tidies the product", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-ledger-hint-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-ledger-1", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 200, ["Latte (250 ml)", "[Fees]"]),
    ]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-ledger-1");
    const options = pickBox(found)["options"] as Array<Record<string, unknown>>;
    if (options[0]["hint"] !== "Latte") {
      throw new Error("hint wrong: " + JSON.stringify(options[0]["hint"]));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

// Prove the label counts only the product beside a fee row.
Deno.test("pick label counts only the product beside a fee row", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-ledger-count-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-ledger-2", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 200, ["Latte (250 ml)", "[Fees]"]),
    ]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-ledger-2");
    const options = pickBox(found)["options"] as Array<Record<string, unknown>>;
    if (options[0]["label"] !== "Zepto · 2026-09-08 · 200.00 · 1 item") {
      throw new Error("label wrong: " + JSON.stringify(options[0]["label"]));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

// Prove an order with only ledger rows carries no hint.
Deno.test("pick option with only ledger rows carries no hint", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-ledger-only-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-ledger-3", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 20, ["[Fees]", "[Rounding]", "[Screenshot only]"]),
    ]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-ledger-3");
    const options = pickBox(found)["options"] as Array<Record<string, unknown>>;
    if ("hint" in options[0]) {
      throw new Error("ledger only order carries a hint: " + JSON.stringify(options[0]["hint"]));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

// Prove the five item limit still applies after ledger rows drop.
Deno.test("pick hint keeps the five item limit after ledger rows drop", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-ledger-limit-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writePickRun("pick-ledger-4", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 600, ["A", "B", "C", "D", "E", "F", "[Fees]"]),
    ]);
    const found = pickStepFor(new Map([["platforms", ["Zepto"]]]), "t-pick-ledger-4");
    const options = pickBox(found)["options"] as Array<Record<string, unknown>>;
    if (options[0]["hint"] !== "A, B, C, D, E +1 more") {
      throw new Error("hint wrong: " + JSON.stringify(options[0]["hint"]));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("pick next sends the user to the People step after a good tick post", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "pick-goto-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const sid = "t-pick-goto-1";
    writePickRun("pick-goto-1", ["zepto"], [
      pickOrder("zepto", "2026-09-08", 530, ["A"]),
      pickOrder("zepto", "2026-09-09", 120, ["B"]),
    ]);
    const out = await pickNext(
      new Map([["platforms", ["zepto"]]]),
      { pick: ["0"] },
      { sessionId: sid },
    );
    if (out?.errors) throw new Error("expected no errors, got " + JSON.stringify(out.errors));
    if (JSON.stringify(out) !== JSON.stringify({ goto: "split-people" })) {
      throw new Error("pick next misses the People jump: " + JSON.stringify(out));
    }
    const meta = JSON.parse(await Deno.readTextFile(runsDir() + "/pick-goto-1/meta.json"));
    if (JSON.stringify(meta.picked) !== JSON.stringify([0])) {
      throw new Error("picked wrong: " + JSON.stringify(meta.picked));
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

// Prove the shared summary names four items with no tail.
Deno.test("item summary names four items with no tail", () => {
  const got = itemSummary([
    { name: "A" },
    { name: "B" },
    { name: "C" },
    { name: "D" },
  ]);
  if (got !== "A, B, C, D") throw new Error("summary wrong: " + JSON.stringify(got));
});

// Prove the shared summary names five items and counts the rest.
Deno.test("item summary names five items and counts the rest", () => {
  const got = itemSummary([
    { name: "A" },
    { name: "B" },
    { name: "C" },
    { name: "D" },
    { name: "E" },
    { name: "F" },
    { name: "G" },
  ]);
  if (got !== "A, B, C, D, E +2 more") {
    throw new Error("summary wrong: " + JSON.stringify(got));
  }
});

// Prove the shared summary merges repeats and drops ledger rows.
Deno.test("item summary merges repeats and drops ledger rows", () => {
  const got = itemSummary([
    { name: "Latte (250 ml)" },
    { name: "Latte (250 ml)" },
    { name: "[Fees]" },
  ]);
  if (got !== "2 Latte") throw new Error("summary wrong: " + JSON.stringify(got));
});

// A saved profile proves a sign-in happened once, never that it still
// works. Swiggy expired a session on 2026-09-17 while this screen read
// "ready" and drew no way back in.
Deno.test("a signed in browser platform still offers a sign in action", async () => {
  const root = await Deno.makeTempDir({ dir: "/tmp", prefix: "acc-cached-" });
  const prev = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    await Deno.mkdir(root + "/share/profiles/swiggy", { recursive: true });
    const nodes = accountsNodes(
      new Map([["platforms", ["Swiggy"]], ["range", ["30"]]]),
    );
    if (actionIndex(nodes, "Sign in to Swiggy again") < 0) {
      throw new Error("a cached platform hides the sign in action");
    }
  } finally {
    if (prev === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", prev);
    await cleanup(root);
  }
});

Deno.test("every Fetch action carries the same into value ending with multi", () => {
  const entries = gatherSteps();
  const reviewEntry = entries[4];
  if (typeof reviewEntry !== "function") throw new Error("review step is not a function");
  const sid = "t-into-shared-1";
  const answers = new Map([
    ["platforms", ["Zomato", "Blinkit", "Swiggy"]],
    ["range", ["30"]],
  ]);
  const first = (reviewEntry as (
    m: Map<string, string[]>,
    ctx?: { sessionId: string },
  ) => { nodes: unknown[] })(answers, { sessionId: sid });
  const commands = first.nodes
    .filter((node) =>
      (node as Record<string, unknown>)["kind"] === "action" &&
      String((node as Record<string, unknown>)["label"] ?? "").startsWith("Fetch ")
    )
    .map((node) => (node as Record<string, unknown>)["command"] as string[]);
  if (commands.length !== 3) throw new Error("expected 3 Fetch actions");
  const intos = commands.map((command) => command.find((part) => part.startsWith("--into=")));
  if (intos.some((into) => into === undefined)) {
    throw new Error("a Fetch action misses --into: " + JSON.stringify(commands));
  }
  if (new Set(intos).size !== 1) {
    throw new Error("Fetch actions share no into value: " + JSON.stringify(intos));
  }
  if (!String(intos[0]).endsWith("-multi")) {
    throw new Error("into value misses the multi suffix: " + String(intos[0]));
  }
  const second = (reviewEntry as (
    m: Map<string, string[]>,
    ctx?: { sessionId: string },
  ) => { nodes: unknown[] })(answers, { sessionId: sid });
  const again = second.nodes
    .filter((node) =>
      (node as Record<string, unknown>)["kind"] === "action" &&
      String((node as Record<string, unknown>)["label"] ?? "").startsWith("Fetch ")
    )
    .map((node) =>
      ((node as Record<string, unknown>)["command"] as string[]).find((part) =>
        part.startsWith("--into=")
      )
    );
  if (JSON.stringify(again) !== JSON.stringify(intos)) {
    throw new Error("the into value changed across renders");
  }
});
