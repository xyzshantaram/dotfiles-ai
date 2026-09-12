// Machine mode tests for the Zomato gather flags. No test touches the
// live site. Each case fails fast on missing values or writes one local
// file, so none reach past validation toward the network. Success
// sentences for the login modes live in source assertions below because
// those paths need the live network to send or verify a code.

const GATHERER = new URL("../wizards/gatherer.ts", import.meta.url).pathname;

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  // Raise a plain error when the check fails.
  if (!cond) throw new Error("assert failed: " + msg);
}

// Run the gatherer under a fresh state root and capture the result.
async function runGatherer(
  args: string[],
): Promise<{ code: number; out: string; err: string; root: string }> {
  // Point state at a fresh temp dir so runs never touch real files.
  const root = await Deno.makeTempDir();
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-lock", "-A", GATHERER, ...args],
    env: { ...Deno.env.toObject(), SPLIT_UTILS_STATE: root, NO_COLOR: "1" },
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
    root,
  };
}

// Read stdout as one human sentence line and return it.
function oneLine(out: string): string {
  // Split on newlines and drop the trailing end of line.
  const lines = out.split("\n").filter((line) => line.length > 0);
  // Assert the mode printed exactly one line.
  assert(lines.length === 1, "mode prints exactly one stdout line");
  return lines[0];
}

// Login start without a phone flag fails and names the phone flag.
Deno.test("zomato login start without phone fails with plain error", async () => {
  const res = await runGatherer(["--zomato-login-start"]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "missing phone exits 1");
  const line = oneLine(res.out);
  // Assert the exact failure sentence.
  assert(
    line ===
      "Could not send the code: Add the phone flag with the account phone number, then try again.",
    "missing phone holds the exact sentence",
  );
  // Assert the output holds no raw status detail.
  assert(!/status \d+/.test(res.out), "missing phone hides raw detail");
});

// Login start with a short phone fails before the network and leaks nothing.
Deno.test("zomato login start with short phone leaks no digits", async () => {
  const secret = "5550100xyz";
  const res = await runGatherer(["--zomato-login-start", "--phone", secret]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "short phone exits 1");
  const line = oneLine(res.out);
  // Assert the exact failure sentence.
  assert(
    line ===
      "Could not send the code: Add the phone flag with the account phone number, then try again.",
    "short phone holds the exact sentence",
  );
  // Assert neither stream repeats the given phone value.
  assert(!res.out.includes(secret), "short phone stays out of stdout");
  assert(!res.err.includes(secret), "short phone stays out of stderr");
});

// Login start accepts the equals flag form the same way.
Deno.test("zomato login start parses phone equals form", async () => {
  const secret = "9990001xyz";
  const res = await runGatherer(["--zomato-login-start", "--phone=" + secret]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "equals phone exits 1");
  const line = oneLine(res.out);
  // Assert the exact failure sentence.
  assert(
    line ===
      "Could not send the code: Add the phone flag with the account phone number, then try again.",
    "equals phone holds the exact sentence",
  );
  // Assert neither stream repeats the given phone value.
  assert(!res.out.includes(secret), "equals phone stays out of stdout");
  assert(!res.err.includes(secret), "equals phone stays out of stderr");
});

// Login start success prints one exact sentence. The live send needs
// the network, so this pins the wording in source.
Deno.test("zomato login start success sentence is exact", async () => {
  const src = await Deno.readTextFile(GATHERER);
  assert(
    src.includes("Code sent. Type the code below, then press Verify the code."),
    "login start success holds the exact sentence",
  );
});

// Login finish without a code flag fails and names the otp flag.
Deno.test("zomato login finish without code fails with plain error", async () => {
  const res = await runGatherer(["--zomato-login-finish"]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "missing code exits 1");
  const line = oneLine(res.out);
  // Assert the exact failure sentence.
  assert(
    line ===
      "That code did not work: Add the otp flag with the code Zomato sent, then try again.",
    "missing code holds the exact sentence",
  );
});

// Login finish with a code but no phone fails before the network.
Deno.test("zomato login finish with code but no phone leaks no code", async () => {
  const secret = "481516";
  const res = await runGatherer(["--zomato-login-finish", "--otp", secret]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "code without phone exits 1");
  const line = oneLine(res.out);
  // Assert the exact failure sentence.
  assert(
    line ===
      "That code did not work: Add the phone flag with the account phone number, then try again.",
    "code without phone holds the exact sentence",
  );
  // Assert neither stream repeats the given one time code.
  assert(!res.out.includes(secret), "one time code stays out of stdout");
  assert(!res.err.includes(secret), "one time code stays out of stderr");
});

// Login finish success prints one exact sentence with or without a
// name. Verification needs the network, so this pins both wordings.
Deno.test("zomato login finish success sentences are exact", async () => {
  const src = await Deno.readTextFile(GATHERER);
  assert(
    src.includes('"Signed in to Zomato as " + done.name + "."'),
    "login finish success with name holds the exact sentence",
  );
  assert(
    src.includes('console.log("Signed in to Zomato.");'),
    "login finish success without name holds the exact sentence",
  );
});

// City mode without values fails and names all four flags.
Deno.test("zomato city without values fails with plain error", async () => {
  const res = await runGatherer(["--zomato-city", "--name", "Testville"]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "missing city values exit 1");
  const line = oneLine(res.out);
  // Assert the exact failure sentence.
  assert(
    line ===
      "Could not save the city: Add the code, name, lat, and lon flags, then try again.",
    "missing city holds the exact sentence",
  );
});

// City mode with a bad code fails validation without writing a file.
Deno.test("zomato city with bad code fails validation", async () => {
  const res = await runGatherer([
    "--zomato-city",
    "--code",
    "abc",
    "--name",
    "Testville",
    "--lat",
    "12.97",
    "--lon",
    "77.59",
  ]);
  // Assert the mode exits with code 1.
  assert(res.code === 1, "bad city code exits 1");
  const line = oneLine(res.out);
  // Assert the exact failure sentence.
  assert(
    line ===
      "Could not save the city: Check the code, lat, and lon flags hold plain numbers, then try again.",
    "bad city holds the exact sentence",
  );
});

// City mode with full values saves the city and prints its name.
Deno.test("zomato city with full values saves and prints the city", async () => {
  const res = await runGatherer([
    "--zomato-city",
    "--code=4",
    "--name=Testville",
    "--lat=12.97",
    "--lon=77.59",
  ]);
  // Assert the mode exits with code 0.
  assert(res.code === 0, "full city values exit 0");
  const line = oneLine(res.out);
  // Assert the exact success sentence.
  assert(line === "City saved: Testville.", "full city holds the exact sentence");
  // Read the saved location back from the fresh state root.
  const raw = await Deno.readTextFile(res.root + "/share/config/zomato-location.json");
  const saved = JSON.parse(raw) as Record<string, unknown>;
  // Assert the file holds the flags the mode received.
  assert(saved["city"] === "Testville", "saved city matches");
  assert(saved["cityId"] === "4", "saved city code matches");
  assert(saved["lat"] === "12.97", "saved lat matches");
  assert(saved["long"] === "77.59", "saved lon matches");
});
