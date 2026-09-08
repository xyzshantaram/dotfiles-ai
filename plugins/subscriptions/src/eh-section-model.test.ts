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

import { describe, expect, it } from "vitest";
import { ehSectionModel, ehUsageHasContent } from "./eh-section-model";

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
