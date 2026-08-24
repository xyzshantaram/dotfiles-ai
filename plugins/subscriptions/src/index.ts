/**
 * W18 — combined subscription panel, host half.
 *
 * Owns the same-origin proxy routes the browser panel polls:
 *   - GET /subscriptions/meridian-quota      — meridian quota (cached 30s)
 *   - GET /subscriptions/meridian-telemetry  — meridian telemetry (cached 60s)
 *   - GET /subscriptions/opencode-balance    — cookie-based OpenCode GO balance
 *   - GET /subscriptions/opencode-usage      — GO windows via the zen API key
 *   - GET /subscriptions/opencode-zen-balance — OpenCode Zen balance (same
 *     cookie payload as GO; zen has no public billing endpoint)
 *   - GET /subscriptions/deepseek-balance    — DeepSeek platform balance
 *   - POST /subscriptions/opencode-cookie/extract — pull the opencode.ai
 *     session cookie out of a local Firefox profile, validate it against the
 *     `_server` RPC, and save it as the OPENCODE_SESSION_COOKIE credential
 *   - POST /subscriptions/opencode-cookie/login — open opencode.ai in the
 *     browser so the user can sign in, then re-run extract
 *
 * The GO usage and DeepSeek balance routes fold in what the removed
 * dsh-opencode-go-usage and ds-api-usage packages owned.
 *
 * The balance has no public API. The zen balance equals the go balance and
 * is reachable only through opencode.ai's private `_server` RPC using the
 * browser-session cookie. The cookie lives in the credentials domain
 * (`OPENCODE_SESSION_COOKIE`), never in settings.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { execFile, execFileSync, spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-settings";
import { uncompress } from "snappyjs";

/** Stable Cordis plugin name. */
export const name = "subscriptions";

/** Required services: web routes and credentials. */
export const inject = ["webServer", "credentials"];

/**
 * Optional section gating. providers[<key>] === false hides that provider
 * section in the browser panel; absent keys and an absent config show all.
 * The same map is the `subscriptions` settings namespace: the browser panel
 * reads it through GET /subscriptions/config and writes it through PUT.
 */
export const Config = z.object({
  providers: z.dict(z.boolean()).default({}),
});

/** The `subscriptions` settings namespace, owned by this plugin. */
const CONFIG_NS = settingsNamespace("subscriptions");

/** Read side of the settings service this plugin registers. */
interface SettingsService {
  get(ns: string): unknown;
}

/** Write side: replaces one namespace's user section wholesale. */
interface SettingsWriteService extends SettingsService {
  replace(ns: string, section: unknown): Promise<void>;
}

/** Minimal structural service lookup, matching profiles.ts. */
function service<T>(ctx: unknown, name: string): T | undefined {
  return (ctx as { get(name: string): unknown }).get(name) as T | undefined;
}

/** opencode.ai reports balance and monthlyUsage as fixed-point scaled by 1e8. */
const USD_SCALE = 100_000_000;
/** SolidStart server-function ids discovered by CodexBar. */
const WORKSPACES_SERVER_ID = "def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f";
const BILLING_SERVER_ID = "c83b78a614689c38ebee981f9b39a8b377716db85c1fd7dbab604adc02d3313d";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const BALANCE_CACHE_MS = 30_000;
const MERIDIAN_TIMEOUT_MS = 10_000;
const OPENCODE_TIMEOUT_MS = 15_000;

/** Write a small JSON response. */
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/** One in-flight promise plus a TTL, so open tabs never hammer the source. */
function cachedOnce(fn, ttlMs) {
  let cache = null;
  return (...args) => {
    const now = Date.now();
    const key = JSON.stringify(args);
    if (cache !== null && now - cache.at < ttlMs && cache.key === key) return cache.promise;
    const promise = Promise.resolve().then(() => fn(...args));
    cache = { at: now, promise, key };
    promise.catch(() => {
      if (cache?.promise === promise) cache = null;
    });
    return promise;
  };
}

/** Headers the opencode.ai `_server` RPC expects from a browser session. */
function makeHeaders(cookie, serverId, referer) {
  return {
    cookie,
    "x-server-id": serverId,
    "x-server-instance": `server-fn:${randomUUID()}`,
    "user-agent": USER_AGENT,
    origin: "https://opencode.ai",
    referer,
    accept: "text/javascript, application/json;q=0.9, */*;q=0.8",
  };
}

