// Tests for the browser push engine. A fake PushApi stands in for
// SplitwiseAPI, so no network call happens. Temp dirs hold the pushed
// map, the state root, and the split files.
import {
  applyCutoff,
  executePush,
  prepareSource,
  prepareSplitwise,
  type PushApi,
  pushSessionFor,
  resetPush,
  resolveNamePicks,
} from "../wizards/expense-split/push-engine.ts";
import { loadPushed } from "../src/splitwise.ts";
import { pushedFilePath } from "../src/paths.ts";
import { pushSteps, sourceStep } from "../wizards/expense-split/push.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

// One split line.
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

// A finished output doc with three orders on three dates.
function doc(people?: string[]) {
  const chosen = people ?? ["Ann", "Bob"];
  return {
    split_at: "2026-01-06T09:00:00Z",
    people: chosen,
    splits: [
      line("Milk", "o1", "2026-01-01T10:00:00", 100, 60, 40),
      line("Eggs", "o2", "2026-01-02T11:00:00", 50, 25, 25),
      line("Chips", "o3", "2026-01-05T12:00:00", 30, 30, 0),
    ],
    totals: { Ann: 115, Bob: 65 },
    settlements: [{ from: "Bob", to: "Ann", amount: 65 }],
  };
}

// Fake API with scripted calls. Records createExpense payloads and
// comments, and hands out expense ids in sequence.
function fakeApi(options?: { failExpense?: boolean }) {
  const expenses: Record<string, string>[] = [];
  const comments: string[] = [];
  let nextId = 101;
  const api: PushApi = {
    getCurrentUser: () => Promise.resolve({ first_name: "Ann", last_name: "", id: 1 }),
    getFriends: () => Promise.resolve([{ first_name: "Bob", last_name: "", id: 2 }]),
    getGroups: () => Promise.resolve([{ name: "Trip", id: 7 }]),
    createExpense: (data) => {
      if (options?.failExpense) throw new Error("splitwise 500 secret=hushhush");
      expenses.push({ ...data });
      return Promise.resolve({ expenses: [{ id: nextId++ }] });
    },
    createComment: (_eid, content) => {
      comments.push(content);
      return Promise.resolve();
    },
  };
  return { api, expenses, comments };
}

// Per-test scratch dirs and env, set once for this file.
const root = await Deno.makeTempDir({ prefix: "push-engine-test-" });
Deno.env.set("SPLIT_UTILS_STATE", root + "/state");
const SPLIT_FILE = root + "/output.json";
await Deno.writeTextFile(SPLIT_FILE, JSON.stringify(doc()));

// Reusable cleanup between tests. Each test gets its own pushed map,
// so fingerprints from one test never leak into the next.
let runCounter = 0;
async function fresh(...sids: string[]): Promise<void> {
  for (const sid of sids) resetPush(sid);
  runCounter += 1;
  try {
    await Deno.remove(pushedFilePath());
  } catch {
    // Missing file means a clean map already.
  }
}

