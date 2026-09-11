/**
 * Table tests for the ElectronHub section fold (ticket #74, item 6).
 *
 * The blank-section defect: the old fold knew exactly two states — "an error
 * string is present" and "data.ok === true" — and drew a bare <h4> for
 * everything else. These tables pin the fixed contract over the input shapes
 * that used to fall through the gap: undefined results (a localStorage
 * snapshot written before ElectronHub existed), `{ ok: false }` answers, and
 * `{ ok: true }` answers whose payload degrades to nothing drawable.
 *
 * One deliberate correction to the ticket's wording: the ticket asks for
 * `status !== "ready" ==> emptyLine !== null`, but the fold has THREE
 * non-ready states, and the error state carries its line in `errorLine`
 * (the red dsp-err row), not `emptyLine`. Asserting emptyLine !== null for a
 * genuine fetch failure would be wrong — the failure IS visible, just in the
 * other slot. So the tables assert the true invariant the source documents:
 * exactly one of errorLine / emptyLine / real content is always present.
 * The ticket's four shapes all land in the pending/empty half of that
 * contract, where emptyLine is indeed always set.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ELECTRONHUB_DEV_NOTE,
  ehSectionModel,
  ehUsageHasContent,
} from "./eh-section-model";

/** One fold input pair plus what the section must render for it. */
interface FoldRow {
  name: string;
  ehUsage: unknown;
  ehModels: unknown;
  status: string;
  emptyLine: string | null;
  errorLine: string | null;
}

/** A fetch envelope shaped the way shared/client-util request() answers. */
const okBody = (body: unknown) => ({ data: body, error: null });

/**
 * The ticket's four shapes: none of these may render as a lone heading, and
 * none of them is an error, so each must produce a non-null emptyLine and a
 * null errorLine.
 */
const NON_READY_ROWS: FoldRow[] = [
  {
    name: "both results undefined: snapshot predates ElectronHub",
    ehUsage: undefined,
    ehModels: undefined,
    status: "pending",
    emptyLine: "Loading ElectronHub usage…",
    errorLine: null,
  },
  {
    name: "empty snapshot object: keys present but answer nothing",
    ehUsage: {},
    ehModels: {},
    status: "pending",
    emptyLine: "Loading ElectronHub usage…",
    errorLine: null,
  },
  {
    name: "bare { ok: false } envelopes carry no failure string",
    ehUsage: { ok: false },
    ehModels: { ok: false },
    status: "pending",
    emptyLine: "Loading ElectronHub usage…",
    errorLine: null,
  },
  {
    name: "{ ok: true } usage with an empty payload and no models yet",
    ehUsage: okBody({ ok: true }),
    ehModels: undefined,
    status: "empty",
    emptyLine: "ElectronHub reported no usage data for this key.",
    errorLine: null,
  },
  {
    name: "{ ok: true } usage with an empty catalog",
    ehUsage: okBody({ ok: true }),
    ehModels: okBody({ ok: true, models: [], source: "catalog" }),
    status: "empty",
    emptyLine: "ElectronHub reported no usage data for this key.",
    errorLine: null,
  },
  {
    name: "legacy empty usage body: every field degraded to null/0/[]",
    ehUsage: okBody({
      ok: true,
      subscription: null,
      credits: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      history: [],
      endpoints: [],
    }),
    ehModels: undefined,
    status: "empty",
    emptyLine: "ElectronHub reported no usage data for this key.",
    errorLine: null,
  },
  {
    name: "hand-shaped legacy endpoints with non-string names draw no cards",
    ehUsage: okBody({
      ok: true,
      subscription: null,
      credits: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      history: [],
      endpoints: [{ name: 123 }, { requests: 5 }, null, "x"],
    }),
    ehModels: undefined,
    status: "empty",
    emptyLine: "ElectronHub reported no usage data for this key.",
    errorLine: null,
  },
];

/**
 * Genuine failures: visible in the error slot, so emptyLine stays null. This
 * is the half of the contract the ticket's literal wording gets wrong — a
 * failed fetch must NOT grow an emptyLine next to its red error row.
 */
