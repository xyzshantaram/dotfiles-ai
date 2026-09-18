// Paging and block checks run with plain functions. No browser opens here.

import { assert, assertEquals } from "@std/assert";
import { isBlockedStatus, pageThrough } from "../src/browser.ts";

Deno.test("pageThrough stops at the end marker", async () => {
  let calls = 0;
  const res = await pageThrough({
    isDone: () => calls >= 2,
    next: () => {
      calls += 1;
      return Promise.resolve(true);
    },
  });
  assertEquals(res.stop, "end", "end marker stops the loop");
  assertEquals(res.pages, 2, "two pages landed");
});

Deno.test("pageThrough stops past the wanted range", async () => {
  let calls = 0;
  const res = await pageThrough({
    isDone: () => false,
    isPastEdge: () => calls >= 1,
    next: () => {
      calls += 1;
      return Promise.resolve(true);
    },
  });
  assertEquals(res.stop, "edge", "old edge stops the loop");
  assertEquals(res.pages, 1, "one page landed");
});

Deno.test("pageThrough reports a stall", async () => {
  const res = await pageThrough({
    isDone: () => false,
    next: () => Promise.resolve(false),
  });
  assertEquals(res.stop, "stalled", "false next means stalled");
  assertEquals(res.pages, 0, "no page landed");
});

Deno.test("pageThrough reports the page cap", async () => {
  let progress = 0;
  const res = await pageThrough({
    limit: 3,
    isDone: () => false,
    onPage: () => {
      progress += 1;
    },
    next: () => Promise.resolve(true),
  });
  assertEquals(res.stop, "limit", "cap stops the loop");
  assertEquals(res.pages, 3, "three pages landed");
  assertEquals(progress, 3, "progress ran per page");
});

Deno.test("pageThrough carries the thrown message", async () => {
  const res = await pageThrough({
    isDone: () => false,
    next: () => Promise.reject(new Error("boom-wall 429")),
  });
  assertEquals(res.stop, "error", "throw means error");
  assert(res.detail?.includes("boom-wall 429"), "detail names the throw");
});

Deno.test("blocked statuses never read as empty", () => {
  for (const status of [401, 403, 407, 418, 429, 503]) {
    assert(isBlockedStatus(status), "status " + status + " counts as blocked");
  }
  assert(!isBlockedStatus(200), "200 is not blocked");
  assert(!isBlockedStatus(404), "404 is not blocked");
});
