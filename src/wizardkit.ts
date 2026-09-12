import { $ } from "zx";
import { MepCLI, Pipeline } from "mepcli";

// Wizard library: same UX in every wizard. Do not hand-edit.

// App version shown in every wizard banner.
export const APP_VERSION = "0.1.0";

const USE_COLOR = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");
const BOLD = USE_COLOR ? "\x1b[1m" : "";
const DIM = USE_COLOR ? "\x1b[2m" : "";
const RESET = USE_COLOR ? "\x1b[0m" : "";
const BLUE = USE_COLOR ? "\x1b[34m" : "";
const GREEN = USE_COLOR ? "\x1b[32m" : "";
const YELLOW = USE_COLOR ? "\x1b[33m" : "";
const GRAY = USE_COLOR ? "\x1b[90m" : "";
const WHITE = USE_COLOR ? "\x1b[37m" : "";

// Author sets this through setTotalStages to match the step count.
let TOTAL_STAGES = 0;

// setTotalStages sets the stage count. Call it once before banner.
export function setTotalStages(n: number): void {
  TOTAL_STAGES = n;
}

const ENV_FILE = Deno.env.get("ENV_FILE") ?? ".env";
const WRITTEN_ENV: string[] = [];
const WRITTEN_SECRET: string[] = [];
const SKIPPED: string[] = [];

function progressPath(): string {
  return Deno.env.get("WIZARD_PROGRESS") ?? "./wizard-progress.jsonl";
}

async function appendEvent(event: unknown): Promise<void> {
  try {
    await Deno.writeTextFile(progressPath(), JSON.stringify(event) + "\n", { append: true });
  } catch {
    // Progress must never break the wizard.
  }
}

export function clearScreen(): void {
  if (Deno.stdout.isTerminal()) console.clear();
}

// One legend row: the key in bold gray, the action in plain white.
export function keyRow(key: string, action: string): string {
  return `  ${BOLD}${GRAY}${key}${RESET}  ${WHITE}${action}${RESET}`;
}

// A legend block for embedding at the end of a prompt message.
// MepCLI redraws the whole message with the widget, so the legend
// stays on screen for the life of the prompt.
export function keyLegend(rows: Array<[string, string]>): string {
  return rows.map(([k, a]) => keyRow(k, a)).join("\n");
}

// menuSeparator builds one dim, unselectable select row for menus.
// The literal type keeps the object valid for MepCLI choice arrays.
export function menuSeparator(text?: string) {
  return { separator: true as const, text };
}

// Short nav hint for select prompts. Append to the message.
export function selectHint(): string {
  return `\n  ${BOLD}${GRAY}Arrows${RESET} move · ${BOLD}${GRAY}Enter${RESET} picks.`;
}

// Short nav hint for checkbox prompts. Append to the message.
export function checkHint(): string {
  return `\n  ${BOLD}${GRAY}Arrows${RESET} move · ${BOLD}${GRAY}Space${RESET} ticks · ${BOLD}${GRAY}Enter${RESET} keeps the ticked people.`;
}

// Process guards: neat errors and Ctrl-C in every wizard.
// Runs once no matter how often banner is called.
let guardsInstalled = false;
export function installProcessGuards(): void {
  if (guardsInstalled) return;
  guardsInstalled = true;
  // Raw JS errors never reach the user: one clean line, then exit 1.
  // Verified: Deno delivers top-level await failures here and
  // preventDefault suppresses the stack dump.
  globalThis.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    e.preventDefault();
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    console.log(`\n  ${YELLOW}Something went wrong: ${reason}${RESET}`);
    console.log("  Progress is saved. Run the wizard again to continue.");
    Deno.exit(1);
  });
  // Ctrl-C cancels any prompt: one clean line, exit 130.
  // MepCLI handles no SIGINT itself, so the listener always fires.
  Deno.addSignalListener("SIGINT", () => {
    console.log("\n  Cancelled.");
    try {
      Deno.stdin.setRaw(false);
    } catch {
      // Best effort: the terminal usually resets itself.
    }
    Deno.exit(130);
  });
}

function clear(): void {
  clearScreen();
}

// Width of the terminal for wrapping. Falls back to 80.
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
  // ESC lives in a built string, never as a regex control escape.
  return text.replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), "");
}

// Wrap plain text to the terminal width at word gaps.
// Keeps ANSI codes intact. Never splits a word unless it runs past
// the full width on its own.
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

