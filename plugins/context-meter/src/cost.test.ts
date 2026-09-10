/**
 * Unit tests for the context-meter cost pricing (ticket #99).
 *
 * Everything here runs in plain node: cost.ts imports nothing
 * browser-side, so no react/jsdom stands in for the real semantics.
 * A passing suite with wrong rates wired is the failure this file
 * exists to prevent — the cache tests assert exact dollar figures,
 * not just "a number came out".
 */

import { describe, expect, it } from "vitest";
import {
  explainMissingRate,
  formatApproxCost,
  isPriced,
  priceBuckets,
  rateKey,
  resolveRate,
} from "./cost";

// Real models.dev shape (anthropic/claude-sonnet-5, 2026-09-09): input 2,
// output 10, cache_read 0.2, cache_write 2.5 USD per million.
const SONNET_RATE = { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 };

describe("priceBuckets carries the cache rates through", () => {
  it("prices one million cache-read tokens at cache_read, not input", () => {
    const buckets = {
      uncachedInputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 0,
      outputTokens: 0,
    };
    // Same counts billed with the cache tokens flattened into input.
    const flattened = {
      uncachedInputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    };
    const wired = priceBuckets(buckets, SONNET_RATE);
    const flat = priceBuckets(flattened, SONNET_RATE);
    // Exact figures pin the wiring: $0.20 at the read rate, $2.00 at input.
    expect(wired).toBeCloseTo(0.2, 10);
    expect(flat).toBeCloseTo(2.0, 10);
    // The ticket's proof: equal numbers mean the rates are not wired in.
    expect(wired).not.toEqual(flat);
  });

  it("prices cache writes at cache_write, which can exceed input", () => {
    const buckets = {
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 1_000_000,
      outputTokens: 0,
    };
    // Anthropic charges writes ABOVE input (2.5 vs 2.0): flattening would
    // underprice a write-heavy session, not just overprice reads.
    expect(priceBuckets(buckets, SONNET_RATE)).toBeCloseTo(2.5, 10);
  });

  it("sums all four buckets at their own rates", () => {
    const buckets = {
      uncachedInputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      outputTokens: 1_000_000,
    };
    expect(priceBuckets(buckets, SONNET_RATE)).toBeCloseTo(2 + 0.2 + 2.5 + 10, 10);
  });

  it("is linear, so future splits reconcile: main + sub == total", () => {
    // No main/subagent split reaches the client today (see the report), but
    // when one does, pricing each part at its rate must sum to the whole.
    // Linearity is what makes that assertion hold; pin it here.
    const main = {
      uncachedInputTokens: 3_000_000,
      cacheReadTokens: 20_000_000,
      cacheWriteTokens: 1_000_000,
      outputTokens: 500_000,
    };
    const sub = {
      uncachedInputTokens: 1_000_000,
      cacheReadTokens: 2_000_000,
      cacheWriteTokens: 0,
      outputTokens: 250_000,
    };
    const total = {
      uncachedInputTokens: main.uncachedInputTokens + sub.uncachedInputTokens,
      cacheReadTokens: main.cacheReadTokens + sub.cacheReadTokens,
      cacheWriteTokens: main.cacheWriteTokens + sub.cacheWriteTokens,
      outputTokens: main.outputTokens + sub.outputTokens,
    };
    expect(priceBuckets(main, SONNET_RATE) + priceBuckets(sub, SONNET_RATE)).toBeCloseTo(
      priceBuckets(total, SONNET_RATE),
      10,
    );
  });

  it("treats non-finite buckets as zero instead of NaN-poisoning the total", () => {
    const buckets = {
      uncachedInputTokens: NaN,
      cacheReadTokens: undefined as unknown as number,
      cacheWriteTokens: 0,
      outputTokens: 1_000_000,
    };
    expect(priceBuckets(buckets, SONNET_RATE)).toBeCloseTo(10, 10);
  });
});