Deno.test("push flow: cutoff filters, choices push and skip, fingerprint lands", async () => {
  await fresh("t-push-1");
  const src = await prepareSource("t-push-1", "Split JSON file", "", SPLIT_FILE);
  assert(src.ok, "source loads");
  const { api, expenses, comments } = fakeApi();
  const sw = await prepareSplitwise("t-push-1", api);
  assert(sw.ok, "splitwise prepares");
  assert(pushSessionFor("t-push-1").mode === "live", "live mode");
  assert(pushSessionFor("t-push-1").signedInAs === "Ann", "signed in as Ann");
  assert(pushSessionFor("t-push-1").nameMap.get("Ann") === 1, "Ann mapped");
  assert(pushSessionFor("t-push-1").nameMap.get("Bob") === 2, "Bob mapped by first name");

  const cut = applyCutoff("t-push-1", "2026-01-02");
  assert(cut.ok, "cutoff valid");
  assert(pushSessionFor("t-push-1").droppedByCutoff === 1, "o3 dropped by cutoff");
  assert(pushSessionFor("t-push-1").groups.length === 2, "two orders kept");
  assert(pushSessionFor("t-push-1").groups.every((o) => o[0].order_id !== "o3"), "o3 excluded");

  pushSessionFor("t-push-1").groupId = 7;
  const done = await executePush("t-push-1", { o1: "Push", o2: "Skip" });
  assert(done.ok, "push ok");
  const out = pushSessionFor("t-push-1").outcome!;
  assert(out.pushed === 1, "one order pushed");
  assert(out.skippedByChoice === 1, "one order skipped by choice");
  assert(out.skippedDupes === 0, "no dupes first run");
  assert(out.totalRs === 100, "total is the pushed order only");
  assert(expenses.length === 1, "one createExpense call");
  assert(expenses[0]["group_id"] === "7", "group id sent");
  assert(expenses[0]["currency_code"] === "INR", "currency from settings");
  assert(expenses[0]["users__0__user_id"] === "1", "payer user id");
  assert(expenses[0]["users__0__paid_share"] === "100.00", "payer paid total");
  assert(expenses[0]["users__1__owed_share"] === "40.00", "Bob owed share");
  assert(comments.length === 1 && comments[0].includes("Milk (100)"), "itemized comment");
  const pushedMap = await loadPushed();
  const fps = Object.keys(pushedMap);
  assert(fps.length === 1 && pushedMap[fps[0]] === 101, "fingerprint saved with expense id");
});

Deno.test("rerun skips the already-sent order by fingerprint", async () => {
  await fresh("t-push-2");
  await prepareSource("t-push-2", "Split JSON file", "", SPLIT_FILE);
  await prepareSplitwise("t-push-2", fakeApi().api);
  applyCutoff("t-push-2", "2026-01-02");
  const first = await executePush("t-push-2", { o1: "Push", o2: "Skip" });
  assert(first.ok, "first push ok");
  // Rerun against the same pushed store. No choices at all: unpicked
  // orders stay out, and o1 is now a dupe.
  resetPush("t-push-2");
  await prepareSource("t-push-2", "Split JSON file", "", SPLIT_FILE);
  const { api, expenses } = fakeApi();
  await prepareSplitwise("t-push-2", api);
  applyCutoff("t-push-2", "2026-01-02");
  const done = await executePush("t-push-2", {});
  assert(done.ok, "rerun ok");
  const out = pushSessionFor("t-push-2").outcome!;
  assert(out.skippedDupes === 1, "o1 skipped as dupe");
  assert(out.pushed === 0, "nothing pushed twice");
  assert(expenses.length === 0, "no createExpense on rerun");
});

Deno.test("stop choice ends the loop and keeps later orders out", async () => {
  await fresh("t-push-3");
  await prepareSource("t-push-3", "Split JSON file", "", SPLIT_FILE);
  const { api, expenses } = fakeApi();
  await prepareSplitwise("t-push-3", api);
  applyCutoff("t-push-3", "2026-01-02");
  const done = await executePush("t-push-3", { o1: "Stop" });
  assert(done.ok, "stop run ok");
  const out = pushSessionFor("t-push-3").outcome!;
  assert(out.stopped, "stopped flag set");
  assert(out.pushed === 0, "stop before push");
  assert(expenses.length === 0, "no expense after stop");
});

Deno.test("failed createExpense takes the failPush path, fingerprint unsaved", async () => {
  await fresh("t-push-4");
  await prepareSource("t-push-4", "Split JSON file", "", SPLIT_FILE);
  const { api } = fakeApi({ failExpense: true });
  await prepareSplitwise("t-push-4", api);
  applyCutoff("t-push-4", "2026-01-02");
  const done = await executePush("t-push-4", { o1: "Push" });
  assert(!done.ok, "push reports failure");
  assert(!done.ok && !done.error.includes("hushhush"), "no raw error text");
  const out = pushSessionFor("t-push-4").outcome!;
  assert(out.failed, "outcome marked failed");
  assert(out.pushed === 0, "nothing counted as pushed");
  const pushedMap = await loadPushed();
  assert(Object.keys(pushedMap).length === 0, "no fingerprint saved");
});

