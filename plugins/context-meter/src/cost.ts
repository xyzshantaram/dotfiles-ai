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
 * WHY THREE STATES INSTEAD OF ONE STRING (#134).
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
 * Explain why no rate could be resolved.
 *
 * Ordered most-fundamental first: without the document nothing else can be
 * judged, and without a model the document cannot be queried. Reporting a
 * later cause while an earlier one holds would send a reader to the wrong
 * half — which is exactly the failure this function exists to end.
 *
 * @param scopeStatus - the settings scope snapshot's `status`, when the
 *   transport reports one. Anything other than the string "unavailable" is
 *   treated as present, so an unfamiliar transport degrades to judging the
 *   document itself rather than mislabelling it as broken.
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
  const docMissing = doc === null || doc === undefined;
  if (scopeStatus === "unavailable" || docMissing) {
    return {
      kind: "transport",
      label: "prices unavailable",
      detail:
        "The browser never received the price table. Settings are mirrored from the host only over a loopback connection, so this is expected on a proxied or LAN URL and no rate can be resolved for any model.",
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
