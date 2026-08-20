#!/usr/bin/env python3
"""
Push expense splits from output.json to Splitwise.

Reads ~/.cache/ordersplit/output.json and creates one Splitwise expense
per order (grouped by platform + date).  Handles OAuth token caching and
interactive confirmation for each order.

Usage:
    python push_to_splitwise.py [--dry-run] [--output path/to/output.json]
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from requests_oauthlib import OAuth1Session

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
CACHE_DIR = Path.home() / ".cache" / "ordersplit"
DEFAULT_OUTPUT = CACHE_DIR / "output.json"
TOKEN_FILE = CACHE_DIR / "splitwise_token.json"
PUSHED_FILE = CACHE_DIR / "splitwise_pushed.json"

BASE = "https://secure.splitwise.com/api/v3.0"
OAUTH_BASE = "https://secure.splitwise.com"


# ---------------------------------------------------------------------------
# SplitwiseAPI – thin wrapper around OAuth1Session
# ---------------------------------------------------------------------------
class SplitwiseAPI:
    def __init__(self, consumer_key, consumer_secret, access_token=None):
        self.consumer_key = consumer_key
        self.consumer_secret = consumer_secret
        self.session = None
        if access_token:
            self.set_access_token(access_token)

    def set_access_token(self, access_token):
        self.session = OAuth1Session(
            self.consumer_key,
            client_secret=self.consumer_secret,
            resource_owner_key=access_token["oauth_token"],
            resource_owner_secret=access_token["oauth_token_secret"],
        )

    def _get(self, path):
        r = self.session.get(f"{BASE}/{path}")
        r.raise_for_status()
        return r.json()

    def _post(self, path, data):
        r = self.session.post(f"{BASE}/{path}", data=data)
        r.raise_for_status()
        return r.json()

    def get_authorize_url(self):
        """Step 1: Get request token and auth URL."""
        oauth = OAuth1Session(self.consumer_key, client_secret=self.consumer_secret)
        r = oauth.post(f"{BASE}/get_request_token")
        r.raise_for_status()
        creds = parse_qs(r.text)
        oauth_token = creds["oauth_token"][0]
        oauth_token_secret = creds["oauth_token_secret"][0]
        url = f"{OAUTH_BASE}/authorize?oauth_token={oauth_token}"
        return url, oauth_token, oauth_token_secret

    def get_access_token(self, oauth_token, oauth_token_secret, oauth_verifier):
        """Step 2: Exchange for access token."""
        oauth = OAuth1Session(
            self.consumer_key, client_secret=self.consumer_secret,
            resource_owner_key=oauth_token,
            resource_owner_secret=oauth_token_secret,
            verifier=oauth_verifier,
        )
        r = oauth.post(f"{BASE}/get_access_token")
        r.raise_for_status()
        creds = parse_qs(r.text)
        return {
            "oauth_token": creds["oauth_token"][0],
            "oauth_token_secret": creds["oauth_token_secret"][0],
        }

    def get_current_user(self):
        data = self._get("get_current_user")
        return data["user"]

    def get_friends(self):
        data = self._get("get_friends")
        return data.get("friends", [])

    def get_groups(self):
        data = self._get("get_groups")
        return data.get("groups", [])

    def create_expense(self, expense_data):
        """Create a new expense.

        expense_data is a dict with keys like: cost, description, group_id,
        users__0__user_id, users__0__paid_share, users__0__owed_share, ...
        """
        return self._post("create_expense", expense_data)

    def create_comment(self, expense_id, content):
        """Post a comment on an expense."""
        return self._post("create_comment", {"expense_id": expense_id, "content": content})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def fmt_rs(amount: float) -> str:
    """Format a rupee amount with 2 decimal places."""
    return f"{amount:.2f}"


def abbreviated(name: str) -> str:
    """First letter of the first name, capitalized."""
    return name.strip()[0].upper() if name.strip() else "?"


def load_pushed() -> dict[str, int]:
    """Return {fingerprint: expense_id} of already-pushed orders."""
    if PUSHED_FILE.exists():
        with open(PUSHED_FILE) as f:
            data = json.load(f)
        return data.get("pushed", {})
    return {}


def save_pushed(pushed: dict[str, int]):
    """Save the pushed tracking dict to disk."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(PUSHED_FILE, "w") as f:
        json.dump({"pushed": pushed}, f, indent=2)


def order_fingerprint(order: list[dict]) -> str:
    """Generate a unique fingerprint for an order: platform|date|total."""
    platform = order[0]["platform"]
    date = order[0]["date"]
    total = fmt_rs(sum(item["price"] for item in order))
    return f"{platform}|{date}|{total}"


