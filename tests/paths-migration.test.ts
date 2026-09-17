// Migration proof for the single state root. A fingerprint file saved
// under the old cache dir moves forward to the config dir on first
// read. Ticket A1 retargeted this from the OAuth1 token file, which no
// longer exists, to the pushed file, which still migrates.
import { loadPushed } from "../src/splitwise.ts";
import { pushedFilePath } from "../src/paths.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("legacy pushed file moves forward to the state root", async () => {
  const savedHome = Deno.env.get("HOME");
  const savedState = Deno.env.get("SPLIT_UTILS_STATE");
  const home = await Deno.makeTempDir({ prefix: "paths-home-" });
  const root = await Deno.makeTempDir({ prefix: "paths-state-" });
  try {
    Deno.env.set("HOME", home);
    Deno.env.set("SPLIT_UTILS_STATE", root);
    const oldPath = home + "/.cache/ordersplit/splitwise_pushed.json";
    await Deno.mkdir(oldPath.slice(0, oldPath.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(oldPath, JSON.stringify({ pushed: { "fp-one": 4242 } }, null, 2));
    const pushed = await loadPushed();
    assert(pushed["fp-one"] === 4242, "fingerprint loads from the old path");
    const fresh = JSON.parse(await Deno.readTextFile(pushedFilePath()));
    assert(fresh.pushed["fp-one"] === 4242, "new path holds the fingerprint");
  } finally {
    if (savedHome === undefined) Deno.env.delete("HOME");
    else Deno.env.set("HOME", savedHome);
    if (savedState === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", savedState);
  }
});
