# Skill: expense-split

Fetch delivery-platform order history, itemize it into JSON, run a
Tkinter dashboard to split expenses among N people, then push everything
to Splitwise via OAuth. Every step persists to `~/.cache/ordersplit/`
so the process is crash-safe and resumable.

## When to use

- User wants to split delivery-platform (Blinkit / Swiggy / Zepto) expenses
  among roommates, partners, or a group
- User needs item-level allocation with multiple people sharing single items
- User wants to push the final splits to Splitwise as individually-confirmed
  expenses with itemized descriptions

## Tools involved

| File | Purpose |
|------|---------|
| `dashboard.py` | Tkinter GUI: load orders.json, split items by person, export output.json |
| `push_to_splitwise.py` | CLI: read output.json, OAuth to Splitwise, create expenses interactively |

## Full workflow

### Step 1: Fetch orders from each platform

Run these tool calls in parallel via the agent:

| Platform | Tool | Notes |
|----------|------|-------|
| Blinkit | `blinkit_blinkit_order_history` | Needs `blinkit_blinkit_send_otp` + `blinkit_blinkit_verify_otp` login first. No address param needed. |
| Zepto | `zepto_list_order_history` | Returns UUID order ids. Follow up with `zepto_get_order_detail` for each order to get per-item prices (in paise). |
| Swiggy Instamart | `swiggy-instamart_get_orders` (orderType: "DASH" then "INSTAMART") | Returns per-item prices and bill breakdown directly. No addressId needed. |
| Swiggy Food | `swiggy-food_get_addresses` then `swiggy-food_get_food_orders` | Needs addressId from get_addresses. Per-item prices require `swiggy-food_get_food_order_details` for each orderId. |

#### MCP configuration

From `~/.config/opencode/opencode.json`:

```jsonc
{
  "mcp": {
    "swiggy-food": {
      "type": "remote",
      "url": "https://mcp.swiggy.com/food",
      "enabled": true
    },
    "swiggy-instamart": {
      "type": "remote",
      "url": "https://mcp.swiggy.com/im",
      "enabled": true
    },
    "blinkit": {
      "type": "local",
      "command": ["sh", "-c", "node ~/installs/blinkit-mcp/dist/index.js"]
    },
    "zepto": {
      "type": "local",
      "command": ["sh", "-c", "npx mcp-remote https://mcp.zepto.co.in/mcp"]
    }
  }
}
```

#### Authentication per platform

**Blinkit**: The agent calls `blinkit_blinkit_send_otp` with the user's
phone number. The user reads the SMS and tells the agent the OTP. The agent
calls `blinkit_blinkit_verify_otp`. Token is cached in the MCP process.

**Swiggy Food + Instamart**: Built-in MCP auth works automatically.
The remote MCP at `mcp.swiggy.com` handles the token exchange. No
intervention needed.

**Zepto**: Uses `mcp-remote` tunneling to `mcp.zepto.co.in`. Auth is
handled by the remote server. First call to `zepto_list_order_history`
may need the user to authenticate in-browser once.

### Step 2: Itemize orders into JSON

After fetching all orders, the agent must:

1. Exclude cancelled orders.
2. Search each product on Blinkit via `blinkit_blinkit_search` /
   `blinkit_blinkit_pick_best` to get current prices. Use the exact
   product name from the order history as the search query. Check
   alternatives in the response for the correct variant (pack size
   matters — 2pcs vs 10pcs vs 4pcs).
3. For Zepto, per-item prices come from `zepto_get_order_detail`
   (`unitSellingPrice` and `totalFinalSellingPrice` in paise).
   Note: Zepto fees are baked into `totalFinalSellingPrice` — do not
   add separate delivery lines for Zepto orders. Set fees to zero.
4. For Swiggy Food, per-item prices come from
   `swiggy-food_get_food_order_details`. Delivery charges are the gap
   between item sum and order total.
5. For Swiggy Instamart DASH, the API returns `itemTotal` but not
   per-item prices. Use `itemTotal` as the item sum and backsolve
   proportional prices.
6. For any items whose current price cannot be found (discontinued
   products), mark them `"estimated": true` and backsolve from the
   order total minus known items and fees.
7. Write a Python script to verify every order balances (items + fees = paid).
   All orders must sum within Rs 0.50 of the paid amount.
8. Write `orders.json` with this schema:

```jsonc
{
  "orders": [{
    "id": "platform-orderid",
    "platform": "blinkit | zepto | swiggy_food | swiggy_instamart",
    "date": "ISO-8601 with TZ offset",
    "paid": 837.00,
    "items": [{
      "name": "Product Name (pack size)",
      "price": 0.00,
      "quantity": 1,
      "estimated": false,
      "source": "blinkit_search | zepto_order_detail | swiggy_order_detail | backsolved"
    }],
    "fees": { "delivery": 0.00, "packaging": 0.00 }
  }],
  "meta": {
    "generated_at": "ISO date",
    "platforms": ["blinkit", ...],
    "date_range": { "from": "...", "to": "..." },
    "excluded": ["cancelled order ids"],
    "price_sources": { ... },
    "estimated_count": 0
  }
}
```

#### Important: Zepto orders

Zepto's `grandTotalAmount` already includes all fees and taxes in the
item-level `totalFinalSellingPrice`. Do **not** add separate delivery
or packaging line items for Zepto orders. Set fees to zero and let the
item prices sum to the paid total.

#### Important: B1G1 detection