// createWizard returns a Pipeline whose hooks clear the screen, print the
// stage counter, and append one JSONL event per step start and completion.
// The counter tracks executed steps, so conditional steps never skew it.
// Pass { stages: false } for looping menus that have no stages.
export function createWizard<Ctx extends Record<string, unknown>>(
  opts?: { stages?: boolean },
): Pipeline<Ctx> {
  const showStages = opts?.stages ?? true;
  let done = 0;
  return new Pipeline<Ctx>({
    onStepStart: async (meta) => {
      clear();
      if (showStages) {
        const n = done + 1;
        console.log(
          `\n${BOLD}${BLUE}▸ Stage ${n}/${TOTAL_STAGES} · ${meta.name ?? "step"}${RESET}`,
        );
      }
      await appendEvent({
        type: "stage",
        index: done + 1,
        name: meta.name,
        time: new Date().toISOString(),
      });
    },
    onStepComplete: async (meta) => {
      done += 1;
      await appendEvent({
        type: "stage-complete",
        index: meta.index + 1,
        name: meta.name,
        time: new Date().toISOString(),
      });
    },
  });
}

// banner shows the opening frame: what this wizard does.
// A no answer stops the run before any stage executes.
// Pass { stages: false } to hide the stage count line.
// deno-lint-ignore require-await -- every wizard awaits banner, so it keeps async.
export async function banner(title: string, opts?: { stages?: boolean }): Promise<void> {
  installProcessGuards();
  clear();
  console.log("");
  for (const line of wrap(title).split("\n")) {
    console.log(`${BOLD}${BLUE}  ${line}${RESET}`);
  }
  const rule = "-".repeat(Math.min(48, termWidth() - 4));
  console.log(`${DIM}  ${rule}${RESET}`);
  if (opts?.stages ?? true) {
    const word = TOTAL_STAGES === 1 ? "stage" : "stages";
    console.log(`${DIM}  ${TOTAL_STAGES} ${word}${RESET}`);
  }
  console.log("");
}

// readyGate explains the browser handoff and waits for a go.
// Browser wizards call it after banner. Other wizards skip it.
export async function readyGate(): Promise<void> {
  console.log(`${DIM}  You drive the browser; this wizard tells you exactly what to do and`);
  console.log(`  captures the values you copy back.${RESET}`);
  const ready = await confirm("Ready to start?");
  if (!ready) {
    say("Stopped. Run the wizard again when ready.");
    wizardExit(0);
  }
}

// Progress dots share one line. One dot per line leaves a column of
// punctuation and a wall of empty space, in a terminal and in the
// wizard output panel alike.
let dotOpen = false;

/** Write one progress dot on the current line. */
export function dot(): void {
  Deno.stdout.writeSync(new TextEncoder().encode("."));
  dotOpen = true;
}

/** Close an open dot line, so the next message starts on its own. */
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

export function say(text: string): void {
  dotEnd();
  for (const line of wrap(text).split("\n")) {
    console.log(`  ${line}`);
  }
}

// wizardExit ends a wizard. A run inside the browser wizard needs no
// navigation advice: the panel shows this output, and the step below it
// holds the button that moves on.
export function wizardExit(code: number): never {
  dotEnd();
  if (Deno.env.get("SPLIT_UTILS_FROM_MENU") === "1") {
    say("Back to the main menu.");
  } else if (Deno.env.get("SPLIT_UTILS_EMBEDDED") !== "1") {
    // Point a direct terminal run back at the main menu.
    say("Open the main menu again to pick your next step.");
  }
  Deno.exit(code);
}
export function step(text: string): void {
  dotEnd();
  const lines = wrap(text).split("\n");
  console.log(`  ${BLUE}•${RESET} ${lines[0]}`);
  for (const line of lines.slice(1)) {
    console.log(`    ${line}`);
  }
}
function note(text: string): void {
  for (const line of wrap(text).split("\n")) {
    console.log(`  ${DIM}${line}${RESET}`);
  }
}
export function warn(text: string): void {
  const lines = wrap(text).split("\n");
  console.log(`  ${YELLOW}⚠ ${lines[0]}${RESET}`);
  for (const line of lines.slice(1)) {
    console.log(`    ${line}`);
  }
}

