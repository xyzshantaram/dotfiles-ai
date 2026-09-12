// Zomato expense-split prototype client (Deno, plain fetch, no deps).
// Status: protocol discovery build. History list shape is confirmed from
// public write-ups and dex strings. Login flow is transcribed from the
// public jomato project (MIT). Detail-field names are candidates until one
// authenticated capture pins them. No call here uses real credentials.
// Run probes: deno run --allow-net probe_public.ts

export const BASE = "https://api.zomato.com";
export const ACCOUNTS = "https://accounts.zomato.com";

// Static app constants. Present in the app binary and in public write-ups.
export const API_KEY = "7749b19667964b87a3efc739e254ada2";
export const CLIENT_ID = "5276d7f1-910b-4243-92ea-d27e758ad02b";
export const APP_VERSION = "986";
export const APP_VERSION_CODE = "1710019860";

export function baseHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Accept": "application/json",
    "X-Zomato-API-Key": API_KEY,
    "X-Zomato-Client-Id": CLIENT_ID,
    "X-Zomato-App-Version": APP_VERSION,
    "X-Zomato-App-Version-Code": APP_VERSION_CODE,
    "User-Agent": "okhttp/4.12.0",
  };
  if (token) h["X-Zomato-Access-Token"] = token;
  return h;
}

// ---- Login: phone OTP plus OAuth2 PKCE (transcribed, not run) ----
// Step 1: POST {ACCOUNTS}/login/phone type=initiate (sms|whatsapp|call).
// Step 2: POST {ACCOUNTS}/login/phone type=verify with otp.
// Step 3: GET {ACCOUNTS}/oauth2/auth with PKCE S256 challenge,
//   scope "offline openid", client_id CLIENT_ID.
// Step 4: POST {ACCOUNTS}/token grant_type=authorization_code.
// Result holds access_token plus refresh_token (offline scope).
// jomato stores both in a local `.zomato` file. That pair is the full
// auth artifact the tool needs. No device-bound secret is required.

export async function sendOtp(phone: string, pref = "sms"): Promise<Response> {
  const body = new URLSearchParams({
    number: phone,
    country_id: "1",
    type: "initiate",
    verification_type: pref,
    package_name: "com.application.zomato",
  });
  return await fetch(`${ACCOUNTS}/login/phone`, {
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function verifyOtp(phone: string, otp: string): Promise<Response> {
  const body = new URLSearchParams({
    number: phone,
    otp,
    country_id: "1",
    type: "verify",
    trust_this_device: "true",
  });
  return await fetch(`${ACCOUNTS}/login/phone`, {
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

// ---- Order history (list shape confirmed) ----
// POST {BASE}/gw/order/history/online_order
// Authed reply: {status:"success", has_more, postback_params, results[]}
// Each food order is results[] item with key order_history_snippet_type_2.
// Paging: feed the reply postback_params back into the next request body.

export interface HistorySkeleton {
  orderId: string;
  restaurant: string;
  locality: string;
  status: string;
  date: string; // raw text, e.g. "30 Apr 2024 at 9:11PM"
  paid: number; // rupees, from bottom_container subtitle1
  items: { name: string; quantity: number }[]; // names only, no prices
}

// Strip Zomato markdown wrappers like "<medium-400|{grey-900|Name}>".
export function cleanText(raw: string): string {
  return raw
    .replace(/<[\w-]+?\|/g, "") // "<semibold-300|" openers
    .replace(/\{[\w-]+?\|/g, "") // "{grey-900|" openers
    .replace(/[<>{}]/g, "") // leftover markup brackets
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// "1 x Peri Peri Chicken Wrap" -> {quantity:1, name:"Peri Peri Chicken Wrap"}
export function parseItemTitle(raw: string): { name: string; quantity: number } {
  const t = cleanText(raw);
  const m = t.match(/^(\d+)\s*x\s+(.+)$/i);
  if (m) return { quantity: parseInt(m[1], 10), name: m[2].trim() };
  return { quantity: 1, name: t };
}

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
    const orderId = clickUrl.replace(/^zomato:\/\/delivery\//, "").replace(
      /^zomato:\/\/order\//,
      "",
    );
    const items = ((snip["items"] as unknown[]) ?? []).map((it) =>
      parseItemTitle(
        ((it as Record<string, unknown>)["title"] as Record<string, string>)?.["text"] ?? "",
      )
    );
    const date = (bottom["title"] as Record<string, string>)?.["text"] ?? "";
    const paidRaw = cleanText((bottom["subtitle1"] as Record<string, string>)?.["text"] ?? "0");
    const paid = parseFloat(paidRaw.replace(/[₹,\s]/g, "")) || 0;
    orders.push({ orderId, restaurant: title, locality, status, date, paid, items });
  }
  return {
    orders,
    hasMore: (root["has_more"] as boolean) ?? false,
    postback: (root["postback_params"] as string) ?? "",
  };
}

export async function fetchHistoryPage(token: string, postback?: string): Promise<unknown> {
  const body: Record<string, string> = {};
  if (postback) body["postback_params"] = postback;
  const res = await fetch(`${BASE}/gw/order/history/online_order`, {
    method: "POST",
    headers: { ...baseHeaders(token), "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

// ---- Order detail (endpoint confirmed, bill keys need one authed capture) ----
// POST {BASE}/v2/order/crystal_v2 -> {response:{order_details:{...}}}
// Known detail keys from public notes: res_name, tab_id (order id).
// Candidate bill keys seen in the binary: grand_total, delivery_charge.
// TODO: run one authenticated fetch, then pin exact item and fee paths.

export async function fetchOrderDetail(token: string, orderId: string): Promise<unknown> {
  const res = await fetch(`${BASE}/v2/order/crystal_v2`, {
    method: "POST",
    headers: { ...baseHeaders(token), "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ order_id: orderId }),
  });
  return await res.json();
}
