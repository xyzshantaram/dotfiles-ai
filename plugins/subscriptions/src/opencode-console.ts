/**
 * opencode.ai console REST model (ticket #341) — pure, dependency-free.
 *
 * The SolidStart `/_server` RPC retired with the console redesign; balance
 * and GO meters now come from the console REST surface with the Firefox
 * session cookies:
 *   - GET /console/auth/session            — session validation (200 vs 401)
 *   - GET /console/api/orgs                — org discovery (first id wins)
 *   - GET /console/api/go/status (x-org-id) — GO meters (fiveHour/week/month)
 *   - GET /console/api/billing/status (x-org-id) — balance (microCents)
 *
 * Money arrives as microCents STRINGS; dollars = microCents / 1e8 (USD_SCALE,
 * shared with the old billing parser). This file owns the parsing only; the
 * host half (index.ts) owns the fetches. Dependency-free so vitest can
 * exercise every shape without importing the host.
 */

/** opencode.ai reports money as fixed-point microCents scaled by 1e8. */
export const OPENCODE_USD_SCALE = 100_000_000;

/** Browser-faithful request headers for the console surface. */
export const OPENCODE_CONSOLE = "https://opencode.ai";
export const OPENCODE_UA =
  "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0";

/** microCents (string or number) -> USD, or null when not a finite number. */
export function microCentsToUsd(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n / OPENCODE_USD_SCALE;
}

/**
 * First org id from GET /console/api/orgs ([{id, name}, ...]).
 * Returns null for any non-array, empty, or id-less payload.
 */
export function parseConsoleOrgs(data: unknown): string | null {
  if (!Array.isArray(data)) return null;
  for (const entry of data) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string" &&
      ((entry as { id: string }).id.length > 0)
    ) {
      return (entry as { id: string }).id;
    }
  }
  return null;
}

/** One GO meter mapped to the panel window shape (USD + percent + reset). */
export interface ConsoleWindow {
  used: number;
  cap: number;
  percent: number;
  resetsAt: string | null;
}

/**
 * Map one go/status meter ({limitMicroCents, usedMicroCents, resetsAt?}).
 * The month meter carries NO resetsAt — it maps to null, never NaN. A meter
 * with unparseable money maps to null so the row degrades instead of
 * rendering a synthesised zero.
 */
export function parseConsoleMeter(data: unknown): ConsoleWindow | null {
  if (data === null || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const used = microCentsToUsd(record.usedMicroCents);
  const cap = microCentsToUsd(record.limitMicroCents);
  if (used === null || cap === null) return null;
  const resetsAt = typeof record.resetsAt === "string" ? record.resetsAt : null;
  return {
    used,
    cap,
    percent: cap > 0 ? Math.max(0, Math.min(100, (used / cap) * 100)) : 0,
    resetsAt,
  };
}

/** GO meters keyed the way the client renders them (rolling/weekly/monthly). */
export interface ConsoleMeters {
  rolling: ConsoleWindow | null;
  weekly: ConsoleWindow | null;
  monthly: ConsoleWindow | null;
}

/** GET /console/api/go/status -> panel windows via access.meters. */
export function parseGoStatus(data: unknown): ConsoleMeters | null {
  if (data === null || typeof data !== "object") return null;
  const access = (data as { access?: unknown }).access;
  if (access === null || typeof access !== "object") return null;
  const meters = (access as { meters?: unknown }).meters;
  if (meters === null || typeof meters !== "object") return null;
  const record = meters as Record<string, unknown>;
  return {
    rolling: parseConsoleMeter(record.fiveHour),
    weekly: parseConsoleMeter(record.week),
    monthly: parseConsoleMeter(record.month),
  };
}

/** GET /console/api/billing/status -> USD balance figures. */
export function parseBillingStatus(data: unknown): {
  balance: number | null;
  available: number | null;
} | null {
  if (data === null || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const balance = microCentsToUsd(record.balanceMicroCents);
  const available = microCentsToUsd(record.availableMicroCents);
  if (balance === null && available === null) return null;
  return { balance, available };
}

/**
 * Fold go/status + billing/status into the balance-route payload the client
 * renders: the hero balance prefers availableMicroCents (spendable) with
 * balanceMicroCents as fallback; the month meter feeds monthlyUsage/Limit;
 * the full meter set rides along as usage so the GO section keeps its
 * windows even when the API-key usage route has no key. Returns null when
 * neither payload yields anything renderable.
 */
export function shapeConsoleBalance(
  go: unknown,
  billing: unknown,
): {
  balance: number | null;
  monthlyUsage: number | null;
  monthlyLimit: number | null;
  usage: ConsoleMeters;
} | null {
  const meters = parseGoStatus(go);
  const money = parseBillingStatus(billing);
  const balance =
    money !== null ? (money.available ?? money.balance) : null;
  const monthlyUsage = meters?.monthly?.used ?? null;
  const monthlyLimit = meters?.monthly?.cap ?? null;
  const usage: ConsoleMeters = meters ?? { rolling: null, weekly: null, monthly: null };
  if (balance === null && monthlyUsage === null) return null;
  return { balance, monthlyUsage, monthlyLimit, usage };
}

/**
 * HTTP status -> stale session. The console answers 401
 * ({"_tag":"SessionQueryFailed"}) for a dead session — including a request
 * that sends `auth` WITHOUT `__Host-console_session`, which is why the
 * harvest must pull both cookies. Anything else is transport/server trouble,
 * never "sign in again".
 */
export function consoleStatusIsStale(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * Build the Cookie header from the two harvested Firefox values. BOTH are
 * mandatory: `__Host-console_session` alone decides authenticated vs 401.
 * Returns null when either is missing or empty — fail closed, never send a
 * known-bad header.
 */
export function buildConsoleCookie(auth: unknown, session: unknown): string | null {
  if (typeof auth !== "string" || auth === "") return null;
  if (typeof session !== "string" || session === "") return null;
  return `auth=${auth}; __Host-console_session=${session}`;
}