describe("resolveRate never guesses", () => {
  const doc = {
    rates: { "meridian/claude-sonnet-5": SONNET_RATE },
    overrides: { "zai/glm-5.3-flash": { input: 1, output: 1, cache_read: 1, cache_write: 1 } },
  };

  it("resolves a sync-written rate by provider/model", () => {
    expect(resolveRate(doc, "meridian", "claude-sonnet-5")).toEqual(SONNET_RATE);
  });

  it("prefers a local override over the sync-written rate", () => {
    const withBoth = {
      rates: { "zai/glm-5.3-flash": SONNET_RATE },
      overrides: { "zai/glm-5.3-flash": { input: 1, output: 1, cache_read: 1, cache_write: 1 } },
    };
    expect(resolveRate(withBoth, "zai", "glm-5.3-flash")).toEqual({
      input: 1,
      output: 1,
      cache_read: 1,
      cache_write: 1,
    });
  });

  it("returns null for an unpriced model, a null doc, and a missing selection", () => {
    // Null (not zero, not a guess) is what renders "unknown price".
    expect(resolveRate(doc, "nope", "nothing")).toBeNull();
    expect(resolveRate(null, "meridian", "claude-sonnet-5")).toBeNull();
    expect(resolveRate(doc, null, "claude-sonnet-5")).toBeNull();
    expect(resolveRate(doc, "meridian", undefined)).toBeNull();
  });

  it("rejects rows without input+output, and accepts rows with zeroed cache dims", () => {
    expect(isPriced({ input: 1 })).toBe(false);
    expect(isPriced({ input: 1, output: 2 })).toBe(true);
    // models.dev omits uncharged dimensions; only input+output are required.
    expect(isPriced({ input: 1, output: 2, cache_read: 0 })).toBe(true);
    expect(resolveRate({ rates: { "a/b": { input: 1 } as never } }, "a", "b")).toBeNull();
  });

  it("keys rows as provider/model", () => {
    expect(rateKey("meridian", "claude-sonnet-5")).toBe("meridian/claude-sonnet-5");
  });
});

describe("formatApproxCost always carries the tilde", () => {
  it("prefixes every figure, including the ticket's example", () => {
    expect(formatApproxCost(0.04)).toBe("~$0.04");
    expect(formatApproxCost(12.5)).toBe("~$12.50");
  });

  it("keeps sub-cent spend visible instead of rounding to $0.00", () => {
    // A cheap model printing "$0.00" reads as free; four decimals keeps it honest.
    expect(formatApproxCost(0.004)).toBe("~$0.0040");
  });
});

/**
 * #134. Three unrelated failures used to render one identical string,
 * "unknown price", with no console output — a dead settings transport, an
 * unresolved model, and a genuinely unpriced model. A bug report could not
 * say which half to look at, which is why the real cause (settings are
 * mirrored from the host only over a LOOPBACK connection, so a proxied URL
 * never receives the price table at all) survived a restart and a day of
 * diagnosis.
 *
 * These tests pin the DIAGNOSIS, and specifically its ORDER: reporting a
 * later cause while an earlier one holds sends a reader to the wrong half.
 */
describe("explainMissingRate", () => {
  const priced = { rates: { "meridian/claude-opus-5": { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } } };

  it("blames the transport when the scope says unavailable", () => {
    const m = explainMissingRate("unavailable", priced, "meridian", "claude-opus-5");
    expect(m.kind).toBe("transport");
    // Must name the loopback constraint: that sentence is the whole point.
    expect(m.detail).toMatch(/loopback/);
  });

  it("blames the transport when the document never arrived", () => {
    expect(explainMissingRate(undefined, undefined, "meridian", "claude-opus-5").kind).toBe("transport");
    expect(explainMissingRate(undefined, null, "meridian", "claude-opus-5").kind).toBe("transport");
  });

  it("prefers the transport cause over a missing model", () => {
    // ORDERING IS THE CONTRACT. With no document, the model is unknowable
    // too; reporting "no model reported" would send the reader to the model
    // seat while the real fault is that nothing was ever received.
    expect(explainMissingRate("unavailable", undefined, null, null).kind).toBe("transport");
  });

  it("blames the model only once the document is present", () => {
    expect(explainMissingRate("ready", priced, null, "claude-opus-5").kind).toBe("no-model");
    expect(explainMissingRate("ready", priced, "meridian", null).kind).toBe("no-model");
    expect(explainMissingRate("ready", priced, "", "").kind).toBe("no-model");
  });

  it("blames the rate table only when document AND model are present", () => {
    const m = explainMissingRate("ready", priced, "meridian", "some-unlisted-model");
    expect(m.kind).toBe("unpriced");
    // Names the exact key, so the reader knows what row to add.
    expect(m.detail).toContain("meridian/some-unlisted-model");
  });

  it("treats an unfamiliar transport status as present rather than broken", () => {
    // A future status string must not be mislabelled as a dead transport;
    // degrade to judging the document itself.
    expect(explainMissingRate("something-new", priced, "meridian", "nope").kind).toBe("unpriced");
    expect(explainMissingRate(undefined, priced, "meridian", "nope").kind).toBe("unpriced");
  });

  it("gives every state a distinct label, which is the entire point", () => {
    const labels = [
      explainMissingRate("unavailable", undefined, null, null).label,
      explainMissingRate("ready", priced, null, null).label,
      explainMissingRate("ready", priced, "meridian", "nope").label,
    ];
    expect(new Set(labels).size).toBe(3);
    // And none of them may be the old catch-all.
    for (const label of labels) expect(label).not.toBe("unknown price");
  });
});
