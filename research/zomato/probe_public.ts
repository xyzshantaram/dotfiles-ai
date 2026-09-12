// Probe 1: reachability and auth-shape check for api.zomato.com.
// Makes no authenticated calls. Uses only the static public API key
// found in the app binary and in public write-ups.
// Run: deno run --allow-net probe_public.ts

const API_KEY = "7749b19667964b87a3efc739e254ada2";
const CLIENT_ID = "5276d7f1-910b-4243-92ea-d27e758ad02b";
const BASE = "https://api.zomato.com";

const staticHeaders = {
  "Accept": "application/json",
  "X-Zomato-API-Key": API_KEY,
  "X-Zomato-Client-Id": CLIENT_ID,
  "X-Zomato-App-Version": "986",
  "X-Zomato-App-Version-Code": "1710019860",
  "User-Agent": "okhttp/4.12.0",
};

async function probe(name: string, path: string, init?: RequestInit) {
  const url = BASE + path;
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...staticHeaders, ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    console.log(`--- ${name}`);
    console.log(`status: ${res.status}`);
    console.log(`content-type: ${res.headers.get("content-type")}`);
    console.log(`body[0:400]: ${text.slice(0, 400)}`);
  } catch (e) {
    console.log(`--- ${name}`);
    console.log(`FETCH FAILED: ${(e as Error).message}`);
  }
}

// 1. Base host alive?
await probe("GET / (host alive?)", "/");
// 2. User info with no access token: expect JSON auth error, not TLS block.
await probe("GET /gw/user/info, no token", "/gw/user/info");
// 3. Order history with no access token: expect JSON auth error.
await probe("GET /gw/order/history/online_order, no token", "/gw/order/history/online_order");
