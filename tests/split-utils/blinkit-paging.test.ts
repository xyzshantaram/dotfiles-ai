// Blinkit history paging (#189).
//
// THE DEFECT, AND THE TWO WRONG GUESSES BEFORE THE ANSWER.
//
// A 200-day gather returned ten Blinkit orders spanning ten days. Ten is the
// page size, so the loop was fetching one page and stopping.
//
// The loop read `response.pagination.cursor` and rebuilt the next URL by hand,
// with a hardcoded `limit=10` and its own page arithmetic. The first fix
// searched the response for any cursor-shaped key. It STILL returned ten
// orders, because Blinkit does not send a `cursor` key at all. A probe of the
// real response settled it:
//
//   "pagination": { "next_url": "/v1/layout/order_history?offset=0&limit=10&
//                                cursor=cD0yNjI4NTEzOTI3&...&page_index=0" }
//
// The server hands over the complete next URL, with the cursor inside it,
// which is why a key search never found it. Following next_url replaces the
// hand-built query entirely, including the hardcoded limit.
//
// These pins need no network: they exercise the lookup with the real shape.
import { assertEquals } from "@std/assert";
import { readNextUrl } from "@app/src/browser.ts";

Deno.test("the real Blinkit shape is read", () => {
  // Copied from a live response, trimmed. This exact shape returned null under
  // both the original code and the cursor-search fix.
  const response = {
    snippets: [],
    pagination: {
      next_url:
        "/v1/layout/order_history?offset=0&limit=10&cursor=cD0yNjI4NTEzOTI3&get_failed_carts_history=false&page_index=0&total_entities_processed=1",
    },
  };
  assertEquals(
    readNextUrl(response),
    "/v1/layout/order_history?offset=0&limit=10&cursor=cD0yNjI4NTEzOTI3&get_failed_carts_history=false&page_index=0&total_entities_processed=1",
  );
});

Deno.test("a camel case variant is read", () => {
  assertEquals(readNextUrl({ pagination: { nextUrl: "/page/2" } }), "/page/2");
});

Deno.test("no next page is null, which is the honest end", () => {
  // The caller decides whether that end is expected: reaching the date cutoff
  // is normal, and running out before it means orders are missing.
  assertEquals(readNextUrl({ pagination: {} }), null);
  assertEquals(readNextUrl({ snippets: [] }), null);
  assertEquals(readNextUrl({}), null);
});

Deno.test("an empty url is not a url", () => {
  // An empty string would refetch the same page forever.
  assertEquals(readNextUrl({ pagination: { next_url: "" } }), null);
});

Deno.test("junk is null, never a throw", () => {
  // This runs against a live server's JSON, so every branch must survive a
  // shape nobody expected rather than ending the gather with a stack trace.
  assertEquals(readNextUrl(null), null);
  assertEquals(readNextUrl("a string"), null);
  assertEquals(readNextUrl(42), null);
  assertEquals(readNextUrl({ pagination: "not an object" }), null);
  assertEquals(readNextUrl({ pagination: { next_url: 7 } }), null);
});

Deno.test("a relative url resolves against the site origin", () => {
  // The loop joins it with new URL(nextUrl, origin). Pinned here because the
  // server sends a path while the fetch needs an absolute url.
  const next = readNextUrl({ pagination: { next_url: "/v1/layout/order_history?cursor=abc" } });
  assertEquals(
    new URL(next as string, "https://blinkit.com").toString(),
    "https://blinkit.com/v1/layout/order_history?cursor=abc",
  );
});
