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
import { stateRoot } from "../../src/runstate.ts";

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
  return stateRoot() + "/config/splitwise.env";
}

// Real client built from the saved key pair.
export async function realApi(): Promise<HandshakeApi> {
  const credentials = await loadCredentials(envPath());
  return new SplitwiseAPI(credentials);
}

// One handshake in flight. The link and request token live in module
// state between renders, not on disk and not in wizard answers, so the
// token secrets never land in a page, a draft, or a log line.
let pending: { url: string; requestToken: AccessToken } | null = null;
let signedInAs: string | null = null;

// Authorize link of the handshake in flight, or null.
export function currentAuthorizeUrl(): string | null {
  return pending?.url ?? null;
}

// Display name of the account from the last finished handshake.
export function currentSignedInAs(): string | null {
  return signedInAs;
}

// Step 1: ask Splitwise for a request token and the authorize link.
// The error text stays generic: a raw error could quote the key pair.
export async function startHandshake(
  api: HandshakeApi,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    pending = await api.getAuthorizeUrl();
    signedInAs = null;
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Could not reach Splitwise to start the approval. Check the key pair and your network, then try again.",
    };
  }
}

// Step 2: swap the verifier for an access token, cache it owner only,
// and confirm who signed in. Accepts a bare code or the full callback
// URL, like the old pusher flow. `save` swaps the cache write in tests.
export async function completeHandshake(
  raw: string,
  api: HandshakeApi,
  save: (token: AccessToken) => Promise<void> = saveToken,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (pending === null) {
    return {
      ok: false,
      error: "The approval link is not ready. Go back one step, then press Next again.",
    };
  }
  try {
    const token = await api.getAccessToken(
      pending.requestToken,
      parseVerifier(raw),
    );
    await save(token);
    const me = await api.getCurrentUser();
    const name = fullName(me);
    signedInAs = name;
    pending = null;
    return { ok: true, name };
  } catch {
    return {
      ok: false,
      error:
        "Splitwise did not accept the verifier. Copy the code from the approval page again and paste it.",
    };
  }
}
