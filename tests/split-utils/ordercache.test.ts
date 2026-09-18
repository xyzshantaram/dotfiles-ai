// The order-detail cache and the throttle policy (#189).
//
// A 200-day Blinkit gather sent 162 detail requests in a burst, the site
// answered 135 with HTTP 429, and the run printed "Saved 27 orders" as though
// it had succeeded. Two changes answer that, and they do different jobs:
//
//   BACKOFF makes one run survive a throttle.
//   THE CACHE makes the next run not send the requests at all.
//
// Backoff alone leaves every later gather just as expensive, which is what
// trips the limit in the first place.
import { assertEquals } from "@std/assert";
import { isThrottled, retryDelays } from "@app/src/browser.ts";
import {
  orderCachePath,
  readCachedDetail,
  writeCachedDetail,
} from "@app/src/ordercache.ts";

Deno.test("a throttle is distinguished from a failure", () => {
  // 429 and 503 are worth waiting out. A 404 is not: retrying it just spends
  // the user's time to reach the same answer.
  assertEquals(isThrottled(429), true);
  assertEquals(isThrottled(503), true);
  assertEquals(isThrottled(404), false);
  assertEquals(isThrottled(500), false);
  assertEquals(isThrottled(200), false);
});

Deno.test("the waits grow and are bounded", () => {
  const delays = retryDelays();
  assertEquals(delays.length > 0, true);
  for (let i = 1; i < delays.length; i++) {
    // A fixed short retry against a throttle is just more throttling.
    assertEquals(delays[i] > delays[i - 1], true, "delay " + i + " must grow");
  }
  // A human is watching the run, so the total wait stays in seconds.
  const total = delays.reduce((a, b) => a + b, 0);
  assertEquals(total <= 60_000, true, "total wait must stay under a minute");
});

Deno.test("a cached detail round-trips", () => {
  const root = Deno.makeTempDirSync({ prefix: "ordercache-" });
  const prior = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    assertEquals(readCachedDetail("blinkit", "123"), null, "a cold cache is a miss");
    assertEquals(writeCachedDetail("blinkit", "123", '{"ok":true}'), true);
    assertEquals(readCachedDetail("blinkit", "123"), '{"ok":true}');
    // Platforms do not collide.
    assertEquals(readCachedDetail("zepto", "123"), null);
  } finally {
    if (prior !== undefined) Deno.env.set("SPLIT_UTILS_STATE", prior);
    else Deno.env.delete("SPLIT_UTILS_STATE");
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("an order id cannot escape the cache directory", () => {
  // Ids arrive from a web response. A traversal in one must not write outside
  // the cache, so the path is built from a filtered id rather than the raw one.
  const root = Deno.makeTempDirSync({ prefix: "ordercache-" });
  const prior = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    const path = orderCachePath("blinkit", "../../../../etc/passwd");
    assertEquals(path.includes(".."), false, "a traversal survived into the path");
    assertEquals(path.startsWith(root), true, "the path left the state root");
  } finally {
    if (prior !== undefined) Deno.env.set("SPLIT_UTILS_STATE", prior);
    else Deno.env.delete("SPLIT_UTILS_STATE");
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("an unwritable cache is a miss, never a crash", () => {
  // A cache that throws is worse than no cache: it would end a gather that is
  // otherwise working.
  const prior = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", "/proc/nonexistent-and-unwritable");
  try {
    assertEquals(writeCachedDetail("blinkit", "1", "x"), false);
    assertEquals(readCachedDetail("blinkit", "1"), null);
  } finally {
    if (prior !== undefined) Deno.env.set("SPLIT_UTILS_STATE", prior);
    else Deno.env.delete("SPLIT_UTILS_STATE");
  }
});

Deno.test("an empty cached body is a miss", () => {
  // A truncated write must not be served as a real response.
  const root = Deno.makeTempDirSync({ prefix: "ordercache-" });
  const prior = Deno.env.get("SPLIT_UTILS_STATE");
  Deno.env.set("SPLIT_UTILS_STATE", root);
  try {
    writeCachedDetail("blinkit", "empty", "");
    assertEquals(readCachedDetail("blinkit", "empty"), null);
  } finally {
    if (prior !== undefined) Deno.env.set("SPLIT_UTILS_STATE", prior);
    else Deno.env.delete("SPLIT_UTILS_STATE");
    Deno.removeSync(root, { recursive: true });
  }
});
