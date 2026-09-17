// Zomato order history for split-utils.
// Plain Deno fetch plus WebCrypto only.
// Protocol facts come from research/zomato/REPORT.md.
// Auth steps follow public notes and are not run here.
// Bill paths stay open until one live capture pins them.

import { formatISTDate, type Order } from "./common.ts";
import { legacyZomatoConfigPath, shareDir, zomatoConfigPath } from "./paths.ts";

export const BASE = "https://api.zomato.com";
export const ACCOUNTS = "https://accounts.zomato.com";

// Static app constants from the app binary and public notes.
// These stay empty in source. The dev constants wizard writes live
// values to state/share/config/zomato.json and that file provides them,
// so an app update never needs a source change.
export const DEFAULT_API_KEY = "";
export const DEFAULT_CLIENT_ID = "";
export const DEFAULT_APP_VERSION = "986";
export const DEFAULT_APP_VERSION_CODE = "1710019860";

export interface ZomatoConfig {
  apiKey: string;
  clientId: string;
  appVersion: string;
  appVersionCode: string;
}

let cachedConfig: ZomatoConfig | null = null;

// Read one JSON file and return an empty record on any failure.
function readJsonFile(path: string): Partial<ZomatoConfig> {
  try {
    return JSON.parse(Deno.readTextFileSync(path)) as Partial<ZomatoConfig>;
  } catch {
    // Missing or invalid file: defaults apply.
    return {};
  }
}

// Read the config file once per process. Bad or partial files fall back
// to the defaults field by field. Missing keys fail loudly.
export function loadConfig(): ZomatoConfig {
  if (cachedConfig) return cachedConfig;
  // Read the old path first. Let the new path win.
  const file: Partial<ZomatoConfig> = {
    ...readJsonFile(legacyZomatoConfigPath()),
    ...readJsonFile(zomatoConfigPath()),
  };
  const apiKey = typeof file.apiKey === "string" && file.apiKey ? file.apiKey : DEFAULT_API_KEY;
  const clientId = typeof file.clientId === "string" && file.clientId
    ? file.clientId
    : DEFAULT_CLIENT_ID;
  // Fail with setup help when live keys miss.
  if (!apiKey || !clientId) {
    throw new Error(
      "Zomato api key or client id is missing. Run the constants wizard first (dev tool) or place the config file by hand at state/share/config/zomato.json.",
    );
  }
  cachedConfig = {
    apiKey,
    clientId,
    appVersion: typeof file.appVersion === "string" && file.appVersion
      ? file.appVersion
      : DEFAULT_APP_VERSION,
    appVersionCode: typeof file.appVersionCode === "string" && file.appVersionCode
      ? file.appVersionCode
      : DEFAULT_APP_VERSION_CODE,
  };
  return cachedConfig;
}

// Token store for the headless login flow. It lives under share, and
// the active state root alone decides where that is. Two hardcoded repo
// paths used to stand behind this as read fallbacks. They ignored
// SPLIT_UTILS_STATE, so a test with its own state root still read the
// developer's live tokens, and the suite passed or failed depending on
// whether anyone had signed in to Zomato.
export function tokensPath(): string {
  return shareDir() + "/zomato-tokens.json";
}

// True when the stored pair holds both tokens. The step builders need a
// sync answer, so this reads the same one path without awaiting.
export function hasTokensSync(): boolean {
  try {
    const data = JSON.parse(Deno.readTextFileSync(tokensPath())) as Partial<ZomatoTokens>;
    return Boolean(data.access_token && data.refresh_token);
  } catch {
    return false;
  }
}

export interface ZomatoTokens {
  access_token: string;
  refresh_token: string;
  obtained_at: string; // ISO string
}

// Read stored tokens from the active state root. Return null when the
// file misses or parses badly.
export async function loadTokens(): Promise<ZomatoTokens | null> {
  try {
    const raw = await Deno.readTextFile(tokensPath());
    const data = JSON.parse(raw) as ZomatoTokens;
    if (!data.access_token || !data.refresh_token) return null;
    return data;
  } catch {
    return null;
  }
}