Deno.test("no Splitwise access falls back to an aggregate summary file", async () => {
  await fresh("t-push-5");
  // Push one order live first, so the fallback has a dupe to exclude.
  await prepareSource("t-push-5", "Split JSON file", "", SPLIT_FILE);
  await prepareSplitwise("t-push-5", fakeApi().api);
  applyCutoff("t-push-5", "2026-01-02");
  const first = await executePush("t-push-5", { o1: "Push", o2: "Skip" });
  assert(first.ok, "first push ok");
  resetPush("t-push-5");
  await prepareSource("t-push-5", "Split JSON file", "", SPLIT_FILE);
  // No api override: env discovery finds nothing, so aggregate mode.
  const sw = await prepareSplitwise("t-push-5");
  assert(sw.ok, "fallback prepares");
  assert(pushSessionFor("t-push-5").mode === "aggregate", "aggregate mode");
  applyCutoff("t-push-5", "2026-01-02");
  const done = await executePush("t-push-5", {});
  assert(done.ok, "aggregate run ok");
  const out = pushSessionFor("t-push-5").outcome!;
  assert(out.aggregateFile !== null, "summary file written");
  if (out.aggregateFile !== null) {
    const text = await Deno.readTextFile(out.aggregateFile);
    assert(text.includes("Summary expense"), "summary content present");
    assert(out.aggregateFile.startsWith(root), "file sits beside the source");
  }
  assert(out.skippedDupes === 1, "dupe excluded from the summary");
  assert(out.totalRs === 50, "only the unpushed order totals");
});

Deno.test("full push through a run id archives the run", async () => {
  await fresh("t-push-6");
  // Stage one assigned run under the state root.
  const runDir = root + "/state/share/runs/r1";
  await Deno.mkdir(runDir, { recursive: true });
  await Deno.writeTextFile(
    runDir + "/meta.json",
    JSON.stringify({
      id: "r1",
      label: "test",
      createdAt: "2026-01-06",
      platforms: ["zepto"],
      rangeDays: 7,
      status: "assigned",
      outputFile: "output.json",
    }),
  );
  const runOut = root + "/state/share/runs/r1-only-output.json";
  await Deno.writeTextFile(runOut, JSON.stringify(doc()));
  await Deno.writeTextFile(runDir + "/output.json", JSON.stringify(doc()));
  const src = await prepareSource("t-push-6", "Assigned run id", "r1", "");
  assert(src.ok, "run id resolves");
  assert(pushSessionFor("t-push-6").runId === "r1", "run id staged");
  const { api } = fakeApi();
  await prepareSplitwise("t-push-6", api);
  applyCutoff("t-push-6", "2026-01-06");
  const done = await executePush("t-push-6", { o1: "Push", o2: "Push" });
  assert(done.ok, "push ok");
  const out = pushSessionFor("t-push-6").outcome!;
  assert(out.pushed === 2, "both kept orders pushed");
  assert(out.archived, "run archived");
  // The live run dir moves into the cache archive.
  let liveGone = false;
  try {
    await Deno.stat(runDir);
  } catch {
    liveGone = true;
  }
  assert(liveGone, "live run dir removed");
  await Deno.stat(root + "/state/cache/runs/r1");
  // Stop with a run id keeps the run in place.
  await fresh("t-push-6");
  await Deno.mkdir(runDir, { recursive: true });
  await Deno.writeTextFile(
    runDir + "/meta.json",
    JSON.stringify({
      id: "r1",
      label: "test",
      createdAt: "2026-01-06",
      platforms: ["zepto"],
      rangeDays: 7,
      status: "assigned",
    }),
  );
  await prepareSource("t-push-6", "Assigned run id", "r1", "");
  await prepareSplitwise("t-push-6", fakeApi().api);
  applyCutoff("t-push-6", "2026-01-06");
  const stopRun = await executePush("t-push-6", { o1: "Stop" });
  assert(stopRun.ok, "stopped run ok");
  assert(pushSessionFor("t-push-6").outcome!.archived === false, "no archive on stop");
});

