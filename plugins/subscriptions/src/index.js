/**
 * W18 — combined subscription panel, host half.
 *
 * Owns three same-origin proxy routes the browser panel polls:
 *   - GET /subscriptions/meridian-quota     — meridian quota (cached 30s)
 *   - GET /subscriptions/meridian-telemetry — meridian telemetry (cached 60s)
 *   - GET /subscriptions/opencode-balance   — cookie-based OpenCode GO balance
 *
 * The OpenCode GO usage windows stay on `/opencode-go/usage`, owned by the
 * dsh-opencode-go-usage package. This half never duplicates that route.
 *
 * The balance has no public API. The zen balance equals the go balance and
 * is reachable only through opencode.ai's private `_server` RPC using the
 * browser-session cookie. The cookie lives in the credentials domain
 * (`OPENCODE_SESSION_COOKIE`), never in settings.
 */
import { randomUUID } from "node:crypto";

/** Stable Cordis plugin name. */
export const name = "subscriptions";

/** Required services: web routes and credentials. */
export const inject = ["webServer", "credentials"];

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
  return () => {
    const now = Date.now();
    if (cache !== null && now - cache.at < ttlMs) return cache.promise;
    const promise = Promise.resolve().then(fn);
    cache = { at: now, promise };
    promise.catch(() => { if (cache?.promise === promise) cache = null; });
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
    accept: "text/javascript, application/json;q=0.9, */*;q=0.8"
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
  return lower.includes("login")
    || lower.includes("sign in")
    || lower.includes("auth/authorize");
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
    headers: makeHeaders(cookie, WORKSPACES_SERVER_ID, "https://opencode.ai")
  });
  let id = parseWorkspaceId(text);
  if (id !== null) return id;
  text = await fetchServerText(url, {
    method: "POST",
    headers: { ...makeHeaders(cookie, WORKSPACES_SERVER_ID, "https://opencode.ai"), "content-type": "application/json" },
    body: "[]"
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
    headers: makeHeaders(cookie, BILLING_SERVER_ID, `https://opencode.ai/workspace/${workspaceId}`)
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
  const regex = new RegExp(`(?:["']?${field}["']?\\s*:\\s*)(?:\\$R\\[\\d+\\]\\s*=\\s*)?(-?[0-9]+(?:\\.[0-9]+)?)`);
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
        balance: typeof customer.balance === "number" ? customer.balance / USD_SCALE : null
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
    balance: balance === null ? null : balance / USD_SCALE
  };
}

export function apply(ctx) {
  const credentials = ctx.get("credentials");

  // ── meridian quota (localhost service, no auth) ────────────────────────
  const quotaOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/v1/usage/quota/all", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
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
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS)
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
    if (balanceCache !== null
      && now - balanceCache.at < BALANCE_CACHE_MS
      && balanceCache.cookie === cookie) return balanceCache.promise;
    const promise = (async () => {
      const workspaceId = await resolveWorkspaceId(cookie);
      const text = await fetchBillingPayload(cookie, workspaceId);
      if (looksSignedOut(text)) throw new Error("signed out");
      const parsed = parseBilling(text);
      if (parsed === null) throw new Error("parse failed");
      return parsed;
    })();
    balanceCache = { at: now, promise, cookie };
    promise.catch(() => { if (balanceCache?.promise === promise) balanceCache = null; });
    return promise;
  };

  const handleBalance = async (_req, res) => {
    let cookie = null;
    try {
      const hit = credentials === undefined ? null : await credentials.resolve("OPENCODE_SESSION_COOKIE");
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
        currency: "USD"
      });
    } catch {
      sendJson(res, 200, { ok: false, error: "cookie invalid or expired" });
    }
  };

  ctx.webServer.register({ kind: "exact", path: "/subscriptions/meridian-quota", handler: handleQuota });
  ctx.webServer.register({ kind: "exact", path: "/subscriptions/meridian-telemetry", handler: handleTelemetry });
  ctx.webServer.register({ kind: "exact", path: "/subscriptions/opencode-balance", handler: handleBalance });
}