// Save a token pair with a fresh timestamp.
export async function saveTokens(
  access_token: string,
  refresh_token: string,
): Promise<ZomatoTokens> {
  const tokens: ZomatoTokens = {
    access_token,
    refresh_token,
    obtained_at: new Date().toISOString(),
  };
  // Make the share dir before the write.
  const path = tokensPath();
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  // Write owner only so secrets stay private.
  await Deno.writeTextFile(path, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  // Fix the mode again for existing files.
  try {
    await Deno.chmod(path, 0o600);
  } catch {
    // Ignore chmod errors on non posix disks.
  }
  return tokens;
}

// Base headers for every Zomato call.
// The key and client id are static strings from the app.
// No per request signature header is needed.
export function baseHeaders(token?: string): Record<string, string> {
  const cfg = loadConfig();
  const h: Record<string, string> = {
    "Accept": "application/json",
    "X-Zomato-API-Key": cfg.apiKey,
    "X-Zomato-Client-Id": cfg.clientId,
    "X-Zomato-App-Version": cfg.appVersion,
    "X-Zomato-App-Version-Code": cfg.appVersionCode,
    "User-Agent": "okhttp/4.12.0",
  };
  if (token) h["X-Zomato-Access-Token"] = token;
  return h;
}

// NOTE: the login steps live further down in this file. The OTP
// endpoints reject cold calls; see the login-flow comment there.

// Build a PKCE pair for the OAuth2 step.
// The verifier holds 64 chars from the unreserved set.
// The challenge is base64url of SHA256 of the verifier with no padding.
export async function buildPkce(): Promise<{ verifier: string; challenge: string }> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const rand = crypto.getRandomValues(new Uint8Array(64));
  let verifier = "";
  for (const b of rand) verifier += chars[b % chars.length];
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const challenge = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// Login flow (verified against jomato + live 400 debugging, 2026-09-09).
//
// The OTP endpoint REJECTS cold calls with 400 "Something went wrong".
// The full app sequence is:
//   1. GET /oauth2/auth with PKCE -> redirects to a login page whose
//      URL carries ?login_challenge=<lc>. Cookies zxcv (verifier), cid,
//      rurl must be set first.
//   2. POST /login/phone type=initiate with lc + number -> OTP sent.
//   3. POST /login/phone type=verify with lc + otp -> redirect_to
//      consent URL.
//   4. GET consent URL -> ?consent_challenge=
//   5. POST /consent cc=<challenge> -> redirect_to callback with ?code=
//   6. GET callback URL -> code lands in the final URL
//   7. POST /token grant_type=authorization_code with code_verifier
//
// The login STATE (verifier, cookies, lc) bridges the two CLI commands
// through a state file next to the tokens.
// ---------------------------------------------------------------------------

const hex = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const uuid = () => crypto.randomUUID();

/** Fresh per-device identity — a new install of the app sends new values.
 * Never replay another client's captured device headers. */
function deviceHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return {
    "Accept": "image/webp",
    "Connection": "Keep-Alive",
    "User-Agent":
      "&source=android_market&version=10&device_manufacturer=Google&device_brand=google&device_model=Android+SDK+built+for+x86_64&api_version=931&app_version=v19.3.1",
    "USER-BUCKET": "0",
    "USER-HIGH-PRIORITY": "0",
    "X-Access-UUID": uuid(),
    "X-Accessibility-Dynamic-Text-Scale-Factor": "1.0",
    "X-Accessibility-Voice-Over-Enabled": "0",
    "X-Android-Id": hex(8),
    "X-APP-APPEARANCE": "LIGHT",
    "X-App-Language": "&lang=en&android_language=en&android_country=",
    "X-App-Session-Id": uuid(),
    "X-APP-THEME": "default",
    "X-BLINKIT-INSTALLED": "false",
    "X-Bluetooth-On": "false",
    "X-City-Id": "-1",
    "X-Client-Id": "zomato_android_v2",
    "X-Device-Height": "2208",
    "X-Device-Language": "en",
    "X-Device-Pixel-Ratio": "2.75",
    "X-Device-Width": "1080",
    "X-DISTRICT-INSTALLED": "false",
    "X-Network-Type": "mobile_UNKNOWN",
    "X-O2-City-Id": "-1",
    "x-perf-class": "PERFORMANCE_AVERAGE",
    "X-Present-Horizontal-Accuracy": "-1",
    "X-Present-Lat": "0.0",
    "X-Present-Long": "0.0",
    "X-Request-Id": uuid(),
    "X-RIDER-INSTALLED": "false",
    "X-SYSTEM-APPEARANCE": "UNSPECIFIED",
    "X-User-Defined-Lat": "0.0",
    "X-User-Defined-Long": "0.0",
    "X-VPN-Active": "1",
    "X-Zomato-API-Key": cfg.apiKey,
    "X-Zomato-App-Version": cfg.appVersion,
    "X-Zomato-App-Version-Code": cfg.appVersionCode,
    "X-Zomato-Client-Id": cfg.clientId,
    "X-Zomato-UUID": uuid(),
  };
}

