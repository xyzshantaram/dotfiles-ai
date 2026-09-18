// Blinkit history paging (#189).
//
// THE DEFECT. The loop read the cursor from ONE fixed path,
// `response.pagination.cursor`, for both the bare first request and the fully
// parameterised later ones. The first response did not carry it there, so the
// loop broke after a single page of ten orders AND REPORTED SUCCESS. The owner
// only noticed because they knew they had more than ten orders.
//
// The same file already contained the correct pattern: Zepto pages through the
// shared `pageThrough` helper, stops on the DATE rather than a count, and
// pushes a failure for every abnormal stop. `pageThrough`'s own docstring names
// the trap Blinkit fell into: "Run one paging loop and return why it stopped,
// never a bare list. The trap it closes is a loop that ends calmly with no
// reason said."
//
// These pins need no network: they exercise the cursor lookup directly with
// real response shapes.
import { assertEquals } from "@std/assert";
// From src/browser.ts, beside pageThrough, NOT from scripts/gatherer.ts: that
// file is an entry point which calls Deno.exit(1) at import time, so importing
// it from a test kills the isolate. That is also the structural reason the loop
// it fixes had no pins in the first place.
import { findCursor } from "@app/src/browser.ts";

Deno.test("the known path is found", () => {
  const res = { pagination: { cursor: "abc123" }, snippets: [] };
  assertEquals(findCursor(res), "abc123");
});

Deno.test("a cursor nested elsewhere is still found", () => {
  // The shape this bug was about: the first response puts it somewhere the
  // fixed path never looked. Any of these would previously have ended the run.
  assertEquals(findCursor({ page_info: { cursor: "deep1" } }), "deep1");
  assertEquals(findCursor({ data: { paging: { next_cursor: "deep2" } } }), "deep2");
  assertEquals(findCursor({ a: { b: { c: { nextCursor: "deep3" } } } }), "deep3");
});

Deno.test("a cursor inside a list is found", () => {
  assertEquals(findCursor({ blocks: [{ noop: 1 }, { cursor: "inlist" }] }), "inlist");
});

Deno.test("no cursor means no cursor", () => {
  // The honest end of a run. This must stay distinguishable from a shape we
  // failed to read, which is why the caller reports one and not the other.
  assertEquals(findCursor({ pagination: {} }), null);
  assertEquals(findCursor({ snippets: [{ widget_type: "order_history_container_vr" }] }), null);
  assertEquals(findCursor(null), null);
  assertEquals(findCursor("a string"), null);
});

Deno.test("an empty cursor is not a cursor", () => {
  // An empty string would page forever against the same URL.
  assertEquals(findCursor({ pagination: { cursor: "" } }), null);
});

Deno.test("only cursor-shaped keys count", () => {
  // A search must not promote any passing string to a cursor. `id` and `token`
  // are the kind of neighbours that would make this silently wrong.
  assertEquals(findCursor({ id: "not-a-cursor", token: "also-not" }), null);
});

Deno.test("the search is depth capped", () => {
  // Guards the cost on a large response. Seven levels is past the cap.
  let deep: Record<string, unknown> = { cursor: "too-deep" };
  for (let i = 0; i < 8; i++) deep = { nest: deep };
  assertEquals(findCursor(deep), null);
});
