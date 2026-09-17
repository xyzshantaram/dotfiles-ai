// Splitwise OAuth handshake state for the browser wizard settings flow.
// Terminal versions live in src/splitwise-setup.ts and wizards/pusher.ts.
// The browser has no terminal opener, so the step renders the authorize
// link instead of calling open_url.
import {
  type AccessToken,
  fullName,
  loadCredentials,
  parseVerifier,
  saveToken,
  SplitwiseAPI,
} from "../../src/splitwise.ts";
import { splitwiseEnvPath } from "../../src/paths.ts";
import { sessionStore, sidOf } from "../../src/sessionstore.ts";

// The part of SplitwiseAPI that the handshake needs. Tests pass a fake.
export interface HandshakeApi {
  getAuthorizeUrl(): Promise<{ url: string; requestToken: AccessToken }>;
  getAccessToken(
    requestToken: AccessToken,
    verifier: string,
  ): Promise<AccessToken>;
  getCurrentUser(): Promise<Record<string, unknown>>;
}

// Path of the saved key pair, same file the key step writes.
export function envPath(): string {
  return splitwiseEnvPath();
}

// Real client built from the saved key pair.
export async function realApi(): Promise<HandshakeApi> {
  const credentials = await loadCredentials(envPath());
  return new SplitwiseAPI(credentials);
}

// One handshake in flight per session. The link and request token live
// in a per-session store between renders, not on disk and not in wizard
// answers, so the token secrets never land in a page, a draft, or a log
// line. The store replaces the module level pending and signedInAs
// values, which two browsers used to share.
const handshakes = sessionStore((): {
  pending: { url: string; requestToken: AccessToken } | null;
  signedInAs: string | null;
} => ({ pending: null, signedInAs: null }));

// Authorize link of the handshake in flight, or null.
export function currentAuthorizeUrl(sessionId: string): string | null {
  return handshakes.for(sidOf({ sessionId })).pending?.url ?? null;
}

// Display name of the account from the last finished handshake.
export function currentSignedInAs(sessionId: string): string | null {
  return handshakes.for(sidOf({ sessionId })).signedInAs;
}

// Step 1: ask Splitwise for a request token and the authorize link.
// The error text stays generic: a raw error could quote the key pair.
export async function startHandshake(
  sessionId: string,
  api: HandshakeApi,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = sidOf({ sessionId });
  try {
    handshakes.for(sid).pending = await api.getAuthorizeUrl();
    handshakes.for(sid).signedInAs = null;
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Could not reach Splitwise to start the approval. Check the key pair and your network, then try again.",
    };
  }
}

// One short reason for a failed verifier swap. It never quotes the key
// pair or the token, because this text reaches the screen. A status
// number from Splitwise is the most useful part, so it leads.
function verifierReason(err: unknown): string {
  // node-oauth rejects with a plain object holding statusCode and data,
  // not with an Error. Reading only err.message therefore read nothing,
  // and every failure reported that it gave no reason.
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
      return "It answered " + status[1] +
        ", which means the code was already used, or it expired, or it belongs to another approval.";
    }
    return "It answered " + status[1] + ".";
  }
  if (/timeout|timed out|network|dns|econn/i.test(raw)) {
    return "The request did not reach Splitwise.";
  }
  // Nothing recognised. The screen says so and the detail goes to the
  // server log, because the raw text can echo the verifier or the key
  // pair back, and this string reaches a page.
  return "It gave no reason, and the detail is in the server log.";
}

// Step 2: swap the verifier for an access token, cache it owner only,
// and confirm who signed in. Accepts a bare code or the full callback
// URL, like the old pusher flow. `save` swaps the cache write in tests.
export async function completeHandshake(
  sessionId: string,
  raw: string,
  api: HandshakeApi,
  save: (token: AccessToken) => Promise<void> = saveToken,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const sid = sidOf({ sessionId });
  const held = handshakes.for(sid);
  if (held.pending === null) {
    return {
      ok: false,
      error: "The approval link is not ready. Go back one step, then press Next again.",
    };
  }
  // Check the shape before spending the one use this code has. A code
  // is letters, digits, dashes and underscores. Anything else means the
  // reader copied a label or a template rather than its value, and
  // sending it would burn the approval for nothing.
  const code = parseVerifier(raw);
  if (code === "" || /[^A-Za-z0-9_-]/.test(code)) {
    return {
      ok: false,
      error: "That does not look like the code. Copy the value after oauth_verifier, " +
        "which is letters and digits only, with no brackets or spaces.",
    };
  }
  try {
    const token = await api.getAccessToken(
      held.pending.requestToken,
      code,
    );
    await save(token);
    const me = await api.getCurrentUser();
    const name = fullName(me);
    held.signedInAs = name;
    held.pending = null;
    return { ok: true, name };
  } catch (err) {
    // Name the real cause. A bare sentence here sent the reader back to
    // copy the same good code again, with nothing to act on. The reason
    // separates a mistyped code from an expired handshake, a wrong key
    // pair, and a network fault, which need different answers.
    // The raw fault goes to the server log only. It can echo the
    // verifier or the key pair, and the message below reaches a page.
    console.error("[connect] verifier swap failed:", err);
    return {
      ok: false,
      error: "Splitwise did not accept the verifier. " + verifierReason(err) +
        " The code is the value after oauth_verifier, and it works once.",
    };
  }
}
