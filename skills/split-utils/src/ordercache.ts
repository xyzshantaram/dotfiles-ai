// A cache of raw order-detail responses, so a repeat gather refetches nothing.
//
// WHY THIS EXISTS. A history LISTING is one request per page, but the detail
// pass is one request per ORDER. A 200-day Blinkit window sent 162 of them in
// a burst, the site answered 135 with HTTP 429, and the run still printed
// "Saved 27 orders" (#189). Backing off helps that one run finish. It does not
// help the next one, which would send all 162 again.
//
// An order's bill does not change once it is delivered, so refetching it is
// pure waste and it is the waste that trips the throttle. With this cache a
// second gather over the same window sends ZERO detail requests, and a run
// interrupted by a throttle resumes instead of starting over. That turns the
// rate limit from a wall into a delay.
//
// THE RAW RESPONSE IS CACHED, NOT THE MAPPED ORDER, deliberately. Mapping is
// this repository's own code and it changes: caching its output would freeze
// yesterday's parser and hide today's fix. Caching the response keeps the
// network result and re-runs the mapping every time.
import { shareDir } from "./paths.ts";

/** Directory holding one platform's cached detail responses. */
export function orderCacheDir(platform: string): string {
  return shareDir() + "/cache/orders/" + platform;
}

/** Path for one order's cached detail response. */
export function orderCachePath(platform: string, orderId: string): string {
  // The id goes through a strict filter rather than into a path as given: it
  // arrives from a web response, and "../" in an order id must not be able to
  // write outside the cache.
  const safe = orderId.replace(/[^A-Za-z0-9_-]/g, "_");
  return orderCacheDir(platform) + "/" + safe + ".json";
}

/**
 * Read one cached detail response, or null when it is not cached.
 * Any read failure is a miss: a cache that throws is worse than no cache.
 */
export function readCachedDetail(platform: string, orderId: string): string | null {
  try {
    const text = Deno.readTextFileSync(orderCachePath(platform, orderId));
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Write one detail response to the cache. Failures are swallowed on purpose:
 * a cache that cannot write must not end a gather that is otherwise working.
 * Returns true when the write landed, so a caller can report cache health.
 */
export function writeCachedDetail(
  platform: string,
  orderId: string,
  text: string,
): boolean {
  try {
    Deno.mkdirSync(orderCacheDir(platform), { recursive: true });
    Deno.writeTextFileSync(orderCachePath(platform, orderId), text);
    return true;
  } catch {
    return false;
  }
}
