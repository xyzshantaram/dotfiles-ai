// Tests for the installer pure helpers. Run with deno test.
// Network and disk stay untouched: only parsing plus naming is covered.

import { desktopEntry, parseArgs, runtimeArtifact, shortcutExec } from "../wizardkit/install.ts";

// Throw on a false check with a plain message.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("parseArgs reads valued flags", () => {
  const out = parseArgs(["--app", "demo", "--version", "0.1.0"]);
  assert(out["app"] === "demo", "reads app");
  assert(out["version"] === "0.1.0", "reads version");
});

Deno.test("parseArgs reads a bare flag as true", () => {
  const out = parseArgs(["--app", "demo", "--dry"]);
  assert(out["dry"] === "true", "bare flag is true");
});

Deno.test("parseArgs throws on bare words", () => {
  let threw = false;
  try {
    parseArgs(["demo"]);
  } catch {
    threw = true;
  }
  assert(threw, "bare word throws");
});

Deno.test("runtimeArtifact names one file per platform", () => {
  assert(
    runtimeArtifact("linux", "x86_64") === "wizardkit-runtime-linux-x86_64",
    "names linux",
  );
  assert(
    runtimeArtifact("darwin", "aarch64") === "wizardkit-runtime-macos-aarch64",
    "names macos",
  );
  assert(
    runtimeArtifact("windows", "x86_64") ===
      "wizardkit-runtime-windows-x86_64.exe",
    "names windows",
  );
  assert(runtimeArtifact("linux", "aarch64") === null, "unknown is null");
});

Deno.test("shortcutExec points the runtime at the wrapper", () => {
  const line = shortcutExec("/r/bin", "Demo", "/home/u/.deno/bin/demo");
  assert(line.includes("/r/bin"), "holds runtime");
  assert(line.includes("--title"), "passes title");
  assert(line.includes("/home/u/.deno/bin/demo"), "holds wrapper");
});

Deno.test("desktopEntry names the app plus exec", () => {
  const text = desktopEntry("Demo", "/r/bin --title Demo -- /w/demo");
  assert(text.includes("Name=Demo"), "names app");
  assert(text.includes("Exec=/r/bin"), "holds exec");
});
