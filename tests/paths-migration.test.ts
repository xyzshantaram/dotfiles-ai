// Migration proof for the single state root. A token saved under the
// old cache dir moves forward to the config dir on first read.
import { loadToken } from "../src/splitwise.ts";
import { tokenFilePath } from "../src/paths.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("legacy token file moves forward to the state root", async () => {
  const savedHome = Deno.env.get("HOME");
  const savedState = Deno.env.get("SPLIT_UTILS_STATE");
  const home = await Deno.makeTempDir({ prefix: "paths-home-" });
  const root = await Deno.makeTempDir({ prefix: "paths-state-" });
  try {
    Deno.env.set("HOME", home);
    Deno.env.set("SPLIT_UTILS_STATE", root);
    const oldPath = home + "/.cache/ordersplit/splitwise_token.json";
    await Deno.mkdir(oldPath.slice(0, oldPath.lastIndexOf("/")), { recursive: true });
    const cache = {
      consumer_key: "key",
      consumer_secret: "secret",
      access_token: { oauth_token: "token-one", oauth_token_secret: "secret-one" },
    };
    await Deno.writeTextFile(oldPath, JSON.stringify(cache, null, 2));
    const token = await loadToken();
    assert(token !== null, "token loads from the old path");
    assert(token!.oauth_token === "token-one", "token value matches");
    assert(token!.oauth_token_secret === "secret-one", "token secret matches");
    const fresh = JSON.parse(await Deno.readTextFile(tokenFilePath()));
    assert(fresh.access_token.oauth_token === "token-one", "new path holds the token");
    assert(fresh.access_token.oauth_token_secret === "secret-one", "new path holds the secret");
  } finally {
    if (savedHome === undefined) Deno.env.delete("HOME");
    else Deno.env.set("HOME", savedHome);
    if (savedState === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", savedState);
  }
});