const ERROR_ROWS: FoldRow[] = [
  {
    name: "fetch failure envelope carries the failure string",
    ehUsage: { data: null, error: "HTTP 500" },
    ehModels: undefined,
    status: "error",
    emptyLine: null,
    errorLine: "ElectronHub: HTTP 500",
  },
  {
    name: "route answering { ok: false } without an error string falls back",
    ehUsage: okBody({ ok: false }),
    ehModels: undefined,
    status: "error",
    emptyLine: null,
    errorLine: "ElectronHub: usage unavailable",
  },
  {
    name: "models failure names the models side",
    ehUsage: okBody({ ok: true, subscription: "devpass" }),
    ehModels: { data: null, error: "HTTP 503" },
    status: "error",
    emptyLine: null,
    errorLine: "ElectronHub: HTTP 503",
  },
];

/** Healthy states: content present, neither line shown. */
const READY_ROWS: FoldRow[] = [
  {
    name: "usage with a subscription tier is content",
    ehUsage: okBody({ ok: true, subscription: "devpass", credits: 120 }),
    ehModels: undefined,
    status: "ready",
    emptyLine: null,
    errorLine: null,
  },
  {
    name: "empty usage plus a populated public catalog is content, with notes",
    ehUsage: okBody({ ok: true }),
    ehModels: okBody({ ok: true, models: ["gpt-4o", "claude-opus"], source: "catalog" }),
    status: "ready",
    emptyLine: null,
    errorLine: null,
  },
  {
    // Amended criterion 1 (#74): the 401 payload is marked unverified and the
    // model list is flagged public, so an unverifiable key reads as
    // "unverified with notes" instead of healthy.
    name: "unverified 401 payload plus public catalog stays annotated",
    ehUsage: okBody({
      ok: true,
      unverified: true,
      note:
        "this API key could not be verified (HTTP 401 on /user/me) — it may be " +
        "capability-limited or invalid; any model list below is the PUBLIC catalog, " +
        "which answers without a key",
    }),
    ehModels: okBody({ ok: true, models: ["gpt-4o"], source: "catalog" }),
    status: "ready",
    emptyLine: null,
    errorLine: null,
  },
];

describe("ehSectionModel fold", () => {
  it.each(NON_READY_ROWS)(
    "never a bare heading: $name",
    ({ ehUsage, ehModels, status, emptyLine, errorLine }) => {
      const model = ehSectionModel(ehUsage, ehModels);
      expect(model.status).toBe(status);
      expect(model.status).not.toBe("ready");
      expect(model.emptyLine).toBe(emptyLine);
      expect(model.errorLine).toBe(errorLine);
    },
  );

  it.each(ERROR_ROWS)("failures surface in the error slot: $name", ({ ehUsage, ehModels }) => {
    const model = ehSectionModel(ehUsage, ehModels);
    expect(model.status).toBe("error");
    expect(model.errorLine).toBeTruthy();
    expect(model.emptyLine).toBeNull();
  });

  it.each(READY_ROWS)("healthy states show neither line: $name", ({ ehUsage, ehModels }) => {
    const model = ehSectionModel(ehUsage, ehModels);
    expect(model.status).toBe("ready");
    expect(model.errorLine).toBeNull();
    expect(model.emptyLine).toBeNull();
  });

  it("exactly one of errorLine / emptyLine / real content is always present", () => {
    for (const row of [...NON_READY_ROWS, ...ERROR_ROWS, ...READY_ROWS]) {
      const model = ehSectionModel(row.ehUsage, row.ehModels);
      const slots = [
        model.errorLine !== null,
        model.emptyLine !== null,
        model.status === "ready",
      ].filter(Boolean).length;
      expect(slots, row.name).toBe(1);
    }
  });

  it("unverified payload keeps both the key warning and the catalog note", () => {
    const row = READY_ROWS[2];
    const model = ehSectionModel(row.ehUsage, row.ehModels);
    expect(model.notes).toHaveLength(2);
    expect(model.notes[0]).toContain("could not be verified");
    expect(model.notes[1]).toContain("public catalog");
  });

  it("populated catalog without usage notes only the catalog", () => {
    const row = READY_ROWS[1];
    const model = ehSectionModel(row.ehUsage, row.ehModels);
    expect(model.models).toEqual(["gpt-4o", "claude-opus"]);
    expect(model.notes).toHaveLength(1);
    expect(model.notes[0]).toContain("public catalog");
  });
});