// Fake API where two members share the first name Bob.
function dupApi() {
  const api: PushApi = {
    getCurrentUser: () => Promise.resolve({ first_name: "Ann", last_name: "", id: 1 }),
    getFriends: () =>
      Promise.resolve([
        { first_name: "Bob", last_name: "One", id: 2 },
        { first_name: "Bob", last_name: "Two", id: 3 },
      ]),
    getGroups: () => Promise.resolve([{ name: "Trip", id: 7 }]),
    createExpense: () => Promise.resolve({ expenses: [{ id: 101 }] }),
    createComment: () => Promise.resolve(),
  };
  return api;
}

Deno.test("ambiguous name shows candidates and the radio pick resolves it", async () => {
  await fresh("t-push-7");
  await prepareSource("t-push-7", "Split JSON file", "", SPLIT_FILE);
  const sw = await prepareSplitwise("t-push-7", dupApi());
  assert(!sw.ok && sw.needsNamePick === true, "setup routes to the name picker");
  assert(pushSessionFor("t-push-7").namePicks.length === 1, "one pending person");
  assert(pushSessionFor("t-push-7").namePicks[0].person === "Bob", "Bob is the pending person");
  assert(
    JSON.stringify(pushSessionFor("t-push-7").namePicks[0].candidates.map((m) => m.id)) === "[2,3]",
    "both Bobs listed as candidates",
  );
  // A missing pick is an error, not a silent skip.
  const empty = resolveNamePicks("t-push-7", {});
  assert(!empty.ok, "no pick errors out");
  // The radio pick stashes a resolution and the setup completes.
  const picked = resolveNamePicks("t-push-7", { "pick:Bob": ["3"] });
  assert(picked.ok, "radio pick accepted");
  const sw2 = await prepareSplitwise("t-push-7", dupApi());
  assert(sw2.ok, "setup finishes after the pick");
  assert(pushSessionFor("t-push-7").nameMap.get("Bob") === 3, "Bob maps to the picked id 3");
  applyCutoff("t-push-7", "2026-01-02");
  pushSessionFor("t-push-7").groupId = 7;
  const done = await executePush("t-push-7", { o1: "Push" });
  assert(done.ok, "push ok");
  const pushedMap = await loadPushed();
  assert(Object.keys(pushedMap).length === 1, "order pushed once");
});

Deno.test("unmatched person accepts a hand-typed id", async () => {
  await fresh("t-push-8");
  const caraFile = root + "/output-cara.json";
  await Deno.writeTextFile(caraFile, JSON.stringify(doc(["Ann", "Cara"])));
  await prepareSource("t-push-8", "Split JSON file", "", caraFile);
  const sw = await prepareSplitwise("t-push-8", fakeApi().api);
  assert(!sw.ok && sw.needsNamePick === true, "setup routes to the name picker");
  assert(pushSessionFor("t-push-8").namePicks.length === 1, "one pending person");
  assert(pushSessionFor("t-push-8").namePicks[0].person === "Cara", "Cara is the pending person");
  assert(pushSessionFor("t-push-8").namePicks[0].candidates.length === 0, "no candidates for Cara");
  // A bad hand-typed id errors before anything is stashed.
  const bad = resolveNamePicks("t-push-8", { "manual:Cara": ["abc"] });
  assert(!bad.ok, "bad id errors out");
  const good = resolveNamePicks("t-push-8", { "manual:Cara": ["9"] });
  assert(good.ok, "manual id accepted");
  const sw2 = await prepareSplitwise("t-push-8", fakeApi().api);
  assert(sw2.ok, "setup finishes after the manual id");
  assert(pushSessionFor("t-push-8").nameMap.get("Cara") === 9, "Cara maps to id 9");
  applyCutoff("t-push-8", "2026-01-02");
  pushSessionFor("t-push-8").groupId = 7;
  const done = await executePush("t-push-8", { o1: "Push" });
  assert(done.ok, "push ok");
  const pushedMap = await loadPushed();
  assert(Object.keys(pushedMap).length === 1, "order pushed once");
});

