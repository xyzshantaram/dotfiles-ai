# Blinkit Playbook

Verified 2026-09-09 against the live site with a logged-in desktop session.

## Login

1. Persistent Chromium profile at `<data-dir>/blinkit-profile` (per-OS location decided by the
   wizard).
2. `blinkit.com` → user enters phone + OTP by hand. First run only.
3. Location: geolocation permission pre-granted; the site's own "Detect my location" fails in
   Chromium — the user picks a saved address manually if prompted.
4. Login signal: `localStorage.auth` parses and `auth.accessToken` is a non-null string (pre-login
   it exists holding `{"accessToken":null}` — do NOT regex-match key names).
5. `deviceId` and `authKey` localStorage keys hold the header values.

## Data extraction (no UI clicks)

Drive the site's JSON APIs from page context — same-origin fetch carries cookies; add the site's own
headers:

- `access_token` = `JSON.parse(localStorage.auth).accessToken`
- `auth_key` = `localStorage.authKey`
- `device_id` = `localStorage.deviceId`
- `app_client: consumer_web`, `platform: desktop_web`, `content-type: application/json`

All `/v1/layout/*` endpoints are **POST**, mostly bodyless.

### Orders list (paginated)

`POST https://blinkit.com/v1/layout/order_history`
`POST ...?offset=0&limit=10&cursor=<cursor>&get_failed_carts_history=false&last_snippet_type=order_history_container_vr&last_widget_type=order+history+widget&page_index=N&total_entities_processed=N+1`

- Orders = `response.snippets[widget_type === "order_history_container_vr"]`
- Per order (header item `image_text_vr_type_header`):
  - `tracking.common_attributes.order_id`, `.deeplink` (→ `cart_id`)
  - amount: `data.left_underlined_subtitle.text` ("₹217")
  - date: `data.subtitle.text` ("08 Sep, 9:38 am" — no year, assume current)
- Pagination: `response.pagination.cursor`; stop when absent, or when a order's date falls before
  the requested range.

### Order detail (items + bill)

`POST https://blinkit.com/v1/layout/order_details/<order_id>?cart_id=<cart_id>`

- Items: snippets with `widget_type === "z_v3_image_text_snippet_type_30"` between the "N items in
  this order" header and the bill block.
  - name: `data.title.text`
  - qty + pack: `data.subtitle1.text` ("700 g x 1", "1 pc x 2", "3 x 200 ml x 1")
  - price: `data.subtitle3.text` markdown "~~₹MRP~~ ₹paid" — **the last price is the LINE total (qty
    included), not the unit price**. Unit price = line / qty.
- Bill rows: `widget_type === "cart_bill_item"`, label `data.left_header.text`, value
  `data.right_header.text` ("₹12", "+₹12", "-₹10", "FREE").
  - Keep: Delivery charges → `fees.delivery`
  - Keep as bracketed pseudo-items: Handling, Convenience (carry bag), surge, tip — normalize "X
    charge" → "[X]"
  - Skip: MRP, Product discount, Item total, Bill total, To pay (items already carry post-discount
    paid prices)

## Mapping contract

`src/blinkit.ts` maps raw captures to the split-utils orders.json schema and enforces
`Σ(unit price × qty) + fees = paid` per order; extraction runs must print per-order balance status
and fail loudly on mismatch.

## Quirks log

- Chromium build: playwright 1.57 expects chromium-1200; using the cached chromium-1234 via
  `executablePath` works fine.
- `--allow-sys` (or `-A`) is required for Playwright under Deno.
- Date strings in the list have no year. Late-December runs must handle the year rollover (a January
  date on the first page is last year).
- The orders page 404s on `/my-orders` and `/orders`; the real URL is `/account/orders`.
