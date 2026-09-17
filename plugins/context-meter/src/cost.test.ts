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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  effectiveExplainStatus,
  explainMissingRate,
  formatApproxCost,
  isPriced,
  priceBuckets,
  rateKey,
  resolveRate,
  selectCostBranch,
  summarizeCost,
  unwrapRoutePrices,
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

  it("keeps the loopback cause on the unavailable branch even when a doc is present", () => {
    // Branch purity both ways: a present doc must not dilute the scope verdict.
    const m = explainMissingRate("unavailable", priced, "meridian", "claude-opus-5");
    expect(m.label).toBe("prices unavailable");
    expect(m.detail).toMatch(/loopback/);
  });

  it("names a DIFFERENT cause when the doc is missing but the transport is up (#161)", () => {
    // On loopback the scope status is never 'unavailable', yet the panel read
    // 'prices unavailable' there too — the old text asserted the loopback cause
    // unconditionally and sent the investigation to the wrong half. A missing
    // document with a live transport is a different failure with a different
    // remedy and must read differently.
    for (const status of ["loading", "ready", "idle", undefined]) {
      const m = explainMissingRate(status, undefined, "meridian", "claude-opus-5");
      expect(m.kind).toBe("transport");
      expect(m.label).not.toBe("prices unavailable");
      expect(m.detail).not.toMatch(/loopback/);
    }
  });

  it("says which scope status it actually saw when the doc is missing (#161)", () => {
    const m = explainMissingRate("loading", undefined, "meridian", "claude-opus-5");
    expect(m.detail).toContain("loading");
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
      explainMissingRate("ready", undefined, "meridian", "claude-opus-5").label,
      explainMissingRate("ready", priced, null, null).label,
      explainMissingRate("ready", priced, "meridian", "nope").label,
    ];
    expect(new Set(labels).size).toBe(4);
    // And none of them may be the old catch-all.
    for (const label of labels) expect(label).not.toBe("unknown price");
  });
});

/**
 * CROSS-PROVIDER ESTIMATES (#161, #126 decision 4; owner's chosen shape).
 *
 * An unresolved provider/model key must never invent a rate — but where the
 * SAME bare model is priced under other providers, the panel may show the
 * MEDIAN session cost as the headline with the min-max RANGE underneath,
 * labelled estimated. Exact rows always win; overrides win per key.
 */
