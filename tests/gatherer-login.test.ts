// Machine mode tests for the browser login flag. No test touches
// the live site. Both cases fail fast on a bad flag value, so none
// reach past validation toward the browser. Success paths need a
// headed window, so source assertions do not cover them here.

const GATHERER = new URL("../wizards/gatherer.ts", import.meta.url).pathname;

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

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
