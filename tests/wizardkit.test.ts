// Tests for the wizardkit wrap helper. Wrapping keeps lines short
// and never splits words unless one word fills the whole width.
import { wrap } from "../src/wizardkit.ts";

// Fail the test when a flag misses.
function assert(cond: boolean, msg: string): void {
  // Throw a clear error when false.
  if (!cond) throw new Error("assert failed: " + msg);
}

// Short text passes through untouched.
Deno.test("wrap keeps short lines whole", () => {
  // Wrap a short line at a wide width.
  const out = wrap("Pick a task", 76);
  // Check the text survives whole.
  assert(out === "Pick a task", "short line whole: " + out);
});

// Long text breaks at word gaps inside the width.
Deno.test("wrap breaks long lines at word gaps", () => {
  // Wrap a long hint at a narrow width.
  const out = wrap("You can use this program entirely for free. It writes one summary.", 40);
  // Check every line fits.
  for (const line of out.split("\n")) {
    assert(line.length <= 40, "line fits: " + line);
  }
  // Check the words survive in order.
  assert(
    out.replace(/\n/g, " ") ===
      "You can use this program entirely for free. It writes one summary.",
    "words survive: " + out,
  );
});

// Embedded newlines survive as paragraph breaks.
Deno.test("wrap keeps blank lines", () => {
  // Wrap text with a blank line inside.
  const out = wrap("First.\n\nSecond.", 76);
  // Check the blank line survives.
  assert(out === "First.\n\nSecond.", "blank survives: " + out);
});
