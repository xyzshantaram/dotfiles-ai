# Zomato Playbook

Verified 2026-09-09 with a live OTP login (Deno-only, no TLS impersonation needed). Token pair
persisted at state/zomato-tokens.json with refresh-on-401 in `authorizedFetch`.

## Auth (the hard-won part)

The app login is OAuth2 + PKCE against accounts.zomato.com. A cold POST to /login/phone returns 400
"Something went wrong". The verified sequence (adapted from jomato's client, live-tested here):

1. **PKCE** verifier + S256 challenge; cookies `zxcv=<verifier>`, `cid=<CLIENT_ID>`,
   `rurl=https://accounts.zomato.com/zoauth/callback`.
2. `GET /oauth2/auth` with
   `approval_prompt=auto, scope=offline openid,
   response_type=code, code_challenge_method=S256, redirect_uri=
   https://accounts.zomato.com/zoauth/callback, state, client_id,
   code_challenge`
   — follow redirects MANUALLY, absorbing every Set-Cookie, until a URL carries
   `login_challenge=<lc>`.
3. `POST /login/phone` form
   `number, country_id=1, lc, type=initiate,
   verification_type=sms, package_name=com.application.zomato,
   message_uuid=`
   → OTP sent.
4. `POST /login/phone` form
   `number, otp, country_id=1, lc, type=verify,
   trust_this_device=true, device_token=` → JSON
   `redirect_to`.
5. `GET redirect_to`, follow manual hops until `consent_challenge=`.
6. `POST /consent` form `cc=<consent_challenge>` → JSON `redirect_to`.
7. Follow manual hops to the callback; the final URL carries `code`, `state`, `scope` (ALL THREE
   feed the next step).
8. `POST /token` form
   `grant_type=authorization_code, code, state, scope,
   code_verifier, client_id, redirect_uri` →
   `{status, token:
   {access_token, refresh_token}}`.

Failure modes seen live, with their fixes:

- 500 at /token when the device identity (X-Android-Id, X-Zomato-UUID, X-App-Session-Id ...) rotates
  between steps: mint ONE identity per login, persist it in the login state, reuse everywhere.
- "No CSRF value available in the session": cookies from step 2 were dropped — absorb Set-Cookie at
  every hop into one jar.
- 500 at /token with correct code: pass the callback's `state` and `scope`, not hardcoded values.

Per-device telemetry headers are FRESH RANDOM per install (never replay another client's captured
ids — a new install sends new ones). Static app constants: API_KEY, CLIENT_ID (embedded in every app
copy), and APP_VERSION / APP_VERSION_CODE from the current APK (keep in sync with
wizards/dev-zomato-consts.ts when Zomato deprecates a version).

## History

`POST https://api.zomato.com/gw/order/history/online_order` JSON `{}` (+`postback_params` from the
previous reply to page).

- REQUIRES location headers or it 500s: `X-Present-Lat/Long`, `X-User-Defined-Lat/Long`,
  `X-City-Id`, `X-O2-City-Id` (Bangalore=4; prototype pins the user's area — T9 must ask).
- Reply: `results[]` cards `order_history_snippet_type_2`:
  - order id: `click_action.deeplink.url` → `order_id=(\d+)`
  - restaurant: `top_container.title.text` (markdown-wrapped, strip)
  - date: `bottom_container.title.text` = "Order placed on 14 Aug, 3:23PM" (no year — default to
    current year)
  - paid: `bottom_container.subtitle1.text` (markdown-wrapped ₹)
  - payment-failed cards: marker in `bottom_container.subtitle2` — skip.

## Detail (bill)

`GET https://api.zomato.com/gw/order/order_summary?order_id=<id>&lang=en`

Crystal-snippet list, keyed by `snippet_config.identity.id` / `identifier`:

- `ORDER_ITEM` (`crystal_snippet_type_5`): `.vertical_subtitles.items[]` with `title.text` "1 x Fish
  & Velvety Mash" and `subtitle3.text` "₹400" = LINE total, PRE-item-discount.
- `CHARGE_ID_DISH`: item-total row, often "~~₹641.67~~ ₹582.67" — the gap between its LAST amount
  and Σ item lines is an unlabeled item-level discount (emit "[Discount]").
- Any other `CHARGE_ID_*`: bill rows — GST & restaurant packaging, Delivery partner fee
  (strikethrough+FREE → 0), Platform fee, Rider tip, Gold subscription fee ₹1, and more; take the
  last ₹ amount.
- Any `BENEFIT_TYPE_*`: discounts (PROMO_CODE, PAYMENT_PROMO_CODE) — negative.
- `final_cost` = paid. `grand_total` = pre-discount-ish total (do not use).

Balance rule (verified on 19 orders): items + charges + benefits + item-discount gap = final_cost,
exact.

## Mapping to orders.json

- Items: unit price = line price / qty (dashboard expands qty).
- "Delivery partner fee" → fees.delivery. Everything else pseudo-items: GST→[GST],
  platform→[Handling], tip→[Tip], discounts→[Discount] (neg), gold fee → [Gold subscription fee]
  (label normalization in the prototype CLI).

## Extraction

One throwaway probe read 19 orders, ALL BALANCE, worth ₹7,802.92, and skipped failed-payment
cards. The shipped reader is `src/zomato.ts`, driven by `wizards/gatherer.ts`.
