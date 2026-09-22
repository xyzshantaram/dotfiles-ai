// Tests for the app settings store. Each test uses a fresh state root
// and restores the env var on exit.
import { loadSettings, saveSettings } from "@app/src/settings.ts";
import { assert, assertEquals } from "@std/assert";

// Point SPLIT_UTILS_STATE at a fresh temp dir and return the old value.
async function freshRoot(): Promise<string | undefined> {
  // Keep the old value for the restore.
  const old = Deno.env.get("SPLIT_UTILS_STATE");
  // Point state at a fresh temp dir.
  const root = await Deno.makeTempDir();
  Deno.env.set("SPLIT_UTILS_STATE", root);
  return old;
}

// Restore the env value from freshRoot.
function restoreRoot(old: string | undefined): void {
  // Put the old value back, or delete the override.
  if (old === undefined) Deno.env.delete("SPLIT_UTILS_STATE");
  else Deno.env.set("SPLIT_UTILS_STATE", old);
}

// loadSettings returns INR defaults when no file exists.
Deno.test("loadSettings defaults to INR with no file", async () => {
  // Point state at a fresh temp dir.
  const old = await freshRoot();
  try {
    // Load with no file on disk.
    const settings = await loadSettings();
    // Check the INR default.
    assertEquals(settings, { currency: "INR" }, "missing file default");
  } finally {
    // Restore the env value for later tests.
    restoreRoot(old);
  }
});

// saveSettings writes a file that loadSettings reads back.
Deno.test("settings round-trip save and load", async () => {
  // Point state at a fresh temp dir.
  const old = await freshRoot();
  try {
    // Save one USD record.
    await saveSettings({ currency: "USD" });
    // Read the raw file from disk.
    const raw = JSON.parse(
      await Deno.readTextFile(Deno.env.get("SPLIT_UTILS_STATE")! + "/config/settings.json"),
    );
    // Check the stored code.
    assertEquals(raw, { currency: "USD" }, "stored code");
    // Load the record back through the API.
    const settings = await loadSettings();
    // Check the round trip result.
    assertEquals(settings, { currency: "USD" }, "round trip code");
  } finally {
    // Restore the env value for later tests.
    restoreRoot(old);
  }
});

// A custom lowercase code persists in fixed uppercase form.
Deno.test("custom code persists in uppercase", async () => {
  // Point state at a fresh temp dir.
  const old = await freshRoot();
  try {
    // Save one lowercase code.
    await saveSettings({ currency: "eur" });
    // Load the record back through the API.
    const settings = await loadSettings();
    // Check the fixed case.
    assertEquals(settings.currency, "EUR", "fixed case");
    // Check the code holds three letters.
    assert(/^[A-Z]{3}$/.test(settings.currency), "three letter code");
  } finally {
    // Restore the env value for later tests.
    restoreRoot(old);
  }
});

// The usage mode round-trips with the currency.
Deno.test("usage mode round-trips", async () => {
  // Point state at a fresh temp dir.
  const old = await freshRoot();
  try {
    // Save one manual usage record.
    await saveSettings({ currency: "INR", usage: "manual" });
    // Load the record back through the API.
    const settings = await loadSettings();
    // Check both fields survive.
    assertEquals(settings, { currency: "INR", usage: "manual" }, "usage round trip");
    // Save again without the usage field.
    await saveSettings({ currency: "USD", usage: settings.usage });
    // The usage value must stay after a currency change.
    const next = await loadSettings();
    assertEquals(next.usage, "manual", "usage survives currency change");
  } finally {
    // Restore the env value for later tests.
    restoreRoot(old);
  }
});

// An unknown usage value drops back to the currency-only shape.
Deno.test("unknown usage value is dropped", async () => {
  // Point state at a fresh temp dir.
  const old = await freshRoot();
  try {
    // Write a file with a bogus usage value by hand.
    const root = Deno.env.get("SPLIT_UTILS_STATE")!;
    await Deno.mkdir(root + "/config", { recursive: true });
    await Deno.writeTextFile(
      root + "/config/settings.json",
      JSON.stringify({ currency: "USD", usage: "bogus" }),
    );
    // Load must keep the currency and drop the usage.
    const settings = await loadSettings();
    assertEquals(settings, { currency: "USD" }, "bogus usage dropped");
  } finally {
    // Restore the env value for later tests.
    restoreRoot(old);
  }
});