export interface LoginState {
  verifier: string;
  lc: string;
  cookies: Record<string, string>;
  /** One device identity per login attempt; the server rejects a
   * rotating identity across the chain (learned via /token 500). */
  device: Record<string, string>;
}

const LOGIN_STATE_FILE = decodeURIComponent(
  new URL("../state/share/zomato-login-state.json", import.meta.url).pathname,
);
const LEGACY_LOGIN_STATE_FILE = decodeURIComponent(
  new URL("../state/zomato-login-state.json", import.meta.url).pathname,
);

// Resolve the login state path under the active state root.
function loginStatePath(): string {
  return shareDir() + "/zomato-login-state.json";
}

async function saveLoginState(state: LoginState): Promise<void> {
  // Make the share dir before the write.
  const path = loginStatePath();
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  // Write owner only so the cookie jar stays private.
  await Deno.writeTextFile(path, JSON.stringify(state, null, 2), { mode: 0o600 });
  // Lock overwrites too: the mode option only applies to new files.
  await Deno.chmod(path, 0o600);
}

export async function loadLoginState(): Promise<LoginState | null> {
  // Try the share path first, then the old path.
  for (const path of [loginStatePath(), LOGIN_STATE_FILE, LEGACY_LOGIN_STATE_FILE]) {
    try {
      return JSON.parse(await Deno.readTextFile(path)) as LoginState;
    } catch {
      // Try the next path.
    }
  }
  return null;
}

const cookieHeader = (cookies: Record<string, string>) =>
  Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");

/** Merge every Set-Cookie of a response into the jar (mutates). */
function absorbCookies(res: Response, cookies: Record<string, string>): void {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}

/** Step 1: authorize URL with PKCE cookies -> login_challenge. */
export async function fetchLoginChallenge(): Promise<LoginState> {
  const { verifier, challenge } = await buildPkce();
  const state = Math.random().toString(36).slice(2, 12).toUpperCase() +
    Date.now().toString(36).toUpperCase();
  const cookies: Record<string, string> = {
    zxcv: verifier,
    cid: loadConfig().clientId,
    rurl: "https://accounts.zomato.com/zoauth/callback",
  };
  const params = new URLSearchParams({
    approval_prompt: "auto",
    scope: "offline openid",
    response_type: "code",
    code_challenge_method: "S256",
    redirect_uri: "https://accounts.zomato.com/zoauth/callback",
    state,
    client_id: loadConfig().clientId,
    code_challenge: challenge,
  });
  // Follow hops manually, absorbing every Set-Cookie. The session CSRF
  // binding comes from THESE cookies — losing them makes the later
  // consent step fail with "No CSRF value available in the session".
  const device = deviceHeaders(); // fixed identity for the whole flow
  let current = `${ACCOUNTS}/oauth2/auth?${params}`;
  let lc = "";
  for (let i = 0; i < 6 && !lc; i++) {
    const hop = await fetch(current, {
      headers: { ...device, Cookie: cookieHeader(cookies) },
      redirect: "manual",
    });
    absorbCookies(hop, cookies);
    const loc = hop.headers.get("location");
    if (!loc) break;
    lc = loc.match(/[?&]login_challenge=([a-f0-9]+)/)?.[1] ?? "";
    current = new URL(loc, current).href;
  }
  if (!lc) {
    throw new Error(`no login_challenge (last ${current.slice(0, 150)})`);
  }
  const loginState: LoginState = { verifier, lc, cookies, device };
  await saveLoginState(loginState);
  return loginState;
}

/** Step 2: send OTP. Requires the login state from step 1. */
export async function sendOtp(
  phone: string,
  state: LoginState,
  pref = "sms",
): Promise<Response> {
  const body = new URLSearchParams({
    number: phone,
    country_id: "1",
    lc: state.lc,
    type: "initiate",
    verification_type: pref,
    package_name: "com.application.zomato",
    message_uuid: "",
  });
  return await fetch(`${ACCOUNTS}/login/phone`, {
    method: "POST",
    headers: {
      ...state.device,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(state.cookies),
    },
    body,
  });
}