describe("ehUsageHasContent", () => {
  it.each([
    ["null usage", null, false],
    ["undefined usage", undefined, false],
    ["empty object", {}, false],
    ["empty-string subscription", { subscription: "" }, false],
    ["subscription tier", { subscription: "devpass" }, true],
    ["zero credits still headline", { credits: 0 }, true],
    ["credit balance", { credits: 120 }, true],
    ["token totals", { usage: { inputTokens: 5, outputTokens: 0 } }, true],
    ["zero tokens", { usage: { inputTokens: 0, outputTokens: 0 } }, false],
    ["history rows", { history: [{ date: "2026-09-01", requests: 3 }] }, true],
    ["empty history", { history: [] }, false],
    ["renderable endpoint", { endpoints: [{ name: "/v1/chat", requests: 3 }] }, true],
    ["empty endpoints", { endpoints: [] }, false],
    // Item 4 (#74): endpointCards skips entries whose name is not a string,
    // so the predicate must not count them either.
    ["non-string endpoint names are not content", { endpoints: [{ name: 123 }] }, false],
    ["nameless endpoint entries are not content", { endpoints: [{ requests: 5 }, null] }, false],
    ["mixed list with one renderable entry is content", { endpoints: [{ name: 7 }, { name: "x" }] }, true],
  ] as Array<[string, unknown, boolean]>)("%s", (_name, usage, expected) => {
    expect(ehUsageHasContent(usage)).toBe(expected);
  });
});

// ── #141: the three account shapes ──────────────────────────────────────────

import {
  ehCodingPlanName,
  ehFormatTimestamp,
  ehIsDevKey,
  ehPercent,
  ehSectionModel as fold,
  parseElectronHubAccountModels,
  parseElectronHubUsage,
} from "./eh-section-model";

/** A full regular-key /user/me answer, per the reference's field map. */
const REGULAR_ME = {
  username: "someone",
  email: "someone@example.com",
  email_verified: true,
  subscription: "free",
  credits: 12.5,
  weekly_credits: 3,
  studio_credits: 7,
  usage: { input_tokens: 1500, output_tokens: 250 },
  claude_monthly_tokens: { used: 900, limit: 1000, remaining: 100, reset: "2026-10-01T00:00:00Z" },
  openai_monthly_tokens: { used: 480, limit: 1000, remaining: 520, reset: "2026-10-01T00:00:00Z" },
  endpoints: { "chat.completions": 41, messages: 9 },
  history: [
    { date: "2026-09-09", requests: 30 },
    { date: "2026-09-10", requests: 20 },
  ],
};

/** A full regular-key /user/models answer (the account usage shape). */
const REGULAR_MODELS = {
  total_consumption: 4.2,
  last_updated: 1757800000,
  models: {
    "gpt-4o": { requests: 12, input_tokens: 100, output_tokens: 50, total_cost: 0.5, owned_by: "openai" },
    "claude-opus": { requests: 30, input_tokens: 900, output_tokens: 300, total_cost: 3.7, owned_by: "anthropic" },
  },
};

describe("#141 probe step 1: dev keys are detected by prefix, before any request", () => {
  it.each([
    ["ek-dev-abcdef", true],
    ["ek-regular", false],
    ["ek-", false],
    ["", false],
    [null, false],
    [undefined, false],
    [42, false],
  ])("ehIsDevKey(%p) === %p", (key, expected) => {
    expect(ehIsDevKey(key)).toBe(expected);
  });
});

