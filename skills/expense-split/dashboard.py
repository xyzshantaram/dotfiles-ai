#!/usr/bin/env python3
"""
Expense Split Dashboard

A Tkinter GUI for splitting expenses among 3 people.
Reads a JSON orders file (Blinkit / Zepto / Swiggy Instamart format)
and lets the user assign expense splits per line item.

Usage:
    python dashboard.py [orders.json]

Dependencies: stdlib only (Python 3.8+).
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from tkinter import (
    Tk,
    Toplevel,
    Frame,
    Label,
    Entry,
    Button,
    Checkbutton,
    Radiobutton,
    StringVar,
    IntVar,
    DoubleVar,
    BooleanVar,
    ttk,
    messagebox,
    LEFT,
    RIGHT,
    TOP,
    BOTTOM,
    X,
    Y,
    W,
    E,
    N,
    S,
    DISABLED,
    NORMAL,
    END,
    HORIZONTAL,
)
from tkinter.font import Font


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_date(iso_str):
    """Parse an ISO-8601 date string. Returns a datetime object or None."""
    if not iso_str:
        return None
    try:
        s = iso_str.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def format_date_short(dt):
    """Return a short human-readable date like 'Jul 23, 3:19 PM'."""
    if dt is None:
        return "Unknown date"
    return dt.strftime("%b %d, %I:%M %p").replace(" 0", " ")


def format_date_output(dt):
    """Return a date string for output.json: '2026-07-23 3:19 PM'."""
    if dt is None:
        return ""
    return dt.strftime("%Y-%m-%d %I:%M %p").replace(" 0", " ")


def format_currency(amount):
    """Format a float as an Indian rupee string: '1234.56'."""
    return f"{amount:.2f}"


def fmt_rupee(amount):
    """Return 'Rupee_SignIX.XX' (use the Indian rupee sign)."""
    return f"\u20b9{amount:.2f}"


# ---------------------------------------------------------------------------
# Name dialog
# ---------------------------------------------------------------------------

class NameDialog(Toplevel):
    """Modal dialog to collect names for the 3 people."""

    def __init__(self, parent, defaults=None):
        super().__init__(parent)
        self.title("Set People Names")
        self.result = None
        self.transient(parent)
        self.grab_set()
        self.resizable(False, False)

        if defaults is None:
            defaults = ["Person 1", "Person 2", "Person 3"]

        Label(
            self,
            text="Enter names for the 3 people sharing expenses:",
            font=("", 10, "bold"),
        ).grid(row=0, column=0, columnspan=2, padx=15, pady=(15, 10))

        self._entries = []
        for i in range(3):
            Label(self, text=f"Person {i + 1}:").grid(
                row=i + 1, column=0, padx=10, pady=5, sticky=E
            )
            var = StringVar(value=defaults[i])
            Entry(self, textvariable=var, width=28).grid(
                row=i + 1, column=1, padx=10, pady=5, sticky=W
            )
            self._entries.append(var)

        btn_frame = Frame(self)
        btn_frame.grid(row=4, column=0, columnspan=2, pady=(10, 15))
        Button(btn_frame, text="OK", width=10, command=self._on_ok).pack(
            side=LEFT, padx=5
        )
        Button(btn_frame, text="Cancel", width=10, command=self._on_cancel).pack(
            side=LEFT, padx=5
        )

        self.protocol("WM_DELETE_WINDOW", self._on_cancel)
        self.bind("<Return>", lambda _e: self._on_ok())
        self.bind("<Escape>", lambda _e: self._on_cancel())

        self.update_idletasks()
        x = parent.winfo_rootx() + 60
        y = parent.winfo_rooty() + 60
        self.geometry(f"+{x}+{y}")

        self.wait_window(self)

    def _on_ok(self):
        names = []
        for i, var in enumerate(self._entries):
            name = var.get().strip()
            if not name:
                name = f"Person {i + 1}"
            names.append(name)
        self.result = names
        self.destroy()

    def _on_cancel(self):
        self.result = None
        self.destroy()


# ---------------------------------------------------------------------------
# Payer dialog
# ---------------------------------------------------------------------------

class PayerDialog(Toplevel):
    """Modal dialog to select who originally paid for all orders."""

    def __init__(self, parent, people_names, default=None):
        super().__init__(parent)
        self.title("Who Paid?")
        self.result = None
        self.transient(parent)
        self.grab_set()
        self.resizable(False, False)

        if default is None and people_names:
            default = people_names[0]

        Label(
            self,
            text="Who originally paid for these orders?",
            font=("", 10, "bold"),
        ).grid(row=0, column=0, columnspan=2, padx=15, pady=(15, 10))

        self._payer_var = StringVar(
            value=default if default in people_names else people_names[0]
        )

        self._radio_buttons = []
        for i, name in enumerate(people_names):
            rb = Radiobutton(
                self,
                text=name,
                variable=self._payer_var,
                value=name,
                font=("", 10),
            )
            rb.grid(row=i + 1, column=0, columnspan=2, sticky=W, padx=30, pady=3)
            self._radio_buttons.append(rb)

        btn_frame = Frame(self)
        btn_frame.grid(
            row=len(people_names) + 1, column=0, columnspan=2, pady=(10, 15)
        )
        Button(btn_frame, text="OK", width=10, command=self._on_ok).pack(
            side=LEFT, padx=5
        )
        Button(btn_frame, text="Cancel", width=10, command=self._on_cancel).pack(
            side=LEFT, padx=5
        )

        self.protocol("WM_DELETE_WINDOW", self._on_cancel)
        self.bind("<Return>", lambda _e: self._on_ok())
        self.bind("<Escape>", lambda _e: self._on_cancel())

        self.update_idletasks()
        x = parent.winfo_rootx() + 60
        y = parent.winfo_rooty() + 60
        self.geometry(f"+{x}+{y}")

        self.wait_window(self)

    def _on_ok(self):
        self.result = self._payer_var.get()
        self.destroy()

    def _on_cancel(self):
        self.result = None
        self.destroy()


# ---------------------------------------------------------------------------
# Summary dialog
# ---------------------------------------------------------------------------

class SummaryDialog(Toplevel):
    """Non-modal summary window showing totals and settlements."""

    def __init__(self, parent, people, totals, settlements, payer=None):
        super().__init__(parent)
        self.title("Expense Split — Summary")
        self.resizable(True, True)

        Label(
            self,
            text="Expense Split Summary",
            font=("", 12, "bold"),
        ).pack(pady=(10, 5))

        # Preamble: who paid and how much
        if payer:
            total_paid = sum(totals.values())
            Label(
                self,
                text=f"{payer} paid {fmt_rupee(total_paid)} total. After splitting:",
                font=("", 10),
                wraplength=500,
            ).pack(padx=20, pady=(0, 5), anchor=W)

        # Totals
        totals_frame = Frame(self)
        totals_frame.pack(padx=20, pady=5, fill=X)
        Label(totals_frame, text="Total spend per person:", font=("", 10, "bold")).pack(
            anchor=W
        )
        for name in people:
            amt = totals.get(name, 0.0)
            Label(totals_frame, text=f"  {name}: {fmt_rupee(amt)}").pack(anchor=W)

        # Settlements
        ttk.Separator(self, orient=HORIZONTAL).pack(fill=X, padx=15, pady=10)
        Label(self, text="Settlements:", font=("", 10, "bold")).pack(anchor=W, padx=20)

        if not settlements:
            Label(self, text="  Everyone paid their fair share — no settlements needed.").pack(
                anchor=W, padx=20
            )
        else:
            for s in settlements:
                fr = s["from"]
                to = s["to"]
                amt = s["amount"]
                Label(
                    self, text=f"  {fr} \u2192 {to}: {fmt_rupee(amt)}"
                ).pack(anchor=W, padx=20)

        Button(self, text="Close", command=self.destroy, width=12).pack(
            pady=(10, 10)
        )


# ---------------------------------------------------------------------------
# Main application
# ---------------------------------------------------------------------------

class ExpenseSplitApp:
    """Main Tkinter application for expense splitting."""

    CACHE_DIR = Path.home() / ".cache" / "ordersplit"
    CACHE_FILE = Path.home() / ".cache" / "ordersplit" / "cache.json"
    OUTPUT_FILE = Path.home() / ".cache" / "ordersplit" / "output.json"

    def __init__(self, input_path):
        self.input_path = Path(input_path).resolve()
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)

        # Load and flatten orders
        self.flat_items = self._load_and_flatten()
        if not self.flat_items:
            messagebox.showerror(
                "No Items",
                "No line items were found in the input file.\n"
                f"File: {self.input_path}",
            )
            sys.exit(1)

        # Load or initialise cache
        self.cache = self._load_cache()

        # People names from cache (or ask)
        self.people_names = self._resolve_people_names()

        # Payer from cache (who fronted all the orders)
        self.payer = self.cache.get("payer")

        # Root window
        self.root = Tk()
        self.root.title("Expense Split Dashboard")
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        # Internal state
        self._current_index = self.cache.get("current_index", 0)
        self._assignments = self.cache.get("assignments", {})
        self._skipped = self.cache.get("skipped", {})
        self._updating_ui = False  # guard against recursive UI updates
        self._suppress_autosave = False  # guard during bulk loading

        # Build the UI
        self._build_ui()
        self._bind_keys()

        # Navigate to the saved index (finds first unassigned if resuming)
        self._navigate_to(self._current_index, save_current=False)

        # If no names were set previously, ask now
        if not self.cache.get("people_names"):
            self._ask_names_dialog()

        # If no payer was set (or names changed), ask now
        if not self.payer or self.payer not in self.people_names:
            self._ask_payer_dialog()

        self.root.mainloop()

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def _load_and_flatten(self):
        """Read orders.json and flatten into a list of line items."""
        if not self.input_path.exists():
            messagebox.showerror(
                "File Not Found",
                f"Cannot find input file:\n{self.input_path}",
            )
            sys.exit(1)

        try:
            with open(self.input_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            messagebox.showerror(
                "Parse Error", f"Failed to read {self.input_path}:\n{exc}"
            )
            sys.exit(1)

        orders = data.get("orders", [])
        flat = []
        for order in orders:
            oid = order.get("id", "unknown")
            platform = order.get("platform", "unknown")
            date_str = order.get("date", "")
            paid = float(order.get("paid", 0) or 0)
            fees = order.get("fees", {}) or {}
            items = order.get("items", [])

            for item in items:
                name = item.get("name", "Unknown item")
                price = float(item.get("price", 0) or 0)
                qty = max(1, int(item.get("quantity", 1) or 1))
                estimated = bool(item.get("estimated", False))
                for _ in range(qty):
                    flat.append(
                        {
                            "order_id": oid,
                            "platform": platform,
                            "date": date_str,
                            "order_total": paid,
                            "name": name,
                            "price": price,
                            "estimated": estimated,
                            "is_fee": False,
                            "fee_label": None,
                        }
                    )

            # Append delivery charge
            delivery = float((fees.get("delivery") or 0))
            if delivery > 0.001:
                flat.append(
                    {
                        "order_id": oid,
                        "platform": platform,
                        "date": date_str,
                        "order_total": paid,
                        "name": "[Delivery]",
                        "price": delivery,
                        "estimated": False,
                        "is_fee": True,
                        "fee_label": "Delivery",
                    }
                )

            # Append packaging charge
            packaging = float((fees.get("packaging") or 0))
            if packaging > 0.001:
                flat.append(
                    {
                        "order_id": oid,
                        "platform": platform,
                        "date": date_str,
                        "order_total": paid,
                        "name": "[Packaging]",
                        "price": packaging,
                        "estimated": False,
                        "is_fee": True,
                        "fee_label": "Packaging",
                    }
                )

        return flat

    # ------------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------------

    def _load_cache(self):
        """Load the cache file. Return empty dict if missing or corrupt."""
        if not self.CACHE_FILE.exists():
            return {}
        try:
            with open(self.CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}

        # Check that the cached item count matches current data
        cached_count = len(cache.get("assignments", {}))
        # If resume was stored but item count changed, offer to resume
        # We handle this in _resolve_people_names / init
        return cache

    def _save_cache(self):
        """Write current state to the cache file."""
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_data = {
            "current_index": self._current_index,
            "assignments": self._assignments,
            "skipped": self._skipped,
            "people_names": self.people_names,
            "payer": self.payer,
        }
        with open(self.CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, indent=2, ensure_ascii=False)

    def _resolve_people_names(self):
        """Get people names from cache, ask if needed, or use defaults."""
        cached_names = self.cache.get("people_names")

        # If we have cache with names, check if we should offer to resume
        if cached_names and len(cached_names) == 3:
            # Offer resume if there are saved assignments
            if self._assignments:
                root_temp = Tk()
                root_temp.withdraw()
                want_resume = messagebox.askyesno(
                    "Resume?",
                    f"Found a saved session with {len(self._assignments)} assigned items.\n"
                    "Resume from where you left off?",
                )
                root_temp.destroy()
                if want_resume:
                    # Find the first unassigned and unskipped index
                    assigned_idx = set(int(k) for k in self._assignments.keys())
                    skipped_idx = set(int(k) for k in self._skipped.keys())
                    taken = assigned_idx | skipped_idx
                    for i in range(len(self.flat_items)):
                        if i not in taken:
                            self._current_index = i
                            break
                    else:
                        self._current_index = 0
                else:
                    # Start fresh
                    self._assignments = {}
                    self._skipped = {}
                    self._current_index = 0
            return cached_names

        # No valid cache names — will ask via dialog after UI is built
        return ["Person 1", "Person 2", "Person 3"]

    def _ask_names_dialog(self):
        """Show the name dialog (called after root is created)."""
        dialog = NameDialog(self.root, defaults=self.people_names)
        if dialog.result:
            self.people_names = dialog.result
        self.cache["people_names"] = self.people_names
        self._save_cache()
        # Refresh the checkbutton labels
        for i, name in enumerate(self.people_names):
            self._check_buttons[i].configure(text=name)

    def _ask_payer_dialog(self):
        """Show the payer dialog (called after root is created)."""
        dialog = PayerDialog(self.root, self.people_names, default=self.payer)
        if dialog.result:
            self.payer = dialog.result
        if not self.payer:
            self.payer = self.people_names[0]
        self.cache["payer"] = self.payer
        self._save_cache()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        """Create all the widgets."""
        root = self.root
        root.geometry("680x580")
        root.minsize(600, 500)

        # Row 0 — Title
        self._title_var = StringVar()
        title_label = Label(
            root,
            textvariable=self._title_var,
            font=("", 13, "bold"),
            anchor=W,
        )
        title_label.grid(row=0, column=0, columnspan=2, sticky=W + E, padx=15, pady=(10, 0))

        ttk.Separator(root, orient=HORIZONTAL).grid(
            row=1, column=0, columnspan=2, sticky=W + E, padx=10, pady=(5, 0)
        )

        # Row 2 — Order context
        self._context_var = StringVar()
        context_label = Label(
            root,
            textvariable=self._context_var,
            font=("", 10),
            anchor=W,
            fg="#444444",
        )
        context_label.grid(row=2, column=0, columnspan=2, sticky=W + E, padx=15, pady=(5, 0))

        # Row 3 — Skipped indicator (hidden by default)
        self._skipped_var = StringVar()
        self._skipped_label = Label(
            root,
            textvariable=self._skipped_var,
            font=("", 10, "bold"),
            fg="#cc3300",
            anchor=W,
        )
        self._skipped_label.grid(row=3, column=0, columnspan=2, sticky=W + E, padx=15, pady=(5, 0))
        self._skipped_label.grid_remove()

        # Row 4 — Item + estimated flag
        self._item_var = StringVar()
        item_label = Label(
            root,
            textvariable=self._item_var,
            font=("", 11, "bold"),
            anchor=W,
        )
        item_label.grid(row=4, column=0, sticky=W + E, padx=15, pady=(5, 0))

        self._estimated_var = StringVar()
        self._estimated_label = Label(
            root,
            textvariable=self._estimated_var,
            font=("", 9, "italic"),
            fg="#cc6600",
            anchor=W,
        )
        self._estimated_label.grid(row=4, column=1, sticky=W, padx=(0, 15), pady=(5, 0))

        ttk.Separator(root, orient=HORIZONTAL).grid(
            row=5, column=0, columnspan=2, sticky=W + E, padx=10, pady=(8, 0)
        )

        # Row 6 — Split type label
        Label(
            root,
            text="Split type:",
            font=("", 10, "bold"),
        ).grid(row=6, column=0, columnspan=2, sticky=W, padx=15, pady=(10, 2))

        # Row 7 — Split type radio buttons
        self._split_type_var = StringVar(value="equal")
        radio_frame = Frame(root)
        radio_frame.grid(row=7, column=0, columnspan=2, sticky=W, padx=15)

        self._radio_equal = Radiobutton(
            radio_frame,
            text="Equal",
            variable=self._split_type_var,
            value="equal",
            command=self._on_split_type_change,
        )
        self._radio_equal.pack(side=LEFT, padx=(0, 10))

        self._radio_percent = Radiobutton(
            radio_frame,
            text="Percentage",
            variable=self._split_type_var,
            value="percentage",
            command=self._on_split_type_change,
        )
        self._radio_percent.pack(side=LEFT, padx=(0, 10))

        self._radio_custom = Radiobutton(
            radio_frame,
            text="Custom",
            variable=self._split_type_var,
            value="custom",
            command=self._on_split_type_change,
        )
        self._radio_custom.pack(side=LEFT, padx=(0, 10))

        self._radio_single = Radiobutton(
            radio_frame,
            text="Single Payer",
            variable=self._split_type_var,
            value="single",
            command=self._on_split_type_change,
        )
        self._radio_single.pack(side=LEFT)

        self._radio_buttons = [
            self._radio_equal,
            self._radio_percent,
            self._radio_custom,
            self._radio_single,
        ]

        ttk.Separator(root, orient=HORIZONTAL).grid(
            row=8, column=0, columnspan=2, sticky=W + E, padx=10, pady=(8, 0)
        )

        # Rows 9-11 — People rows
        self._people_frame = Frame(root)
        self._people_frame.grid(row=9, column=0, columnspan=2, sticky=W + E, padx=15, pady=(8, 0))

        self._checked_vars = []
        self._value_vars = []
        self._check_buttons = []
        self._value_entries = []
        self._value_labels = []  # unit label ("%" or "₹") next to entry
        self._people_labels = []  # "Person N:" label

        for i in range(3):
            row_frame = Frame(self._people_frame)
            row_frame.pack(fill=X, pady=3)

            checked_var = BooleanVar(value=False)
            self._checked_vars.append(checked_var)

            cb = Checkbutton(
                row_frame,
                text=self.people_names[i],
                variable=checked_var,
                command=self._on_checkbox_change,
                font=("", 10),
                width=18,
                anchor=W,
            )
            cb.pack(side=LEFT)
            self._check_buttons.append(cb)

            value_var = StringVar(value="")
            self._value_vars.append(value_var)

            # Unit label (changes based on mode)
            unit_label = Label(row_frame, text="", font=("", 10))
            unit_label.pack(side=LEFT, padx=(5, 0))
            self._value_labels.append(unit_label)

            entry = Entry(
                row_frame,
                textvariable=value_var,
                width=12,
                state=DISABLED,
                justify=RIGHT,
            )
            entry.pack(side=LEFT, padx=(2, 0))
            self._value_entries.append(entry)

        # Row 10 — Validation message
        self._validation_var = StringVar()
        validation_label = Label(
            root,
            textvariable=self._validation_var,
            font=("", 9),
            fg="#cc0000",
            anchor=W,
            wraplength=650,
        )
        validation_label.grid(row=10, column=0, columnspan=2, sticky=W + E, padx=15, pady=(5, 0))

        # Row 11 — Progress bar
        progress_frame = Frame(root)
        progress_frame.grid(row=11, column=0, columnspan=2, sticky=W + E, padx=15, pady=(10, 0))

        self._progress_bar = ttk.Progressbar(
            progress_frame,
            orient=HORIZONTAL,
            mode="determinate",
            maximum=max(1, len(self.flat_items)),
        )
        self._progress_bar.pack(side=LEFT, fill=X, expand=True)

        self._remaining_var = StringVar()
        remaining_label = Label(
            progress_frame,
            textvariable=self._remaining_var,
            font=("", 9),
            width=36,
            anchor=E,
        )
        remaining_label.pack(side=RIGHT, padx=(10, 0))

        # Row 12 — Navigation buttons
        ttk.Separator(root, orient=HORIZONTAL).grid(
            row=12, column=0, columnspan=2, sticky=W + E, padx=10, pady=(10, 0)
        )

        btn_frame = Frame(root)
        btn_frame.grid(row=13, column=0, columnspan=2, sticky=W + E, padx=15, pady=(8, 15))
        btn_frame.columnconfigure(3, weight=1)

        self._prev_btn = Button(
            btn_frame,
            text="\u25c0 Previous",
            command=self._prev_item,
            width=12,
        )
        self._prev_btn.grid(row=0, column=0, padx=(0, 4))

        self._skip_btn = Button(
            btn_frame,
            text="Skip this item",
            command=self._toggle_skip_item,
            width=13,
        )
        self._skip_btn.grid(row=0, column=1, padx=4)

        self._next_btn = Button(
            btn_frame,
            text="Next \u25b6",
            command=self._next_item,
            width=12,
        )
        self._next_btn.grid(row=0, column=2, padx=4)

        # Spacer
        Label(btn_frame, text="").grid(row=0, column=3, sticky=W + E)

        self._save_btn = Button(
            btn_frame,
            text="Save & Quit",
            command=self._save_and_quit,
            width=12,
        )
        self._save_btn.grid(row=0, column=4, padx=4)

        self._finish_btn = Button(
            btn_frame,
            text="Finish & Export",
            command=self._finish_and_export,
            width=14,
            bg="#4a7",
            fg="white",
            font=("", 10, "bold"),
        )
        self._finish_btn.grid(row=0, column=5, padx=(4, 0))

        # Trace value vars for auto-save
        for var in self._value_vars:
            var.trace_add("write", lambda *_: self._schedule_autosave())
        self._split_type_var.trace_add("write", lambda *_: self._schedule_autosave())
        for var in self._checked_vars:
            var.trace_add("write", lambda *_: self._schedule_autosave())

        self._autosave_after_id = None

    # ------------------------------------------------------------------
    # Key bindings
    # ------------------------------------------------------------------

    def _bind_keys(self):
        root = self.root
        root.bind("<Control-s>", lambda _e: self._force_save())
        root.bind("<Control-q>", lambda _e: self._save_and_quit())
        root.bind("<Escape>", lambda _e: self._prev_item())
        root.bind("<Control-n>", lambda _e: self._next_item())
        root.bind("<Control-p>", lambda _e: self._prev_item())

    # ------------------------------------------------------------------
    # UI refresh
    # ------------------------------------------------------------------

    def _navigate_to(self, index, save_current=True):
        """Navigate to a specific flat item index."""
        if save_current:
            self._save_current_assignment()

        index = max(0, min(index, len(self.flat_items) - 1))
        self._current_index = index
        self._suppress_autosave = True
        self._refresh_ui()
        self._suppress_autosave = False
        self._save_cache()

    def _refresh_ui(self):
        """Update all UI elements for the current item."""
        self._updating_ui = True

        total = len(self.flat_items)
        idx = self._current_index
        item = self.flat_items[idx]

        # Title
        self._title_var.set(f"Expense Split \u2014 Item {idx + 1} of {total}")

        # Order context
        platform = item["platform"].title()
        dt = parse_date(item["date"])
        date_str = format_date_short(dt) if dt else "Unknown date"
        order_total = item["order_total"]
        self._context_var.set(
            f"{platform} \u2014 {date_str} \u2014 Order total {fmt_rupee(order_total)}"
        )

        # Item name + price
        name = item["name"]
        price = item["price"]
        if item.get("is_fee"):
            self._item_var.set(f'{name} \u2014 {fmt_rupee(price)}')
        else:
            self._item_var.set(f'\u201c{name}\u201d \u2014 {fmt_rupee(price)}')

        # Estimated flag
        if item.get("estimated"):
            self._estimated_var.set("\u26a0 estimated")
            self._estimated_label.configure(fg="#cc6600")
        else:
            self._estimated_var.set("")
            self._estimated_label.configure(fg="#666666")

        # Load saved assignment or reset
        str_idx = str(idx)
        if str_idx in self._assignments:
            self._load_assignment(self._assignments[str_idx])
        else:
            self._reset_controls()

        # Handle skip state
        is_skipped = str_idx in self._skipped
        if is_skipped:
            self._skipped_var.set("\u26a0 SKIPPED \u2014 this item will be excluded from totals")
            self._skipped_label.configure(fg="#cc3300")
            self._skipped_label.grid()
            self._estimated_var.set("")
            self._estimated_label.configure(fg="#666666")
            self._set_skip_ui_state(True)
            self._skip_btn.configure(text="Unskip")
        else:
            self._skipped_label.grid_remove()
            self._set_skip_ui_state(False)
            self._skip_btn.configure(text="Skip this item")

        # Update progress
        assigned_count = len(self._assignments)
        skipped_count = len(self._skipped)
        self._progress_bar["value"] = assigned_count + skipped_count
        remaining = total - assigned_count - skipped_count
        self._remaining_var.set(
            f"{assigned_count} assigned, {skipped_count} skipped, {remaining} left"
        )

        # Update button states
        if idx == 0:
            self._prev_btn.configure(state=DISABLED)
        else:
            self._prev_btn.configure(state=NORMAL)

        if idx >= total - 1:
            self._next_btn.configure(state=DISABLED)
        else:
            self._next_btn.configure(state=NORMAL)

        # Refresh checkbutton labels in case names changed
        for i, name in enumerate(self.people_names):
            self._check_buttons[i].configure(text=name)

        # Apply mode-specific UI (skip for skipped items)
        if not is_skipped:
            self._apply_mode()

        self._updating_ui = False

    def _load_assignment(self, assignment):
        """Load saved assignment into UI controls."""
        split_type = assignment.get("split_type", "equal")
        self._split_type_var.set(split_type)

        selected = assignment.get("people", [])
        amounts = assignment.get("amounts", {})

        for i, name in enumerate(self.people_names):
            checked = name in selected
            self._checked_vars[i].set(checked)
            amt = amounts.get(name, 0.0)

            if split_type == "equal":
                self._value_vars[i].set(fmt_rupee(amt))
            elif split_type == "percentage":
                # Compute percentage from amount and item price
                item_price = self.flat_items[self._current_index]["price"]
                if item_price > 0:
                    pct = round(amt / item_price * 100)
                else:
                    pct = 0
                self._value_vars[i].set(str(pct) if checked else "")
            elif split_type == "custom":
                self._value_vars[i].set(f"{amt:.2f}" if checked else "")
            else:  # single
                self._value_vars[i].set(fmt_rupee(amt))

    def _reset_controls(self):
        """Reset UI controls to defaults for a fresh item."""
        self._split_type_var.set("equal")
        for i in range(3):
            self._checked_vars[i].set(False)
            self._value_vars[i].set("")

    def _set_skip_ui_state(self, skipped):
        """Enable or disable the split controls based on skip state."""
        state = DISABLED if skipped else NORMAL
        for rb in self._radio_buttons:
            rb.configure(state=state)
        for cb in self._check_buttons:
            cb.configure(state=state)
        for entry in self._value_entries:
            entry.configure(state=DISABLED if skipped else "readonly")

    def _apply_mode(self):
        """Update entry states and labels based on current split type."""
        mode = self._split_type_var.get()
        item_price = self.flat_items[self._current_index]["price"]
        checked = [v.get() for v in self._checked_vars]

        for i in range(3):
            entry = self._value_entries[i]
            unit = self._value_labels[i]

            if mode == "equal":
                unit.configure(text="")
                if checked[i]:
                    entry.configure(state="readonly")
                else:
                    entry.configure(state=DISABLED)
            elif mode == "percentage":
                unit.configure(text="%")
                if checked[i]:
                    entry.configure(state=NORMAL)
                else:
                    entry.configure(state=DISABLED)
            elif mode == "custom":
                unit.configure(text="\u20b9")
                if checked[i]:
                    entry.configure(state=NORMAL)
                else:
                    entry.configure(state=DISABLED)
            else:  # single
                unit.configure(text="")
                if checked[i]:
                    entry.configure(state="readonly")
                else:
                    entry.configure(state=DISABLED)

        # Compute display values
        self._compute_display()

    # ------------------------------------------------------------------
    # Computation
    # ------------------------------------------------------------------

    def _compute_display(self):
        """Compute and update read-only display values for Equal / Single mode."""
        mode = self._split_type_var.get()
        checked = [v.get() for v in self._checked_vars]
        item_price = self.flat_items[self._current_index]["price"]
        num_selected = sum(1 for c in checked if c)

        if mode == "equal":
            if num_selected > 0:
                share = item_price / num_selected
            else:
                share = 0.0
            for i in range(3):
                if checked[i]:
                    self._value_vars[i].set(fmt_rupee(share))
                elif self._value_vars[i].get() != "":
                    self._value_vars[i].set("")

        elif mode == "single":
            for i in range(3):
                if checked[i]:
                    self._value_vars[i].set(fmt_rupee(item_price))
                elif self._value_vars[i].get() != "":
                    self._value_vars[i].set("")

        # For percentage and custom modes, the user enters values directly.
        # We still want to update the validation message.
        self._update_validation()

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _update_validation(self):
        """Update the validation message and return True if valid."""
        mode = self._split_type_var.get()
        checked = [v.get() for v in self._checked_vars]
        num_checked = sum(1 for c in checked if c)
        item_price = self.flat_items[self._current_index]["price"]

        self._validation_var.set("")

        if mode == "equal":
            if num_checked == 0:
                self._validation_var.set("Select at least one person to split with.")
                return False
            return True

        elif mode == "percentage":
            if num_checked == 0:
                self._validation_var.set("Select at least one person.")
                return False
            total_pct = 0
            for i in range(3):
                if checked[i]:
                    val = self._value_vars[i].get().strip()
                    if not val:
                        self._validation_var.set("Enter percentages for all selected people.")
                        return False
                    try:
                        pct = int(val)
                    except ValueError:
                        self._validation_var.set("Percentages must be whole numbers.")
                        return False
                    if pct < 0:
                        self._validation_var.set("Percentages cannot be negative.")
                        return False
                    total_pct += pct
            if total_pct != 100:
                self._validation_var.set(
                    f"Percentages must sum to 100 (currently {total_pct})."
                )
                return False
            return True

        elif mode == "custom":
            if num_checked == 0:
                self._validation_var.set("Select at least one person.")
                return False
            total_amt = 0.0
            for i in range(3):
                if checked[i]:
                    val = self._value_vars[i].get().strip()
                    if not val:
                        self._validation_var.set("Enter amounts for all selected people.")
                        return False
                    try:
                        amt = float(val)
                    except ValueError:
                        self._validation_var.set("Amounts must be numbers (e.g. 120.50).")
                        return False
                    if amt < 0:
                        self._validation_var.set("Amounts cannot be negative.")
                        return False
                    total_amt += amt
            if abs(total_amt - item_price) > 0.51:
                self._validation_var.set(
                    f"Amounts must sum to {fmt_rupee(item_price)} "
                    f"(currently {fmt_rupee(total_amt)})."
                )
                return False
            return True

        else:  # single
            if num_checked != 1:
                self._validation_var.set("Select exactly one person.")
                return False
            return True

    def _is_valid(self):
        """Check if the current assignment is valid."""
        return self._update_validation()

    # ------------------------------------------------------------------
    # Assignment save / load
    # ------------------------------------------------------------------

    def _save_current_assignment(self):
        """Save the current UI state as an assignment for the current item."""
        if not self._is_valid():
            return

        mode = self._split_type_var.get()
        checked = [v.get() for v in self._checked_vars]
        item_price = self.flat_items[self._current_index]["price"]

        selected = [self.people_names[i] for i in range(3) if checked[i]]
        amounts = {}

        if mode == "equal":
            num_sel = len(selected)
            share = item_price / num_sel if num_sel > 0 else 0.0
            for name in selected:
                amounts[name] = round(share, 2)
            # Distribute rounding error to last person
            if num_sel > 0:
                total_rounded = sum(amounts.values())
                diff = round(item_price - total_rounded, 2)
                amounts[selected[-1]] = round(amounts[selected[-1]] + diff, 2)

        elif mode == "percentage":
            for i in range(3):
                if checked[i]:
                    name = self.people_names[i]
                    pct = int(self._value_vars[i].get().strip())
                    amounts[name] = round(item_price * pct / 100.0, 2)
            # Fix rounding
            total_rounded = sum(amounts.values())
            diff = round(item_price - total_rounded, 2)
            if abs(diff) > 0.001 and selected:
                amounts[selected[-1]] = round(amounts[selected[-1]] + diff, 2)

        elif mode == "custom":
            for i in range(3):
                if checked[i]:
                    name = self.people_names[i]
                    amounts[name] = float(self._value_vars[i].get().strip())

        else:  # single
            for i in range(3):
                if checked[i]:
                    name = self.people_names[i]
                    amounts[name] = item_price
                    break

        assignment = {
            "split_type": mode,
            "people": selected,
            "amounts": amounts,
        }
        self._assignments[str(self._current_index)] = assignment
        # Unskip this item if it was previously skipped
        self._skipped.pop(str(self._current_index), None)

    def _schedule_autosave(self):
        """Debounced auto-save triggered by field changes."""
        if self._suppress_autosave or self._updating_ui:
            return
        # Cancel any pending autosave
        if self._autosave_after_id:
            self.root.after_cancel(self._autosave_after_id)
        self._autosave_after_id = self.root.after(300, self._autosave_tick)

    def _autosave_tick(self):
        """Perform the deferred auto-save."""
        self._autosave_after_id = None
        if self._is_valid():
            self._save_current_assignment()
            self._save_cache()
            # Update progress after save
            assigned_count = len(self._assignments)
            skipped_count = len(self._skipped)
            self._progress_bar["value"] = assigned_count + skipped_count
            remaining = len(self.flat_items) - assigned_count - skipped_count
            self._remaining_var.set(
                f"{assigned_count} assigned, {skipped_count} skipped, {remaining} left"
            )

    def _force_save(self):
        """Force save the current assignment and cache."""
        if self._is_valid():
            self._save_current_assignment()
        self._save_cache()
        self._validation_var.set("Saved.")

    # ------------------------------------------------------------------
    # Checkbox change handler (for single-payer radio behavior)
    # ------------------------------------------------------------------

    def _on_checkbox_change(self):
        """Handle checkbox toggle. Enforce single-selection in 'single' mode."""
        if self._updating_ui:
            return
        mode = self._split_type_var.get()
        if mode == "single":
            self._updating_ui = True
            changed = False
            checked = [v.get() for v in self._checked_vars]
            num_checked = sum(1 for c in checked if c)

            if num_checked > 1:
                # Uncheck all but the most recently checked one.
                # Since we cannot easily know which was clicked last,
                # we uncheck all and only keep the first checked.
                found = False
                for i in range(3):
                    if checked[i] and not found:
                        found = True
                    elif checked[i]:
                        self._checked_vars[i].set(False)
            self._updating_ui = False

        self._apply_mode()

    def _on_split_type_change(self):
        """Handle split type radio button change."""
        if self._updating_ui:
            return
        self._apply_mode()

    # ------------------------------------------------------------------
    # Navigation
    # ------------------------------------------------------------------

    def _prev_item(self):
        if self._current_index > 0:
            self._save_current_assignment()
            self._navigate_to(self._current_index - 1, save_current=False)

    def _next_item(self):
        if self._current_index < len(self.flat_items) - 1:
            self._navigate_to(self._current_index + 1, save_current=True)

    def _toggle_skip_item(self):
        """Toggle the skip state for the current item."""
        str_idx = str(self._current_index)
        if str_idx in self._skipped:
            # Unskip: remove from skipped, stay on item for assignment
            del self._skipped[str_idx]
            self._save_cache()
            self._refresh_ui()
        else:
            # Skip: clear any assignment, mark as skipped, advance
            self._assignments.pop(str_idx, None)
            self._skipped[str_idx] = True
            self._save_cache()
            if self._current_index < len(self.flat_items) - 1:
                self._navigate_to(self._current_index + 1, save_current=False)
            else:
                self._refresh_ui()

    # ------------------------------------------------------------------
    # Save & Quit / Finish & Export
    # ------------------------------------------------------------------

    def _save_and_quit(self):
        """Save cache and exit."""
        if self._is_valid():
            self._save_current_assignment()
        self._save_cache()
        self.root.destroy()

    def _finish_and_export(self):
        """Check all items are assigned or skipped, export output.json, show summary."""
        # Try to save current assignment first
        if self._is_valid():
            self._save_current_assignment()

        total = len(self.flat_items)
        assigned = len(self._assignments)
        skipped = len(self._skipped)
        if assigned + skipped < total:
            missing = total - assigned - skipped
            missing_indices = sorted(
                i for i in range(total)
                if str(i) not in self._assignments and str(i) not in self._skipped
            )
            # Show the first few missing indices
            preview = ", ".join(str(x + 1) for x in missing_indices[:10])
            if len(missing_indices) > 10:
                preview += f", ... ({len(missing_indices)} total)"
            messagebox.showwarning(
                "Incomplete",
                f"{missing} item(s) are not yet assigned or skipped.\n\n"
                f"Unassigned items: {preview}\n\n"
                "Assign or skip all items before exporting.",
            )
            return

        self._save_cache()

        # Build output
        now_iso = datetime.now(timezone.utc).isoformat()
        splits = []
        totals = {name: 0.0 for name in self.people_names}

        for i in range(total):
            if str(i) in self._skipped:
                continue
            item = self.flat_items[i]
            assignment = self._assignments[str(i)]
            dt = parse_date(item["date"])
            date_out = format_date_output(dt) if dt else item["date"]

            split_entry = {
                "item": item["name"],
                "platform": item["platform"],
                "date": date_out,
                "price": item["price"],
                "split_type": assignment["split_type"],
                "assignments": assignment["amounts"],
            }
            splits.append(split_entry)

            for name, amt in assignment["amounts"].items():
                totals[name] = round(totals[name] + amt, 2)

        # Compute settlements
        settlements = _compute_settlements(self.people_names, totals, self.payer)

        output = {
            "split_at": now_iso,
            "people": self.people_names,
            "splits": splits,
            "totals": {name: round(amt, 2) for name, amt in totals.items()},
            "settlements": settlements,
        }

        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with open(self.OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        # Show summary
        SummaryDialog(self.root, self.people_names, totals, settlements, payer=self.payer)

    # ------------------------------------------------------------------
    # Window close
    # ------------------------------------------------------------------

    def _on_close(self):
        """Auto-save on window close."""
        if self._is_valid():
            self._save_current_assignment()
        self._save_cache()
        self.root.destroy()


# ---------------------------------------------------------------------------
# Terminal summary (--summary flag)
# ---------------------------------------------------------------------------

def print_summary(orders_path):
    """Read orders.json and output.json, print a terminal summary grouped by order."""
    from collections import OrderedDict

    output_path = Path.home() / ".cache" / "ordersplit" / "output.json"

    if not output_path.exists():
        print(f"Error: output.json not found at {output_path}", file=sys.stderr)
        sys.exit(1)

    # Read orders.json
    try:
        with open(orders_path, "r", encoding="utf-8") as f:
            orders_data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"Error reading {orders_path}: {exc}", file=sys.stderr)
        sys.exit(1)

    # Read output.json
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            output_data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"Error reading {output_path}: {exc}", file=sys.stderr)
        sys.exit(1)

    # Build order metadata lookup: (platform, formatted_date) -> meta
    order_meta = {}
    for order in orders_data.get("orders", []):
        dt = parse_date(order.get("date", ""))
        if dt is None:
            continue
        formatted_date = dt.strftime("%Y-%m-%d %-I:%M %p")
        key = (order.get("platform", "").lower(), formatted_date)
        order_meta[key] = {
            "id": order.get("id", "unknown"),
            "paid": float(order.get("paid", 0) or 0),
            "platform": order.get("platform", "unknown").title(),
            "display_date": dt.strftime("%b %d %-I:%M %p"),
        }

    people = output_data.get("people", [])
    totals = output_data.get("totals", {})

    # Group splits by (platform, date)
    order_groups = OrderedDict()
    for split in output_data.get("splits", []):
        key = (split.get("platform", "").lower(), split.get("date", ""))
        if key not in order_groups:
            order_groups[key] = []
        order_groups[key].append(split)

    # Sort groups chronologically
    sorted_keys = sorted(order_groups.keys(), key=lambda k: k[1])

    COL_W = 11  # price column width

    for key in sorted_keys:
        splits_in_group = order_groups[key]
        meta = order_meta.get(key)
        if meta is None:
            continue

        # Order header
        print("=" * 80)
        print(
            f"{meta['platform']} \u2014 {meta['display_date']} \u2014 "
            f"order {meta['id']} \u2014 paid Rs {meta['paid']:.2f}"
        )
        print("=" * 80)

        # Column headers
        header = f"  {'Item': <56} {'Full': >{COL_W}}"
        for p in people:
            header += f" {p: >{COL_W}}"
        print(header)

        # Separator line
        sep = f"  {'-' * 56} {'-' * COL_W}"
        for _ in people:
            sep += f" {'-' * COL_W}"
        print(sep)

        # Per-person order totals
        order_totals = {p: 0.0 for p in people}

        # Item rows
        for split in splits_in_group:
            item_name = split["item"]
            price = split["price"]
            assignments = split.get("assignments", {})

            if len(item_name) > 56:
                item_name = item_name[:53] + "..."

            full_str = f"Rs {price:.2f}"
            full_col = f"{full_str: >{COL_W}}"

            person_cols = []
            for p in people:
                if p in assignments:
                    amt = assignments[p]
                    person_cols.append(f"Rs {amt:.2f}")
                    order_totals[p] += amt
                else:
                    person_cols.append("-")

            line = f"  {item_name: <56} {full_col}"
            for pc in person_cols:
                line += f" {pc: >{COL_W}}"
            print(line)

        # Footer separator
        print(f"  {'-' * 56} {'-' * COL_W}" + "".join(f" {'-' * COL_W}" for _ in people))

        # ORDER TOTAL row
        total_line = f"  {'ORDER TOTAL': <56} {'': >{COL_W}}"
        for p in people:
            amt = order_totals[p]
            total_line += f" {f'Rs {amt:.2f}': >{COL_W}}"
        print(total_line)

    # Grand total
    print("=" * 80)
    grand_line = f"  {'GRAND TOTAL': <56} {'': >{COL_W}}"
    for p in people:
        amt = totals.get(p, 0.0)
        grand_line += f" {f'Rs {amt:,.2f}': >{COL_W}}"
    print(grand_line)
    print("=" * 80)


# ---------------------------------------------------------------------------
# Settlement computation
# ---------------------------------------------------------------------------

def _compute_settlements(people, totals, payer=None):
    """
    Compute settlement instructions.

    The payer fronted all the money. Each non-payer sends their full
    assigned total to the payer. The payer keeps their own assigned
    amount (they already paid it up front).
    """
    if payer is None:
        payer = people[0] if people else ""

    settlements = []
    for name in people:
        if name == payer:
            continue
        amount = round(totals.get(name, 0.0), 2)
        if amount > 0.001:
            settlements.append(
                {"from": name, "to": payer, "amount": amount}
            )
    return settlements


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Expense Split Dashboard — split expenses among 3 people."
    )
    parser.add_argument(
        "input_file",
        nargs="?",
        default="orders.json",
        help="Path to the orders JSON file (default: orders.json in CWD).",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print terminal summary from output.json and exit.",
    )
    args = parser.parse_args()

    if args.summary:
        print_summary(args.input_file)
        return

    ExpenseSplitApp(args.input_file)


if __name__ == "__main__":
    main()
