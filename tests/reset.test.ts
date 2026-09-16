// Factory reset checks. The reset removes each target, names each
// one, reruns clean, and leaves neighbours beside the root alone.

import { factoryReset, resetTargets } from "../src/reset.ts";
import { pushedFilePath, stateRoot, tokenFilePath } from "../src/paths.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

// True when the path exists on disk.
async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

Deno.test("factory reset removes its targets and stays in bounds", async () => {
  const base = await Deno.makeTempDir({ dir: "/tmp", prefix: "reset-state-" });
  const root = base + "/state";
  Deno.env.set("SPLIT_UTILS_STATE", root);
  // Create every file and directory the reset targets.
  await Deno.mkdir(root + "/config", { recursive: true });
  await Deno.writeTextFile(root + "/config/settings.json", "{}");
  await Deno.mkdir(root + "/share/runs/run1", { recursive: true });
  await Deno.writeTextFile(root + "/share/runs/run1/meta.json", "{}");
  await Deno.mkdir(root + "/share/profiles", { recursive: true });
  await Deno.writeTextFile(root + "/share/profiles/p1.json", "{}");
  await Deno.writeTextFile(root + "/share/zomato-tokens.json", "{}");
  await Deno.writeTextFile(root + "/share/zomato-login-state.json", "{}");
  await Deno.writeTextFile(tokenFilePath(), "{}");
  await Deno.writeTextFile(pushedFilePath(), "{}");
  // A neighbour beside the state root the reset must keep.
  await Deno.writeTextFile(base + "/keep-me.txt", "keep");
  const removed = await factoryReset();
  const expected = [
    tokenFilePath(),
    pushedFilePath(),
    root + "/config",
    root + "/share/runs",
    root + "/share/profiles",
    root + "/share/zomato-tokens.json",
    root + "/share/zomato-login-state.json",
  ];
  for (const path of expected) {
    assert(removed.includes(path), "removed list names " + path);
    assert(!(await exists(path)), "target is gone: " + path);
  }
  assert(
    removed.length === expected.length,
    "removed list holds only the targets",
  );
  assert(await exists(base + "/keep-me.txt"), "neighbour still exists");
  // A second run finds nothing and throws nothing.
  const again = await factoryReset();
  assert(again.length === 0, "second run removes nothing");
  assert(await exists(base + "/keep-me.txt"), "neighbour still exists");
});

Deno.test("reset targets all sit inside the state root", async () => {
  const base = await Deno.makeTempDir({ dir: "/tmp", prefix: "reset-guard-" });
  const root = base + "/state";
  Deno.env.set("SPLIT_UTILS_STATE", root);
  const targets = resetTargets();
  const live = stateRoot();
  assert(targets.length > 0, "reset names targets");
  for (const path of targets) {
    assert(path === live || path.startsWith(live + "/"), "target sits inside root: " + path);
  }
});

// A reset must clear the old cache copies too. The move forward copies
// whichever one survives back into the state root on the next read, so
// a reset that spares them undoes itself and the user stays signed in.
Deno.test("factory reset clears the legacy credential files", async () => {
  const base = await Deno.makeTempDir({ dir: "/tmp", prefix: "reset-legacy-" });
  const home = base + "/home";
  const root = base + "/state";
  await Deno.mkdir(home + "/.cache/ordersplit", { recursive: true });
  await Deno.mkdir(root + "/config", { recursive: true });
  const oldToken = home + "/.cache/ordersplit/splitwise_token.json";
  await Deno.writeTextFile(oldToken, '{"oauth_token":"t","oauth_token_secret":"s"}');
  const priorHome = Deno.env.get("HOME");
  Deno.env.set("HOME", home);
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const { factoryReset } = await import("../src/reset.ts");
    const removed = await factoryReset();
    if (!removed.includes(oldToken)) {
      throw new Error("the removed list does not name the legacy token file");
    }
    let stillThere = true;
    try {
      await Deno.stat(oldToken);
    } catch {
      stillThere = false;
    }
    if (stillThere) throw new Error("the legacy token file survived the reset");
    // A second run must stay quiet rather than throw on the missing file.
    await factoryReset();
  } finally {
    if (priorHome !== undefined) Deno.env.set("HOME", priorHome);
    await Deno.remove(base, { recursive: true }).catch(() => {});
  }
});
