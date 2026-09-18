// Passive drift detection for split-utils. Failures map to signatures.
// The repo issue tracker receives public drift reports.

// Public home for drift reports from users.
export const ISSUES_URL = "https://github.com/xyzshantaram/dotfiles-ai/issues";

// One failed fetch or parse step from a gather run.
export interface FailureEvent {
  platform: string;
  kind: "http" | "parse";
  status?: number;
  detail: string;
}

// Known drift shapes matched from failure lists.
export type DriftSignature =
  | "auth-universal"
  | "history-server-error"
  | "bills-not-parsing";

// Match failures to a drift signature and return null on no match.
export function detectDrift(failures: FailureEvent[]): DriftSignature | null {
  // Count auth hits across http 401 and 403 codes.
  const authHits = failures.filter(
    (f) => f.kind === "http" && (f.status === 401 || f.status === 403),
  );
  // Return the auth signature before weaker matches.
  if (authHits.length >= 3) return "auth-universal";
  // Find any history 500 failure by its detail text.
  const historyHit = failures.some(
    (f) =>
      f.kind === "http" && f.status === 500 &&
      f.detail.toLowerCase().includes("history"),
  );
  // Return the history signature before the parse fallback.
  if (historyHit) return "history-server-error";
  // Flag bill loss when every failure is a parse failure.
  if (failures.length > 0 && failures.every((f) => f.kind === "parse")) {
    return "bills-not-parsing";
  }
  // Report no drift for anything else.
  return null;
}

// Build user and dev messages for a drift signature.
export function driftMessage(
  sig: DriftSignature,
  logPath: string,
): { user: string; dev: string } {
  // Pick a plain first line per signature.
  let first = "";
  // Describe the auth shape in plain words.
  if (sig === "auth-universal") {
    first = "Logins stopped working on every platform at once.";
  } else if (sig === "history-server-error") {
    first = "Order history stopped loading from the company side.";
  } else {
    // Describe the parse shape in plain words.
    first = "Bills stopped opening in a form this tool can read.";
  }
  // Join the warm user message from plain parts.
  const user = first +
    " Something changed on the company side. It is not your fault." +
    " Please report it at " + ISSUES_URL +
    " and attach the log file at " + logPath + "." +
    " The log file is already safe to share.";
  // Point devs at the constants wizard.
  const dev = "Drift signature: " + sig + "." +
    " Run scripts/dev/zomato-consts.ts to refresh the constants." +
    " Then rerun the failed step. Full log: " + logPath + ".";
  return { user, dev };
}
