# Zomato protocol study for split-utils

Scope: read-only order history for expense split. No emulator in ship path. No real credentials
used. All live probes were unauthenticated.

## 1. Feasibility per requirement

- R1 auth: feasible with caveats. Login is phone OTP plus OAuth2 PKCE on accounts.zomato.com. The
  full auth artifact is an access token plus a refresh token. Both transfer by copy. No device-bound
  secret is needed. The flow is transcribed from public code. It is not run here.
- R2 list orders: feasible. POST api.zomato.com/gw/order/history/online_order returns order id,
  restaurant, date, total, and status. A live probe returns clean JSON auth errors. The binary holds
  the same path.
- R3 line items: feasible with caveats. History cards give dish names and counts but no prices. Unit
  prices must come from the detail endpoint. The endpoint is live. Exact bill paths need one
  authenticated capture.
- R4 fees and taxes: feasible with caveats. Same detail endpoint. The binary holds grand_total and
  delivery_charge keys. Exact fee paths need one authenticated capture.
- R5 orders.json: feasible. A mapper exists. A sample run emits valid schema. Items sum to paid.
- R6 plain Deno: feasible. Plain Deno fetch reaches api.zomato.com. No TLS fingerprint block
  appears. Blinkit needed a Chrome-TLS client. Zomato does not.

## 2. What was found

Base host: https://api.zomato.com. Auth host: https://accounts.zomato.com.

| Path                           | Method | Auth         | Note                                         |
| ------------------------------ | ------ | ------------ | -------------------------------------------- |
| /gw/user/info                  | GET    | access token | probe: 401 JSON without token                |
| /gw/order/history/online_order | POST   | access token | probe: 401 JSON without token; GET gives 404 |
| /v2/order/crystal_v2           | POST   | access token | probe: 200 JSON Invalid Params without body  |
| /gw/tabbed-home                | GET    | access token | home feed, per public notes                  |
| accounts /login/phone          | POST   | static key   | OTP initiate then verify                     |
| accounts /oauth2/auth          | GET    | static key   | PKCE S256, scope offline openid              |
| accounts /token                | POST   | static key   | code exchange, returns token pair            |

Auth scheme: header X-Zomato-Access-Token plus static X-Zomato-API-Key
7749b19667964b87a3efc739e254ada2 plus X-Zomato-Client-Id 5276d7f1-910b-4243-92ea-d27e758ad02b. The
key ships in the binary. No request signing was found. No per-request signature header appears in
code or notes.

Network stack: OkHttp 4.12.0 drives the API. Cronet classes ship in the binary. gRPC classes ship
too, likely for chat or assist features, not orders. Realtime events use MQTT on hedwig.zomato.com.
UI is server driven. Responses hold layout snippets with deep links.

Token storage: the app uses EncryptedSharedPreferences with an AndroidKeyStore key. The store
resists plain backup copy. The headless OTP flow avoids that problem. It mints fresh tokens without
the device.

Pinning: no sha256 pin sets appear in the binary. A public report intercepted traffic with a system
store injection tool. That points to system trust only, with no pinning. This is not fully proven.
Treat it as likely open to proxy capture.

History shape: results[] holds order_history_snippet_type_2 cards. Each card holds a
zomato://delivery/<orderId> link, markdown restaurant name, status tag, item lines like "2 x Dish
Name", a date line like "30 Apr 2024 at 9:11PM", and a rupee total. Paging uses postback_params with
last_created_timestamp and last_order_id.

Detail shape: response.order_details holds res_name and tab_id. Full bill layout is unpublished. One
authenticated fetch will pin it.

## 3. Prototype and study paths

All files sit under /tmp/dsh/zomato-re/.

- probe_public.ts: unauthenticated reachability and auth-shape checks. Run with deno run --allow-net
  probe_public.ts. Proves plain Deno transport plus JSON error shape.
- probe_post.ts and probe_detail.ts: method checks for history and detail paths. Same run form.
  Proves POST plus endpoint presence.
- zomato_client.ts: header builder, OTP calls, history fetch and parser, detail fetch stub.
  Typechecks with deno check.
- sample_history_page.json: reconstructed card with invented data. No real user data.
- map_sample.ts: maps the sample to orders.json schema. Run with deno run --allow-read
  map_sample.ts. It checks that items sum to paid.

Next step to close R3 and R4: run one authenticated history fetch, then one crystal_v2 fetch for a
known order id. Pin the item price and fee paths. Fill parseBill in the client. Replace the "[Detail
capture pending]" pseudo-item with real lines.

## 4. Risks

- Rate limits are unpublished. Keep polling slow. Poll history once per sync.
- Device headers are static strings. The server may flag odd sets. Reuse one plausible set.
- Access tokens expire. Refresh tokens carry offline scope. Store both and refresh on 401.
- App version headers may drift. The server can reject old builds. Bump X-Zomato-App-Version when
  calls fail after an app update.
- Some endpoints guard against replay. One game endpoint allows a single call per event. Order reads
  show no such guard, but treat write paths with care.
- The API is unofficial. Zomato terms likely bar automated access. Limit use to the user own data.
  Keep request volume low.
- Response shape is server driven and can change without notice. Parse with guards, not fixed
  positions.
