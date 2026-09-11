/**
 * W18 — combined subscription panel, host half.
 *
 * Owns the same-origin proxy routes the browser panel polls:
 *   - GET /subscriptions/meridian-quota      — meridian quota (cached 30s)
 *   - GET /subscriptions/meridian-telemetry  — meridian telemetry (cached 60s)
 *   - GET /subscriptions/meridian-quota-single — single-profile meridian quota (cached 30s)
 *   - GET /subscriptions/meridian-telemetry-requests — recent meridian requests (cached 60s)
 *   - GET /subscriptions/meridian-logs        — recent meridian logs (cached 15s)
 *   - GET /subscriptions/meridian-health      — meridian auth + renewal info (cached 60s)
 *   - GET /subscriptions/opencode-balance    — cookie-based OpenCode GO balance
 *   - GET /subscriptions/opencode-usage      — GO windows via the zen API key
 *   - GET /subscriptions/opencode-zen-balance — OpenCode Zen balance (same
 *     cookie payload as GO; zen has no public billing endpoint)
 *   - GET /subscriptions/deepseek-balance    — DeepSeek platform balance
 *   - GET /subscriptions/zai-quota         — Z.ai Coding Plan quota windows (cached 30s)
 *   - GET /subscriptions/zai-usage         — Z.ai 7-day model usage (cached 60s)
 *   - GET /subscriptions/electronhub-usage — ElectronHub account usage (cached 60s;
 *     the endpoint's own guidance allows usage checks at most once a minute)
 *   - GET /subscriptions/electronhub-models — ElectronHub model list (cached 5min;
 *     the account-scoped list when the key may read it, else the public catalog)
 *   - POST /subscriptions/opencode-cookie/extract — pull the opencode.ai
 *     session cookie out of a local Firefox profile, validate it against the
 *     `_server` RPC, and save it as the OPENCODE_SESSION_COOKIE credential
 *   - POST /subscriptions/opencode-cookie/login — open opencode.ai in the
 *     browser so the user can sign in, then re-run extract
 *
 * The GO usage and DeepSeek balance routes fold in what the removed
 * dsh-opencode-go-usage and ds-api-usage packages owned.
 * GO windows are now fetched via the zen API key at /subscriptions/opencode-usage.
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
import { uncompress } from "snappyjs";
import { sendJson, readBody, isPlainObject } from "../../shared/http";

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
  return (
    lower.includes("/login") ||
    lower.includes("sign in") ||
    lower.includes("/auth/authorize") ||
    lower.includes("sign-in")
  );
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

const ZAI_MONITOR_BASE = "https://api.z.ai";
const ZAI_TIMEOUT_MS = 15_000;

const ELECTRONHUB_API_BASE = "https://api.electronhub.ai/v1";
const ELECTRONHUB_TIMEOUT_MS = 15_000;
/** Upstream rate guidance: usage is checkable at most once per minute. */
const ELECTRONHUB_USAGE_CACHE_MS = 60_000;
/** The model catalog changes slowly, so a five-minute cache is plenty. */
const ELECTRONHUB_MODELS_CACHE_MS = 300_000;
/**
 * Credential names accepted for ElectronHub, in priority order.
 *
 * The panel only ever asked for ELECTRONHUB_API_KEY, but this repo's own
 * ElectronHub model provider (settings.yaml `electronhub.apiKeyEnv`) stores
 * the key as ELECTRONHUB_DEVPASS_API_KEY, and that is the name actually
 * present in the credential store. So a machine with a working ElectronHub
 * key still took the "no credential" branch on every request and the section
 * could never populate. Accept either name instead of asking the owner to
 * store one key under two names.
 */
const ELECTRONHUB_KEY_NAMES = ["ELECTRONHUB_API_KEY", "ELECTRONHUB_DEVPASS_API_KEY"];
/** The affordance text the panel shows when no accepted name is stored. */
const ELECTRONHUB_KEY_MISSING = `${ELECTRONHUB_KEY_NAMES.join(" or ")} credential not configured`;

/** One Z.ai quota window, mapped for the panel's window-meter rows. */
export interface ZaiWindow {
  used: number;
  cap: number;
  percent: number;
  resetsAt: number | null;
}

