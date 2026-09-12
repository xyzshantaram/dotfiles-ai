// Headless Chromium names itself in the user agent and in its client
// hint brands. Zepto answers that token with HTTP 429, which reads as
// a rate limit but never clears. These checks pin the sanitizer.

import { assert, assertEquals } from "@std/assert";
import {
  isHeadlessUa,
  stripHeadlessUa,
  uaMajorVersion,
  uaMetadata,
  uaPlatform,
} from "../src/browser.ts";

const HEADLESS =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36";
const PLAIN =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

Deno.test("headless agent is detected and rewritten", () => {
  assert(isHeadlessUa(HEADLESS), "headless token found");
  assert(!isHeadlessUa(PLAIN), "plain agent holds no token");
  assertEquals(stripHeadlessUa(HEADLESS), PLAIN, "rewrite matches the plain agent");
  assertEquals(stripHeadlessUa(PLAIN), PLAIN, "plain agent stays as it is");
});

Deno.test("version and platform come from the agent", () => {
  assertEquals(uaMajorVersion(HEADLESS), "151", "major version from a headless agent");
  assertEquals(uaPlatform(HEADLESS), "Linux", "Linux agent");
  assertEquals(
    uaPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0"),
    "Windows",
    "Windows agent",
  );
  assertEquals(
    uaPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/151.0.0.0"),
    "macOS",
    "macOS agent",
  );
});

Deno.test("client hint brands carry no headless token", () => {
  const meta = uaMetadata(HEADLESS, false);
  const brands = meta.brands.map((item) => item.brand).join(" ");
  assert(!brands.includes("Headless"), "brands drop the headless name");
  assertEquals(meta.brands[0].version, "151", "brand version matches the agent");
  assertEquals(meta.platform, "Linux", "platform matches the agent");
  assertEquals(meta.mobile, false, "desktop metadata stays desktop");
  assertEquals(uaMetadata(HEADLESS, true).mobile, true, "mobile flag carries");
});