/** GET or POST the `_server` RPC and return the raw text. */
async function fetchServerText(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`opencode HTTP ${res.status}`);
  return res.text();
}

/** A signed-out session page contains one of these markers. */
function looksSignedOut(text) {
  const lower = String(text).toLowerCase();
  return lower.includes("login") || lower.includes("sign in") || lower.includes("auth/authorize");
}

/** First workspace id from the SolidStart payload, then a JSON walk. */
function parseWorkspaceId(text) {
  const match = /id\s*:\s*"(wrk_[^"]+)"/.exec(text);
  if (match !== null) return match[1];
  try {
    return findWorkspaceId(JSON.parse(text));
  } catch {
    return null;
  }
}

function findWorkspaceId(value) {
  if (typeof value === "string") return value.startsWith("wrk_") ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findWorkspaceId(item);
      if (found !== null) return found;
    }
  } else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      const found = findWorkspaceId(value[key]);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Step 1: discover the first workspace id, with a POST fallback. */
async function resolveWorkspaceId(cookie) {
  const url = `https://opencode.ai/_server?id=${WORKSPACES_SERVER_ID}`;
  let text = await fetchServerText(url, {
    headers: makeHeaders(cookie, WORKSPACES_SERVER_ID, "https://opencode.ai"),
  });
  let id = parseWorkspaceId(text);
  if (id !== null) return id;
  text = await fetchServerText(url, {
    method: "POST",
    headers: {
      ...makeHeaders(cookie, WORKSPACES_SERVER_ID, "https://opencode.ai"),
      "content-type": "application/json",
    },
    body: "[]",
  });
  id = parseWorkspaceId(text);
  if (id === null) throw new Error("no workspace id");
  return id;
}

/** Step 2: fetch the customer/billing payload for the workspace. */
async function fetchBillingPayload(cookie, workspaceId) {
  const args = encodeURIComponent(JSON.stringify([workspaceId]));
  const url = `https://opencode.ai/_server?id=${BILLING_SERVER_ID}&args=${args}`;
  return fetchServerText(url, {
    headers: makeHeaders(cookie, BILLING_SERVER_ID, `https://opencode.ai/workspace/${workspaceId}`),
  });
}

/** Step 2a: fetch the workspace billing page, which embeds the balance. */
async function fetchBillingText(cookie, workspaceId) {
  return fetchServerText(`https://opencode.ai/workspace/${workspaceId}/billing`, {
    headers: {
      cookie,
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      origin: "https://opencode.ai",
      referer: "https://opencode.ai",
    },
  });
}