/**
 * Map quota limits to the fiveHour and weekly windows by `unit` (3 = 5-hour
 * rolling, 6 = weekly), ignoring the `type` string, which varies by plan.
 * First entry per unit wins. In one limit entry, `usage` is the window cap,
 * `currentValue` is the consumed amount, and `percentage` is the percent used.
 */
export function parseZaiQuota(data: unknown): {
  level: string | null;
  fiveHour: ZaiWindow | null;
  weekly: ZaiWindow | null;
} {
  const source: Record<string, unknown> =
    data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const limits = Array.isArray(source.limits) ? source.limits : [];
  const level = typeof source.level === "string" ? source.level : null;
  const toWindow = (entry: Record<string, unknown>): ZaiWindow => {
    const used = Number(entry.currentValue) || 0;
    const cap = Number(entry.usage) || 0;
    const percent =
      typeof entry.percentage === "number" ? entry.percentage : cap > 0 ? (used / cap) * 100 : 0;
    return {
      used,
      cap,
      percent: Math.max(0, Math.min(100, percent)),
      resetsAt: typeof entry.nextResetTime === "number" ? entry.nextResetTime : null,
    };
  };
  let fiveHour: ZaiWindow | null = null;
  let weekly: ZaiWindow | null = null;
  for (const item of limits) {
    if (item === null || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry.unit === 3 && fiveHour === null) fiveHour = toWindow(entry);
    if (entry.unit === 6 && weekly === null) weekly = toWindow(entry);
  }
  return { level, fiveHour, weekly };
}

