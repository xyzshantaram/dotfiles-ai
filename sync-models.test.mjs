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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";
import {
  buildFreshRates,
  electronhubRow,
  entryText,
  indexModelsDev,
  isMetaModelId,
  modelsEditForProvider,
  partitionGoIds,
  renderPricesSection,
  yamlNeedsQuote,
  yamlQuoteScalar,
} from "./sync-models.mjs";

const here = dirname(fileURLToPath(import.meta.url));

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

describe("quoted display names survive a YAML round-trip (#342a)", () => {
  it("quotes the two killer names from the 2026-09-24 run", () => {
    expect(entryText("longcat-2.0", "Meituan: LongCat 2.0", null)).toContain(
      '        name: "Meituan: LongCat 2.0"',
    );
    expect(entryText("x", "inclusionAI: Ling 3.0 Flash Sante (free)", null)).toContain(
      '        name: "inclusionAI: Ling 3.0 Flash Sante (free)"',
    );
  });

  it("passes safe names through unquoted so diffs stay minimal", () => {
    for (const n of [
      "LongCat 2.0",
      "GLM 5.3 (DevPass)",
      "Qwen3.8 27B",
      "MiMo-V2.5",
      "Hy4 preview",
      "Muse Spark 1.3 Contributor",
    ]) {
      expect(yamlNeedsQuote(n)).toBe(false);
      expect(yamlQuoteScalar(n)).toBe(n);
      expect(entryText("x", n, null)).toContain(`        name: ${n}`);
    }
  });

  it("quotes number/bool/null-like and indicator-led names", () => {
    for (const n of [
      "123",
      "1.5",
      "true",
      "null",
      "~",
      "yes",
      "off",
      "#trending",
      "- dash",
      "trailing:",
      "hash # tag",
      "? query",
    ]) {
      expect(yamlNeedsQuote(n)).toBe(true);
      expect(yamlQuoteScalar(n)).toBe(JSON.stringify(n));
    }
  });

  it("the unquoted killer name really did break parsing (regression pin)", () => {
    // The exact bytes the 2026-09-24 run emitted: a bare `name:` scalar
    // containing ": " is a nested map to the parser, so the entry's name
    // is not a string at all.
    expect(() =>
      YAML.parse("models:\n      - id: x\n        name: Meituan: LongCat 2.0"),
    ).toThrow();
  });

  it("emitted entries parse back to the same names", () => {
    const text = [
      "models:",
      ...entryText("longcat-2.0", "Meituan: LongCat 2.0", null),
      ...entryText("glm-5.3-flash", "GLM 5.3 Flash", null),
    ].join("\n");
    const doc = YAML.parse(text);
    expect(doc.models[0].name).toBe("Meituan: LongCat 2.0");
    expect(doc.models[1].name).toBe("GLM 5.3 Flash");
  });
});