Deno.test("unique first name maps straight away with no pick", async () => {
  await fresh("t-push-9");
  await prepareSource("t-push-9", "Split JSON file", "", SPLIT_FILE);
  // Full names carry last names here, so only the first names match.
  const api: PushApi = {
    getCurrentUser: () => Promise.resolve({ first_name: "Ann", last_name: "Jones", id: 1 }),
    getFriends: () => Promise.resolve([{ first_name: "Bob", last_name: "Smith", id: 2 }]),
    getGroups: () => Promise.resolve([{ name: "Trip", id: 7 }]),
    createExpense: () => Promise.resolve({ expenses: [{ id: 101 }] }),
    createComment: () => Promise.resolve(),
  };
  const sw = await prepareSplitwise("t-push-9", api);
  assert(sw.ok, "setup finishes with no name pick");
  assert(pushSessionFor("t-push-9").nameMap.get("Ann") === 1, "Ann maps by unique first name");
  assert(pushSessionFor("t-push-9").nameMap.get("Bob") === 2, "Bob maps by unique first name");
  assert(pushSessionFor("t-push-9").signedInAs === "Ann Jones", "signed in name keeps the last name");
});

// Helpers to pull nodes out of a step by kind.
function textNodes(step: { nodes: { kind: string }[] }) {
  return step.nodes.filter((n) => n.kind === "text") as {
    kind: string;
    name: string;
    value?: string;
  }[];
}