describe("#141 shape 1: a regular ek- key renders everything REST gives, fail-soft per field", () => {
  it("the full /user/me fixture parses every documented field", () => {
    const usage = parseElectronHubUsage(REGULAR_ME);
    expect(usage.subscription).toBe("free");
    expect(usage.credits).toBe(12.5);
    expect(usage.weeklyCredits).toBe(3);
    expect(usage.studioCredits).toBe(7);
    expect(usage.usage).toEqual({ inputTokens: 1500, outputTokens: 250 });
    expect(usage.monthly.claude).toEqual({
      used: 900,
      limit: 1000,
      remaining: 100,
      reset: "2026-10-01 00:00 UTC",
      percent: 90,
    });
    expect(usage.monthly.openai.remaining).toBe(520);
    expect(usage.endpoints).toEqual([
      { name: "chat.completions", requests: 41 },
      { name: "messages", requests: 9 },
    ]);
    expect(usage.history).toHaveLength(2);
    expect(usage.codingPlan).toBe(false);
  });

  it("the full /user/models fixture sorts by requests and tolerates unix seconds", () => {
    const account = parseElectronHubAccountModels(REGULAR_MODELS);
    expect(account.entries.map((entry) => entry.id)).toEqual(["claude-opus", "gpt-4o"]);
    expect(account.entries[0]).toEqual({
      id: "claude-opus",
      requests: 30,
      inputTokens: 900,
      outputTokens: 300,
      totalCost: 3.7,
      ownedBy: "anthropic",
    });
    expect(account.totalConsumption).toBe(4.2);
    expect(account.lastUpdated).toContain("UTC");
  });

  it("the fold is ready over the full regular-key envelope pair", () => {
    const model = fold(okBody({ ok: true, ...REGULAR_ME }), okBody({ ok: true, ...REGULAR_MODELS }));
    expect(model.status).toBe("ready");
    expect(model.errorLine).toBeNull();
    expect(model.emptyLine).toBeNull();
    expect(model.notes).toHaveLength(0);
    expect(model.accountUsage).toHaveLength(2);
    expect(model.totalConsumption).toBe(4.2);
  });

  it("an absent field omits its row, never blanks the section", () => {
    // Strip everything optional: only the tier and credits remain.
    const usage = parseElectronHubUsage({ subscription: "free", credits: 1 });
    expect(usage.weeklyCredits).toBeNull();
    expect(usage.studioCredits).toBeNull();
    expect(usage.monthly.claude).toBeNull();
    expect(usage.monthly.openai).toBeNull();
    expect(usage.endpoints).toEqual([]);
    expect(usage.history).toEqual([]);
    const model = fold(okBody({ ok: true, subscription: "free", credits: 1 }), undefined);
    expect(model.status).toBe("ready");
  });

  it("numeric strings and a partial monthly box still parse", () => {
    const usage = parseElectronHubUsage({
      subscription: "free",
      credits: "9.75",
      claude_monthly_tokens: { used: "10", limit: "40" },
    });
    expect(usage.credits).toBe(9.75);
    expect(usage.monthly.claude.used).toBe(10);
    expect(usage.monthly.claude.percent).toBe(25);
    expect(usage.monthly.claude.reset).toBeNull();
  });
});

describe("#141 review: the models fetch honours the dev-key guard", () => {
  // Source-structure pin, the same tool as the archive regression guard:
  // /user/models 401s dev keys BY DESIGN, so the guard must fire BEFORE the
  // account-scoped attempt — or the dev credential reaches an endpoint that
  // rejects it (#141 review finding 1).
  const here = dirname(fileURLToPath(import.meta.url));

  it("electronhubModelsOnce checks ehIsDevKey before any /user/models fetch", () => {
    const src = readFileSync(join(here, "index.ts"), "utf8");
    const start = src.indexOf("electronhubModelsOnce");
    const end = src.indexOf("handleElectronhubUsage");
    const body = src.slice(start, end);
    const guard = body.indexOf("ehIsDevKey(key)");
    const scoped = body.indexOf('attempt("/user/models")');
    expect(guard).toBeGreaterThan(-1);
    expect(scoped).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(scoped);
  });
});

describe("#141 shape 2: a dev key renders the design fact, never 'invalid key'", () => {
  /** What the host answers for a dev key, from the prefix alone (no fetch). */
  const devEnvelope = () =>
    okBody({
      ok: true,
      ...parseElectronHubUsage(null),
      devKey: true,
      note: ELECTRONHUB_DEV_NOTE,
    });

  it("the fold reads as ready with the note, not as an error or empty", () => {
    const model = fold(devEnvelope(), okBody({ ok: true, models: ["gpt-4o"], source: "catalog" }));
    expect(model.status).toBe("ready");
    expect(model.errorLine).toBeNull();
    expect(model.emptyLine).toBeNull();
    expect(model.notes.join(" ")).toContain("usage endpoints are unavailable to dev keys");
  });

  it("the dev-key surface never says the key is invalid or unverified", () => {
    const model = fold(devEnvelope(), undefined);
    const rendered = [model.errorLine, model.emptyLine, ...model.notes]
      .filter((line) => line !== null)
      .join(" ");
    expect(rendered).not.toMatch(/invalid/i);
    expect(rendered).not.toMatch(/could not be verified/);
  });
});

