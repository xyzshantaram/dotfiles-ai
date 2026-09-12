// End to end drive for ticket F5: manual expenses become orders in a
// written run, then the split stage reads and splits that run. Also
// proves the Zomato phone and OTP fields are gone.

import { createWizard } from "../wizardkit/mod.ts";
import { gatherSteps, manualPicked, manualRowProblems, manualRows, persistManualRun } from "../wizards/expense-split/gather.ts";
import { DEFAULT_LOCATION } from "../src/zomato.ts";
import { splitSteps } from "../wizards/expense-split/split.ts";
import { runsDir } from "../src/runstate.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

// Fail when the body misses a marker.
function assertStringIncludes(body: string, mark: string): void {
  if (!body.includes(mark)) {
    throw new Error("expected " + JSON.stringify(mark) + " in body");
  }
}

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

// Fail when the run status is not the gathered shape.
function assertMatch(value: string, re: RegExp): void {
  if (!re.test(value)) throw new Error(value + " fails " + String(re));
}
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
  const res = await handle(
    new Request("http://x/step", { method: "POST", body: form }),
  );
  return await res.text();
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

  // The write happens here, not during render.
  persistManualRun(rowMap);

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
  persistManualRun(rowMap);
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

  // Split the run: people, payer, who am I, run id.
  await post(handle, {
    step: "split-people",
    action: "next",
    "person-1": "Asha",
    "person-2": "Vijay",
  });
  await post(handle, { step: "split-payer", action: "next", payer: "Asha" });
  await post(handle, { step: "split-me", action: "next", me: "Asha" });
  await post(handle, { step: "split-run", action: "next", run: dir });

  // Both lines split equally in one post.
  await post(handle, {
    step: "split-item",
    action: "nextline",
    "mode-0": "Equal",
    "who-0": ["Asha", "Vijay"],
    "mode-1": "Equal",
    "who-1": ["Asha", "Vijay"],
  });
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
    // Render the manual step with rows posted. It must write nothing.
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
    if (before.length !== 0) {
      throw new Error("render wrote a run: " + before.join(", "));
    }
    if (body.includes("Saved")) throw new Error("render still names a saved run");
    // Direct persist writes exactly one run with one order.
    persistManualRun(
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

Deno.test("zomato step has no dead phone or otp fields", async () => {
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
  const liveCopy = body.includes("Zomato: ready.") ||
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
  for (const key of ["items", "rows", "options", "nodes", "buttons", "entries"]) {
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
  const { onSubmit } = await import("../wizards/expense-split.ts");
  const root = await Deno.makeTempDir({ prefix: "b4-state-" });
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    // No runs on disk: Next is refused and names the Fetch button.
    const bare = await onSubmit({ platforms: ["zepto"] }, "gather-review");
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
    const open = await onSubmit({ platforms: ["zepto"] }, "gather-review");
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
    if (!body.includes("Zomato: ready.")) throw new Error("ready line misses");
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