describe("summarizeCost", () => {
  const buckets = {
    uncachedInputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 1_000_000,
  };
  // $1/M input + $1/M output => exactly $2 for the buckets above, per unit row.
  const doc = {
    rates: {
      "meridian/claude-opus-5": { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      "electronhub/claude-opus-5": { input: 1, output: 3, cache_read: 0.1, cache_write: 1 },
      "zai/claude-opus-5": { input: 3, output: 9, cache_read: 0.3, cache_write: 3 },
    },
    overrides: {},
  };

  it("prices an exact provider/model row with no range", () => {
    const s = summarizeCost(buckets, doc, "meridian", "claude-opus-5");
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("exact");
    expect(s!.key).toBe("meridian/claude-opus-5");
    // 1M * 5 + 1M * 25, per million.
    expect(s!.cost).toBeCloseTo(30, 10);
  });

  it("estimates the median across providers sharing the bare model", () => {
    // No "nowhere/claude-opus-5" row: candidate costs are 30 (meridian),
    // 4 (electronhub), 12 (zai). Median 12, range 4-30.
    const s = summarizeCost(buckets, doc, "nowhere", "claude-opus-5");
    expect(s).not.toBeNull();
    expect(s!.kind).toBe("estimated");
    expect(s!.cost).toBeCloseTo(12, 10);
    expect(s!.min).toBeCloseTo(4, 10);
    expect(s!.max).toBeCloseTo(30, 10);
    expect(s!.providers.sort()).toEqual(["electronhub", "meridian", "zai"]);
  });

  it("averages the two middle costs for an even candidate count", () => {
    const two = {
      rates: {
        "a/m": { input: 2, output: 2, cache_read: 0, cache_write: 0 },
        "b/m": { input: 4, output: 4, cache_read: 0, cache_write: 0 },
      },
    };
    // Costs 4 and 8: median is their mean, 6 — not the lower, not the upper.
    const s = summarizeCost(buckets, two, "c", "m");
    expect(s!.kind).toBe("estimated");
    expect(s!.cost).toBeCloseTo(6, 10);
  });

  it("lets an override win its key inside the candidate set", () => {
    const withOverride = {
      rates: { "a/m": { input: 2, output: 2, cache_read: 0, cache_write: 0 } },
      overrides: { "a/m": { input: 10, output: 10, cache_read: 0, cache_write: 0 } },
    };
    // Single candidate prices at the override (cost 20), never the sync row (4).
    const s = summarizeCost(buckets, withOverride, "b", "m");
    expect(s!.kind).toBe("estimated");
    expect(s!.cost).toBeCloseTo(20, 10);
  });

  it("returns null when no row shares the bare model, and never a zero", () => {
    expect(summarizeCost(buckets, doc, "meridian", "no-such-model")).toBeNull();
    expect(summarizeCost(buckets, null, "meridian", "claude-opus-5")).toBeNull();
    expect(summarizeCost(buckets, doc, "meridian", null)).toBeNull();
    expect(summarizeCost(buckets, doc, null, null)).toBeNull();
  });

  it("still estimates when the provider is unknown but the model is priced", () => {
    // The common mixed-routing case: no provider reported, bare model known.
    const s = summarizeCost(buckets, doc, null, "claude-opus-5");
    expect(s!.kind).toBe("estimated");
    expect(s!.cost).toBeCloseTo(12, 10);
  });

  it("matches multi-segment model ids after the first slash only", () => {
    const nested = {
      rates: {
        "command-code/MiniMaxAI/MiniMax-M2.5": {
          input: 0.3,
          output: 1.2,
          cache_read: 0.03,
          cache_write: 0.375,
        },
      },
    };
    // "MiniMax-M2.5" alone is NOT the bare model; the full suffix is.
    expect(summarizeCost(buckets, nested, "other", "MiniMax-M2.5")).toBeNull();
    const s = summarizeCost(buckets, nested, "other", "MiniMaxAI/MiniMax-M2.5");
    expect(s!.kind).toBe("estimated");
  });
});

/**
 * THE LAN FALLBACK CONVERSION, executed (#161 review DEFECT 1).
 *
 * Mutating the client's `doc.prices` to `doc.price` — the single line
 * converting the new GET /context-meter/prices response into the panel's
 * price document — left all 36 tests green, because no test EXECUTED the
 * conversion. The conversion now lives in unwrapRoutePrices, and these
 * tests call it: the typo mutant returns undefined below and goes red.
 */
describe("unwrapRoutePrices", () => {
  const doc = {
    rates: { "meridian/claude-opus-5": SONNET_RATE },
    overrides: {},
  };

  it("unwraps a successful route body into the panel document", () => {
    const result = { data: { ok: true, prices: doc }, error: null };
    expect(unwrapRoutePrices(result)).toBe(doc);
  });

  it("reads doc.prices, not a near-miss key", () => {
    // The proven mutant: doc.price (singular) is undefined, so the panel
    // would sit on "no document" forever while the suite stayed green.
    // A decoy `price` key proves which key is actually read.
    const result = {
      data: { ok: true, prices: doc, price: { rates: { "fake/row": SONNET_RATE } } },
      error: null,
    };
    const unwrapped = unwrapRoutePrices(result);
    expect(unwrapped).toBe(doc);
    expect(unwrapped).not.toBe((result.data as any).price);
  });

  it("yields undefined for every failure shape, never a half table", () => {
    expect(unwrapRoutePrices(null)).toBeUndefined();
    expect(unwrapRoutePrices(undefined)).toBeUndefined();
    // Network failure: fetchJson answers { data: null, error }.
    expect(unwrapRoutePrices({ data: null, error: "HTTP 503" })).toBeUndefined();
    // Route answered but refused: 405/503 bodies carry ok: false.
    expect(
      unwrapRoutePrices({ data: { ok: false, error: "prices unavailable" }, error: null }),
    ).toBeUndefined();
    // A body without the table is not a table.
    expect(unwrapRoutePrices({ data: { ok: true }, error: null })).toBeUndefined();
    expect(unwrapRoutePrices({ data: { ok: true, prices: null }, error: null })).toBeUndefined();
    expect(unwrapRoutePrices({ data: { ok: true, prices: undefined }, error: null })).toBeUndefined();
  });
});

/**
 * THE EXACT/ESTIMATE GATE, executed (#161 review DEFECT 1).
 *
 * Widening `summary.kind === "exact"` to `summary !== null` silently
 * collapses every estimate back into the exact branch — the range row
 * vanishes and the figure is mislabelled — and stayed green at 36/36,
 * because the suite only asserted the TEXTUAL presence of
 * `else if (summary !== null) {`. The gate now lives in selectCostBranch,
 * and these tests execute it through real summaries: the widened mutant
 * answers "exact" for the estimate below and goes red.
 */
describe("selectCostBranch", () => {
  const buckets = {
    uncachedInputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 1_000_000,
  };
  const doc = {
    rates: {
      "meridian/claude-opus-5": { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      "electronhub/claude-opus-5": { input: 1, output: 3, cache_read: 0.1, cache_write: 1 },
    },
  };

  it("answers exact only for an exact summary", () => {
    expect(selectCostBranch(summarizeCost(buckets, doc, "meridian", "claude-opus-5"))).toBe(
      "exact",
    );
  });

  it("answers estimated for a non-null non-exact summary", () => {
    // No "nowhere/claude-opus-5" row, but the bare model is shared: the
    // summary is estimated, and the gate must say so.
    const summary = summarizeCost(buckets, doc, "nowhere", "claude-opus-5");
    expect(summary).not.toBeNull();
    expect(summary!.kind).toBe("estimated");
    expect(selectCostBranch(summary)).toBe("estimated");
  });

  it("answers missing for a null summary, never a zero", () => {
    expect(selectCostBranch(null)).toBe("missing");
    expect(selectCostBranch(summarizeCost(buckets, null, "meridian", "claude-opus-5"))).toBe(
      "missing",
    );
  });
});

/**
 * THE EFFECTIVE STATUS (#161 review DEFECT 2).
 *
 * On a LAN origin the settings scope status IS 'unavailable' while the
 * plugin route may still have delivered the table. Judging the raw scope
 * status would report a dead transport for a genuinely unpriced model.
 */
describe("effectiveExplainStatus", () => {
  const held = { rates: { "meridian/claude-opus-5": SONNET_RATE } };

  it("does not let a dead scope overrule a delivered document", () => {
    expect(effectiveExplainStatus("unavailable", held)).not.toBe("unavailable");
  });

  it("leaves the scope verdict standing when nothing arrived", () => {
    expect(effectiveExplainStatus("unavailable", undefined)).toBe("unavailable");
    expect(effectiveExplainStatus("unavailable", null)).toBe("unavailable");
  });

  it("passes any other status through untouched", () => {
    expect(effectiveExplainStatus("ready", held)).toBe("ready");
    expect(effectiveExplainStatus("loading", undefined)).toBe("loading");
    expect(effectiveExplainStatus(undefined, held)).toBe(undefined);
  });
});

/**
 * EVERY PANEL STATE, reachable on the LAN path (#161 review DEFECT 2).
 *
 * Before the fix the client passed the raw SCOPE status to
 * explainMissingRate, so once the route had delivered the table a
 * genuinely unpriced model still reported "prices unavailable" — and
 * 'unpriced model' and 'no model reported' were unreachable on LAN
 * entirely. These drive the CLIENT's own pipeline (unwrap the fetch
 * result, judge the effective status, summarize) with the scope status a
 * LAN browser really sees ('unavailable') and pin all four outcomes.
 */
describe("the LAN path reaches every panel state", () => {
  const LAN_SCOPE = "unavailable";
  const held = {
    rates: { "meridian/claude-opus-5": { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 } },
    overrides: {},
  };
  const buckets = {
    uncachedInputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 1_000_000,
  };

  /** The client's pipeline on a LAN origin: unwrap, effective status, explain. */
  function lanMissing(routeResult: unknown, provider: string | null, model: string | null) {
    const doc = unwrapRoutePrices(routeResult);
    return explainMissingRate(effectiveExplainStatus(LAN_SCOPE, doc), doc, provider, model);
  }

  it("says the transport failed when the route delivered nothing", () => {
    const m = lanMissing({ data: null, error: "HTTP 503" }, "meridian", "claude-opus-5");
    expect(m.kind).toBe("transport");
    expect(m.label).toBe("prices unavailable");
  });

  it("says no model was reported once the route delivered the table", () => {
    const m = lanMissing({ data: { ok: true, prices: held }, error: null }, null, null);
    expect(m.kind).toBe("no-model");
    expect(m.label).toBe("no model reported");
  });

  it("says the model is unpriced once the route delivered the table", () => {
    const m = lanMissing(
      { data: { ok: true, prices: held }, error: null },
      "meridian",
      "some-unlisted-model",
    );
    expect(m.kind).toBe("unpriced");
    expect(m.label).toBe("unpriced model");
    expect(m.detail).toContain("meridian/some-unlisted-model");
  });

  it("prices exactly once the route delivered the table", () => {
    const doc = unwrapRoutePrices({ data: { ok: true, prices: held }, error: null });
    const summary = summarizeCost(buckets, doc, "meridian", "claude-opus-5");
    expect(summary).not.toBeNull();
    expect(selectCostBranch(summary)).toBe("exact");
    expect(summary!.cost).toBeCloseTo(30, 10);
  });

  it("estimates with median and range once the route delivered the table", () => {
    const multi = {
      rates: {
        ...held.rates,
        "electronhub/claude-opus-5": { input: 1, output: 3, cache_read: 0.1, cache_write: 1 },
      },
      overrides: {},
    };
    const doc = unwrapRoutePrices({ data: { ok: true, prices: multi }, error: null });
    const summary = summarizeCost(buckets, doc, "nowhere", "claude-opus-5");
    expect(selectCostBranch(summary)).toBe("estimated");
    // Median 17 of the two candidate costs, range 4–30: the headline AND
    // the spread.
    expect(summary!.cost).toBeCloseTo(17, 10);
    expect(summary!.min).toBeCloseTo(4, 10);
    expect(summary!.max).toBeCloseTo(30, 10);
  });
});

/**
 * THE RENDER PATH, pinned (#134 review SHOULD-FIX; #99's original complaint).
 *
 * Every test above covers the CLASSIFIER. None covered the WIRING, so a
 * future edit could reintroduce a catch-all string in the panel, or drop the
 * explanatory title, and this suite would stay green — which is precisely
 * the gap #99's review_fail recorded about the unknown-price render path.
 *
 * There is no DOM in this suite, so this reads client.tsx as source. That is
 * the same technique the repo already uses where the artefact is not
 * executable here (plugins/session-archive/src/archive.test.ts,
 * plugins/composer-approvals/src/rings.test.ts). It pins the WIRING, not the
 * pixels; only a live look proves the panel reads well.
 */
describe("the panel is wired to the explainer, not to a catch-all string", () => {
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "client.tsx"), "utf8");
  // Comments legitimately discuss the old string; assertions are about code.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("never renders the old catch-all", () => {
    expect(source).not.toContain('"unknown price"');
  });

  it("computes the explanation and renders its label", () => {
    expect(source).toMatch(/explainMissingRate\s*\(/);
    expect(source).toMatch(/missing\.label/);
  });

  it("passes the actionable sentence through as a title", () => {
    // Without this the reader gets a better word but no way to act on it.
    //
    // ASSERT THE CALL, NOT THE MENTION. The first version of this test
    // checked only that `missing.detail` appeared SOMEWHERE in the file, and
    // it SURVIVED a mutation that severed the detail from the row — because
    // the same expression also appears at its assignment site. A guard that
    // passes against the bug it exists to catch is worse than no guard, so
    // this asserts the cost row actually receives a title argument.
    const call = /row\(\s*"cost"\s*,[^)]*\)/s.exec(source);
    expect(call).not.toBeNull();
    const args = (call as RegExpExecArray)[0];
    expect(args).toMatch(/detail/);
    expect(args.split(",").length).toBeGreaterThanOrEqual(5);
    // And row() must APPLY it rather than accept and ignore it.
    expect(source).toMatch(/title:\s*title/);
  });

  it("judges the effective document status, not the raw scope status (#161 review)", () => {
    // DEFECT 2: passing the raw scope status made 'unpriced model' and
    // 'no model reported' unreachable on LAN. The client must derive the
    // scope status and pass it through effectiveExplainStatus, so a
    // delivered route document overrules a dead scope transport.
    expect(source).toMatch(/pricesSnap[^;]*\.status/s);
    expect(source).toMatch(/effectiveExplainStatus\s*\(/);
  });

  it("prices through the summary, not a single rate (#161)", () => {
    // resolveRate prices one row; the panel must render the exact-or-estimate
    // summary instead, or the median/range work above never reaches a reader.
    expect(source).toMatch(/summarizeCost\s*\(/);
    expect(source).not.toMatch(/resolveRate\s*\(/);
    expect(source).toMatch(/summary[!.]\.cost/);
  });

  it("falls back to the plugin route when the scope yields no document (#161)", () => {
    // The settings mirror is loopback-only; without this fetch the panel is
    // permanently unpriced on a LAN URL no matter how complete the table is.
    expect(source).toMatch(/fetchJson\(\s*"\/context-meter\/prices"\s*\)/);
  });

  it("renders the estimate range as its own row with the providers behind it", () => {
    // A bare median without the spread is a guess wearing a number; the
    // range row underneath is what keeps it an honest estimate.
    const call = /row\(\s*"range"\s*,[^)]*\)/s.exec(source);
    expect(call).not.toBeNull();
    expect((call as RegExpExecArray)[0]).toMatch(/rangeLabel/);
    expect(source).toMatch(/summary[!.]\.providers/);
    // DELETED (#161 review): the old fourth assertion here checked the
    // TEXTUAL presence of `else if (summary !== null) {` while commenting
    // that "the estimate branch must be REACHABLE" — and stayed green when
    // the exact gate was widened to `summary !== null`, which kills every
    // estimate. A grep cannot observe behaviour. The gate now lives in
    // selectCostBranch (cost.ts), pinned by the executing tests above; this
    // grep keeps only the range-row WIRING (the row call, the label, the
    // providers), which has no executing equivalent without a DOM.
  });
});
