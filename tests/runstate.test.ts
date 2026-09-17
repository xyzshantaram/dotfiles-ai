// Tests for the run state spine. Each test uses a fresh state root.
import {
  archiveRun,
  backupFailedRun,
  createRun,
  ensureRun,
  listRuns,
  listRunsSync,
  readRun,
  runFilePath,
  runsDir,
  stateRoot,
  updateRun,
} from "../src/runstate.ts";
import { loadSettingsSync } from "../src/settings.ts";

// Fail the test when a flag misses.
function assert(cond: boolean, msg: string): void {
  // Throw a clear error when false.
  if (!cond) throw new Error("assert failed: " + msg);
}

// Fail the test when two values differ.
function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  // Compare with JSON form for depth.
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  // Throw a clear error on mismatch.
  if (a !== b) throw new Error(msg + ": want " + b + " got " + a);
}

// createRun writes a gathered meta that readRun returns.
Deno.test("createRun writes gathered meta", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one zepto run.
  const { id, dir } = await createRun("zepto", ["zepto"], 30, root + "/gather.log");
  // Read the raw meta file from disk.
  const raw = JSON.parse(await Deno.readTextFile(dir + "/meta.json"));
  // Check the stored status and fields.
  assertEquals(raw.status, "gathered", "meta status");
  assertEquals(raw.id, id, "meta id");
  assertEquals(raw.label, "zepto", "meta label");
  assertEquals(raw.platforms, ["zepto"], "meta platforms");
  assertEquals(raw.rangeDays, 30, "meta range");
  // Read the run back through the API.
  const found = await readRun(id);
  // Check the round trip result.
  assert(found !== null, "readRun finds the run");
  assertEquals(found!.meta.status, "gathered", "round trip status");
  assertEquals(found!.dir, dir, "round trip dir");
});

// updateRun patches status to assigned and persists.
Deno.test("updateRun patches status", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one zepto run.
  const { id } = await createRun("zepto", ["zepto"], 30, root + "/gather.log");
  // Patch the status to assigned.
  await updateRun(id, { status: "assigned" });
  // Read the run back through the API.
  const found = await readRun(id);
  // Check the patched status.
  assert(found !== null, "readRun finds the run");
  assertEquals(found!.meta.status, "assigned", "patched status");
  // Read the raw file and check it persisted.
  const raw = JSON.parse(
    await Deno.readTextFile(runsDir() + "/" + id + "/meta.json"),
  );
  assertEquals(raw.status, "assigned", "file status");
});

// listRuns returns newest first across two runs in order.
Deno.test("listRuns returns newest first", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create two runs with one label to hit the suffix path on collision.
  const first = await createRun("multi", ["zepto"], 30, root + "/a.log");
  const second = await createRun("multi", ["zepto"], 30, root + "/b.log");
  // Check the suffix rule when both runs share one second.
  const sameSecond = second.id === first.id + "-2";
  // Check time order when seconds differ.
  if (!sameSecond) {
    const s1 = Number(first.id.split("-")[0]);
    const s2 = Number(second.id.split("-")[0]);
    assert(s2 > s1, "later run holds a later stamp");
  }
  // List runs and check newest first order.
  const runs = await listRuns();
  assertEquals(runs.length, 2, "run count");
  assertEquals(runs[0].id, second.id, "newest first");
  assertEquals(runs[1].id, first.id, "oldest last");
});

// backupFailedRun copies the dir and marks the original failed.
Deno.test("backupFailedRun copies dir and marks original", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one zepto run.
  const { id, dir } = await createRun("zepto", ["zepto"], 30, root + "/gather.log");
  // Add an orders file so the copy has content.
  await Deno.writeTextFile(dir + "/orders.json", "{}\n");
  // Back the run up with a reason.
  await backupFailedRun(id, "login failed");
  // Check the original dir still lives.
  const orig = await readRun(id);
  assert(orig !== null, "original stays");
  assertEquals(orig!.meta.status, "failed", "original status");
  assertEquals(orig!.meta.failureReason, "login failed", "original reason");
  // Check the backup copy holds the orders file.
  const backupOrders = await Deno.readTextFile(
    runsDir() + "/" + id + "-failed-backup/orders.json",
  );
  assertEquals(backupOrders, "{}\n", "backup content");
  // Check live listing hides the backup.
  const runs = await listRuns();
  assertEquals(runs.length, 1, "live count");
  assertEquals(runs[0].id, id, "live id");
});

// archiveRun moves the dir under cache runs.
Deno.test("archiveRun moves dir to cache", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one zepto run.
  const { id } = await createRun("zepto", ["zepto"], 30, root + "/gather.log");
  // Archive the run.
  await archiveRun(id);
  // Check the live read misses now.
  assert((await readRun(id)) === null, "archived run hides");
  // Check live listing drops the run.
  assertEquals(await listRuns(), [], "live list empties");
  // Check the archive holds the meta file.
  const meta = JSON.parse(
    await Deno.readTextFile(stateRoot() + "/cache/runs/" + id + "/meta.json"),
  );
  assertEquals(meta.id, id, "archive keeps meta");
});

