// Splitwise API key check for the browser wizard settings flow.
// The browser saves one API key, then this module checks it with
// getCurrentUser and keeps the signed-in name per session.
import { fullName, loadCredentials, SplitwiseAPI } from "../../src/splitwise.ts";
import { splitwiseEnvPath } from "../../src/paths.ts";
import { sessionStore, sidOf } from "../../src/sessionstore.ts";

// The part of SplitwiseAPI that the key check needs. Tests pass a fake.
export interface IdentityApi {
  getCurrentUser(): Promise<Record<string, unknown>>;
}

// Path of the saved key, same file the settings step writes.
export function envPath(): string {
  return splitwiseEnvPath();
}

// Real client built from the saved key.
export async function realApi(): Promise<IdentityApi> {
  const credentials = await loadCredentials(envPath());
  return new SplitwiseAPI(credentials);
}

// Signed-in name per session. The store keeps one name per browser,
// so two browsers never share it.
const keyChecks = sessionStore((): {
  signedInAs: string | null;
} => ({ signedInAs: null }));

// Display name of the account from the last good key check.
export function currentSignedInAs(sessionId: string): string | null {
  return keyChecks.for(sidOf({ sessionId })).signedInAs;
}

// One short reason for a failed key check. It never quotes the key,
// because this text reaches the screen. A status number from
// Splitwise is the most useful part, so it leads.
function keyReason(err: unknown): string {
  let raw = "";
  if (err instanceof Error) {
    raw = err.message;
  } else if (err !== null && typeof err === "object") {
    const bag = err as { statusCode?: unknown; data?: unknown };
    const code = typeof bag.statusCode === "number" ? String(bag.statusCode) : "";
    const data = typeof bag.data === "string" ? bag.data : "";
    raw = (code + " " + data).trim();
  } else {
    raw = String(err);
  }
  const status = raw.match(/\b(400|401|403|404|429|5\d\d)\b/);
  if (status !== null) {
    if (status[1] === "401" || status[1] === "403") {
      return "Splitwise did not accept the key. It answered " + status[1] +
        ". Copy the whole key again from the Splitwise apps page.";
    }
    return "It answered " + status[1] + ".";
  }
  if (/timeout|timed out|network|dns|econn/i.test(raw)) {
    return "The request did not reach Splitwise.";
  }
  // Nothing recognised. The screen says so and the detail goes to the
  // server log, because the raw text can echo the key back, and this
  // string reaches a page.
  return "It gave no reason, and the detail is in the server log.";
}

// Check one API key with getCurrentUser, store the account name, and
// return it. On a fault log the raw cause and return a short reason.
// The raw fault never reaches the returned text, because that text
// reaches a page and can echo the key.
export async function verifyKey(
  sessionId: string,
  api: IdentityApi,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const sid = sidOf({ sessionId });
  try {
    const me = await api.getCurrentUser();
    const name = fullName(me);
    keyChecks.for(sid).signedInAs = name;
    return { ok: true, name };
  } catch (err) {
    console.error("[connect] key check failed:", err);
    return { ok: false, error: keyReason(err) };
  }
}
