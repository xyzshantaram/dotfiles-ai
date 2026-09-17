// Terminal output helper. Share one style across scripts.
const USE_COLOR = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");
const RESET = USE_COLOR ? "\x1b[0m" : "";
const BLUE = USE_COLOR ? "\x1b[34m" : "";

// Report the terminal width. Fall back to 80.
export function termWidth(): number {
  try {
    const cols = Deno.consoleSize().columns;
    return cols >= 40 ? cols : 80;
  } catch {
    return 80;
  }
}

// Strip ANSI color codes for width math.
function visible(text: string): string {
  // Build ESC from code. Keep the pattern plain text.
  return text.replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), "");
}

// Wrap plain text at word gaps. Keep ANSI codes intact.
// Split a word only when it exceeds the full width alone.
export function wrap(text: string, width?: number): string {
  const max = (width ?? termWidth()) - 2;
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/ +/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const probe = line.length === 0 ? word : line + " " + word;
      if (visible(probe).length <= max || line.length === 0) {
        line = probe;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

// Share one progress line across dots. Close the line before text.
// Track the open dot line state here.
let dotOpen = false;

/** Write one progress dot on the current line. */
export function dot(): void {
  Deno.stdout.writeSync(new TextEncoder().encode("."));
  dotOpen = true;
}

/** Close the open dot line. Start the next message on a new line. */
export function dotEnd(): void {
  if (!dotOpen) return;
  Deno.stdout.writeSync(new TextEncoder().encode("\n"));
  dotOpen = false;
}

/** Open one progress line for a single order. */
export function lineStart(text: string): void {
  dotEnd();
  Deno.stdout.writeSync(new TextEncoder().encode("  " + text));
  dotOpen = true;
}

/** Close the open progress line with a result word. */
export function lineEnd(result = "Done."): void {
  if (!dotOpen) return;
  Deno.stdout.writeSync(new TextEncoder().encode(" " + result + "\n"));
  dotOpen = false;
}

// Print a message. Close the dot line first.
export function say(text: string): void {
  dotEnd();
  for (const line of wrap(text).split("\n")) {
    console.log(`  ${line}`);
  }
}

// Print a step marker. Close the dot line first.
export function step(text: string): void {
  dotEnd();
  const lines = wrap(text).split("\n");
  console.log(`  ${BLUE}•${RESET} ${lines[0]}`);
  for (const line of lines.slice(1)) {
    console.log(`    ${line}`);
  }
}

// End a run. Close the dot line first. Print no closing advice.
export function wizardExit(code: number): never {
  dotEnd();
  Deno.exit(code);
}