/** Step 3: verify OTP -> consent redirect. */
export async function verifyOtp(
  phone: string,
  otp: string,
  state: LoginState,
): Promise<{ consentUrl: string }> {
  const body = new URLSearchParams({
    number: phone,
    otp,
    country_id: "1",
    lc: state.lc,
    type: "verify",
    trust_this_device: "true",
    device_token: "",
  });
  const res = await fetch(`${ACCOUNTS}/login/phone`, {
    method: "POST",
    headers: {
      ...state.device,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(state.cookies),
    },
    body,
  });
  absorbCookies(res, state.cookies);
  const json = await res.json().catch(() => null) as
    | { status?: boolean; redirect_to?: string }
    | null;
  if (!res.ok || !json?.status || !json.redirect_to) {
    throw new Error(
      `otp verify failed (status ${res.status} body ${JSON.stringify(json)?.slice(0, 200)})`,
    );
  }
  await saveLoginState(state); // persist session cookies for the next step
  return { consentUrl: json.redirect_to };
}

/** Steps 4-6: consent hop + callback -> authorization code. */
export async function completeConsent(
  consentUrl: string,
  state: LoginState,
): Promise<{ code: string; state: string; scope: string }> {
  const headers = () => ({ ...state.device, Cookie: cookieHeader(state.cookies) });
  // Follow manual hops (absorbing cookies) until a URL carries the
  // consent_challenge. The first hop is often another 302.
  let current = consentUrl;
  let cc = current.match(/[?&]consent_challenge=([a-f0-9]+)/)?.[1] ?? "";
  for (let i = 0; i < 6 && !cc; i++) {
    const hop = await fetch(current, { headers: headers(), redirect: "manual" });
    absorbCookies(hop, state.cookies);
    const loc = hop.headers.get("location");
    if (!loc) break;
    cc = loc.match(/[?&]consent_challenge=([a-f0-9]+)/)?.[1] ?? "";
    current = new URL(loc, current).href;
  }
  if (!cc) throw new Error(`no consent_challenge (last ${current.slice(0, 150)})`);
  await saveLoginState(state);
  const consentRes = await fetch(`${ACCOUNTS}/consent`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ cc }),
  });
  absorbCookies(consentRes, state.cookies);
  const consentJson = await consentRes.json().catch(() => null) as {
    status?: boolean;
    redirect_to?: string;
  } | null;
  if (!consentJson?.status || !consentJson.redirect_to) {
    throw new Error(
      `consent failed (status ${consentRes.status} body ${
        JSON.stringify(consentJson)?.slice(0, 200)
      })`,
    );
  }
  let finalUrl = consentJson.redirect_to;
  // follow manual hops to the callback with ?code= (absorb cookies)
  for (let i = 0; i < 6 && !finalUrl.match(/[?&]code=/); i++) {
    const hop = await fetch(finalUrl, { headers: headers(), redirect: "manual" });
    absorbCookies(hop, state.cookies);
    const loc = hop.headers.get("location");
    if (!loc) break;
    finalUrl = new URL(loc, finalUrl).href;
  }
  const code = finalUrl.match(/[?&]code=([^&]+)/)?.[1];
  if (!code) throw new Error(`no authorization code (final ${finalUrl.slice(0, 150)})`);
  return {
    code: decodeURIComponent(code),
    state: finalUrl.match(/[?&]state=([^&]+)/)?.[1] ?? "",
    scope: finalUrl.match(/[?&]scope=([^&]+)/)?.[1] ?? "offline openid",
  };
}

