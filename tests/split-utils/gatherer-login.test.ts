// Machine mode tests for the browser login flag. No test touches
// the live site. Both cases fail fast on a bad flag value, so none
// reach past validation toward the browser. Success paths need a
// headed window, so source assertions do not cover them here.

import { assert } from "@std/assert";
const GATHERER = new URL(import.meta.resolve("@app/scripts/gatherer.ts")).pathname;

// Run the gatherer under a fresh state root and capture the result.
async function runGatherer(
  args: string[],
): Promise<{ code: number; out: string; err: string }> {
  // Point state at a fresh temp dir so runs never touch real files.
  const root = await Deno.makeTempDir();
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-lock", "-A", GATHERER, ...args],
    env: {
      ...Deno.env.toObject(),
      SPLIT_UTILS_STATE: root,
      NO_COLOR: "1",
    },
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
}

const PICK = "Pick a platform to sign in to: zepto, blinkit, or swiggy.";

// Bare login flag prints the pick sentence and exits 1.
Deno.test("browser login without value asks for a platform", async () => {
  const res = await runGatherer(["--login"]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "bare login exits 1");
  // Assert stdout holds the exact pick sentence.
  assert(res.out.includes(PICK), "bare login holds the pick sentence");
  // Assert the mode never reaches the interactive wizard.
  assert(!res.out.includes("Ready to start"), "bare login skips the wizard");
  assert(!res.err.includes("Ready to start"), "bare login hides the prompt");
});

// Unknown login platform prints the same sentence and exits 1.
Deno.test("browser login with unknown platform asks for a platform", async () => {
  const res = await runGatherer(["--login=nosuch"]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "unknown login exits 1");
  // Assert stdout holds the exact pick sentence.
  assert(res.out.includes(PICK), "unknown login holds the pick sentence");
  // Assert the mode never reaches the interactive wizard.
  assert(!res.out.includes("Ready to start"), "unknown login skips the wizard");
  assert(!res.err.includes("Ready to start"), "unknown login hides the prompt");
});

// Both bad flag runs stay clear of the interactive wizard.
Deno.test("browser login never reaches the interactive wizard", async () => {
  const bare = await runGatherer(["--login"]);
  const unknown = await runGatherer(["--login=nosuch"]);
  // Assert neither run prints the wizard gate words.
  assert(!bare.out.includes("Ready to start"), "bare run skips the gate");
  assert(!bare.err.includes("Ready to start"), "bare run hides the gate");
  assert(!unknown.out.includes("Ready to start"), "unknown run skips the gate");
  assert(!unknown.err.includes("Ready to start"), "unknown run hides the gate");
});

// Bare emit before another flag still runs prompt mode.
// The next flag must not read as the emit value.
Deno.test("bare emit before another flag runs prompt mode", async () => {
  const res = await runGatherer(["--emit", "--platforms=manual"]);
  // Assert the mode exits with code 0.
  assert(res.code === 0, "bare emit exits 0");
  // Assert stdout holds the saved summary for prompt mode.
  assert(res.out.includes("Saved 0 orders"), "bare emit runs prompt mode");
  // Assert stderr names no bad mode.
  assert(!res.err.includes("Unknown emit mode"), "bare emit names no bad mode");
});

// Emit with an explicit mode still runs that mode.
Deno.test("emit equals form still runs the named mode", async () => {
  const res = await runGatherer(["--emit=prompt", "--platforms=manual"]);
  // Assert the mode exits with code 0.
  assert(res.code === 0, "emit prompt exits 0");
  // Assert stdout holds the saved summary for prompt mode.
  assert(res.out.includes("Saved 0 orders"), "emit prompt runs prompt mode");
});

// Emit with a bad mode fails and names the mode.
Deno.test("emit with a bad mode names the mode", async () => {
  const res = await runGatherer(["--emit=bogus"]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "bad emit mode exits 1");
  // Assert stderr names the bad mode.
  assert(res.err.includes("Unknown emit mode: bogus"), "bad emit names the mode");
});

// An unknown flag fails instead of passing through silently.
Deno.test("unknown flag fails with plain error", async () => {
  const res = await runGatherer(["--bogus"]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "unknown flag exits 1");
  // Assert stderr names the bad flag.
  assert(res.err.includes("Unknown option: --bogus"), "unknown flag names the flag");
});