describe("DevPass preservation (#342b)", () => {
  const vendor = {
    name: "Vendor Guess",
    limit: { context: 1000000, output: 262144 },
    modalities: { input: ["text"] },
  };

  it("the existing row's name/contextWindow/maxTokens win over models.dev", () => {
    expect(
      electronhubRow(
        { name: "GLM 5.3 (DevPass)", contextWindow: 262000, maxTokens: 65536 },
        "glm-5.3:dev",
        vendor,
      ),
    ).toEqual({ name: "GLM 5.3 (DevPass)", contextWindow: 262000, maxTokens: 65536 });
  });

  it("absent fields backfill from the lookup", () => {
    const row = electronhubRow(
      { name: "Qwen3.8 27B", contextWindow: undefined, maxTokens: undefined },
      "qwen3.8-27b:dev",
      vendor,
    );
    expect(row.name).toBe("Qwen3.8 27B");
    expect(row.contextWindow).toBe(1000000);
    expect(row.maxTokens).toBe(262144);
  });

  it("a new id with no row seeds from the lookup", () => {
    expect(electronhubRow(null, "mimo-v2.5:dev", vendor)).toEqual({
      name: "Vendor Guess",
      contextWindow: 1000000,
      maxTokens: 262144,
    });
  });

  it("falls back to prettyName with no row and no entry", () => {
    expect(electronhubRow(null, "mimo-v2.5:dev", null).name).toBe("Mimo V2.5:dev");
  });

  it("electronhub emits no markers, and heals a block a bad run stamped", () => {
    const block = ["      - id: x"];
    const stamped = ["      # sync-models:begin", ...block, "      # sync-models:end"];
    // No markers present: the entries region is replaced with bare entries.
    expect(modelsEditForProvider("electronhub", 10, 15, -1, -1, block, stamped)).toEqual({
      at: 11,
      deleteCount: 5,
      block,
    });
    // Markers present (post-stomp state): the whole region — markers
    // included — is replaced with bare entries, so the markers are gone.
    const healed = modelsEditForProvider("electronhub", 10, 20, 12, 19, block, stamped);
    expect(healed).toEqual({ at: 11, deleteCount: 10, block });
    expect(healed.block.join("\n")).not.toContain("sync-models:");
  });

  it("other providers keep the marker behavior", () => {
    const block = ["      - id: x"];
    const marked = ["      # sync-models:begin", ...block, "      # sync-models:end"];
    expect(modelsEditForProvider("zai", 10, 20, 12, 19, block, marked)).toEqual({
      at: 13,
      deleteCount: 6,
      block,
    });
    expect(modelsEditForProvider("zai", 10, 15, -1, -1, block, marked)).toEqual({
      at: 11,
      deleteCount: 5,
      block: marked,
    });
  });
});

describe("Meta models seed the responses route (#342c)", () => {
  it("matches both gateway id forms and nothing else", () => {
    for (const id of [
      "meta/muse-spark-1.3-contributor",
      "meta/muse-spark-1.1",
      "muse-spark-1.3-contributor",
      "muse-spark-1.2-contributor",
    ]) {
      expect(isMetaModelId(id)).toBe(true);
    }
    for (const id of [
      "glm-5.3-flash",
      "longcat-2.0",
      "qwen3.7-max",
      "mimo-v2.5",
      "hy3",
      "omen-alpha",
      "qwen3.8-27b:dev",
    ]) {
      expect(isMetaModelId(id)).toBe(false);
    }
  });

  it("partitions one live fetch into completions + responses", () => {
    expect(
      partitionGoIds([
        "longcat-2.0",
        "glm-5.3-flash",
        "qwen3.7-max",
        "muse-spark-1.3-contributor",
        "muse-spark-1.2-contributor",
        "omen-alpha",
      ]),
    ).toEqual({
      completions: ["longcat-2.0", "glm-5.3-flash", "qwen3.7-max", "omen-alpha"],
      responses: ["muse-spark-1.3-contributor", "muse-spark-1.2-contributor"],
    });
  });

  it("no chain ref points at an opencode-go Meta id, and the responses rung resolves", () => {
    // The completions filter drops every Meta id from opencode-go: prove
    // no chain needs one there. The responses filter keeps Meta ids: prove
    // the rung the chains need survives it.
    const text = readFileSync(join(here, "home", "settings.yaml"), "utf8");
    const doc = YAML.parse(text);
    const refs = [];
    for (const chain of Object.values(doc.profile.chains ?? {})) {
      for (const r of chain ?? []) {
        if (typeof r === "string" && r.includes("/") && !r.startsWith("chain:")) refs.push(r);
        else if (r && typeof r === "object" && r.provider && r.model)
          refs.push(`${r.provider}/${r.model}`);
      }
    }
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const slash = ref.indexOf("/");
      const prov = ref.slice(0, slash);
      const model = ref.slice(slash + 1);
      if (prov === "opencode-go") expect(isMetaModelId(model)).toBe(false);
    }
    expect(refs).toContain("opencode-go-responses/muse-spark-1.3-contributor");
    expect(
      partitionGoIds(["muse-spark-1.3-contributor", "glm-5.3-flash"]).responses,
    ).toContain("muse-spark-1.3-contributor");
  });
});
