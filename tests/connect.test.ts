// Tests for the browser wizard Splitwise handshake. A fake HandshakeApi
// stands in for SplitwiseAPI, so no network call happens. Each test uses
// a fresh module state by way of the pending/sign-in resets below.
import {
  completeHandshake,
  currentAuthorizeUrl,
  currentSignedInAs,
  type HandshakeApi,
  startHandshake,
} from "../wizards/expense-split/connect.ts";
import { fullName, parseVerifier } from "../src/splitwise.ts";
import type { AccessToken } from "../src/splitwise.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

// Fail unless the outcome failed, then hand back its error text.
function assertFails(
  out: { ok: true } | { ok: false; error: string },
  msg: string,
): string {
  if (out.ok) throw new Error("assert failed: " + msg);
  return out.error;
}

// Fake API with one scripted outcome per call.
function fakeApi(options?: {
  failExchange?: boolean;
  failStart?: boolean;
}): { api: HandshakeApi; seenVerifiers: string[] } {
  const seenVerifiers: string[] = [];
  const token: AccessToken = {
    oauth_token: "at-ok",
    oauth_token_secret: "ats-ok",
  };
  return {
    seenVerifiers,
    api: {
      getAuthorizeUrl: () => {
        if (options?.failStart) throw new Error("down");
        return Promise.resolve({
          url: "https://example.test/authorize?oauth_token=req-tok",
          requestToken: {
            oauth_token: "req-tok",
            oauth_token_secret: "req-sec",
          },
        });
      },
      getAccessToken: (_rt, verifier) => {
        seenVerifiers.push(verifier);
        if (options?.failExchange) {
          throw new Error("splitwise down secret=hushhush");
        }
        return Promise.resolve(token);
      },
      getCurrentUser: () => Promise.resolve({ first_name: "Ada", last_name: "Lovelace" }),
    },
  };
}

Deno.test("parseVerifier takes a bare code as is", () => {
  assert(parseVerifier("  ab12cd  ") === "ab12cd", "bare code");
});

Deno.test("parseVerifier pulls the code from a full callback URL", () => {
  const url = "https://example.test/callback?oauth_token=req&oauth_verifier=xy99z";
  assert(parseVerifier(url) === "xy99z", "callback URL");
  assert(
    parseVerifier(url + "&extra=1") === "xy99z",
    "verifier stops at next param",
  );
});

Deno.test("fullName joins the name parts", () => {
  assert(fullName({ first_name: "Ada", last_name: "Lovelace" }) === "Ada Lovelace", "both parts");
  assert(fullName({}) === "", "empty record");
});

Deno.test("startHandshake stores the authorize link", async () => {
  const { api } = fakeApi();
  const out = await startHandshake(api);
  assert(out.ok, "start ok");
  assert(
    currentAuthorizeUrl() === "https://example.test/authorize?oauth_token=req-tok",
    "link stored",
  );
});

Deno.test("startHandshake failure stays generic", async () => {
  const { api } = fakeApi({ failStart: true });
  const error = assertFails(await startHandshake(api), "start failed");
  assert(error.includes("Could not reach Splitwise"), "generic error");
  assert(!error.includes("down"), "no raw error text");
});

// Keep the handshake off the real token cache in every test.
const noSave = () => Promise.resolve();

Deno.test("completeHandshake accepts bare code and callback URL", async () => {
  const bare = fakeApi();
  await startHandshake(bare.api);
  const one = await completeHandshake("ab12cd", bare.api, noSave);
  assert(one.ok && one.name === "Ada Lovelace", "bare path signs in");
  assert(bare.seenVerifiers[0] === "ab12cd", "bare verifier passed through");
  assert(currentSignedInAs() === "Ada Lovelace", "sign-in state set");

  const cb = fakeApi();
  await startHandshake(cb.api);
  const two = await completeHandshake(
    "https://example.test/cb?oauth_token=req&oauth_verifier=xy99z",
    cb.api,
    noSave,
  );
  assert(two.ok && two.name === "Ada Lovelace", "callback path signs in");
  assert(cb.seenVerifiers[0] === "xy99z", "verifier pulled from URL");
});

Deno.test("completeHandshake caches the token through save", async () => {
  const { api } = fakeApi();
  await startHandshake(api);
  let saved: AccessToken | null = null;
  const out = await completeHandshake("ab12cd", api, (t) => {
    saved = t;
    return Promise.resolve();
  });
  assert(out.ok, "exchange ok");
  const token = saved as AccessToken | null;
  assert(token !== null && token.oauth_token === "at-ok", "token handed to save");
});

Deno.test("completeHandshake without a started handshake errors cleanly", async () => {
  const { api } = fakeApi();
  const error = assertFails(await completeHandshake("ab12cd", api), "asks to restart");
  assert(error.includes("not ready"), "asks to restart");
});

Deno.test("completeHandshake failure stays generic and keeps the link", async () => {
  const { api } = fakeApi({ failExchange: true });
  await startHandshake(api);
  const error = assertFails(await completeHandshake("wrong", api), "exchange failed");
  assert(error.includes("did not accept the verifier"), "generic error");
  assert(
    !error.includes("hushhush") && !error.includes("wrong"),
    "no raw error or verifier",
  );
  assert(currentAuthorizeUrl() !== null, "link kept for a retry");
  assert(currentSignedInAs() === null, "no sign-in on failure");
});
