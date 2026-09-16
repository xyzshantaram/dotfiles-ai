/**
 * Override-survival test for the sync WRITE path (ticket #99).
 *
 * Criterion: "a local price override survives a sync-models.mjs run, with
 * a test". The existing override test in plugins/context-meter/src/cost.test.ts
 * pins READ-time precedence (the client prefers overrides over rates). That
 * says nothing about the WRITE path: mutation 99d — make renderPricesSection
 * discard the overrides tail — survived the suite, so a sync that clobbered
 * every hand-kept price would ship silently.
 *
 * This file drives the WRITE path the way a real sync drives it: fresh rates
 * built with buildFreshRates from a models.dev fixture, sorted exactly as
 * main() sorts them, then rendered over an existing prices block carrying a
 * local override via renderPricesSection. The override tail must come out
 * verbatim with its value intact. A test that only asserted the override is
 * present after calling a function that never had a chance to drop it would
 * prove nothing — here the fresh rates churn underneath (models added and
 * removed) while the override survives, so removing the preservation logic
 * turns these tests red.
 *
 * Importing sync-models.mjs is side-effect free: main() runs only for a
 * direct `node sync-models.mjs` invocation (the RUN_AS_SCRIPT guard), so the
 * import binds the pure helpers without seeding anything.
 */

import { describe, expect, it } from "vitest";
import {
  buildFreshRates,
  indexModelsDev,
  renderPricesSection,
} from "./sync-models.mjs";

// Minimal models.dev api.json shape: provider -> { models: { id: entry } }.
// "my-local" is priced at 1s so the override below (7s) can never pass by
// accident from rebuilt rates.
function fixtureDb() {
  return indexModelsDev({
    acme: {
      models: {
        "alpha-1": {
          cost: { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
        },
        "beta-1": {
          cost: { input: 1, output: 4, cache_read: 0.1, cache_write: 1 },
        },
        "my-local": {
          cost: { input: 1, output: 1, cache_read: 1, cache_write: 1 },
        },
      },
    },
  });
}

// What main() does with buildFreshRates output before rendering: sort by key
// so fetch order never churns the diff.
function freshSorted(targets, db) {
  const { rates } = buildFreshRates(targets, db);
  return [...rates.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
}

// An existing prices block as the sync would slice it from settings.yaml:
// managed head, stale rates, and a hand-kept overrides tail with a value no
// fixture rate carries (7/70/0.7/7.5), so the assertion cannot pass by
// accident from rebuilt rates.
const EXISTING_WITH_OVERRIDE = [
  "prices:",
  "  # USD per million tokens, from models.dev `cost` (see sync-models.mjs).",
  "  rates:",
  '    "test/alpha-1":',
  "      input: 999",
  "      output: 999",
  "      cache_read: 999",
  "      cache_write: 999",
  '    "test/stale-model":',
  "      input: 3",
  "      output: 6",
  "      cache_read: 0.3",
  "      cache_write: 3",
  "  overrides:",
  '    "test/my-local":',
  "      input: 7",
  "      output: 70",
  "      cache_read: 0.7",
  "      cache_write: 7.5",
];

describe("a local price override survives a sync run", () => {
  it("keeps the overrides tail verbatim while rates are rebuilt wholesale", () => {
    // The sync churns underneath the override: beta-1 is new, stale-model is
    // gone from the fetch, alpha-1 reprices. None of that may touch overrides.
    const fresh = freshSorted(
      [
        { route: "test", id: "alpha-1" },
        { route: "test", id: "beta-1" },
      ],
      fixtureDb(),
    );
    expect(fresh.length).toBe(2);

    const block = renderPricesSection(fresh, EXISTING_WITH_OVERRIDE);
    const text = block.join("\n");

    // The override survives with its value intact — matched as full lines,
    // not a substring, so a truncated or re-rendered row fails.
    expect(block).toContain('    "test/my-local":');
    expect(block).toContain("      input: 7");
    expect(block).toContain("      output: 70");
    expect(block).toContain("      cache_read: 0.7");
    expect(block).toContain("      cache_write: 7.5");

    // And the rates really were rebuilt, not carried over: the stale model is
    // gone, the fresh ones price from the fixture (alpha-1 at input 2, not
    // the stale 999), and the tail sits after the last rate row.
    expect(text).not.toContain("stale-model");
    expect(text).not.toContain("input: 999");
    expect(block).toContain('    "test/alpha-1":');
    expect(block).toContain('    "test/beta-1":');
    const overrideAt = block.indexOf("  overrides:");
    const lastRateAt = block.lastIndexOf('    "test/beta-1":');
    expect(overrideAt).toBeGreaterThan(lastRateAt);
  });

  it("survives even when fresh rates carry the same key at a different price", () => {
    // The sync never merges the override into rates: the managed row prices
    // from the fetch (1s) while the hand-kept row keeps its own value (7s),
    // and the client prefers the latter at read time (pinned in cost.test.ts).
    const fresh = freshSorted([{ route: "test", id: "my-local" }], fixtureDb());
    expect(fresh.length).toBe(1);
    expect(fresh[0][1].input).toBe(1);

    const block = renderPricesSection(fresh, EXISTING_WITH_OVERRIDE);
    // Both rows exist: the managed one from the fetch, the hand-kept one
    // verbatim. Dropping the tail (mutation 99d) removes the input: 7 row.
    expect(block).toContain('    "test/my-local":');
    expect(block).toContain("      input: 7");
    expect(block).toContain("  overrides:");
  });

  it("starts a new prices section with an empty overrides map", () => {
    const fresh = freshSorted([{ route: "test", id: "alpha-1" }], fixtureDb());
    const block = renderPricesSection(fresh, null);
    expect(block[0]).toBe("prices:");
    expect(block).toContain("  overrides: {}");
  });
});
