// The browser binary rule (#186).
//
// WHY THIS TEST EXISTS. src/browser.ts used to export DEFAULT_CHROMIUM, a
// hardcoded "/home/sid/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
// and both of its "fallback" branches launched THAT instead of the bundled
// build its own comment promised. A user on Windows met it as a launch failure
// naming a stranger's home directory. It shipped past 334 tests because the
// decision lived inside a launchPersistentContext call that no test could
// reach without a real browser.
//
// So the rule is a pure function now, and these are its pins. They assert the
// ORDER and the guarantee, not the spelling of a path.
import { assertEquals, assertStringIncludes } from "@std/assert";
import { binaryOrder } from "@app/src/browser.ts";

Deno.test("an explicit path is used alone", () => {
  assertEquals(binaryOrder({ executablePath: "/opt/chrome" }), ["explicit"]);
});

Deno.test("a branded channel falls back to the bundled build", () => {
  // The case the old comment named and the old code got wrong: a Windows or
  // macOS machine asking for channel "chrome" without Chrome installed.
  assertEquals(binaryOrder({ channel: "chrome" }), ["channel", "bundled"]);
});

Deno.test("with nothing configured the bundled build is used", () => {
  assertEquals(binaryOrder({}), ["bundled"]);
});

Deno.test("the bundled build is always last and always reachable", () => {
  // The guarantee, stated as a property rather than as three examples: every
  // path that can fail ends at the one strategy that needs nothing installed
  // on the machine. A future branch that forgets it reddens here.
  for (
    const opts of [
      {},
      { channel: "chrome" },
      { channel: "msedge" },
    ] as const
  ) {
    const order = binaryOrder(opts);
    assertEquals(order[order.length - 1], "bundled", JSON.stringify(opts));
  }
  // An explicit path is the one exception: the caller named a binary, so
  // silently launching a different one would be worse than failing.
  assertEquals(binaryOrder({ executablePath: "/opt/chrome" }), ["explicit"]);
});

Deno.test("no developer machine path survives in the shipped source", () => {
  // The defect itself, pinned directly. Any absolute home path in a shipped
  // module is wrong for every machine except the one it was written on.
  const src = Deno.readTextFileSync(new URL(import.meta.resolve("@app/src/browser.ts")));
  const live = src
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  assertEquals(live.includes("/home/"), false, "a home path is live in browser.ts");
  assertEquals(live.includes("DEFAULT_CHROMIUM"), false, "the constant is back");
  // The comment explaining the removal may mention the old path, and should,
  // so the next reader learns why the constant is absent rather than adding
  // one back. Pin the EXPLANATION, not its wording: the fallback must be
  // named as Playwright's bundled build somewhere in this file.
  assertStringIncludes(src, "bundled build");
});
