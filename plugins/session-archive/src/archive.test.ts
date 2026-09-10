/**
 * Tests for the archive panel's title read (#133).
 *
 * The defect these guard against was a PERFORMANCE defect with no incorrect
 * output: the list rendered perfectly, it just fully decompressed and parsed
 * every archived session log to do it. Correctness tests cannot catch that,
 * so the load-bearing test here is the STATIC one at the bottom — it asserts
 * the expensive call is not present in the source. That is unusual, and it
 * is deliberate: the only observable difference between the fixed and broken
 * versions is which upstream call is made.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { titleOf } from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));

const header = { id: "session-1", cwd: "/home/sid/repos/dotfiles-ai", createdAt: 0 };

/** A cache whose cachedSnapshot returns whatever it was built with. */
function cacheReturning(snapshot: unknown) {
  return {
    cachedSnapshot() {
      return snapshot as { values?: { title?: unknown } } | undefined;
    },
  };
}

describe("titleOf reads the cached row and never costs a log read", () => {
  it("returns the cached title", () => {
    expect(titleOf(cacheReturning({ values: { title: "Implementing aidos" } }), header)).toBe(
      "Implementing aidos",
    );
  });

  it("passes the header through as the identity witness", () => {
    // Upstream matches the stored row against the caller's header so a row
    // from an unrelated log lifecycle is never served. If we stopped passing
    // the header, the cache could not make that check.
    let seen: unknown;
    const cache = {
      cachedSnapshot(meta: unknown) {
        seen = meta;
        return { values: { title: "t" } };
      },
    };
    titleOf(cache, header);
    expect(seen).toBe(header);
  });

  it("degrades to null for a row with no cached title", () => {
    // A session checkpointed before the projection cache could write at all
    // (every write failed until #127) simply has no row. That row lists
    // without a title; it must not fail the listing.
    expect(titleOf(cacheReturning(undefined), header)).toBeNull();
    expect(titleOf(cacheReturning({}), header)).toBeNull();
    expect(titleOf(cacheReturning({ values: {} }), header)).toBeNull();
  });

  it("degrades to null when the service itself is absent", () => {
    expect(titleOf(undefined, header)).toBeNull();
  });

  it("rejects a non-string or empty title rather than rendering it", () => {
    expect(titleOf(cacheReturning({ values: { title: "" } }), header)).toBeNull();
    expect(titleOf(cacheReturning({ values: { title: 42 } }), header)).toBeNull();
    expect(titleOf(cacheReturning({ values: { title: null } }), header)).toBeNull();
    expect(titleOf(cacheReturning({ values: { title: { title: "nested" } } }), header)).toBeNull();
  });

  it("returns null instead of throwing when the cache throws", () => {
    // The whole archive list is lost if this propagates. Upstream states a
    // fail-soft contract for its own durable writes; the read side needs the
    // same discipline.
    const angry = {
      cachedSnapshot(): never {
        throw new Error("cache exploded");
      },
    };
    expect(() => titleOf(angry, header)).not.toThrow();
    expect(titleOf(angry, header)).toBeNull();
  });
});

describe("the listing does not fan out full log loads (#133 regression guard)", () => {
  const raw = readFileSync(join(HERE, "index.ts"), "utf8");
  /**
   * CODE ONLY, comments stripped. index.ts documents the removed call by
   * name — that prose is valuable and must not trip the guard, while a real
   * call must. Written after the first version of this test failed on its
   * own explanatory comment, which is the correct failure for the wrong
   * reason: the assertion is about what the module CALLS, not what it says.
   */
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("never CALLS readTitleSnapshots", () => {
    // This is the actual bug: readTitleSnapshots(everyArchivedId) reads like
    // an index lookup but performs a full readFile + zstd decompress + full
    // parse + structuredClone-per-event PER SESSION. Reintroducing it would
    // pass every behavioural test in this file while making the panel slow
    // again, so the call site itself is what gets pinned.
    //
    // Matches a CALL, not a mention: the explanatory comment in index.ts
    // names the function deliberately and must stay allowed.
    expect(source).not.toMatch(/readTitleSnapshots\s*\(/);
  });

  it("reads titles through the zero-I/O cached snapshot instead", () => {
    expect(source).toMatch(/cachedSnapshot\s*\(/);
    expect(source).toContain("sessionProjectionCache");
  });

  it("looks the cache up once for the listing, not once per row", () => {
    // A per-row service lookup would be correct but pointlessly repeated;
    // more importantly, a lookup inside the loop is how this kind of fan-out
    // creeps back in.
    const lookups = source.match(/service<SessionProjectionCacheService>/g) ?? [];
    expect(lookups.length).toBe(1);
  });
});