// open_url opens a URL in the human's browser, cross-platform incl. WSL.
export async function open_url(url: string): Promise<void> {
  console.log(`  ${GREEN}↗ opening${RESET} ${url}`);
  const attempts: Array<() => Promise<unknown>> = [
    () => $`wslview ${url}`,
    () => $`explorer.exe ${url}`,
    () => $`xdg-open ${url}`,
    () => $`open ${url}`,
  ];
  for (const run of attempts) {
    try {
      await run();
      return;
    } catch {
      // Try the next opener.
    }
  }
  warn(`couldn't open a browser, so visit it manually: ${url}`);
}

// confirm asks a y/N gate. It resolves true on yes.
export async function confirm(question: string): Promise<boolean> {
  return await MepCLI.confirm({ message: question });
}

function existing(key: string): string | null {
  let text: string;
  try {
    text = Deno.readTextFileSync(ENV_FILE);
  } catch {
    return null;
  }
  let found: string | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith(`${key}=`)) found = line.slice(key.length + 1);
  }
  return found;
}

function keptCurrent(value: string, current: string | null): string {
  if (value.trim() === "" && current) return current;
  return value;
}

// ask reads a visible value. Enter keeps the saved .env value on re-runs.
export async function ask(key: string, promptText: string): Promise<string> {
  const current = existing(key);
  const value = await MepCLI.text({
    message: `${promptText}${current ? " [Enter keeps current]" : ""}`,
    initial: current ?? undefined,
  });
  return keptCurrent(value, current);
}

// ask_secret is like ask, but input stays hidden.
export async function ask_secret(key: string, promptText: string): Promise<string> {
  const current = existing(key);
  const value = await MepCLI.secret({
    message: `${promptText}${current ? " [Enter keeps current]" : ""}`,
    initial: current ?? undefined,
  });
  return keptCurrent(value, current);
}

async function ghReady(): Promise<boolean> {
  try {
    await $`gh auth status`;
    return true;
  } catch {
    return false;
  }
}

// write_env upserts KEY=VALUE into ENV_FILE. Idempotent.
export async function write_env(key: string, value: string): Promise<void> {
  let lines: string[] = [];
  try {
    lines = Deno.readTextFileSync(ENV_FILE).split("\n");
  } catch {
    lines = [];
  }
  const kept = lines.filter((line) => !line.startsWith(`${key}=`));
  const trimmed = kept.join("\n").replace(/\n+$/, "");
  const next = trimmed ? `${trimmed}\n${key}=${value}\n` : `${key}=${value}\n`;
  await Deno.writeTextFile(ENV_FILE, next);
  WRITTEN_ENV.push(key);
  console.log(`  ${GREEN}✓ wrote${RESET} ${key} → ${ENV_FILE}`);
}

// set_secret sets a GitHub Actions repo secret via gh, else records a skip.
export async function set_secret(name: string, value: string): Promise<void> {
  if (await ghReady()) {
    try {
      await $`gh secret set ${name} --body ${value}`;
      WRITTEN_SECRET.push(name);
      console.log(`  ${GREEN}✓ set${RESET} GitHub secret ${name}`);
      return;
    } catch {
      // Fall through to the skip warning.
    }
  }
  SKIPPED.push(`GitHub secret ${name} (set it manually: gh secret set ${name})`);
  warn(`skipped GitHub secret ${name}: gh not ready; set it later`);
}

// finish shows the closing summary and appends the done event.
// Pass false for test runs that change nothing.
export async function finish(complete = true): Promise<void> {
  if (complete) {
    console.log(`\n${BOLD}${GREEN}  ✓ Setup complete${RESET}`);
  } else {
    console.log(`\n${BOLD}${GREEN}  Done.${RESET}`);
  }
  if (WRITTEN_ENV.length) {
    note(`wrote ${WRITTEN_ENV.length} value(s) to ${ENV_FILE}: ${WRITTEN_ENV.join(" ")}`);
  }
  if (WRITTEN_SECRET.length) {
    note(`set ${WRITTEN_SECRET.length} GitHub secret(s): ${WRITTEN_SECRET.join(" ")}`);
  }
  if (SKIPPED.length) {
    console.log("");
    warn("still to do by hand:");
    for (const s of SKIPPED) note(`  - ${s}`);
  }
  console.log("");
  await appendEvent({
    type: "done",
    time: new Date().toISOString(),
    envKeys: WRITTEN_ENV,
    secrets: WRITTEN_SECRET,
    skipped: SKIPPED,
  });
}
