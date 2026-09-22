// Tests for owner only secret file writes. Run with deno test.
// Each case checks one save path from the T15 ticket. Ticket A1
// retired the token writer, so the key file write is the save path
// that still holds a secret.

import { writeSplitwiseEnv } from "@app/app/expense-split/settings.ts";
import { splitwiseEnvPath } from "@app/src/paths.ts";
import { assert } from "@std/assert";

Deno.test("writeSplitwiseEnv ends at mode 600 on new and old files", async () => {
  // Point the state root at a fresh temp dir.
  const dir = await Deno.makeTempDir();
  const saved = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", dir);
  const path = splitwiseEnvPath();
  try {
    // Write once to cover the new file path.
    await writeSplitwiseEnv("key-one");
    // Read the mode bits of the new file.
    const first = await Deno.stat(path);
    // Assert the owner only bits land on new files.
    assert((first.mode! & 0o777) === 0o600, "new secret file ends at 600");
    // Widen the mode to prove the writer fixes an existing file.
    await Deno.chmod(path, 0o644);
    // Write again to cover the overwrite path.
    await writeSplitwiseEnv("key-two");
    // Read the mode bits of the old file.
    const second = await Deno.stat(path);
    // Assert the owner only bits land on old files.
    assert((second.mode! & 0o777) === 0o600, "old secret file ends at 600");
    // Assert the file holds the newer key under the parsed name.
    const text = await Deno.readTextFile(path);
    assert(text.trim() === "API_KEY=key-two", "file holds the API key line");
  } finally {
    // Drop the override so later tests stay clean.
    if (saved === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
    else Deno.env.set("SPLIT_UTILS_STATE", saved);
  }
});