# ---------------------------------------------------------------------------
# Output loading
# ---------------------------------------------------------------------------
def load_output(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# OAuth / login
# ---------------------------------------------------------------------------
def load_credentials(env_path: str | None) -> tuple[str, str]:
    """Load consumer key/secret from .env file or stdin.

    .env format (one KEY=VALUE per line):
        CONSUMER_KEY=...
        CONSUMER_SECRET=...
    """
    if env_path:
        p = Path(env_path).expanduser().resolve()
        if not p.exists():
            print(f"ERROR: {p} not found.", file=sys.stderr)
            sys.exit(1)
        creds = {}
        with open(p) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                creds[key.strip()] = value.strip()
        if "CONSUMER_KEY" not in creds or "CONSUMER_SECRET" not in creds:
            print("ERROR: .env file must contain CONSUMER_KEY and CONSUMER_SECRET", file=sys.stderr)
            sys.exit(1)
        return creds["CONSUMER_KEY"], creds["CONSUMER_SECRET"]

    print("Go to https://secure.splitwise.com/oauth_clients and create an app.")
    consumer_key = input("Enter your Consumer Key: ").strip()
    consumer_secret = input("Enter your Consumer Secret: ").strip()
    return consumer_key, consumer_secret


def get_splitwise_client(env_path: str | None = None) -> SplitwiseAPI:
    """Return an authenticated SplitwiseAPI instance.

    Uses cached token from TOKEN_FILE if it exists; otherwise runs the
    OAuth 1 flow interactively and caches the result.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if TOKEN_FILE.exists():
        with open(TOKEN_FILE) as f:
            token_data = json.load(f)
        api = SplitwiseAPI(token_data["consumer_key"], token_data["consumer_secret"])
        api.set_access_token(token_data["access_token"])
        return api

    consumer_key, consumer_secret = load_credentials(env_path)

    api = SplitwiseAPI(consumer_key, consumer_secret)
    url, oauth_token, oauth_token_secret = api.get_authorize_url()
    print(f"\nOpen this URL in your browser to authorize:\n{url}\n")
    callback = input("Paste the full callback URL from your browser: ").strip()

    qs = parse_qs(urlparse(callback).query)
    oauth_verifier = qs["oauth_verifier"][0]

    access_token = api.get_access_token(oauth_token, oauth_token_secret, oauth_verifier)
    api.set_access_token(access_token)

    token_data = {
        "consumer_key": consumer_key,
        "consumer_secret": consumer_secret,
        "access_token": access_token,
    }
    with open(TOKEN_FILE, "w") as f:
        json.dump(token_data, f, indent=2)

    return api


# ---------------------------------------------------------------------------
# Resolution name -> Splitwise user id
# ---------------------------------------------------------------------------
def build_name_map(api: SplitwiseAPI, people: list[str]) -> dict[str, int]:
    """Return a dict mapping each person's full name to a Splitwise user id."""
    current = api.get_current_user()
    friends = api.get_friends()

    # Build lookup structures.
    all_users = [current] + list(friends)

    # full_name -> [user_dict, ...]
    by_full: dict[str, list] = {}
    # first_name -> [user_dict, ...]
    by_first: dict[str, list] = {}
    for u in all_users:
        full = f"{u['first_name']} {u.get('last_name', '')}".strip()
        by_full.setdefault(full, []).append(u)
        by_first.setdefault(u["first_name"], []).append(u)

    name_map: dict[str, int] = {}

    for person in people:
        # Try exact full-name match first.
        if person in by_full:
            if len(by_full[person]) == 1:
                name_map[person] = by_full[person][0]["id"]
                print(f"  ✓ {person} → Splitwise ID {name_map[person]}")
                continue

        # Try exact first-name match.
        first_name = person.split()[0]
        if first_name in by_first:
            if len(by_first[first_name]) == 1:
                name_map[person] = by_first[first_name][0]["id"]
                print(f"  ✓ {person} → Splitwise ID {name_map[person]} (matched by first name)")
                continue
            else:
                # Multiple matches -- ask user.
                print(f"\n  Multiple Splitwise users match '{person}':")
                for i, u in enumerate(by_first[first_name], 1):
                    print(
                        f"    [{i}] {u['first_name']} {u.get('last_name', '')} "
                        f"(ID {u['id']})"
                    )
                choice = input(f"  Pick 1-{len(by_first[first_name])}: ").strip()
                try:
                    idx = int(choice) - 1
                    name_map[person] = by_first[first_name][idx]["id"]
                except (ValueError, IndexError):
                    print(f"  Invalid choice; asking for manual ID.")
                    mid = input(f"  Enter Splitwise user ID for '{person}': ").strip()
                    name_map[person] = int(mid)
                continue

        # No match at all -- ask manually.
        print(f"\n  Could not find '{person}' in your Splitwise friends.")
        mid = input(f"  Enter Splitwise user ID for '{person}': ").strip()
        name_map[person] = int(mid)

    return name_map


# ---------------------------------------------------------------------------
# Group splits into orders
# ---------------------------------------------------------------------------
def group_orders(splits: list[dict]) -> list[list[dict]]:
    """Group consecutive splits sharing the same platform + date into orders."""
    if not splits:
        return []
    orders = []
    current_order = [splits[0]]
    for item in splits[1:]:
        if (
            item["platform"] == current_order[-1]["platform"]
            and item["date"] == current_order[-1]["date"]
        ):
            current_order.append(item)
        else:
            orders.append(current_order)
            current_order = [item]
    orders.append(current_order)
    return orders


# ---------------------------------------------------------------------------
# Determine the payer for an order
# ---------------------------------------------------------------------------
def infer_payer(order: list[dict], settlements: list[dict]) -> str:
    """Return the name of the person who paid for this order.

    Uses the settlements list: the person receiving money (the "to" field)
    is treated as the payer for every order.  This is a heuristic that works
    when one person fronts all expenses.
    """
    # Every settlement has a "to" — pick the first one.
    if settlements:
        return settlements[0]["to"]
    # Fallback: assume the first person in the first split assignment.
    first_assignments = order[0]["assignments"]
    return list(first_assignments.keys())[0]


# ---------------------------------------------------------------------------
# Summarise an order
# ---------------------------------------------------------------------------
def summarise_order(
    order: list[dict], people: list[str], payer: str, idx: int, total_orders: int
) -> str:
    """Return a multi-line string describing the order and its splits."""
    total = sum(item["price"] for item in order)
    platform = order[0]["platform"]

    # Build per-person owed totals for this order.
    person_owed: dict[str, float] = {p: 0.0 for p in people}
    for item in order:
        for name, amt in item["assignments"].items():
            person_owed[name] = person_owed.get(name, 0.0) + amt

    lines = []
    lines.append(
        f"{'=' * 72}\n"
        f"Order {idx + 1}/{total_orders}: {platform.title()} "
        f"— {order[0]['date']} — ₹{fmt_rs(total)}"
    )
    for item in order:
        parts = [item["item"] + ":"]
        for p in people:
            if p in item["assignments"]:
                parts.append(f" {abbreviated(p)} Rs {fmt_rs(item['assignments'][p])}")
        lines.append("  " + " |".join(parts))
    # Per-person totals line.
    tot_parts = []
    for p in people:
        if person_owed[p] > 0:
            tot_parts.append(f" {abbreviated(p)} Rs {fmt_rs(person_owed[p])}")
    lines.append(f"  ORDER:{' |'.join(tot_parts)}")
    lines.append(f"{'=' * 72}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Build description for Splitwise expense
# ---------------------------------------------------------------------------
def format_title(order):
    """Return a short expense title like 'Blinkit order 07-23 3:19 PM'"""
    platform = order[0]["platform"].replace("_", " ").title()
    date = order[0]["date"]
    dt = datetime.strptime(date, "%Y-%m-%d %I:%M %p")
    return f"{platform} order {dt.strftime('%m-%d %-I:%M %p')}"


def build_itemized_comment(order, people):
    """Return a multi-line string with the itemized split for the comment."""
    lines = ["Itemized split:"]
    for item in order:
        name = item["item"]
        price = item["price"]
        parts = []
        for p in people:
            if p in item["assignments"]:
                parts.append(f"{p}: Rs {fmt_rs(item['assignments'][p])}")
        if parts:
            lines.append(f"  {name} (Rs {fmt_rs(price)}) — {', '.join(parts)}")
        else:
            lines.append(f"  {name} (Rs {fmt_rs(price)}) — unassigned")
    
    # Per-person totals
    person_owed = {p: 0.0 for p in people}
    for item in order:
        for name, amt in item["assignments"].items():
            person_owed[name] = person_owed.get(name, 0.0) + amt
    lines.append("")
    lines.append("Totals:")
    for p in people:
        if person_owed[p] > 0:
            lines.append(f"  {p}: Rs {fmt_rs(person_owed[p])}")
    
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Create an expense
# ---------------------------------------------------------------------------
def push_order(
    api: SplitwiseAPI,
    order: list[dict],
    people: list[str],
    name_map: dict[str, int],
    payer: str,
    dry_run: bool,
    group_id: int = 0,
    currency_code: str = "INR",
) -> tuple[bool, str | None]:
    """Create a Splitwise expense for a single order.

    Returns (True, expense_id) on success, (True, None) on dry-run,
    (False, None) on error.
    """
    total = sum(item["price"] for item in order)
    platform = order[0]["platform"]
    date = order[0]["date"]

    # Per-person owed shares.
    person_owed: dict[str, float] = {p: 0.0 for p in people}
    for item in order:
        for name, amt in item["assignments"].items():
            person_owed[name] = person_owed.get(name, 0.0) + amt

    description = format_title(order)

    if dry_run:
        print(f"  [DRY RUN] Would create expense: ₹{fmt_rs(total)} — {description}")
        return True, None

    data = {
        "cost": fmt_rs(total),
        "description": description,
        "group_id": group_id,
        "currency_code": currency_code,
    }
    for i, person in enumerate(people):
        paid = fmt_rs(total) if person == payer else "0.00"
        owed = fmt_rs(person_owed.get(person, 0.0))
        data[f"users__{i}__user_id"] = str(name_map[person])
        data[f"users__{i}__paid_share"] = paid
        data[f"users__{i}__owed_share"] = owed

    try:
        result = api.create_expense(data)
        eid = result.get("expenses", [{}])[0].get("id")
        print(f"  ✅ Created expense #{eid}")
        if eid:
            comment = build_itemized_comment(order, people)
            api.create_comment(eid, comment)
        return True, str(eid) if eid else None
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Push expense splits to Splitwise"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be created without actually creating expenses.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Path to output.json (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--env",
        default=None,
        help="Path to .env file with CONSUMER_KEY and CONSUMER_SECRET",
    )
    args = parser.parse_args()

    created = 0
    skipped = 0

    # 1. Load data.
    output_path = Path(args.output).expanduser().resolve()
    if not output_path.exists():
        print(f"ERROR: {output_path} not found.", file=sys.stderr)
        sys.exit(1)

    data = load_output(output_path)
    people = data["people"]
    splits = data["splits"]
    settlements = data.get("settlements", [])

    # 2. Group into orders.
    orders = group_orders(splits)
    total_orders = len(orders)
    pushed = load_pushed()
    print(f"Loaded {len(splits)} split items across {total_orders} orders.\n")

    payer = infer_payer(orders[0] if orders else [], settlements)

    if args.dry_run:
        print("=== DRY RUN — no Splitwise connection needed ===\n")
        name_map = {p: 0 for p in people}  # dummy, never used
        api = None
        group_id = 0
        currency_code = "INR"
    else:
        print("Connecting to Splitwise …")
        api = get_splitwise_client(env_path=args.env)

        print("\nResolving people to Splitwise users …")
        name_map = build_name_map(api, people)

        # Fetch and pick group
        groups = api.get_groups()
        print(f"\nFound {len(groups)} groups:")
        for i, g in enumerate(groups, 1):
            members = ", ".join(m.get("first_name", "?") for m in g.get("members", [])[:4])
            print(f"  [{i}] {g['name']} (ID: {g['id']}) — {members}")

        print(f"  [0] No group (non-group expense)")
        choice = input(f"\nSelect group [0-{len(groups)}] (default 0): ").strip()
        try:
            gi = int(choice) if choice else 0
            group_id = groups[gi - 1]["id"] if 1 <= gi <= len(groups) else 0
            group_name = groups[gi - 1]["name"] if 1 <= gi <= len(groups) else "non-group"
        except (ValueError, IndexError):
            group_id = 0
            group_name = "non-group"

        # Currency
        currency_code = input("Currency code [INR]: ").strip().upper() or "INR"

        print(f"\nPushing to: {group_name} | Currency: {currency_code}")
        print(f"Payer (fronting all orders): {payer}")

    for idx, order in enumerate(orders):
        fingerprint = order_fingerprint(order)

        if not args.dry_run and fingerprint in pushed:
            print(f"\n  ⏭️  Already pushed as Splitwise expense #{pushed[fingerprint]} — skipping.")
            skipped += 1
            continue

        print()
        summary = summarise_order(order, people, payer, idx, total_orders)
        print(summary)

        if args.dry_run:
            # Dry-run: show summaries only, auto-"yes" for all
            if push_order(api, order, people, name_map, payer, dry_run=True, group_id=group_id, currency_code=currency_code)[0]:
                created += 1
            continue

        try:
            choice = input("Push to Splitwise? [Y/n/s(kip all)/q(uit)]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nInterrupted.")
            break

        if choice in ("s", "skip all"):
            skipped += total_orders - idx
            break
        if choice in ("q", "quit"):
            break
        if choice in ("", "y"):
            success, eid = push_order(api, order, people, name_map, payer, dry_run=False, group_id=group_id, currency_code=currency_code)
            if success:
                created += 1
                if eid is not None:
                    pushed[fingerprint] = int(eid)
                    save_pushed(pushed)
            else:
                skipped += 1
        else:
            skipped += 1

    print()
    print(f"===\nDone! Created {created} expenses, skipped {skipped}.")


if __name__ == "__main__":
    main()