/** Step 7: trade the code for tokens. */
export async function exchangeCode(
  grant: { code: string; state: string; scope: string },
  loginState: LoginState,
): Promise<{ access_token: string; refresh_token: string }> {
  const { verifier, device, cookies } = loginState;
  // The callback echoes state and scope; the token endpoint validates
  // both against the original authorize request.
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: grant.code,
    state: grant.state,
    scope: grant.scope,
    code_verifier: verifier,
    client_id: loadConfig().clientId,
    redirect_uri: "https://accounts.zomato.com/zoauth/callback",
  });
  const res = await fetch(`${ACCOUNTS}/token`, {
    method: "POST",
    headers: {
      ...device,
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader(cookies),
    },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `token exchange failed (status ${res.status} body ${(await res.text()).slice(0, 300)} ` +
        `code=${grant.code.slice(0, 10)}… state=${grant.state.slice(0, 12)} scope=${grant.scope})`,
    );
  }
  const json = await res.json() as {
    status: boolean;
    token: { access_token: string; refresh_token?: string };
  };
  if (!json.status || !json.token?.access_token) {
    throw new Error(`token exchange rejected: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { access_token: json.token.access_token, refresh_token: json.token.refresh_token ?? "" };
}

// Mint a fresh pair from a refresh token.
// The new pair is saved at once.
export async function refreshTokens(
  refresh_token: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: loadConfig().clientId,
  });
  const res = await fetch(`${ACCOUNTS}/token`, {
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `token refresh failed (status ${res.status} body ${(await res.text()).slice(0, 300)})`,
    );
  }
  const json = (await res.json()) as Record<string, string>;
  await saveTokens(json["access_token"], json["refresh_token"]);
  return { access_token: json["access_token"], refresh_token: json["refresh_token"] };
}

// Fetch with a token and retry once after refresh on 401.
// Refresh uses the stored refresh token.
export async function authorizedFetch(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const extra = (init.headers ?? {}) as Record<string, string>;
  const first = await fetch(url, { ...init, headers: { ...baseHeaders(token), ...extra } });
  if (first.status !== 401) return first;
  const stored = await loadTokens();
  if (!stored?.refresh_token) return first;
  const pair = await refreshTokens(stored.refresh_token);
  return await fetch(url, { ...init, headers: { ...baseHeaders(pair.access_token), ...extra } });
}

// One order card from the history list.
// Date keeps raw text until parseZomatoDate runs.
// Items hold names and counts only. Prices come from detail.
export interface HistorySkeleton {
  orderId: string;
  restaurant: string;
  locality: string;
  status: string;
  date: string; // raw text like "30 Apr 2024 at 9:11PM"
  paid: number; // rupees from bottom_container subtitle1
  items: { name: string; quantity: number }[];
}

// Strip Zomato markup wraps like "<medium-400|{grey-900|Name}>".
export function cleanText(raw: string): string {
  return raw
    .replace(/<[\w-]+?\|/g, "")
    .replace(/\{[\w-]+?\|/g, "")
    .replace(/[<>{}]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Split "1 x Peri Peri Chicken Wrap" to count plus name.
// Plain names fall back to count 1.
export function parseItemTitle(raw: string): { name: string; quantity: number } {
  const t = cleanText(raw);
  const m = t.match(/^(\d+)\s*x\s+(.+)$/i);
  if (m) return { quantity: parseInt(m[1], 10), name: m[2].trim() };
  return { quantity: 1, name: t };
}

// Parse one history page to order cards plus a page cursor.
// Cards without the type 2 snippet are skipped.
// Paging feeds postback back to the next call.
export function parseHistoryPage(
  json: unknown,
): { orders: HistorySkeleton[]; hasMore: boolean; postback: string } {
  const root = json as Record<string, unknown>;
  const results = (root["results"] as unknown[]) ?? [];
  const orders: HistorySkeleton[] = [];
  for (const r of results) {
    const rec = r as Record<string, unknown>;
    const snip = rec["order_history_snippet_type_2"] as Record<string, unknown> | undefined;
    if (!snip) continue;
    const top = (snip["top_container"] as Record<string, unknown>) ?? {};
    const bottom = (snip["bottom_container"] as Record<string, unknown>) ?? {};
    const title = cleanText((top["title"] as Record<string, string>)?.["text"] ?? "");
    const locality = cleanText((top["subtitle1"] as Record<string, string>)?.["text"] ?? "");
    const tag = snip["tag"] as Record<string, unknown> | undefined;
    const status = (tag?.["title"] as Record<string, string>)?.["text"] ?? "";
    const clickUrl =
      ((snip["click_action"] as Record<string, unknown>)?.["deeplink"] as Record<string, string>)
        ?.["url"] ?? "";
    const orderId = clickUrl.match(/order_id=(\d+)/)?.[1] ?? "";
    const items = ((snip["items"] as unknown[]) ?? []).map((it) =>
      parseItemTitle(
        ((it as Record<string, unknown>)["title"] as Record<string, string>)?.["text"] ?? "",
      )
    );
    const date = (bottom["title"] as Record<string, string>)?.["text"] ?? "";
    const paidRaw = cleanText((bottom["subtitle1"] as Record<string, string>)?.["text"] ?? "0");
    const paid = parseFloat(paidRaw.replace(/[₹,\s]/g, "")) || 0;
    // Failed payments carry the marker in bottom_container.subtitle2.
    const failed = /payment failed|cancelled/i.test(
      (bottom["subtitle2"] as Record<string, string>)?.["text"] ?? "",
    );
    if (failed) continue;
    orders.push({ orderId, restaurant: title, locality, status, date, paid, items });
  }
  return {
    orders,
    hasMore: (root["has_more"] as boolean) ?? false,
    postback: (root["postback_params"] as string) ?? "",
  };
}

// One saved delivery location for the history gateway.
// The gatherer wizard asks the user once and stores the answer.
export interface ZomatoLocation {
  city: string;
  lat: string;
  long: string;
  cityId: string;
}

// Prototype area in Bengaluru. Used when no saved location exists.
export const DEFAULT_LOCATION: ZomatoLocation = {
  city: "Bengaluru",
  lat: "12.9341967",
  long: "77.7241821",
  cityId: "4",
};

// Location headers the history gateway requires: without them the call
// 500s (verified live 2026-09-09). The wizard passes the saved answer.
// Defaults keep the old prototype values for direct callers.
export function locationHeaders(loc: ZomatoLocation = DEFAULT_LOCATION): Record<string, string> {
  return {
    "X-Present-Lat": loc.lat,
    "X-Present-Long": loc.long,
    "X-User-Defined-Lat": loc.lat,
    "X-User-Defined-Long": loc.long,
    "X-City-Id": loc.cityId,
    "X-O2-City-Id": loc.cityId,
  };
}

// Fetch one raw history page.
// Pass the last postback to page forward (POST body, location headers).
export async function fetchHistoryPage(
  token: string,
  postback?: string,
  loc: ZomatoLocation = DEFAULT_LOCATION,
): Promise<unknown> {
  const body: Record<string, string> = {};
  if (postback) body["postback_params"] = postback;
  const res = await fetch(`${BASE}/gw/order/history/online_order`, {
    method: "POST",
    headers: {
      ...baseHeaders(token),
      ...locationHeaders(loc),
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`history failed (status ${res.status})`);
  return await res.json();
}

// Fetch one order summary. GET order_summary with lang; the reply is a
// crystal-snippet list (verified live 2026-09-09, order 8470552516).
export async function fetchOrderDetail(token: string, orderId: string): Promise<unknown> {
  const res = await fetch(`${BASE}/gw/order/order_summary?order_id=${orderId}&lang=en`, {
    headers: { ...baseHeaders(token), "Accept": "image/webp" },
  });
  if (!res.ok) throw new Error(`order_summary failed (status ${res.status})`);
  return await res.json();
}

// Parse Zomato date text to an ISO UTC string.
// Input looks like "30 Apr 2024 at 9:11PM".
// The wall time counts as India time.
// A missing year falls back to the current year.
export function parseZomatoDate(raw: string): string {
  // Live shape: "Order placed on 14 Aug, 3:23PM" (no year, comma, prefix).
  const m = raw.trim().match(
    /^(?:order placed on\s+)?(\d{1,2})\s+([A-Za-z]{3}),?\s*(?:(\d{4})\s+)?(?:at\s+)?(\d{1,2}):(\d{2})\s*([AP]M)$/i,
  );
  if (!m) throw new Error(`bad Zomato date (${raw})`);
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = months[m[2].toLowerCase()];
  if (month === undefined) throw new Error(`bad Zomato month (${raw})`);
  const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  let hour = parseInt(m[4], 10) % 12;
  if (m[6].toUpperCase() === "PM") hour += 12;
  const utcMs = Date.UTC(year, month, parseInt(m[1], 10), hour, parseInt(m[5], 10)) -
    5.5 * 3600_000;
  return new Date(utcMs).toISOString();
}

// Map one history card to the shared order shape.
// Item prices stay 0 here.
// Real prices come from the detail call later.
export function mapHistoryOrder(skeleton: HistorySkeleton): Order {
  return {
    id: `zomato-${skeleton.orderId}`,
    platform: "zomato",
    date: formatISTDate(parseZomatoDate(skeleton.date)),
    paid: skeleton.paid,
    items: skeleton.items.map((it) => ({ name: it.name, price: 0, quantity: it.quantity })),
    fees: { delivery: 0, packaging: 0 },
  };
}

// Bill lines from an order_summary reply (verified on 8470552516).
// Items: crystal_snippet_type_5 (identifier ORDER_ITEM)
//   .vertical_subtitles.items[] -> title "1 x Name", subtitle3 "₹400"
//   (LINE price for the quantity shown).
// Charges: text_snippet_type_15 keyed by snippet_config.identity.id:
//   CHARGE_ID_DISH (item total, informational — skipped),
//   CHARGE_ID_RES_PACKAGING (GST), CHARGE_ID_DELIVERY (FREE → 0),
//   CHARGE_ID_PLATFORM_FEE, CHARGE_ID_RIDER_TIP,
//   BENEFIT_TYPE_PROMO_CODE (negative), final_cost (paid).
// Strikethrough values ("~~₹43.00~~ FREE") count as FREE.
export interface ZomatoBillLine {
  name: string;
  price: number; // LINE total rupees
  quantity: number;
}

export function parseBill(detailJson: unknown): Array<ZomatoBillLine> {
  const items = ((detailJson as { items?: unknown[] }).items ?? []) as Array<
    Record<string, unknown>
  >;
  const lines: ZomatoBillLine[] = [];
  // Item-total row often reads "~~₹641.67~~ ₹582.67": item lines carry
  // PRE-discount prices; the gap is an unlabeled item-level discount.
  let dishFinal: number | null = null;
  for (const it of items) {
    const cfgDish = it["snippet_config"] as Record<string, Record<string, string>> | undefined;
    if ((cfgDish?.["identity"]?.["id"] ?? "") === "CHARGE_ID_DISH") {
      const rawDish =
        (it["text_snippet_type_15"] as { subtitle?: { text?: string } })?.subtitle?.text ?? "";
      const amounts = [...rawDish.matchAll(/₹\s*([\d,.]+)/g)].map((m) =>
        parseFloat(m[1].replace(/,/g, ""))
      );
      if (amounts.length) dishFinal = amounts[amounts.length - 1]; // last = live value
    }
  }
  for (const it of items) {
    const cfg = it["snippet_config"] as Record<string, Record<string, string>> | undefined;
    const identRaw: unknown = cfg?.["identifier"] ?? cfg?.["identity"]?.["id"] ?? "";
    const ident = typeof identRaw === "string" ? identRaw : "";
    if (ident === "ORDER_ITEM") {
      const snip = it["crystal_snippet_type_5"] as {
        vertical_subtitles?: {
          items?: Array<{ title?: { text?: string }; subtitle3?: { text?: string } }>;
        };
      };
      for (const line of snip?.vertical_subtitles?.items ?? []) {
        const { name, quantity } = parseItemTitle(line.title?.text ?? "");
        const priceText = cleanText(line.subtitle3?.text ?? "");
        const price = parseFloat(priceText.replace(/[₹,\s]/g, "")) || 0;
        lines.push({ name, price, quantity });
      }
      if (dishFinal !== null) {
        const itemsSum = lines.reduce((sum, l) => sum + l.price, 0);
        const gap = Math.round((dishFinal - itemsSum) * 100) / 100;
        if (Math.abs(gap) >= 0.005) {
          lines.push({ name: "Item discount", price: gap, quantity: 1 });
        }
        dishFinal = null; // once, after the item group
      }
    } else if (
      (ident.startsWith("CHARGE_ID_") && ident !== "CHARGE_ID_DISH") || // GST, delivery, platform, tip, gold, ...
      ident.startsWith("BENEFIT_TYPE_") // promo + payment-promo discounts
    ) {
      const snip = it["text_snippet_type_15"] as {
        title?: { text?: string };
        subtitle?: { text?: string };
      };
      const raw = snip?.subtitle?.text ?? "";
      const clean = cleanText(raw);
      // "₹43.00 FREE" or strikethrough markdown → free
      const isFree = /free/i.test(clean) || /~~/.test(raw);
      const amount = isFree ? 0 : parseFloat(clean.replace(/[₹,\s]/g, "")) || 0;
      lines.push({ name: cleanText(snip?.title?.text ?? ident), price: amount, quantity: 1 });
    }
  }
  return lines;
}
