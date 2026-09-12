// Factory reset checks. The reset removes each target, names each
// one, reruns clean, and leaves neighbours beside the root alone.

import { factoryReset } from "../src/reset.ts";
import { pushedFilePath, tokenFilePath } from "../src/splitwise.ts";

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
  Deno.env.set("SPLITWISE_TOKEN_FILE", base + "/splitwise_token.json");
  Deno.env.set("SPLITWISE_PUSHED_FILE", base + "/splitwise_pushed.json");
  // Create every file and directory the reset targets.
  await Deno.mkdir(root + "/config", { recursive: true });
  await Deno.writeTextFile(root + "/config/settings.json", "{}");
  await Deno.mkdir(root + "/share/runs/run1", { recursive: true });
  await Deno.writeTextFile(root + "/share/runs/run1/meta.json", "{}");
  await Deno.mkdir(root + "/share/profiles", { recursive: true });
  await Deno.writeTextFile(root + "/share/profiles/p1.json", "{}");
  await Deno.writeTextFile(root + "/share/zomato-tokens.json", "{}");
  await Deno.writeTextFile(root + "/share/zomato-login-state.json", "{}");
  await Deno.writeTextFile(base + "/splitwise_token.json", "{}");
  await Deno.writeTextFile(base + "/splitwise_pushed.json", "{}");
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
