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
 * unpriced resolves null, and the caller renders "unknown price" — never a
 * guessed rate, never a hidden row that would make the session look cheap.
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