/** Local "YYYY-MM-DD HH:mm:ss", the timestamp format the monitor API expects. */
function zaiTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day} ${time}`;
}

/** Model-usage data -> totals plus a tolerant per-model summary. */
export function parseZaiUsage(data: unknown): {
  totalCalls: number;
  totalTokens: number;
  modelSummary: { model: string; calls: number; tokens: number }[];
} {
  const source: Record<string, unknown> =
    data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const totals: Record<string, unknown> =
    source.totalUsage !== null && typeof source.totalUsage === "object"
      ? (source.totalUsage as Record<string, unknown>)
      : {};
  const modelSummary: { model: string; calls: number; tokens: number }[] = [];
  const items = Array.isArray(source.modelSummaryList) ? source.modelSummaryList : [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const model =
      typeof entry.modelCode === "string"
        ? entry.modelCode
        : typeof entry.model === "string"
          ? entry.model
          : "?";
    const calls = Number(entry.modelCallCount ?? entry.calls ?? 0) || 0;
    const tokens = Number(entry.modelTokensUsage ?? entry.tokens ?? 0) || 0;
    if (calls === 0 && tokens === 0) continue;
    modelSummary.push({ model, calls, tokens });
  }
  return {
    totalCalls: Number(totals.totalModelCallCount) || 0,
    totalTokens: Number(totals.totalTokensUsage) || 0,
    modelSummary,
  };
}

/** Envelope-aware GET for the Z.ai monitor API. Auth failures answer HTTP 200 with success false. */
async function zaiMonitorGet(path: string, key: string): Promise<unknown> {
  const res = await fetch(`${ZAI_MONITOR_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(ZAI_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`zai monitor HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (
    body === null ||
    typeof body !== "object" ||
    (body as { success?: unknown }).success !== true
  ) {
    const envelope = body as { code?: unknown; msg?: unknown } | null;
    throw new Error(
      `zai monitor error ${
        envelope && typeof envelope.code !== "undefined" ? envelope.code : "?"
      }: ${envelope && typeof envelope.msg === "string" ? envelope.msg : "malformed envelope"}`,
    );
  }
  return (body as { data: unknown }).data;
}

/**
 * ElectronHub (api.electronhub.ai) — account usage and model list.
 * The OpenAPI documents integers, but the panel must survive numbers
 * arriving as strings and partial payloads, so every numeric field goes
 * through ehNumber and every missing field degrades instead of throwing.
 *
 * The pure half of this work — key/account-type detection, the /user/me and
 * /user/models parsers, and the section fold — lives in eh-section-model.ts,
 * dependency-free so the vitest fixtures (#141) can exercise all three
 * account shapes without importing the host. This file owns the probe
 * sequence: key prefix -> GET /user/me -> response shape.
 */
import {
  ELECTRONHUB_DEV_NOTE,
  ehIsDevKey,
  ehNumber,
  parseElectronHubAccountModels,
  parseElectronHubModels,
  parseElectronHubUsage,
} from "./eh-section-model";

// Re-exported for compatibility with the pre-#141 layout (these were local
// exports of this module; the implementations moved to the fold module).
export { parseElectronHubModels, parseElectronHubUsage };

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

  // ── meridian quota (single profile, enriched buckets) ─────────────────
  const quotaSingleOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/v1/usage/quota", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`meridian quota HTTP ${res.status}`);
    return res.json();
  }, 30_000);

  const handleQuotaSingle = async (_req, res) => {
    try {
      sendJson(res, 200, await quotaSingleOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── meridian telemetry: recent requests ───────────────────────────────
  const telemetryRequestsOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/telemetry/requests?limit=20", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`meridian requests HTTP ${res.status}`);
    return res.json();
  }, 60_000);

  const handleTelemetryRequests = async (_req, res) => {
    try {
      sendJson(res, 200, await telemetryRequestsOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── meridian recent logs ──────────────────────────────────────────────
  const meridianLogsOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/telemetry/logs?limit=10", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`meridian logs HTTP ${res.status}`);
    return res.json();
  }, 15_000);

  const handleMeridianLogs = async (_req, res) => {
    try {
      sendJson(res, 200, await meridianLogsOnce());
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── meridian health / auth ────────────────────────────────────────────
  const meridianHealthOnce = cachedOnce(async () => {
    const res = await fetch("http://localhost:9000/health", {
      signal: AbortSignal.timeout(MERIDIAN_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`meridian health HTTP ${res.status}`);
    return res.json();
  }, 60_000);

  const handleMeridianHealth = async (_req, res) => {
    try {
      sendJson(res, 200, await meridianHealthOnce());
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
      const token =
        credentials === undefined
          ? null
          : (await credentials.resolve("DEEPSEEK_PLATFORM_TOKEN"))?.value;
      if (!token) {
        sendJson(res, 200, {
          error: "DEEPSEEK_PLATFORM_TOKEN not configured; sign in to platform.deepseek.com",
        });
        return;
      }
      const raw = await dsUsageAmountOnce(token, month, year);
      // Transform platform.deepseek.com nested shape -> flat array the client expects
      const biz = raw?.data?.biz_data || {};
      const total = Array.isArray(biz.total) ? biz.total : [];
      const transformed = total.map((m) => {
        const usage = Array.isArray(m.usage) ? m.usage : [];
        let input = 0,
          output = 0,
          cacheRead = 0,
          cacheWrite = 0;
        for (const item of usage) {
          const n = Number(item.amount) || 0;
          switch (item.type) {
            case "PROMPT_CACHE_HIT_TOKEN":
              cacheRead += n;
              break;
            case "PROMPT_CACHE_MISS_TOKEN":
              input += n;
              break;
            case "RESPONSE_TOKEN":
              output += n;
              break;
            case "PROMPT_TOKEN":
              // total prompt tokens; don't double-count
              break;
          }
        }
        return {
          model: m.model || "(unknown)",
          input_tokens: input,
          output_tokens: output,
          cache_read_tokens: cacheRead,
          cache_write_tokens: cacheWrite,
        };
      });
      sendJson(res, 200, transformed);
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
      const token =
        credentials === undefined
          ? null
          : (await credentials.resolve("DEEPSEEK_PLATFORM_TOKEN"))?.value;
      if (!token) {
        sendJson(res, 200, {
          error: "DEEPSEEK_PLATFORM_TOKEN not configured; sign in to platform.deepseek.com",
        });
        return;
      }
      const raw = await dsUsageCostOnce(token, month, year);
      // Transform nested cost shape -> flat array with cost per model
      const bizRaw = raw?.data?.biz_data;
      const biz = Array.isArray(bizRaw) ? bizRaw[0] || {} : bizRaw || {};
      const total = Array.isArray(biz.total) ? biz.total : [];
      const transformed = total
        .map((m) => {
          const usage = Array.isArray(m.usage) ? m.usage : [];
          let cost = 0;
          for (const item of usage) {
            if (item.type !== "REQUEST") cost += Number(item.amount) || 0;
          }
          return { model: m.model || "(unknown)", cost };
        })
        .filter((m) => m.cost > 0);
      sendJson(res, 200, transformed);
    } catch (error) {
      sendJson(res, 200, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // ── Z.ai (GLM) quota and usage (monitor API, Bearer ZAI_API_KEY) ────────
  const resolveZaiKey = async () =>
    credentials === undefined ? null : (await credentials.resolve("ZAI_API_KEY"))?.value;

  const zaiQuotaOnce = cachedOnce(
    async (key) => parseZaiQuota(await zaiMonitorGet("/api/monitor/usage/quota/limit", key)),
    30_000,
  );

  const zaiUsageOnce = cachedOnce(async (key) => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
    const query = `startTime=${encodeURIComponent(
      zaiTimestamp(start),
    )}&endTime=${encodeURIComponent(zaiTimestamp(end))}`;
    return parseZaiUsage(await zaiMonitorGet(`/api/monitor/usage/model-usage?${query}`, key));
  }, 60_000);

  const handleZaiQuota = async (_req, res) => {
    try {
      const key = await resolveZaiKey();
      if (!key) {
        sendJson(res, 200, { ok: false, error: "ZAI_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...(await zaiQuotaOnce(key)) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleZaiUsage = async (_req, res) => {
    try {
      const key = await resolveZaiKey();
      if (!key) {
        sendJson(res, 200, { ok: false, error: "ZAI_API_KEY credential not configured" });
        return;
      }
      sendJson(res, 200, { ok: true, ...(await zaiUsageOnce(key)) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // ── ElectronHub usage + models (api.electronhub.ai, Bearer key) ───────────
  const resolveElectronHubKey = async () => {
    if (credentials === undefined) return null;
    for (const name of ELECTRONHUB_KEY_NAMES) {
      try {
        const value = (await credentials.resolve(name))?.value;
        if (typeof value === "string" && value !== "") return value;
      } catch (error) {
        // An unknown name must not abort the search: try the next one. But
        // credentials.resolve returns undefined for an unknown name rather
        // than throwing, so anything landing here is a GENUINE provider
        // failure (locked store, decrypt error) that this loop would otherwise
        // swallow into an indistinguishable "no key found".
        ctx.logger.warn(
          `electronhub credential "${name}" failed to resolve: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return null;
  };

  /** GET one ElectronHub path with the account key. */
  const electronhubGet = (path, key) =>
    fetch(`${ELECTRONHUB_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(ELECTRONHUB_TIMEOUT_MS),
    });

  const electronhubUsageOnce = cachedOnce(async (key) => {
    // Probe step 1 (#141): the key PREFIX decides before any request. A dev
    // key (ek-dev-…) answers 401 on /user/me and /user/models BY DESIGN — it
    // only works for inference — so it must never reach the endpoints and
    // must never read as an invalid key (#74's surfacing kept honest). This
    // branch answers from the prefix alone; the fold renders its note.
    if (ehIsDevKey(key)) {
      return { ...parseElectronHubUsage(null), devKey: true, note: ELECTRONHUB_DEV_NOTE };
    }
    const res = await electronhubGet("/user/me", key);
    // 403 is a CAPABILITY limit: the key is accepted, this surface is not in
    // its class. Empty payload plus a note; the section still shows its models.
    if (res.status === 403) {
      return {
        ...parseElectronHubUsage(null),
        note: "account usage is not available for this API key (HTTP 403)",
      };
    }
    // 401 is AMBIGUOUS and must not be reported as either healthy or broken.
    //
    // The #68 review asked for 401 to become a hard error ("bad key") while 403
    // stayed a note. That split is not implementable here, and probing decided
    // it (live, 2026-09-08):
    //   Bearer <garbage>  -> /v1/user/me  401
    //   no Authorization  -> /v1/user/me  401
    //   the stored DevPass key (valid for inference) -> /v1/user/me  401
    //   no Authorization  -> /v1/models   200
    // An invalid key, a missing key and a working-but-capability-limited key
    // are INDISTINGUISHABLE at this endpoint, and /v1/models is a public
    // catalog that validates nothing. Throwing would paint a red error over a
    // key that works fine for inference; staying silent is what made an
    // invalid key look healthy in the first place.
    //
    // So: say exactly what is known. The note names the ambiguity, and
    // `unverified` marks the payload so the client can stop the model list
    // from reading as proof the key works.
    if (res.status === 401) {
      return {
        ...parseElectronHubUsage(null),
        unverified: true,
        note:
          "this API key could not be verified (HTTP 401 on /user/me) — it may be " +
          "capability-limited or invalid; any model list below is the PUBLIC catalog, " +
          "which answers without a key",
      };
    }
    if (!res.ok) throw new Error(`electronhub usage HTTP ${res.status}`);
    return parseElectronHubUsage(await res.json());
  }, ELECTRONHUB_USAGE_CACHE_MS);

  const electronhubModelsOnce = cachedOnce(async (key) => {
    // /v1/user/models is the account-scoped list and rejects key classes that
    // still work for inference; /v1/models is the public catalog and answers
    // for any valid key. Fall back to it so the section shows a real model
    // list instead of nothing.
    if (ehIsDevKey(key)) {
      // Probe step 1 applies to THIS fetch too (#141 review): a dev key must
      // never reach /user/models — it 401s there BY DESIGN, and a swallowed
      // 401 is still the dev credential hitting an endpoint that rejects it.
      // The public catalog answers WITHOUT any key (verified live during
      // #74), so fetch it keyless: no Authorization header, no dev
      // credential on the wire. Account usage is unreachable for a dev key
      // by definition, so this branch is catalog-only.
      const res = await fetch(`${ELECTRONHUB_API_BASE}/models`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(ELECTRONHUB_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(
          `electronhub models unavailable: public catalog HTTP ${res.status} ` +
            "(dev key cannot request account usage)",
        );
      }
      return { models: parseElectronHubModels(await res.json()), source: "catalog" };
    }
    const attempt = async (path) => {
      const res = await electronhubGet(path, key);
      if (!res.ok) return { ok: false, status: res.status, models: [], body: null };
      const body = await res.json();
      return {
        ok: true,
        status: res.status,
        models: parseElectronHubModels(body),
        body,
      };
    };
    const scoped = await attempt("/user/models");
    // #141: the account shape — { models: { id: {...} } } — yields no NAMES
    // through parseElectronHubModels (its models field is an object, not an
    // array), so the account usage parser decides the account branch too.
    const scopedAccount = scoped.ok === true ? parseElectronHubAccountModels(scoped.body) : null;
    if (scoped.ok === true && (scoped.models.length > 0 || scopedAccount !== null)) {
      const names =
        scoped.models.length > 0 ? scoped.models : scopedAccount.entries.map((entry) => entry.id);
      const result = { models: names, source: "account" };
      if (scopedAccount !== null) {
        return {
          ...result,
          accountUsage: scopedAccount.entries,
          totalConsumption: scopedAccount.totalConsumption,
          lastUpdated: scopedAccount.lastUpdated,
        };
      }
      return result;
    }
    const catalog = await attempt("/models");
    if (catalog.ok === true) return { models: catalog.models, source: "catalog" };
    if (scoped.ok === true) return { models: scoped.models, source: "account" };
    // Both paths failed: report BOTH statuses. Reporting only the catalog's
    // discards the scoped attempt entirely, and the pair is what distinguishes
    // "key rejected everywhere" (401/401) from "endpoint down" (5xx).
    throw new Error(
      `electronhub models unavailable: /user/models HTTP ${scoped.status}, /models HTTP ${catalog.status}`,
    );
  }, ELECTRONHUB_MODELS_CACHE_MS);

  const handleElectronhubUsage = async (_req, res) => {
    try {
      const key = await resolveElectronHubKey();
      if (!key) {
        sendJson(res, 200, { ok: false, error: ELECTRONHUB_KEY_MISSING });
        return;
      }
      sendJson(res, 200, { ok: true, ...(await electronhubUsageOnce(key)) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleElectronhubModels = async (_req, res) => {
    try {
      const key = await resolveElectronHubKey();
      if (!key) {
        sendJson(res, 200, { ok: false, error: ELECTRONHUB_KEY_MISSING });
        return;
      }
      sendJson(res, 200, { ok: true, ...(await electronhubModelsOnce(key)) });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Firefox platform.deepseek.com localStorage userToken extraction ──────────
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
  const firefoxDeepSeekProfileDirs = firefoxProfileDirs;

  async function sqliteSnapshotAndQuery(dbPath, sql, timeoutMs = 10_000) {
    const scratch = mkdtempSync(join(tmpdir(), "ff-sqlite-"));
    const dest = join(scratch, "data.sqlite");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {}
    };
    try {
      execFileSync("sqlite3", [`file:${dbPath}?mode=ro&immutable=1`, ".backup " + dest], {
        timeout: 15_000,
        killSignal: "SIGKILL",
      });
    } catch {
      cleanup();
      return null;
    }
    return new Promise((resolve) => {
      execFile(
        "sqlite3",
        ["-readonly", "-noheader", dest, sql],
        { timeout: timeoutMs },
        (error, stdout) => {
          try {
            if (error) return resolve(null);
            const raw = String(stdout).trim();
            if (!raw) return resolve(null);
            resolve(raw);
          } finally {
            cleanup();
          }
        },
      );
    });
  }

  // Read Firefox Storage v2 (ls/data.sqlite) for platform.deepseek.com userToken
  // Firefox localStorage compression is 0 = raw or 1 = SNAPPY (snappyjs).
  const readDeepSeekToken = async (profileDir) => {
    const storeDir = join(profileDir, "storage", "default", "https+++platform.deepseek.com", "ls");
    const dbPath = join(storeDir, "data.sqlite");
    if (!existsSync(dbPath)) return null;
    const sql = "SELECT hex(value), compression_type FROM data WHERE key = 'userToken' LIMIT 1";
    const raw = await sqliteSnapshotAndQuery(dbPath, sql);
    if (raw === null) return null;
    const [hex, compressionType] = String(raw).split("|");
    if (compressionType !== "0" && compressionType !== "1") return null;
    let token;
    try {
      token =
        compressionType === "1"
          ? uncompress(Buffer.from(hex, "hex")).toString("utf8")
          : Buffer.from(hex, "hex").toString("utf8");
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(token);
      if (parsed !== null && typeof parsed === "object" && typeof parsed.value === "string")
        token = parsed.value;
    } catch {}
    return token;
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
      ctx.logger.info("wrote DEEPSEEK_PLATFORM_TOKEN credential");
      sendJson(res, 200, { ok: true, saved: true });
    } catch (error) {
      ctx.logger.warn("failed to write DEEPSEEK_PLATFORM_TOKEN credential");
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

  // Firefox keeps the cookie DB in WAL mode. Copy sqlite + wal + shm to a
  // scratch dir so the read never contends with the live writer, then query
  // the copies read-only. Returns the opencode.ai cookie header string.
  const readCookieString = async (dbDir) => {
    const src = join(dbDir, "cookies.sqlite");
    if (!existsSync(src)) return null;
    const sql =
      "SELECT name || char(9) || value FROM moz_cookies WHERE (host = 'opencode.ai' OR host LIKE '%.opencode.ai') AND name = 'auth'";
    const raw = await sqliteSnapshotAndQuery(src, sql);
    if (raw === null) return null;
    const parts = String(raw)
      .split("\n")
      .map((line) => {
        const tab = String(line).indexOf("\t");
        return tab === -1 ? null : String(line).slice(0, tab) + "=" + String(line).slice(tab + 1);
      })
      .filter((part) => part !== null && String(part).includes("="));
    return parts.length > 0 ? parts.join("; ") : null;
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
      ctx.logger.info("wrote OPENCODE_SESSION_COOKIE credential");
      sendJson(res, 200, { ok: true, saved: true });
    } catch (error) {
      ctx.logger.warn("failed to write OPENCODE_SESSION_COOKIE credential");
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
    path: "/subscriptions/meridian-quota-single",
    handler: handleQuotaSingle,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-telemetry-requests",
    handler: handleTelemetryRequests,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-logs",
    handler: handleMeridianLogs,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/meridian-health",
    handler: handleMeridianHealth,
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
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/zai-quota",
    handler: handleZaiQuota,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/zai-usage",
    handler: handleZaiUsage,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/electronhub-usage",
    handler: handleElectronhubUsage,
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/subscriptions/electronhub-models",
    handler: handleElectronhubModels,
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
        body = await readBody(req as import("node:http").IncomingMessage);
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
