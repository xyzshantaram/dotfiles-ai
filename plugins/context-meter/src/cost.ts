/**
 * Approximate session-cost pricing for the context meter.
 *
 * The tokenUsage projection carries four disjoint buckets with no model
 * attached (dsh-token-meter declares them "independent of model routing"),
 * so this module prices one bucket set at one caller-supplied rate and says
 * nothing about where the rate came from. Resolving the wrong rate still
 * prices the wrong dollars: every consumer must display the rate key
 * alongside the figure, or a mid-session model switch silently reprices
 * the whole history.
 */

/** One session's whole-log token buckets, mirroring tokenUsage. */
export interface TokenBuckets {
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

/** USD per million tokens for one provider/model, from models.dev `cost`. */
export interface PriceRate {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

/** A non-finite count prices as zero. Without this a single undefined
 * bucket poisons the whole session figure into NaN, and the panel shows
 * nothing instead of an approximate cost. */
function num(value: unknown): number {
  return typeof value === "number" && isFinite(value) ? value : 0;
}

/**
 * Price one bucket set at its own rates. Cache reads bill at cache_read,
 * NOT at input: a read is typically a tenth of the input price, and long
 * sessions (the ones worth costing) are mostly cache reads, so flattening
 * overstates them several-fold. The four terms stay separate for the same
 * reason: one blended input rate cannot carry them.
 */
export function priceBuckets(buckets: TokenBuckets, rate: PriceRate): number {
  return (
    (num(buckets.uncachedInputTokens) * num(rate.input) +
      num(buckets.cacheReadTokens) * num(rate.cache_read) +
      num(buckets.cacheWriteTokens) * num(rate.cache_write) +
      num(buckets.outputTokens) * num(rate.output)) /
    1e6
  );
}

/**
 * Render an approximate cost. The tilde is the whole honesty contract: no
 * provider-invoice reconciliation happens here, so a bare "$0.04" reads as
 * a bill. Values under a cent keep four decimals — toFixed(2) would print
 * "$0.00" for real spend and make cheap models look free.
 */
export function formatApproxCost(usd: number): string {
  if (!isFinite(usd)) return "~$—.——";
  if (usd < 0.01) return "~$" + usd.toFixed(4);
  return "~$" + usd.toFixed(2);
}

/** Settings key for one rate row. Matches the W6 `prices` namespace
 * convention ("provider/model") that sync-models.mjs writes. */
export function rateKey(provider: string, model: string): string {
  return provider + "/" + model;
}

/** The resolved `prices` namespace value: sync-written rates plus the
 * hand-kept overrides map that sync-models.mjs never touches. */
export interface PricesDoc {
  rates?: Record<string, PriceRate> | null;
  overrides?: Record<string, PriceRate> | null;
}

/**
 * Unwrap one GET /context-meter/prices answer into the panel's price
 * document (#161 review DEFECT 1: this line had zero executing coverage).
 *
 * The LAN fallback reads the same resolved table the settings mirror
 * carries, over the plugin's own route instead of the loopback-only
 * mirror. fetchJson answers `{ data, error }`; the route body is
 * `{ ok, prices }` on success. Anything else — a network failure (data
 * null), a 405/503 (ok false or missing), a body without the prices table
 * — yields undefined, and the caller treats it as "no document", never as
 * a half table. Missing means missing, never a zero (#126's rule).
 *
 * This is the exact conversion the client performs on the fetch result;
 * it lives here so the suite EXECUTES it instead of grepping for it.
 */
export function unwrapRoutePrices(result: unknown): PricesDoc | undefined {
  if (result === null || result === undefined) return undefined;
  const data = (result as { data?: unknown }).data;
  if (data === null || data === undefined) return undefined;
  const body = data as { ok?: unknown; prices?: unknown };
  if (body.ok !== true) return undefined;
  const prices = body.prices;
  if (prices === null || prices === undefined) return undefined;
  return prices as PricesDoc;
}

/** True when the row can price: input and output must both be present.
 * A missing cache dimension bills as zero (models.dev omits uncharged
 * dimensions — zai writes cache_write: 0 while resellers omit the key),
 * but a row without input or output is not a price at all. */
export function isPriced(rate: unknown): rate is PriceRate {
  if (rate === null || rate === undefined || typeof rate !== "object") return false;
  const r = rate as Record<string, unknown>;
  return typeof r["input"] === "number" && typeof r["output"] === "number";
}

/**
 * Resolve one rate row. Overrides win: a hand-set price the sync silently
 * replaced would be set once and never trusted again. Anything absent or
 * unpriced resolves null — never a guessed rate, never a hidden row that
 * would make the session look cheap.
 *
 * A null result is not self-explaining: pass the same inputs to
 * {@link explainMissingRate} to learn WHICH of the three causes applies.
 * This comment used to say the caller renders "unknown price"; it no longer
 * does, and a stale contract comment is how the next reader inherits the
 * confusion this pair was written to end (#134).
 */
export function resolveRate(
  doc: PricesDoc | null | undefined,
  provider: string | null | undefined,
  model: string | null | undefined,
): PriceRate | null {
  if (doc === null || doc === undefined) return null;
  if (typeof provider !== "string" || provider === "") return null;
  if (typeof model !== "string" || model === "") return null;
  const key = rateKey(provider, model);
  const over =
    doc.overrides !== null && doc.overrides !== undefined ? doc.overrides[key] : undefined;
  if (isPriced(over)) return over as PriceRate;
  const base = doc.rates !== null && doc.rates !== undefined ? doc.rates[key] : undefined;
  if (isPriced(base)) return base as PriceRate;
  return null;
}

/**
 * WHY FOUR STATES INSTEAD OF ONE STRING (#134, #161).
 *
 * `resolveRate` returning null used to render one word — "unknown price" —
 * for three completely different failures, with no console output. That cost
 * a full day of diagnosis: a dead settings transport is indistinguishable
 * from a model we simply have no rate for, so the report "it still says
 * unknown price" carried no information about which half to look at.
 *
 * The real case that motivated this: the settings scope is only mirrored
 * from the host over a LOOPBACK connection (dsh-client-ui-settings builds
 * its mirror as `connection.isLoopback ? "host" : "memory"`), so on a
 * proxied or LAN URL the prices document never arrives at all and EVERY
 * model reads unpriced — permanently, restart-proof, no matter how complete
 * the rate table is.
 *
 * #161 split the transport state in two. The old text asserted the loopback
 * cause unconditionally, and the panel read 'prices unavailable' ON LOOPBACK
 * too — where the scope status cannot be 'unavailable'. A missing document
 * with a live transport is a different failure (host registration absent, or
 * the mirror stalled) with a different remedy, so it reads differently.
 *
 * These states are DIAGNOSTIC, not cosmetic. The never-guess rule is
 * unchanged: none of them invents a rate, and an unpriced model still shows
 * no figure rather than a zero (#126's criterion).
 */
export type MissingRateKind = "transport" | "no-model" | "unpriced";

export interface MissingRate {
  kind: MissingRateKind;
  /** Short enough for the panel row and the hover tip. */
  label: string;
  /** One sentence a reader can act on, for the tooltip. */
  detail: string;
}

/**
 * The status {@link explainMissingRate} should judge, given the document
 * the panel actually holds (#161 review DEFECT 2).
 *
 * On a LAN origin the settings scope status IS 'unavailable' — the mirror
 * is loopback-only — while the plugin route may still have delivered the
 * table. Judging the raw scope status then reports "prices unavailable /
 * the browser never received the price table" for a genuinely unpriced
 * model, which is false, and makes 'unpriced model' and 'no model
 * reported' unreachable on LAN entirely. When the panel HOLDS the table,
 * the dead transport is history, not the diagnosis: report it as up so
 * the explainer judges the held document. When nothing arrived, the scope
 * verdict stands untouched.
 */
export function effectiveExplainStatus(
  scopeStatus: unknown,
  effectiveDoc: PricesDoc | null | undefined,
): unknown {
  if (scopeStatus === "unavailable" && effectiveDoc !== null && effectiveDoc !== undefined)
    return "ready";
  return scopeStatus;
}

/**
 * Explain why no rate could be resolved.
 *
 * Ordered most-fundamental first: without the document nothing else can be
 * judged, and without a model the document cannot be queried. Reporting a
 * later cause while an earlier one holds would send a reader to the wrong
 * half — which is exactly the failure this function exists to end.
 *
 * @param scopeStatus - the settings scope snapshot's `status`, when the
 *   transport reports one. Only the string "unavailable" means the transport
 *   itself is down (the loopback/memory case); any other status with a
 *   missing document means the transport is up but the table never arrived.
 *   An unfamiliar transport degrades to judging the document itself rather
 *   than mislabelling it as broken.
 * @param doc - the resolved prices document, if it arrived.
 * @param provider - live selection's provider, or null when unresolved.
 * @param model - live selection's model, or null when unresolved.
 */
export function explainMissingRate(
  scopeStatus: unknown,
  doc: PricesDoc | null | undefined,
  provider: string | null | undefined,
  model: string | null | undefined,
): MissingRate {
  if (scopeStatus === "unavailable") {
    return {
      kind: "transport",
      label: "prices unavailable",
      detail:
        "The browser never received the price table. Settings are mirrored from the host only over a loopback connection, so this is expected on a proxied or LAN URL and no rate can be resolved for any model.",
    };
  }
  const docMissing = doc === null || doc === undefined;
  if (docMissing) {
    const seen =
      typeof scopeStatus === "string" && scopeStatus !== "" ? scopeStatus : "unknown";
    return {
      kind: "transport",
      label: "prices not received",
      detail:
        "The price table never arrived although the settings transport reports " +
        "status '" +
        seen +
        "'. The host may not have registered the prices namespace, or the " +
        "mirror stalled — reload, and if it persists the host log names the cause.",
    };
  }
  const hasProvider = typeof provider === "string" && provider !== "";
  const hasModel = typeof model === "string" && model !== "";
  if (!hasProvider || !hasModel) {
    return {
      kind: "no-model",
      label: "no model reported",
      detail:
        "The session has not reported which provider and model served it, so there is no rate to look up. The price table is present.",
    };
  }
  return {
    kind: "unpriced",
    label: "unpriced model",
    detail:
      "No rate row for " +
      rateKey(provider as string, model as string) +
      ". The price table arrived but does not price this model; add a row under the prices namespace.",
  };
}

/**
 * The bare model id of a "provider/model" rate key: everything after the
 * FIRST slash. Model ids themselves contain slashes
 * ("command-code/MiniMaxAI/MiniMax-M2.5"), so splitting on the last slash
 * would misidentify them; the provider is always the first segment.
 */
export function bareModel(key: string): string {
  const slash = key.indexOf("/");
  return slash === -1 ? key : key.slice(slash + 1);
}

/** One session's cost under one pricing, exact or estimated. */
export interface CostSummary {
  kind: "exact" | "estimated";
  /** The exact rate key, when kind is exact. */
  key: string | null;
  /** Exact cost, or the MEDIAN candidate cost when estimated. */
  cost: number;
  /** Cheapest candidate cost; estimated only. */
  min: number;
  /** Priciest candidate cost; estimated only. */
  max: number;
  /** Provider prefixes behind the estimate, sorted; estimated only. */
  providers: string[];
}

/**
 * Price one bucket set, preferring the exact provider/model row and falling
 * back to a cross-provider estimate (#161, #126 decision 4, owner's chosen
 * shape: median headline with the range underneath).
 *
 * The estimate never invents a rate: every candidate is a real published row
 * for the SAME bare model under another provider. Overrides win per key,
 * exactly as in {@link resolveRate}. With an even candidate count the median
 * is the mean of the two middle costs. No candidate at all resolves null —
 * never a zero, never a guess (#126's rule).
 */
export function summarizeCost(
  buckets: TokenBuckets,
  doc: PricesDoc | null | undefined,
  provider: string | null | undefined,
  model: string | null | undefined,
): CostSummary | null {
  if (typeof model !== "string" || model === "") return null;
  const exact =
    typeof provider === "string" && provider !== "" ? resolveRate(doc, provider, model) : null;
  if (exact !== null) {
    return {
      kind: "exact",
      key: rateKey(provider as string, model),
      cost: priceBuckets(buckets, exact),
      min: priceBuckets(buckets, exact),
      max: priceBuckets(buckets, exact),
      providers: [],
    };
  }
  if (doc === null || doc === undefined) return null;
  const merged: Record<string, unknown> = {};
  if (doc.rates !== null && doc.rates !== undefined) {
    for (const [key, rate] of Object.entries(doc.rates)) merged[key] = rate;
  }
  if (doc.overrides !== null && doc.overrides !== undefined) {
    for (const [key, rate] of Object.entries(doc.overrides)) merged[key] = rate;
  }
  const candidates: { provider: string; cost: number }[] = [];
  for (const [key, rate] of Object.entries(merged)) {
    if (bareModel(key) !== model) continue;
    if (!isPriced(rate)) continue;
    candidates.push({
      provider: key.slice(0, key.indexOf("/")),
      cost: priceBuckets(buckets, rate as PriceRate),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.cost - b.cost);
  const mid = Math.floor(candidates.length / 2);
  const median =
    candidates.length % 2 === 1
      ? candidates[mid].cost
      : (candidates[mid - 1].cost + candidates[mid].cost) / 2;
  return {
    kind: "estimated",
    key: null,
    cost: median,
    min: candidates[0].cost,
    max: candidates[candidates.length - 1].cost,
    providers: [...new Set(candidates.map((c) => c.provider))].sort(),
  };
}

/**
 * Which cost row the panel renders for one summary (#161 review DEFECT 1).
 *
 * The panel renders the exact figure only for an exact summary; ANY other
 * non-null summary is an estimate (median headline with the range
 * underneath). Widening the exact gate to "summary !== null" silently
 * collapses every estimate back into the exact branch — the range row
 * vanishes and the figure is mislabelled — so the gate lives here,
 * executed by the suite, not as a shape the suite greps for.
 */
export function selectCostBranch(summary: CostSummary | null): "exact" | "estimated" | "missing" {
  if (summary !== null && summary !== undefined && summary.kind === "exact") return "exact";
  if (summary !== null && summary !== undefined) return "estimated";
  return "missing";
}

/**
 * The collapsed trigger's tooltip text, which doubles as the trigger's
 * aria-label (#166).
 *
 * The open panel marks an estimate three ways — median headline, "Est.
 * range" row, hover naming the provider count — but the collapsed tip used
 * to carry the bare median, so an estimate was indistinguishable from an
 * exact figure for anyone who did not open the panel, and a screen-reader
 * user got ONLY the unmarked form. The estimate therefore carries its
 * marker AND its range here; exact and missing figures render exactly as
 * before. A null figure (no usage yet) renders the reading alone.
 *
 * Deliberately NOT the styled tooltip plugin (`data-dsh-tip`): that plugin
 * reads the visual text from `title` while the accessible name still comes
 * from `aria-label`, which would split the two surfaces this one string
 * keeps identical — and it strips `title` while showing, so a drifted pair
 * would show one figure and announce another. One string feeds the hover
 * div and the aria-label alike, so they can never disagree.
 */
export function buildTipText(
  reading: string,
  costText: string | null,
  costBranch: "exact" | "estimated" | "missing",
  rangeLabel: string | null,
): string {
  if (costText === null) return reading;
  if (costBranch === "estimated") {
    // The marker is unconditional: even a missing range must never leave an
    // estimate looking exact on the one surface some users exclusively get.
    const marked =
      rangeLabel !== null ? costText + " (est. range " + rangeLabel + ")" : costText + " (est.)";
    return reading + " · " + marked;
  }
  return reading + " · " + costText;
}