/** The dict that carries a non-empty customerID, found recursively. */
function findCustomer(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCustomer(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  if (typeof value.customerID === "string" && value.customerID.length > 0) return value;
  for (const key of Object.keys(value)) {
    const found = findCustomer(value[key]);
    if (found !== null) return found;
  }
  return null;
}

/** Tolerant field scan: matches `monthlyUsage:123` and `"monthlyUsage":$R[3]=123`. */
function numberField(text, field) {
  const regex = new RegExp(
    `(?:["']?${field}["']?\\s*:\\s*)(?:\\$R\\[\\d+\\]\\s*=\\s*)?(-?[0-9]+(?:\\.[0-9]+)?)`,
  );
  const match = regex.exec(text);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parse the billing payload. It is a SolidStart `$R[...]` JavaScript
 * payload, not plain JSON, so the JSON path runs first and a tolerant field
 * scan follows. customerID must be present before any number is trusted.
 */
function parseBilling(text) {
  try {
    const object = JSON.parse(text);
    const customer = findCustomer(object);
    if (customer !== null && typeof customer.monthlyUsage === "number") {
      return {
        monthlyUsage: customer.monthlyUsage / USD_SCALE,
        monthlyLimit: typeof customer.monthlyLimit === "number" ? customer.monthlyLimit : null,
        balance: typeof customer.balance === "number" ? customer.balance / USD_SCALE : null,
      };
    }
  } catch {
    // fall through to the tolerant field scan
  }
  if (!/customerID\s*:\s*"[^"]+"/.test(text)) return null;
  const usage = numberField(text, "monthlyUsage");
  if (usage === null) return null;
  const limit = numberField(text, "monthlyLimit");
  const balance = numberField(text, "balance");
  return {
    monthlyUsage: usage / USD_SCALE,
    monthlyLimit: limit,
    balance: balance === null ? null : balance / USD_SCALE,
  };
}

/**
 * Parse a Zen balance in USD out of the workspace dashboard page or the
 * billing payload. Tries, in order: a JSON walk for a customerID-carrying
 * object with a numeric balance, the SolidStart `customerID ... balance`
 * serialization, and a "current balance"/"zen balance" label next to a
 * dollar figure. Returns null when no balance is found.
 */
function parseZenBalanceText(text) {
  text = String(text).replace(/<!--[\s\S]*?-->/g, "");
  const slot = /data-slot="balance-value"[^>]*>\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(text);
  if (slot !== null) {
    const v = Number(slot[1].replace(/,/g, ""));
    if (Number.isFinite(v) && v >= 0) return v;
  }
  try {
    const object = JSON.parse(text);
    const customer = findCustomer(object);
    if (customer !== null && typeof customer.balance === "number") {
      return customer.balance / USD_SCALE;
    }
  } catch {
    // not JSON; fall through to the regex paths
  }
  const solid =
    /(?:^|[,{])\s*(?:"customerID"|customerID)\s*:\s*(?:\$R\[\d+\]\s*=\s*)?"[^"]+"[^{}]{0,512}?(?:"balance"|balance)\s*:\s*(?:\$R\[\d+\]\s*=\s*)?(-?[0-9]+(?:\.[0-9]+)?)/.exec(
      text,
    );
  if (solid !== null && solid[1] !== undefined) {
    const raw = Number(solid[1]);
    if (Number.isFinite(raw)) return raw / USD_SCALE;
  }
  const after =
    /(?:current\s+balance|zen\s+balance)[\s\S]{0,160}?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i.exec(text);
  if (after !== null && after[1] !== undefined) {
    const value = Number(after[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const before =
    /\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)[\s\S]{0,160}?(?:current\s+balance|zen\s+balance)/i.exec(text);
  if (before !== null && before[1] !== undefined) {
    const value = Number(before[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/**
 * Command Code (api.commandcode.ai) — balance and usage.
 * Every endpoint may answer wrapped in a `data` envelope or bare, so unwrap
 * before reading fields.
 */
function unwrapData(json) {
  if (json !== null && typeof json === "object" && !Array.isArray(json) && "data" in json)
    return json.data;
  return json;
}

/** Map a Command Code HTTP status to a clear, user-facing error. */
function commandCodeStatusError(status) {
  if (status === 401 || status === 403) return "Command Code API key invalid or expired";
  if (status === 408 || status === 429) return "Command Code API rate limited; will retry";
  return `Command Code API HTTP ${status}`;
}

/** GET one Command Code endpoint; orgId is appended only when present. */
async function commandCodeGet(key, base, path, orgId) {
  const sep = path.includes("?") ? "&" : "?";
  const url =
    orgId === null || orgId === undefined
      ? `${base}${path}`
      : `${base}${path}${sep}orgId=${encodeURIComponent(orgId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(commandCodeStatusError(res.status));
  return unwrapData(await res.json());
}

/** Credits payload -> the panel hero and window shape. */
export function parseCommandCodeCredits(json) {
  const data = unwrapData(json);
  const credits = data !== null && typeof data === "object" ? data.credits || {} : {};
  const windows = data !== null && typeof data === "object" ? data.windowLimits || {} : {};
  const fiveHour = windows.fiveHour || {};
  const weekly = windows.weekly || {};
  return {
    credits: {
      monthly: credits.monthlyCredits ?? null,
      purchased: credits.purchasedCredits ?? null,
      free: credits.freeCredits ?? null,
    },
    windows: {
      fiveHour: {
        used: fiveHour.used ?? null,
        cap: fiveHour.cap ?? null,
        resetAt: fiveHour.resetAt ?? null,
      },
      weekly: {
        used: weekly.used ?? null,
        cap: weekly.cap ?? null,
        resetAt: weekly.resetAt ?? null,
      },
    },
  };
}

/** Subscriptions + usage payloads -> the panel plan/cost shape. */
export function parseCommandCodeUsage(subJson, usageJson) {
  const sub = unwrapData(subJson);
  const usage = unwrapData(usageJson);
  const out = {} as Record<string, unknown>;
  if (sub !== null && typeof sub === "object") {
    if (typeof sub.planId === "string") out.plan = sub.planId;
    if (typeof sub.currentPeriodStart === "string") out.periodStart = sub.currentPeriodStart;
    if (typeof sub.currentPeriodEnd === "string") out.periodEnd = sub.currentPeriodEnd;
  }
  if (usage !== null && typeof usage === "object" && typeof usage.totalCost === "number") {
    out.totalCost = usage.totalCost;
  }
  return out;
}

export function apply(ctx, config) {
  const credentials = ctx.get("credentials");

  // The `subscriptions` settings namespace holds the provider visibility map.
  // The composition entry (patch row config) is the base layer; a user write
  // through PUT /subscriptions/config overrides it until reset.
  installSettingsSection(ctx, CONFIG_NS, Config, config ?? {}, {
    setSource: () => {},
    onChange: () => {},
  });
  // ── meridian quota (localhost service, no auth) ────────────────────────
  const quotaOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/v1/usage/quota/all", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`meridian quota HTTP ${res.status}`);
    return res.json();
  }, 30_000);

  const handleQuota = async (_req, res) => {
    try {
      sendJson(res, 200, await quotaOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── meridian telemetry (localhost service, no auth) ────────────────────
  const telemetryOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/telemetry/summary?window=86400000", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`meridian telemetry HTTP ${res.status}`);
    return res.json();
  }, 60_000);

  const handleTelemetry = async (_req, res) => {
    try {
      sendJson(res, 200, await telemetryOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── cookie-based OpenCode GO balance ───────────────────────────────────
  // The cookie comes from the credentials domain. A missing credential or a
  // signed-out/parse failure both answer with 200 and a JSON error object so
  // the browser panel can show the message inline.
  let balanceCache = null;
  const cachedBalance = (cookie) => {
    const now = Date.now();
    if (
      balanceCache !== null &&
      now - balanceCache.at < BALANCE_CACHE_MS &&
      balanceCache.cookie === cookie
    )
      return balanceCache.promise;
    const promise = (async () => {
      const workspaceId = await resolveWorkspaceId(cookie);
      const text = await fetchBillingPayload(cookie, workspaceId);
      if (looksSignedOut(text)) throw new Error("signed out");
      const parsed = parseBilling(text);
      if (parsed === null) throw new Error("parse failed");
      // Prefer the balance embedded in the workspace dashboard page (the
      // pattern used by CodexBar and pi-sub-limits); keep the billing RPC
      // payload for monthly usage and as the fallback. Best-effort only.
      try {
        const dashboard = await fetchBillingText(cookie, workspaceId);
        if (!looksSignedOut(dashboard)) {
          const dashBalance = parseZenBalanceText(dashboard);
          if (dashBalance !== null) parsed.balance = dashBalance;
        }
      } catch {
        // keep the billing payload balance
      }
      return parsed;
    })();
    balanceCache = { at: now, promise, cookie };
    promise.catch(() => {
      if (balanceCache?.promise === promise) balanceCache = null;
    });
    return promise;
  };

  const handleBalance = async (_req, res) => {
    let cookie = null;
    try {
      const hit =
        credentials === undefined ? null : await credentials.resolve("OPENCODE_SESSION_COOKIE");
      cookie = hit?.value ?? null;
    } catch {
      cookie = null;
    }
    if (cookie === null || cookie === "") {
      sendJson(res, 200, { error: "OPENCODE_SESSION_COOKIE credential not configured" });
      return;
    }
    try {
      const data = await cachedBalance(cookie);
      sendJson(res, 200, {
        ok: true,
        balance: data.balance,
        monthlyUsage: data.monthlyUsage,
        monthlyLimit: data.monthlyLimit,
        currency: "USD",
      });
    } catch {
      sendJson(res, 200, { ok: false, error: "cookie invalid or expired" });
    }
  };

  // ── OpenCode Zen balance (no public API-key billing endpoint) ──────────
  // The zen gateway (/zen/v1) ships only inference routes; no billing path
  // answers there. Zen and GO share one account and one cookie-based
  // `_server` payload, so the zen route serves the same handler as the GO
  // balance. The balance itself is read from the workspace dashboard page
  // when parseable, with the `_server` billing payload as fallback (the
  // pattern used by CodexBar and pi-sub-limits).
  const handleOzBalance = handleBalance;

  // ── OpenCode GO windows (zen API key, no cookie) ────────────────────────
  const goUsageOnce = cachedOnce(async () => {
    const key =
      credentials === undefined ? null : (await credentials.resolve("OPENCODE_GO_API_KEY"))?.value;
    if (!key) throw new Error("OPENCODE_GO_API_KEY credential not configured");
    const res = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`go usage HTTP ${res.status}`);
    return res.json();
  }, 30_000);

  const handleGoUsage = async (_req, res) => {
    try {
      sendJson(res, 200, await goUsageOnce());
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── DeepSeek platform balance (DS API key) ────────────────────────────
  const dsBalanceOnce = cachedOnce(async () => {
    const key =
      credentials === undefined ? null : (await credentials.resolve("DEEPSEEK_API_KEY"))?.value;
    if (!key) throw new Error("DEEPSEEK_API_KEY credential not configured");
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`deepseek balance HTTP ${res.status}`);
    return res.json();
  }, 30_000);

  const handleDsBalance = async (_req, res) => {
    try {
      sendJson(res, 200, await dsBalanceOnce());
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── DeepSeek platform usage (monthly cost + tokens) ─────────────────────
  const DS_PLATFORM_BASE = "https://platform.deepseek.com/api/v0";
  const dsUsageAmountOnce = cachedOnce(async (token, month, year) => {
    const res = await fetch(`${DS_PLATFORM_BASE}/usage/amount?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`deepseek usage amount HTTP ${res.status}`);
    return res.json();
  }, 60_000);

  const dsUsageCostOnce = cachedOnce(async (token, month, year) => {
    const res = await fetch(`${DS_PLATFORM_BASE}/usage/cost?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(OPENCODE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`deepseek usage cost HTTP ${res.status}`);
    return res.json();
  }, 60_000);

  const handleDsUsageAmount = async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost`);
      const month = url.searchParams.get("month");
      const year = url.searchParams.get("year");
      if (!month || !year) {
        sendJson(res, 400, { error: "month and year query params required" });
        return;
      }
      const authHeader =
        req.headers && typeof req.headers.authorization === "string"
          ? req.headers.authorization
          : "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : credentials === undefined
          ? null
          : (await credentials.resolve("DEEPSEEK_PLATFORM_TOKEN"))?.value;
      if (!token) {
        sendJson(res, 200, {
          error: "DEEPSEEK_PLATFORM_TOKEN not configured; sign in to platform.deepseek.com",
        });
        return;
      }
      const data = await dsUsageAmountOnce(token, month, year);
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleDsUsageCost = async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost`);
      const month = url.searchParams.get("month");
      const year = url.searchParams.get("year");
      if (!month || !year) {
        sendJson(res, 400, { error: "month and year query params required" });
        return;
      }
      const authHeader =
        req.headers && typeof req.headers.authorization === "string"
          ? req.headers.authorization
          : "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : credentials === undefined
          ? null
          : (await credentials.resolve("DEEPSEEK_PLATFORM_TOKEN"))?.value;
      if (!token) {
        sendJson(res, 200, {
          error: "DEEPSEEK_PLATFORM_TOKEN not configured; sign in to platform.deepseek.com",
        });
        return;
      }
      const data = await dsUsageCostOnce(token, month, year);
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // Firefox platform.deepseek.com localStorage userToken extraction ──────────
  const firefoxDeepSeekProfileDirs = () => {
    const root = join(homedir(), ".mozilla", "firefox");
    if (!existsSync(root)) return [];
    try {
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name));
    } catch {
      return [];
    }
  };

  // Read Firefox Storage v2 (ls/data.sqlite) for platform.deepseek.com userToken
  // Firefox localStorage compression is 0 = raw or 1 = SNAPPY (snappyjs).
  const readDeepSeekToken = (profileDir) => {
    const storeDir = join(profileDir, "storage", "default", "https+++platform.deepseek.com", "ls");
    const dbPath = join(storeDir, "data.sqlite");
    if (!existsSync(dbPath)) return Promise.resolve(null);
    const scratch = mkdtempSync(join(tmpdir(), "ds-token-"));
    const dest = join(scratch, "data.sqlite");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    };
    // Snapshot the live Firefox DB via sqlite's backup API. We open the source
    // with immutable=1 so sqlite takes NO lock; Firefox holds a persistent lock
    // on this file, so a normal .backup fails with "database is locked". This
    // reads through the sqlite engine (a consistent point-in-time snapshot) and
    // never copies the user's browser DB files by hand.
    try {
      execFileSync("/usr/bin/sqlite3", [`file:${dbPath}?mode=ro&immutable=1`, ".backup " + dest], {
        timeout: 15_000,
        killSignal: "SIGKILL",
      });
    } catch {
      cleanup();
      return Promise.resolve(null);
    }
    const sql = "SELECT hex(value), compression_type FROM data WHERE key = 'userToken' LIMIT 1";
    return new Promise((resolve) => {
      execFile(
        "/usr/bin/sqlite3",
        ["-readonly", "-noheader", dest, sql],
        { timeout: 10_000 },
        (error, stdout) => {
          try {
            if (error) return resolve(null);
            const raw = String(stdout).trim();
            if (!raw) return resolve(null);
            const [hex, compressionType] = raw.split("|");
            if (compressionType !== "0" && compressionType !== "1") return resolve(null);
            let token;
            try {
              token =
                compressionType === "1"
                  ? uncompress(Buffer.from(hex, "hex")).toString("utf8")
                  : Buffer.from(hex, "hex").toString("utf8");
            } catch {
              return resolve(null);
            }
            // appKit stores the token as {"value":"<token>","__version":"0"}; unwrap it
            try {
              const parsed = JSON.parse(token);
              if (parsed !== null && typeof parsed === "object" && typeof parsed.value === "string")
                token = parsed.value;
            } catch {
              /* not JSON */
            }
            resolve(token);
          } finally {
            cleanup();
          }
        },
      );
    });
  };

  const extractDeepSeekToken = async () => {
    for (const dir of firefoxDeepSeekProfileDirs()) {
      if (
        !existsSync(
          join(dir, "storage", "default", "https+++platform.deepseek.com", "ls", "data.sqlite"),
        )
      )
        continue;
      const token = await readDeepSeekToken(dir);
      if (token === null) continue;
      return { token };
    }
    return null;
  };

  const handleDeepSeekTokenExtract = async (_req, res) => {
    const found = await extractDeepSeekToken();
    if (found === null) {
      sendJson(res, 200, {
        ok: false,
        error: "no platform.deepseek.com session found in any Firefox profile",
      });
      return;
    }
    try {
      if (credentials !== undefined) await credentials.set("DEEPSEEK_PLATFORM_TOKEN", found.token);
      sendJson(res, 200, { ok: true, saved: true });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error:
          "token valid but save failed: " +
          (error instanceof Error ? error.message : String(error)),
      });
    }
  };

  const handleDeepSeekTokenLogin = async (_req, res) => {
    try {
      const child = spawn("firefox", ["--new-window", "https://platform.deepseek.com"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const firefoxProfileDirs = () => {
    const root = join(homedir(), ".mozilla", "firefox");
    if (!existsSync(root)) return [];
    try {
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name));
    } catch {
      return [];
    }
  };

  // Firefox keeps the cookie DB in WAL mode. Copy sqlite + wal + shm to a
  // scratch dir so the read never contends with the live writer, then query
  // the copies read-only. Returns the opencode.ai cookie header string.
  const readCookieString = (dbDir) => {
    const src = join(dbDir, "cookies.sqlite");
    if (!existsSync(src)) return Promise.resolve(null);
    const scratch = mkdtempSync(join(tmpdir(), "oc-cookies-"));
    const dest = join(scratch, "cookies.sqlite");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    };
    // Snapshot the live Firefox DB via sqlite's backup API. We open the source
    // with immutable=1 so sqlite takes NO lock; Firefox holds a persistent lock
    // on this file, so a normal .backup fails with "database is locked". This
    // reads through the sqlite engine (a consistent point-in-time snapshot) and
    // never copies the user's browser DB files by hand.
    try {
      execFileSync("/usr/bin/sqlite3", [`file:${src}?mode=ro&immutable=1`, ".backup " + dest], {
        timeout: 15_000,
        killSignal: "SIGKILL",
      });
    } catch {
      cleanup();
      return Promise.resolve(null);
    }
    const sql =
      "SELECT name || char(9) || value FROM moz_cookies WHERE host LIKE '%opencode.ai' AND name = 'auth'";
    return new Promise((resolve) => {
      execFile(
        "/usr/bin/sqlite3",
        ["-readonly", "-noheader", dest, sql],
        { timeout: 10_000 },
        (error, stdout) => {
          try {
            if (error) return resolve(null);
            const parts = String(stdout)
              .trim()
              .split("\n")
              .map((line) => {
                const tab = line.indexOf("\t");
                return tab === -1 ? null : line.slice(0, tab) + "=" + line.slice(tab + 1);
              })
              .filter((part) => part !== null && part.includes("="));
            resolve(parts.length > 0 ? parts.join("; ") : null);
          } finally {
            cleanup();
          }
        },
      );
    });
  };

  // Validate the cookie against the real `_server` RPC before saving.
  const extractCookie = async () => {
    for (const dir of firefoxProfileDirs()) {
      if (!existsSync(join(dir, "cookies.sqlite"))) continue;
      const cookieString = await readCookieString(dir);
      if (cookieString === null) continue;
      try {
        await cachedBalance(cookieString);
        return { cookie: cookieString };
      } catch {
        return { cookie: cookieString, stale: true };
      }
    }
    return null;
  };

  const handleCookieExtract = async (_req, res) => {
    const found = await extractCookie();
    if (found === null) {
      sendJson(res, 200, {
        ok: false,
        error: "no opencode.ai session cookie found in any Firefox profile",
      });
      return;
    }
    if (found.stale) {
      sendJson(res, 200, {
        ok: false,
        invalid: true,
        error: "firefox cookie is stale; sign in and retry",
      });
      return;
    }
    try {
      if (credentials !== undefined) await credentials.set("OPENCODE_SESSION_COOKIE", found.cookie);
      sendJson(res, 200, { ok: true, saved: true });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error:
          "cookie valid but save failed: " +
          (error instanceof Error ? error.message : String(error)),
      });
    }
  };

  // Open the browser (visible, detached) so the user can sign in.
  const handleCookieLogin = async (_req, res) => {
    try {
      const child = spawn("firefox", ["--new-window", "https://opencode.ai"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-quota",
    handler: handleQuota,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-telemetry",
    handler: handleTelemetry,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-balance",
    handler: handleBalance,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-zen-balance",
    handler: handleOzBalance,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-usage",
    handler: handleGoUsage,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-balance",
    handler: handleDsBalance,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-usage/amount",
    handler: handleDsUsageAmount,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-usage/cost",
    handler: handleDsUsageCost,
  });
  // ── Command Code (api.commandcode.ai) balance + usage ─────────────────────
  const CMD_API_BASE = "https://api.commandcode.ai/alpha";
  const commandCodeOrgOnce = cachedOnce(async (key) => {
    const whoami = await commandCodeGet(key, CMD_API_BASE, "/whoami", null);
    const org = whoami !== null && typeof whoami === "object" ? whoami.org : null;
    return org !== null &&
      typeof org === "object" &&
      typeof org.id === "string" &&
      org.id.length > 0
      ? org.id
      : null;
  }, 30_000);

  const commandCodeCreditsOnce = cachedOnce(async (key) => {
    const orgId = await commandCodeOrgOnce(key);
    return parseCommandCodeCredits(
      await commandCodeGet(key, CMD_API_BASE, "/billing/credits", orgId),
    );
  }, 30_000);

  const commandCodeUsageOnce = cachedOnce(async (key) => {
    const orgId = await commandCodeOrgOnce(key);
    const sub = await commandCodeGet(key, CMD_API_BASE, "/billing/subscriptions", orgId);
    const periodStart =
      sub !== null && typeof sub === "object" && typeof sub.currentPeriodStart === "string"
        ? sub.currentPeriodStart
        : null;
    let usage = {};
    if (periodStart !== null) {
      usage = await commandCodeGet(
        key,
        CMD_API_BASE,
        `/usage/summary?since=${encodeURIComponent(periodStart)}`,
        null,
      );
    }
    return parseCommandCodeUsage(sub, usage);
  }, 30_000);

  /** Resolve the CMD_API_KEY the same way the DeepSeek routes do. */
  const resolveCommandCodeKey = async (req) => {
    const authHeader =
      req.headers && typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
    return credentials === undefined ? null : (await credentials.resolve("CMD_API_KEY"))?.value;
  };

  const handleCommandCodeCredits = async (req, res) => {
    try {
      const key = await resolveCommandCodeKey(req);
      if (!key) {
        sendJson(res, 200, { ok: false, error: "CMD_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...(await commandCodeCreditsOnce(key)) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleCommandCodeUsage = async (req, res) => {
    try {
      const key = await resolveCommandCodeKey(req);
      if (!key) {
        sendJson(res, 200, { ok: false, error: "CMD_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...(await commandCodeUsageOnce(key)) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/commandcode-credits",
    handler: handleCommandCodeCredits,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/commandcode-usage",
    handler: handleCommandCodeUsage,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-cookie/extract",
    handler: handleCookieExtract,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/opencode-cookie/login",
    handler: handleCookieLogin,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-token/extract",
    handler: handleDeepSeekTokenExtract,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/deepseek-token/login",
    handler: handleDeepSeekTokenLogin,
  });
  // ── /subscriptions/config: the provider visibility map ──────────────────────
  // GET returns the resolved `subscriptions` namespace (user layer over the
  // composition base). PUT validates and writes through the same settings
  // service installSettingsSection registered, so a toggle hot-applies.
  const MAX_BODY_BYTES = 64 * 1024;

  async function readBody(req: unknown): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      if (Buffer.concat(chunks).byteLength > MAX_BODY_BYTES) {
        throw new Error("request body too large");
      }
    }
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("body is not valid JSON");
    }
  }

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function validateProviders(
    value: unknown,
  ): { ok: true; value: Record<string, boolean> } | { ok: false; error: string } {
    if (!isPlainObject(value)) return { ok: false, error: "providers must be an object" };
    const out: Record<string, boolean> = {};
    for (const key of Object.keys(value)) {
      if (typeof value[key] !== "boolean") {
        return { ok: false, error: `providers.${key} must be a boolean` };
      }
      out[key] = value[key];
    }
    return { ok: true, value: out };
  }

  function canonicalConfig(raw: unknown): unknown {
    const map = isPlainObject(raw) && isPlainObject(raw.providers) ? raw.providers : {};
    return { providers: map };
  }

  const handleConfig = async (req: unknown, res: unknown) => {
    const sendJsonRes = sendJson as (res: unknown, status: number, body: unknown) => void;
    if ((req as { method?: string }).method === "GET") {
      const settings = service<SettingsService>(ctx, "settings");
      const raw = settings?.get(CONFIG_NS);
      sendJsonRes(res, 200, { ok: true, config: canonicalConfig(raw) });
      return;
    }
    if ((req as { method?: string }).method === "PUT") {
      const settings = service<SettingsWriteService>(ctx, "settings");
      if (settings === undefined) {
        sendJsonRes(res, 503, { ok: false, error: "settings service unavailable" });
        return;
      }
      let body: unknown;
      try {
        body = await readBody(req);
      } catch (error) {
        sendJsonRes(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const rawProviders = isPlainObject(body) ? body.providers : undefined;
      const validated = validateProviders(rawProviders);
      if (validated.ok === false) {
        sendJsonRes(res, 400, { ok: false, error: validated.error });
        return;
      }
      try {
        await settings.replace(CONFIG_NS, { providers: validated.value });
      } catch (error) {
        sendJsonRes(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const after = settings.get(CONFIG_NS);
      sendJsonRes(res, 200, { ok: true, config: canonicalConfig(after) });
      return;
    }
    sendJsonRes(res, 405, { ok: false, error: "method not allowed" });
  };

  ctx.webServer.register({ kind: "exact", path: "/subscriptions/config", handler: handleConfig });
}