// readRun throws a clear error on a corrupt meta status.
Deno.test("readRun throws on bad status", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one zepto run.
  const { id, dir } = await createRun("zepto", ["zepto"], 30, root + "/gather.log");
  // Corrupt the status value on disk.
  const raw = JSON.parse(await Deno.readTextFile(dir + "/meta.json"));
  raw.status = "bogus";
  await Deno.writeTextFile(dir + "/meta.json", JSON.stringify(raw));
  // Read the run and catch the throw.
  let msg = "";
  try {
    await readRun(id);
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  // Check the error names the run dir.
  assert(msg.includes(dir), "throw names the run dir");
  // Check the error names the bad field.
  assert(msg.includes("status"), "throw names the bad field");
});

// runFilePath maps missing files to null and live files to paths.
Deno.test("runFilePath resolves live files only", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one zepto run.
  const { id, dir } = await createRun("zepto", ["zepto"], 30, root + "/gather.log");
  // Check a missing file maps to null.
  assert((await runFilePath(id, "orders.json")) === null, "missing maps to null");
  // Write the orders file to the run dir.
  await Deno.writeTextFile(dir + "/orders.json", "{}\n");
  // Check the path resolves now.
  assertEquals(await runFilePath(id, "orders.json"), dir + "/orders.json", "live path");
});

// listRuns sorts newest first and puts a bad date last.
Deno.test("listRuns puts a bad date last", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create three runs.
  const newest = await createRun("newest", ["zepto"], 30, root + "/a.log");
  const older = await createRun("older", ["zepto"], 30, root + "/b.log");
  const bad = await createRun("bad", ["zepto"], 30, root + "/c.log");
  // Pin two dates and leave one unparsable.
  await updateRun(newest.id, { createdAt: "2026-01-03T00:00:00.000Z" });
  await updateRun(older.id, { createdAt: "2026-01-02T00:00:00.000Z" });
  await updateRun(bad.id, { createdAt: "00Z" });
  // List runs and check the exact id order.
  const runs = await listRuns();
  assertEquals(
    runs.map((run) => run.id),
    [newest.id, older.id, bad.id],
    "bad date sorts last",
  );
  // The sync twin keeps the same order.
  const synced = listRunsSync();
  assertEquals(
    synced.map((run) => run.id),
    [newest.id, older.id, bad.id],
    "sync twin keeps the order",
  );
});

// loadSettingsSync returns INR defaults when no file exists.
Deno.test("loadSettingsSync defaults to INR with no file", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Load with no file on disk.
  const settings = loadSettingsSync();
  // Check the INR default.
  assertEquals(settings, { currency: "INR" }, "missing file default");
});

// ensureRun creates a run with exactly the id it is given.
Deno.test("ensureRun creates a run with the given id", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one run with a fixed id.
  const { dir, existed } = await ensureRun(
    "abc-multi",
    "zomato",
    ["zomato"],
    30,
    root + "/gather.log",
  );
  assert(!existed, "first ensureRun is new");
  assertEquals(dir, runsDir() + "/abc-multi", "run dir");
  // Read the raw meta file from disk.
  const raw = JSON.parse(await Deno.readTextFile(dir + "/meta.json"));
  assertEquals(raw.id, "abc-multi", "meta id");
  assertEquals(raw.status, "gathered", "meta status");
});

// ensureRun merges platforms and keeps the first createdAt.
Deno.test("ensureRun merges platforms and keeps createdAt", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one zomato run.
  await ensureRun("shared-multi", "zomato", ["zomato"], 30, root + "/a.log");
  const first = JSON.parse(
    await Deno.readTextFile(runsDir() + "/shared-multi/meta.json"),
  );
  // Append a second platform to the same run.
  const second = await ensureRun(
    "shared-multi",
    "blinkit",
    ["blinkit"],
    30,
    root + "/b.log",
  );
  assert(second.existed, "second ensureRun exists");
  // Read the merged record.
  const raw = JSON.parse(
    await Deno.readTextFile(runsDir() + "/shared-multi/meta.json"),
  );
  assertEquals(raw.platforms, ["zomato", "blinkit"], "merged platforms");
  assertEquals(raw.label, "multi", "merged label");
  assertEquals(raw.createdAt, first.createdAt, "kept createdAt");
});

// ensureRun throws when the run status is pushed.
Deno.test("ensureRun throws when the run is pushed", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create one run then mark it pushed.
  const { dir } = await ensureRun(
    "done-multi",
    "zomato",
    ["zomato"],
    30,
    root + "/gather.log",
  );
  const raw = JSON.parse(await Deno.readTextFile(dir + "/meta.json"));
  raw.status = "pushed";
  await Deno.writeTextFile(dir + "/meta.json", JSON.stringify(raw));
  // Appending must throw.
  let msg = "";
  try {
    await ensureRun("done-multi", "blinkit", ["blinkit"], 30, root + "/b.log");
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  assert(msg.includes("not open for more orders"), "throw names the fault");
});

// ensureRun throws on an unsafe id.
Deno.test("ensureRun throws on an unsafe id", async () => {
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // An unsafe id must throw.
  let msg = "";
  try {
    await ensureRun("../escape", "zomato", ["zomato"], 30, root + "/a.log");
  } catch (e) {
    msg = e instanceof Error ? e.message : String(e);
  }
  assert(msg.includes("bad run id"), "throw names the fault");
});
