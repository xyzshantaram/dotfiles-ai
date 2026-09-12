// Cliffy UI kit: shared banner, tree rows, legend, and prompts.
// This file has no split-utils imports. It stays clean for reuse.

import { Confirm } from "cliffy-confirm";
import { Select } from "cliffy-select";

// Two-space indent for every body line.
export const INDENT = "  ";

// Color stays on only for a live terminal without NO_COLOR.
function useColor(): boolean {
  return Deno.stdout.isTerminal() && Deno.env.get("NO_COLOR") === undefined;
}

// Wrap text in bold. Return it plain when color is off.
export function B(text: string): string {
  if (!useColor()) return text;
  return `\x1b[1m${text}\x1b[0m`;
}

// Wrap text in dim. Return it plain when color is off.
export function DIM(text: string): string {
  if (!useColor()) return text;
  return `\x1b[2m${text}\x1b[0m`;
}

// Wrap text in yellow. Return it plain when color is off.
export function YELLOW(text: string): string {
  if (!useColor()) return text;
  return `\x1b[33m${text}\x1b[0m`;
}

// Wrap text in green. Return it plain when color is off.
export function GREEN(text: string): string {
  if (!useColor()) return text;
  return `\x1b[32m${text}\x1b[0m`;
}

// Wrap text in blue. Return it plain when color is off.
export function BLUE(text: string): string {
  if (!useColor()) return text;
  return `\x1b[34m${text}\x1b[0m`;
}

// Wrap text in orange (256-color). Return it plain when color is off.
export function ORANGE(text: string): string {
  if (!useColor()) return text;
  return `\x1b[38;5;208m${text}\x1b[0m`;
}

// Wrap text in white. Return it plain when color is off.
// White vanishes on light themes. Use it only where the user asked.
export function WHITE(text: string): string {
  if (!useColor()) return text;
  return `\x1b[37m${text}\x1b[0m`;
}

// Build the progress line: color-coded labels, bold white counts.
export function renderProgress(assigned: number, skipped: number, left: number): string {
  return `${INDENT}Progress: ${BLUE("Assigned")} ${B(WHITE(String(assigned)))}, ` +
    `${ORANGE("Skipped")} ${B(WHITE(String(skipped)))}, ` +
    `${WHITE("Left")} ${B(WHITE(String(left)))}.`;
}
// Width of the terminal for the rule. Fall back to 80.
function termWidth(): number {
  try {
    const cols = Deno.consoleSize().columns;
    return cols >= 40 ? cols : 80;
  } catch {
    return 80;
  }
}

// Build the banner text: blank line, bold blue title, dim rule, blank line.
export function renderBanner(title: string): string {
  const color = useColor();
  const head = color ? "\x1b[1m\x1b[34m" : "";
  const dim = color ? "\x1b[2m" : "";
  const reset = color ? "\x1b[0m" : "";
  const lines: string[] = [""];
  for (const line of title.split("\n")) {
    lines.push(`${head}${INDENT}${line}${reset}`);
  }
  const rule = "-".repeat(Math.min(48, termWidth() - 4));
  lines.push(`${dim}${INDENT}${rule}${reset}`);
  lines.push("");
  return lines.join("\n");
}

// Print the banner. The caller clears the screen first.
export function banner(title: string): void {
  console.log(renderBanner(title));
}

// State of one tree row: done, todo, current, or skipped.
export type TreeRowState = "done" | "todo" | "current" | "skipped";

// Build one tree row with its arm: corner arm for the last row,
// tee arm for the rest. Glyphs match src/render.ts.
export function renderTreeRow(state: TreeRowState, text: string, last = false): string {
  const color = useColor();
  const reset = color ? "\x1b[0m" : "";
  const arm = last ? "└─" : "├─";
  if (state === "done") {
    const mark = color ? "\x1b[32m✓" : "✓";
    return `${INDENT}${arm} ${mark}${reset} ${text}`;
  }
  if (state === "todo") {
    const mark = color ? "\x1b[2m○" : "○";
    return `${INDENT}${arm} ${mark}${reset} ${text}`;
  }
  if (state === "skipped") {
    const mark = color ? "\x1b[2m⊘" : "⊘";
    return `${INDENT}${arm} ${mark}${reset} ${text}`;
  }
  const row = color ? `\x1b[1m▸ ${text}${reset}` : `▸ ${text}`;
  return `${INDENT}${arm} ${row}`;
}