Deno.test("source step renders one value entry for the picked choice", async () => {
  const saved = Deno.env.get("SPLIT_UTILS_STATE");
  const empty = await Deno.makeTempDir({ prefix: "push-source-empty-" });
  Deno.env.set("SPLIT_UTILS_STATE", empty);
  try {
    // No pick yet: the first choice shows as picked, and no assigned
    // run means the Other run entry shows with its helper line.
    const initial = sourceStep(new Map(), "r9");
    const initialRadio = initial.nodes.find((n) => n.kind === "radio") as {
      picked?: string;
    };
    assert(initialRadio.picked === "Assigned run", "first choice picked by default");
    const initialTexts = textNodes(initial);
    assert(initialTexts.length === 1, "one value entry before a pick");
    assert(initialTexts[0].name === "run-id-other", "other run entry shown first");
    assert(initialTexts[0].value === "", "other run starts empty");

    // A picked file choice shows only the file entry, not the run entry.
    const picked = new Map([["source", ["Split JSON file"]]]);
    const step = sourceStep(picked, "r9");
    const texts = textNodes(step);
    assert(texts.length === 1, "exactly one value entry after a pick");
    assert(texts[0].name === "split-file", "the picked file entry shows");
    const radioNode = step.nodes.find((n) => n.kind === "radio") as {
      picked?: string;
    };
    assert(radioNode.picked === "Split JSON file", "radio shows the pick");
  } finally {
    if (saved === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", saved);
  }
});

async function writeAssignedMeta(
  stateRoot: string,
  id: string,
  createdAt: string,
  status: string,
): Promise<void> {
  const dir = stateRoot + "/share/runs/" + id;
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(
    dir + "/meta.json",
    JSON.stringify({
      id,
      label: "shop " + id,
      createdAt,
      platforms: ["zepto"],
      rangeDays: 7,
      status,
    }),
  );
}

function radioByName(step: { nodes: { kind: string }[] }, name: string) {
  return step.nodes.find((n) => {
    const rec = n as unknown as Record<string, unknown>;
    return rec["kind"] === "radio" && rec["name"] === name;
  }) as unknown as { name: string; picked?: string; options: unknown[] } | undefined;
}

function markdownTexts(step: { nodes: { kind: string }[] }): string[] {
  return step.nodes.filter((n) => n.kind === "markdown").map((n) =>
    String((n as unknown as Record<string, unknown>)["text"] ?? "")
  );
}

Deno.test("source step lists two assigned runs and starts on the newest", async () => {
  const saved = Deno.env.get("SPLIT_UTILS_STATE");
  const state = await Deno.makeTempDir({ prefix: "push-source-two-" });
  Deno.env.set("SPLIT_UTILS_STATE", state);
  try {
    await writeAssignedMeta(state, "r-old", "2026-01-01T09:00:00Z", "assigned");
    await writeAssignedMeta(state, "r-new", "2026-01-05T09:00:00Z", "assigned");
    const found = sourceStep(new Map(), "");
    const radio = radioByName(found, "run-id");
    assert(radio !== undefined, "run radio listed");
    const values = (radio!.options as Array<Record<string, unknown>>).map((o) =>
      String(o["value"] ?? o)
    );
    assert(JSON.stringify(values) === JSON.stringify(["r-new", "r-old"]), "newest first");
    assert(radio!.picked === "r-new", "starts on the newest run");
    const texts = textNodes(found);
    const other = texts.find((t) => t.name === "run-id-other");
    assert(other !== undefined, "other run entry follows the radio");
    assert(other!.value === "", "other run starts empty");
  } finally {
    if (saved === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", saved);
  }
});

Deno.test("source step hides gathered runs from the assigned list", async () => {
  const saved = Deno.env.get("SPLIT_UTILS_STATE");
  const state = await Deno.makeTempDir({ prefix: "push-source-gathered-" });
  Deno.env.set("SPLIT_UTILS_STATE", state);
  try {
    await writeAssignedMeta(state, "r-a", "2026-01-01T09:00:00Z", "assigned");
    await writeAssignedMeta(state, "r-g", "2026-01-06T09:00:00Z", "gathered");
    const found = sourceStep(new Map(), "");
    const radio = radioByName(found, "run-id");
    assert(radio !== undefined, "run radio listed");
    const values = (radio!.options as Array<Record<string, unknown>>).map((o) =>
      String(o["value"] ?? o)
    );
    assert(values.includes("r-a"), "assigned run listed");
    assert(!values.includes("r-g"), "gathered run never appears");
  } finally {
    if (saved === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", saved);
  }
});

Deno.test("source step starts on the prefill id when it names a run in the list", async () => {
  const saved = Deno.env.get("SPLIT_UTILS_STATE");
  const state = await Deno.makeTempDir({ prefix: "push-source-prefill-" });
  Deno.env.set("SPLIT_UTILS_STATE", state);
  try {
    await writeAssignedMeta(state, "r-old", "2026-01-01T09:00:00Z", "assigned");
    await writeAssignedMeta(state, "r-new", "2026-01-05T09:00:00Z", "assigned");
    const found = sourceStep(new Map(), "r-old");
    const radio = radioByName(found, "run-id");
    assert(radio !== undefined, "run radio listed");
    assert(radio!.picked === "r-old", "prefill id wins when it names a run");
  } finally {
    if (saved === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", saved);
  }
});

Deno.test("source step with no assigned run shows the line plus the free text entry and no radio", async () => {
  const saved = Deno.env.get("SPLIT_UTILS_STATE");
  const state = await Deno.makeTempDir({ prefix: "push-source-none-" });
  Deno.env.set("SPLIT_UTILS_STATE", state);
  try {
    await writeAssignedMeta(state, "r-g", "2026-01-06T09:00:00Z", "gathered");
    const found = sourceStep(new Map(), "");
    assert(radioByName(found, "run-id") === undefined, "no empty radio");
    const body = markdownTexts(found).join("\n");
    assert(body.includes("No assigned run exists yet"), "line names the empty list");
    assert(body.includes("split stage creates one"), "line names the split stage");
    const texts = textNodes(found);
    assert(texts.length === 1, "only the free text entry shows");
    assert(texts[0].name === "run-id-other", "free text entry alone");
    assert(texts[0].value === "", "free text entry starts empty");
  } finally {
    if (saved === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", saved);
  }
});

Deno.test("empty cutoff keeps every order and pushes the oldest", async () => {
  await fresh("t-push-10");
  await prepareSource("t-push-10", "Split JSON file", "", SPLIT_FILE);
  const { api, expenses } = fakeApi();
  await prepareSplitwise("t-push-10", api);
  const cut = applyCutoff("t-push-10", "");
  assert(cut.ok, "empty cutoff accepted");
  assert(pushSessionFor("t-push-10").cutoff === "", "cutoff cleared");
  assert(pushSessionFor("t-push-10").droppedByCutoff === 0, "nothing dropped");
  assert(pushSessionFor("t-push-10").groups.length === 3, "all orders kept");
  pushSessionFor("t-push-10").groupId = 7;
  const done = await executePush("t-push-10", { o1: "Push", o2: "Skip", o3: "Skip" });
  assert(done.ok, "push ok");
  assert(pushSessionFor("t-push-10").outcome!.pushed === 1, "oldest order pushed");
  assert(pushSessionFor("t-push-10").outcome!.totalRs === 100, "total is the oldest order");
  assert(expenses.length === 1, "one expense sent");
});

Deno.test("spaces-only cutoff keeps every order", async () => {
  await fresh("t-push-11");
  await prepareSource("t-push-11", "Split JSON file", "", SPLIT_FILE);
  await prepareSplitwise("t-push-11", fakeApi().api);
  const cut = applyCutoff("t-push-11", "   ");
  assert(cut.ok, "spaces cutoff accepted");
  assert(pushSessionFor("t-push-11").cutoff === "", "cutoff cleared");
  assert(pushSessionFor("t-push-11").groups.length === 3, "all orders kept");
  assert(pushSessionFor("t-push-11").droppedByCutoff === 0, "nothing dropped");
});

Deno.test("bad cutoff date still reports the error", async () => {
  await fresh("t-push-12");
  await prepareSource("t-push-12", "Split JSON file", "", SPLIT_FILE);
  await prepareSplitwise("t-push-12", fakeApi().api);
  const cut = applyCutoff("t-push-12", "not-a-date");
  assert(!cut.ok, "bad date rejected");
  if (!cut.ok) {
    assert(cut.error === "Use the form YYYY-MM-DD for the cutoff date.", "message kept");
  }
});

Deno.test("throwing sign in check falls back to aggregate with setupError", async () => {
  await fresh("t-push-13");
  await prepareSource("t-push-13", "Split JSON file", "", SPLIT_FILE);
  const base = fakeApi().api;
  const api: PushApi = {
    ...base,
    getCurrentUser: () => Promise.reject(new Error("boom-token-expired")),
  };
  const sw = await prepareSplitwise("t-push-13", api);
  assert(sw.ok, "fallback prepares");
  assert(pushSessionFor("t-push-13").mode === "aggregate", "aggregate mode");
  assert(pushSessionFor("t-push-13").setupError !== null, "setupError set");
  assert(pushSessionFor("t-push-13").setupError!.includes("boom-token-expired"), "reason named");
});

Deno.test("missing keys leave setupError null", async () => {
  await fresh("t-push-14");
  await prepareSource("t-push-14", "Split JSON file", "", SPLIT_FILE);
  const sw = await prepareSplitwise("t-push-14");
  assert(sw.ok, "fallback prepares");
  assert(pushSessionFor("t-push-14").mode === "aggregate", "aggregate mode");
  assert(pushSessionFor("t-push-14").setupError === null, "no setupError without access");
});

Deno.test("second prepare clears an earlier setupError", async () => {
  await fresh("t-push-15");
  await prepareSource("t-push-15", "Split JSON file", "", SPLIT_FILE);
  const base = fakeApi().api;
  const bad: PushApi = {
    ...base,
    getCurrentUser: () => Promise.reject(new Error("temp-network-blip")),
  };
  const first = await prepareSplitwise("t-push-15", bad);
  assert(first.ok, "first fallback prepares");
  assert(pushSessionFor("t-push-15").setupError !== null, "first run sets setupError");
  const second = await prepareSplitwise("t-push-15", fakeApi().api);
  assert(second.ok, "second run prepares");
  assert(pushSessionFor("t-push-15").mode === "live", "live mode again");
  assert(pushSessionFor("t-push-15").setupError === null, "setupError cleared");
});

Deno.test("very long reason stays within its limit", async () => {
  await fresh("t-push-16");
  await prepareSource("t-push-16", "Split JSON file", "", SPLIT_FILE);
  const base = fakeApi().api;
  const longMsg = "x".repeat(500);
  const api: PushApi = {
    ...base,
    getCurrentUser: () => Promise.reject(new Error(longMsg)),
  };
  const sw = await prepareSplitwise("t-push-16", api);
  assert(sw.ok, "fallback prepares");
  assert(pushSessionFor("t-push-16").setupError !== null, "setupError set");
  const prefix = "Splitwise access is set up, but the sign in check failed: ";
  const suffix = ". The push writes a summary file instead. Try again in a moment.";
  assert(
    pushSessionFor("t-push-16").setupError!.length <= prefix.length + 120 + suffix.length,
    "reason cut keeps the text within its limit",
  );
  assert(!pushSessionFor("t-push-16").setupError!.includes("x".repeat(121)), "long body cut");
});

Deno.test("cutoff step prefills the newest order date and keeps typed values", async () => {
  await fresh("t-push-17");
  await prepareSource("t-push-17", "Split JSON file", "", SPLIT_FILE);
  const entries = pushSteps();
  const cutoff = entries
    .map((entry) => (typeof entry === "function" ? entry(new Map(), { sessionId: "t-push-17" }) : entry))
    .find((s) => s.id === "push-cutoff");
  assert(cutoff !== undefined, "cutoff step exists in pushSteps");
  const texts = textNodes(cutoff!);
  assert(texts.length === 1, "one cutoff entry");
  assert(texts[0].value === "2026-01-05", "prefill is the newest order date");
  // A typed value wins over the prefill.
  const cutoff2 = entries
    .map((entry) =>
      typeof entry === "function" ? entry(new Map([["cutoff", ["2026-01-02"]]]), { sessionId: "t-push-17" }) : entry
    )
    .find((s) => s.id === "push-cutoff");
  const texts2 = textNodes(cutoff2!);
  assert(texts2[0].value === "2026-01-02", "typed cutoff wins over the prefill");
  // The step order matches the forward path.
  const ids = entries.map((entry) => typeof entry === "function" ? entry(new Map(), { sessionId: "t-push-17" }).id : entry.id);
  assert(
    JSON.stringify(ids) ===
      JSON.stringify([
        "push-source",
        "push-names",
        "push-setup",
        "push-group",
        "push-cutoff",
        "push-confirm",
        "push-report",
      ]),
    "step order matches the forward path",
  );
});

Deno.test("the push session prepared under A does not serve B", async () => {
  await fresh("iso-push-A", "iso-push-B");
  const fileA = root + "/iso-push-a.json";
  const fileB = root + "/iso-push-b.json";
  await Deno.writeTextFile(fileA, JSON.stringify(doc(["Ann", "Bob"])));
  await Deno.writeTextFile(
    fileB,
    JSON.stringify(doc(["Cara", "Dev"])),
  );
  const { pushSessionFor } = await import("../wizards/expense-split/push-engine.ts");
  const srcA = await prepareSource("iso-push-A", "Split JSON file", "", fileA);
  assert(srcA.ok, "A source loads");
  const srcB = await prepareSource("iso-push-B", "Split JSON file", "", fileB);
  assert(srcB.ok, "B source loads");
  const liveA = pushSessionFor("iso-push-A");
  const liveB = pushSessionFor("iso-push-B");
  assert(JSON.stringify(liveA.people) === '["Ann","Bob"]', "A keeps its people");
  assert(JSON.stringify(liveB.people) === '["Cara","Dev"]', "B keeps its people");
  assert(liveA.file === fileA, "A keeps its file");
  assert(liveB.file === fileB, "B keeps its file");
  assert(liveA.file !== liveB.file, "the two sessions stage apart");
});

// Check the bar shape without posting answers.
Deno.test("source step declares a bar with a back button and a forward button", () => {
  const found = sourceStep(new Map(), "");
  assert(found.nav !== undefined, "source step declares a bar");
  assert(found.nav!.back === true, "bar carries a back button");
  const next = found.nav!.next;
  if (next === undefined || typeof next === "string") {
    throw new Error("assert failed: bar carries a labeled forward button");
  }
  assert(next.label === "Next", "forward button keeps its label");
  assert(next.run !== undefined, "forward button owns its handler");
});
