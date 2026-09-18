# Zepto Playbook

Verified 2026-09-09 against the live site with a logged-in desktop session. Use `www.zepto.com`
directly (not zeptonow.com).

## HTTP 429 means headless, not rate limit (settled 2026-09-12)

Zepto answers any request whose user agent holds the `HeadlessChrome` token with `429`, which
Chromium surfaces as `net::ERR_HTTP_RESPONSE_CODE_FAILURE` before one API call fires. The status
reads as a rate limit. It is not one. It never clears with time, and deleting the profile does not
help.

Proof, three loads of `/account/orders` on one profile minutes apart: headless with the default
agent got 429, headless with a desktop agent got 200, headed got 200. The headless agent named
`HeadlessChrome/151`. The other two named `Chrome/151`.

`openSession` in `src/browser.ts` now rewrites the agent and the sec-ch-ua brands over CDP when it
runs headless with no explicit agent. Keep that rewrite. The scrape phase runs headless, so removing
it returns the whole site to 429.

Earlier note, now known to be wrong: this was read as a flagged profile plus self-inflicted rate
limiting. No flag and no throttle existed. The trigger was the split of login and scrape into headed
and headless phases, which moved the scrape onto the headless agent.

## Login

1. Persistent profile at `<data-dir>/zepto-profile`, portrait window 480x860 at 1x scale,
   geolocation pre-granted (Bengaluru coords).
2. `www.zepto.com` → user logs in by hand (phone + OTP). First run only.
3. No reliable login localStorage signal (token-shaped keys exist pre-login). Detection strategy for
   the wizard: watch the page for the SITE's own order-list 200 through a response listener, and
   offer an "I'm signed in" choice that loads /account/orders and watches for the same signal. Never
   check login with a DIRECT pageFetch to the gateway: without the time-bound request-signature
   header the gateway answers 202 even for logged-in users, so the wait never ends.

## Data extraction (capture-driven — no replayed requests)

The BFF gateway binds requests with a time-bound `request-signature` header; replaying captured
headers gets 202. So the site's own JS makes every call: we navigate synthetically and harvest JSON
responses.

### Orders list

- Page: `www.zepto.com/account/orders` (NOT /orders — that 404s).
- Site call: `GET bff-gateway.zepto.com/api/v2/order/?page_number=N` until `endOfList` — fired by
  clicking "Load More".
- Per order: `id` (uuid), `code`, `grandTotalAmount` (PAISE), `placedTime` (ISO UTC), `status` (also
  CANCELLED orders appear — decide per use whether to keep).

### Order detail

- Route: `www.zepto.com/order/<uuid>?isArchived=false`.
- Site call: `POST bff-gateway.zepto.com/pfs-postorder/api/v1/get-page/
  ORDER_DETAILS` with JSON
  `{orderId, page_size: 8, isArchived: false,
  enforce_platform_type: "DESKTOP"}` (later pages add
  last_widget_id + page_number).
- **The bill widget only loads on scroll** — scroll to bottom 2-3 times per detail page or the fees
  are missing.
- Products: `pageLayout.widgets[].data.items[].orderProductsV2.
  sectionData[].orderProducts[]`.
  Multi-shipment orders have MULTIPLE widget items (one per shipment) — gather all, not just the
  first.
  - name: `storeProduct.product.name`
  - pack: `storeProduct.productVariant.formattedPacksize`
  - qty: `quantityOrdered`
  - prices (paise): `unitMrp`, `unitSellingPrice`, `unitFinalSellingPrice`, `totalFinalSellingPrice`
    (line total)
- Bill rows: widget items with `feeSection`:
  - `itemTotalAndDiscounts`: "Item Total" (informational)
  - `feesAndGst`: Delivery Fee, Handling Fee/Charge, GST, Delivery Partner Tip, restaurant charges.
    Take the NON-strikethrough right value ("FREE" = 0).

## Mapping contract (`src/zepto.ts`)

- Unit price = `totalFinalSellingPrice / 100 / qty` (line carries fees for Cafe items sometimes —
  GST may already be baked in).
- Fee reconciliation: `diff = paid − Σ product lines`. If labeled fees sum to diff exactly, add them
  as `[Label]` pseudo-items. If they do not reconcile, add a single `[Fees]` catch-all for the diff.
  Never blindly add fee rows (double-count risk).
- Balance check: `Σ(unit × qty) + pseudo-items == paid` must hold, and it does across all 42
  extracted orders.

## Quirks log

- Gateway 202s replayed headers — always capture-drive.
- 638/639 responses on a browse session can be `partytown` analytics proxy noise; the recorder's
  skipFilter drops them.
- The orders list "Load More" paginates ~8 orders per click; a 30-day window needs ~21 pages (167
  total orders).
- Zepto fees are usually baked into item line prices; only a minority of orders show separate fee
  rows (tips, delivery when not waived).