describe("#141 shape 3: a coding-plan subscription is named, and the console-only caveat is stated once", () => {
  it.each([
    ["subscription string", { subscription: "coding-plan" }],
    ["subscription object with tier", { subscription: { tier: "Coding Plan", name: "Coding" } }],
    ["bare tier field", { tier: "coding plan" }],
    ["plan field", { plan: "Coding Plan" }],
  ])("detection via %s", (_label, source) => {
    expect(ehCodingPlanName(source)).not.toBeNull();
    expect(parseElectronHubUsage(source).codingPlan).toBe(true);
  });

  it("a regular tier is not a coding plan", () => {
    expect(parseElectronHubUsage({ subscription: "free" }).codingPlan).toBe(false);
    expect(parseElectronHubUsage({ subscription: "devpass" }).codingPlan).toBe(false);
  });

  it("the fold appends the console-only note exactly once, with no zeros standing in", () => {
    const model = fold(
      okBody({
        ok: true,
        ...parseElectronHubUsage({ subscription: "Coding Plan", credits: 0 }),
      }),
      undefined,
    );
    expect(model.status).toBe("ready");
    const caveat = model.notes.filter((note) => note.includes("console-only"));
    expect(caveat).toHaveLength(1);
    expect(caveat[0]).toContain("WebSocket");
    expect(caveat[0]).toContain("not REST");
  });
});

describe("#141 tolerant timestamp and percentage helpers (the reference's _fmt_ts and page formula)", () => {
  it.each([
    ["unix seconds", 1757800000, true],
    ["unix millis", 1757800000000, true],
    ["ISO string", "2026-09-10T12:00:00Z", true],
    ["garbage string", "not a date", false],
    ["null", null, false],
    ["undefined", undefined, false],
    ["object", {}, false],
  ])("ehFormatTimestamp: %s", (_label, value, parses) => {
    const result = ehFormatTimestamp(value);
    expect(result === null).toBe(!parses);
    if (parses) expect(result).toMatch(/UTC$/);
  });

  it("seconds and millis for the same instant produce the same stamp", () => {
    expect(ehFormatTimestamp(1757800000)).toBe(ehFormatTimestamp(1757800000000));
  });

  it.each([
    [0, 100, 0],
    [900, 1000, 90],
    [1, 3, 33],
    [2, 3, 67],
    [500, 400, 100],
    [10, 0, null],
    [10, null, null],
    ["10", "40", 25],
  ])("ehPercent(%p, %p) === %p", (used, limit, expected) => {
    expect(ehPercent(used, limit)).toBe(expected);
  });
});

describe("#141 account-models parser edge cases", () => {
  it("answers null for non-account shapes (the public catalog must not trip it)", () => {
    expect(parseElectronHubAccountModels(null)).toBeNull();
    expect(parseElectronHubAccountModels(["gpt-4o"])).toBeNull();
    expect(parseElectronHubAccountModels({ models: ["gpt-4o"] })).toBeNull();
    expect(parseElectronHubAccountModels({ models: {} })).toBeNull();
    expect(parseElectronHubAccountModels({})).toBeNull();
  });

  it("drops malformed entries to zeros rather than throwing", () => {
    const account = parseElectronHubAccountModels({
      models: { m1: null, m2: { requests: "5" } },
      last_updated: "garbage",
    });
    expect(account.entries).toEqual([
      { id: "m2", requests: 5, inputTokens: null, outputTokens: null, totalCost: null, ownedBy: null },
      { id: "m1", requests: 0, inputTokens: null, outputTokens: null, totalCost: null, ownedBy: null },
    ]);
    expect(account.lastUpdated).toBeNull();
  });
});