Zepto does not expose an explicit B1G1 flag. Detect B1G1 by comparing
`totalFinalSellingPrice` against `unitSellingPrice` × quantity:
when qty=2 and total ≈ unit price, it is B1G1. Divide the total by the
quantity to get the effective per-unit price for the orders.json.

### Step 3: Run the expense-split dashboard

```
python ~/.config/opencode/skills/expense-split/dashboard.py ~/ai-scratch/orders.json
```

#### Dashboard features

- **People setup**: On first launch asks for 3 names and who originally paid.
  Stores both in the cache so it only asks once.
- **Item-by-item**: Shows each line item with order context. Items with
  quantity > 1 are expanded to individual rows. Delivery and packaging
  fees appear as separate line items (for non-Zepto platforms).
- **Split types** (radio buttons):
  - Equal — splits among selected people evenly
  - Percentage — integer percentages per person (must sum to 100)
  - Custom — exact rupee amounts per person (must sum to item price)
  - Single Payer — one person takes the full amount
- **Skip**: A "Skip this item" button excludes the item from totals.
  Skipped items are saved in the cache and do not appear in output.json.
  Use this for expenses already settled separately.
- **Progress**: Shows "X assigned, Y skipped, Z remaining".
- **Cache**: Every change auto-saves to `~/.cache/ordersplit/cache.json`.
  Resume from any crash or power loss.
- **Export**: "Finish & Export" writes `~/.cache/ordersplit/output.json`
  with per-person totals and settlement instructions.
- **Summary**: `--summary` flag prints a terminal table of every order
  with per-person columns, no GUI:
  ```
  python ~/.config/opencode/skills/expense-split/dashboard.py --summary ~/ai-scratch/orders.json
  ```

#### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+S` | Force save |
| `Ctrl+Q` | Save and quit |
| `Ctrl+N` | Next item |
| `Ctrl+P` | Previous item |
| `Escape` | Go back to previous item |

### Step 4: Review the output

`~/.cache/ordersplit/output.json` shape:

```jsonc
{
  "split_at": "ISO-8601",
  "people": ["Name1", "Name2", "Name3"],
  "splits": [{
    "item": "Product Name",
    "platform": "blinkit",
    "date": "2026-07-23 3:19 PM",
    "price": 240.00,
    "split_type": "equal",
    "assignments": { "Name1": 120.00, "Name2": 120.00 }
  }],
  "totals": { "Name1": 8370.91, "Name2": 2663.28, "Name3": 2026.84 },
  "settlements": [
    { "from": "Name2", "to": "Name1", "amount": 2663.28 },
    { "from": "Name3", "to": "Name1", "amount": 2026.84 }
  ]
}
```

Use `--summary` for a quick terminal view. The settlements assume one
person fronted all orders — the non-payers send their full owed amounts
to the payer.

### Step 5: Push to Splitwise

#### Setup

Register an app at https://secure.splitwise.com/oauth_clients.
Create a `.env` file:

```
CONSUMER_KEY=your_key_here
CONSUMER_SECRET=your_secret_here
```

Install the dependency:

```
pip install requests-oauthlib
```

#### Run

```
python ~/.config/opencode/skills/expense-split/push_to_splitwise.py --env ~/ai-scratch/splitwise.env
```

#### Flow

1. **OAuth**: Opens a browser URL for authorization. Paste the callback
   URL back into the terminal. Token is cached in
   `~/.cache/ordersplit/splitwise_token.json` — only needed once.
2. **Resolve people**: Matches output.json names to Splitwise user IDs
   via friends list. Prompts for manual IDs if a name is not found.
3. **Group selection**: Lists your Splitwise groups. Pick one, or `0`
   for non-group expenses.
4. **Currency**: Defaults to INR. Press Enter to accept, or type another
   code (USD, EUR, etc.).
5. **Per-order confirmation**: Shows each order with itemized splits and
   prompts `[Y/n/s/q]`. Confirmed orders are created as Splitwise
   expenses. Skipped orders are not pushed.
6. **Idempotent**: Successfully pushed expense IDs are saved to
   `~/.cache/ordersplit/splitwise_pushed.json`. Re-running the script
   skips already-pushed orders. Safe to interrupt and resume.

#### Expense format on Splitwise

Each order becomes one expense with:
- **Cost**: the full order total
- **Paid by**: the payer (from output.json settlements)
- **Split**: per-person owed shares from the dashboard assignments
- **Description**: platform, date, top items, per-person totals
  (e.g. `Blinkit Jul 23 | Marlboro Gold, Duracell AAA | S:341 H:341 P:155`)
- **Group**: whichever group was selected

#### Dry run

```
python push_to_splitwise.py --dry-run --env ~/ai-scratch/splitwise.env
```

Shows all orders and what would be pushed without connecting to
Splitwise. Does not use or create pushed tracking files.

## Cache files

All in `~/.cache/ordersplit/`:

| File | Purpose |
|------|---------|
| `cache.json` | Dashboard progress: current index, assignments, skipped items, people names, payer |
| `output.json` | Final split results with per-person totals and settlements |
| `splitwise_token.json` | OAuth1 access token (consumer key, secret, oauth token) |
| `splitwise_pushed.json` | Map of order fingerprints to Splitwise expense IDs |

## Dependencies

- `dashboard.py`: stdlib only (tkinter, json, pathlib, datetime, os, argparse, math)
- `push_to_splitwise.py`: stdlib + `requests-oauthlib` (`pip install requests-oauthlib`)
