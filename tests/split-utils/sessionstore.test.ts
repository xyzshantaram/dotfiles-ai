// Tests for the per session store that keeps two browsers apart.
import { assert, assertEquals } from "@std/assert";
import { DEFAULT_SESSION, sessionStore, sidOf } from "@app/src/sessionstore.ts";

Deno.test("each session gets its own value", () => {
  const store = sessionStore(() => ({ picked: [] as string[] }));
  store.for("a").picked.push("zepto");
  assertEquals(store.for("b").picked.length, 0, "b starts empty");
  assertEquals(store.for("a").picked.join(","), "zepto", "a keeps its pick");
  assertEquals(store.size(), 2, "two sessions live");
});

Deno.test("the same session gets the same value back", () => {
  const store = sessionStore(() => ({ n: 0 }));
  store.for("a").n = 7;
  assertEquals(store.for("a").n, 7, "value survives a second read");
  assertEquals(store.size(), 1, "one session only");
});

Deno.test("the cap drops the least recently used session", () => {
  const store = sessionStore(() => ({ n: 0 }), 2);
  store.for("a");
  store.for("b");
  // Touch a, so b becomes the oldest.
  store.for("a").n = 1;
  store.for("c");
  assertEquals(store.size(), 2, "the cap holds");
  assertEquals(store.for("a").n, 1, "a survived because it was used");
  assertEquals(store.for("b").n, 0, "b was dropped and starts fresh");
});

Deno.test("drop forgets one session", () => {
  const store = sessionStore(() => ({ n: 0 }));
  store.for("a").n = 3;
  store.drop("a");
  assertEquals(store.for("a").n, 0, "a starts fresh after a drop");
});

Deno.test("sidOf falls back when no context arrives", () => {
  assertEquals(sidOf(undefined), DEFAULT_SESSION, "no context");
  assertEquals(sidOf({}), DEFAULT_SESSION, "context with no id");
  assertEquals(sidOf({ sessionId: "" }), DEFAULT_SESSION, "empty id");
  assertEquals(sidOf({ sessionId: "abc" }), "abc", "a real id passes");
  assert(DEFAULT_SESSION.length > 0, "the fallback names something");
});
