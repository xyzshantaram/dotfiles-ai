// Tests for owner only secret file writes. Run with deno test.
// Each case checks one save path from the T15 ticket.

import { saveToken } from "../src/splitwise.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("saveToken ends at mode 600 on new and old files", async () => {
  // Point the token cache at a fresh temp file.
  const dir = await Deno.makeTempDir();
  const path = dir + "/splitwise_token.json";
  Deno.env.set("SPLITWISE_TOKEN_FILE", path);
  try {
    // Write once to cover the new file path.
    await saveToken({ oauth_token: "token-one", oauth_token_secret: "secret-one" });
    // Read the mode bits of the new file.
    const first = await Deno.stat(path);
    // Assert the owner only bits land on new files.
    assert((first.mode! & 0o777) === 0o600, "new secret file ends at 600");
    // Write again to cover the overwrite path.
    await saveToken({ oauth_token: "token-two", oauth_token_secret: "secret-two" });
    // Read the mode bits of the old file.
    const second = await Deno.stat(path);
    // Assert the owner only bits land on old files.
    assert((second.mode! & 0o777) === 0o600, "old secret file ends at 600");
  } finally {
    // Drop the override so later tests stay clean.
    Deno.env.delete("SPLITWISE_TOKEN_FILE");
  }
});