// Build a key legend: one line per entry, bold key, plain action.
export function renderKeyLegend(entries: Array<[string, string]>): string {
  return entries.map(([key, action]) => `${INDENT}${B(key)}  ${action}`).join(
    "\n",
  );
}

// One hotkey row: bold key on screen, plain label, value on pick.
export interface HotkeyRow {
  key: string;
  label: string;
  value: string;
}

// Build the hotkey menu text. Pointer marks the selected row only.
export function renderHotkeyMenu(rows: HotkeyRow[], selected: number): string {
  return rows.map((row, i) => {
    const mark = i === selected ? `${B("▸")} ` : "  ";
    return `${INDENT}${mark}${B(row.key)}  ${row.label}`;
  }).join("\n");
}

// Match a raw key to the first row with the same key. Else return null.
export function matchHotkey(rows: HotkeyRow[], key: string): string | null {
  const want = key.toLowerCase();
  for (const row of rows) {
    if (row.key === want) return row.value;
  }
  return null;
}

// Ask the user to pick one hotkey row. Arrows move, keys jump, Enter picks.
// onInterrupt runs before a Ctrl-C exit so callers can flush saves.
export async function hotkeyMenu(
  rows: HotkeyRow[],
  initial = 0,
  onInterrupt?: () => Promise<void>,
): Promise<string> {
  const count = rows.length;
  if (count === 0) throw new Error("hotkeyMenu needs one row at least.");
  const start = initial < 0 ? 0 : initial >= count ? count - 1 : initial;
  const stdin = Deno.stdin;
  if (!stdin.isTerminal()) {
    rows.forEach((row, i) => console.log(`${INDENT}${i + 1}. ${row.key}  ${row.label}`));
    const line = globalThis.prompt("Pick a number") ?? "";
    const text = line.trim();
    if (text === "") return rows[start].value;
    const num = Number.parseInt(text, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= count) return rows[num - 1].value;
    const hit = matchHotkey(rows, text);
    if (hit !== null) return hit;
    return rows[start].value;
  }
  let at = start;
  console.log(renderHotkeyMenu(rows, at));
  stdin.setRaw(true);
  try {
    const reader = stdin.readable.getReader();
    try {
      const enc = new TextEncoder();
      while (true) {
        const out = await reader.read();
        const value = out.value;
        if (value === undefined || value.length === 0) continue;
        if (value[0] === 3) {
          try {
            stdin.setRaw(false);
          } catch {
            // Already closing. The exit below still lands.
          }
          if (onInterrupt !== undefined) await onInterrupt();
          console.log("Cancelled.");
          Deno.exit(130);
        }
        if (value[0] === 13 || value[0] === 10) return rows[at].value;
        if (value.length === 3 && value[0] === 27 && value[1] === 91) {
          if (value[2] === 65) at = (at - 1 + count) % count;
          else if (value[2] === 66) at = (at + 1) % count;
          else continue;
          Deno.stdout.writeSync(enc.encode(`\x1b[${count}A`));
          console.log(renderHotkeyMenu(rows, at));
          continue;
        }
        if (value.length === 1) {
          const hit = matchHotkey(rows, String.fromCharCode(value[0]!));
          if (hit !== null) return hit;
        }
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    try {
      stdin.setRaw(false);
    } catch {
      // Not a terminal. Prompts manage their own mode.
    }
  }
}

// Ask the user to pick one row. Show all rows at once, never a window.
export async function menuSelect(
  message: string,
  choices: Array<{ title: string; value: string }>,
): Promise<string> {
  return await Select.prompt<string>({
    message,
    options: choices.map((c) => ({ name: c.title, value: c.value })),
    maxRows: Math.max(choices.length, 1),
  });
}

// Ask the user a yes or no question. Return true for yes.
export async function confirmAsk(message: string): Promise<boolean> {
  return await Confirm.prompt({ message });
}
