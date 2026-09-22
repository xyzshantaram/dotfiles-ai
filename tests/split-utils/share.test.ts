// Tests for encrypted share links. All tests run offline.
import { decryptForShare, encryptForShare, generateShareKey } from "@app/src/share.ts";
import { assert, assertEquals } from "@std/assert";

// Make a fixed 32-byte key for repeat runs.
function fixedKey(): Uint8Array {
  // Fill each slot with its index.
  const key = new Uint8Array(32);
  // Store the index in each slot.
  for (let i = 0; i < 32; i++) key[i] = i;
  // Return the filled key.
  return key;
}

// encryptForShare then decryptForShare returns the input.
Deno.test("share round-trips JSON text with a known key", async () => {
  // Define JSON with a rare marker field.
  const input = '{"split":"x7q9-marker","total":42}';
  // Encrypt the input with the fixed key.
  const blob = await encryptForShare(input, fixedKey());
  // Decrypt the blob with the same key.
  const output = await decryptForShare(blob, fixedKey());
  // Check exact round-trip of the text.
  assertEquals(output, input, "round-trip text");
});

// decryptForShare with the wrong key throws.
Deno.test("share decrypt with wrong key throws", async () => {
  // Encrypt the input with the fixed key.
  const blob = await encryptForShare('{"a":1}', fixedKey());
  // Make a wrong key full of nines.
  const wrong = new Uint8Array(32).fill(9);
  // Track whether decrypt throws.
  let threw = false;
  // Try to decrypt with the wrong key.
  try {
    await decryptForShare(blob, wrong);
  } catch {
    // Mark the throw and move on.
    threw = true;
  }
  // Check that decrypt threw.
  assert(threw, "wrong key must throw");
});

// decryptForShare on garbage input throws.
Deno.test("share decrypt on garbage throws", async () => {
  // Track whether decrypt throws.
  let threw = false;
  // Try to decrypt plain garbage text.
  try {
    await decryptForShare("not-a-blob!!", fixedKey());
  } catch {
    // Mark the throw and move on.
    threw = true;
  }
  // Check that decrypt threw.
  assert(threw, "garbage must throw");
});

// The ciphertext blob hides the plaintext.
Deno.test("share blob hides plaintext", async () => {
  // Define JSON with a rare marker field.
  const input = '{"secret":"x7q9-marker-zzz"}';
  // Encrypt the input with the fixed key.
  const blob = await encryptForShare(input, fixedKey());
  // Check that the marker misses from the blob.
  assert(!blob.includes("x7q9-marker-zzz"), "blob must hide plaintext");
});

// generateShareKey returns fresh 32-byte keys.
Deno.test("share key makes 32 fresh bytes", () => {
  // Make two keys back to back.
  const first = generateShareKey();
  const second = generateShareKey();
  // Check the byte count of each key.
  assertEquals(first.length, 32, "first key length");
  assertEquals(second.length, 32, "second key length");
  // Check that the two keys differ.
  assert(
    JSON.stringify([...first]) !== JSON.stringify([...second]),
    "keys must differ",
  );
});
