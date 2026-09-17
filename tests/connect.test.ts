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
  const out = await startHandshake("t-connect-1", api);
  assert(out.ok, "start ok");
  assert(
    currentAuthorizeUrl("t-connect-1") === "https://example.test/authorize?oauth_token=req-tok",
    "link stored",
  );
});

Deno.test("startHandshake failure stays generic", async () => {
  const { api } = fakeApi({ failStart: true });
  const error = assertFails(await startHandshake("t-connect-2", api), "start failed");
  assert(error.includes("Could not reach Splitwise"), "generic error");
  assert(!error.includes("down"), "no raw error text");
});

// Keep the handshake off the real token cache in every test.
const noSave = () => Promise.resolve();

Deno.test("completeHandshake accepts bare code and callback URL", async () => {
  const bare = fakeApi();
  await startHandshake("t-connect-3", bare.api);
  const one = await completeHandshake("t-connect-3", "ab12cd", bare.api, noSave);
  assert(one.ok && one.name === "Ada Lovelace", "bare path signs in");
  assert(bare.seenVerifiers[0] === "ab12cd", "bare verifier passed through");
  assert(currentSignedInAs("t-connect-3") === "Ada Lovelace", "sign-in state set");

  const cb = fakeApi();
  await startHandshake("t-connect-3b", cb.api);
  const two = await completeHandshake(
    "t-connect-3b",
    "https://example.test/cb?oauth_token=req&oauth_verifier=xy99z",
    cb.api,
    noSave,
  );
  assert(two.ok && two.name === "Ada Lovelace", "callback path signs in");
  assert(cb.seenVerifiers[0] === "xy99z", "verifier pulled from URL");
});

Deno.test("completeHandshake caches the token through save", async () => {
  const { api } = fakeApi();
  await startHandshake("t-connect-4", api);
  let saved: AccessToken | null = null;
  const out = await completeHandshake("t-connect-4", "ab12cd", api, (t) => {
    saved = t;
    return Promise.resolve();
  });
  assert(out.ok, "exchange ok");
  const token = saved as AccessToken | null;
  assert(token !== null && token.oauth_token === "at-ok", "token handed to save");
});

Deno.test("completeHandshake without a started handshake errors cleanly", async () => {
  const { api } = fakeApi();
  const error = assertFails(await completeHandshake("t-connect-5", "ab12cd", api), "asks to restart");
  assert(error.includes("not ready"), "asks to restart");
});

Deno.test("completeHandshake failure stays generic and keeps the link", async () => {
  const { api } = fakeApi({ failExchange: true });
  await startHandshake("t-connect-6", api);
  const error = assertFails(await completeHandshake("t-connect-6", "wrong", api), "exchange failed");
  assert(error.includes("did not accept the verifier"), "generic error");
  assert(
    !error.includes("hushhush") && !error.includes("wrong"),
    "no raw error or verifier",
  );
  assert(currentAuthorizeUrl("t-connect-6") !== null, "link kept for a retry");
  assert(currentSignedInAs("t-connect-6") === null, "no sign-in on failure");
});

Deno.test("the handshake started under A is invisible to B", async () => {
  const sidA = "iso-handshake-A";
  const sidB = "iso-handshake-B";
  const apiFor = (url: string): HandshakeApi => ({
    getAuthorizeUrl: () =>
      Promise.resolve({
        url,
        requestToken: { oauth_token: "req-" + url, oauth_token_secret: "sec" },
      }),
    getAccessToken: () =>
      Promise.resolve({ oauth_token: "at-ok", oauth_token_secret: "ats-ok" }),
    getCurrentUser: () => Promise.resolve({ first_name: "Ada", last_name: "Lovelace" }),
  });
  const outA = await startHandshake(sidA, apiFor("https://example.test/a"));
  assert(outA.ok, "A starts");
  assert(currentAuthorizeUrl(sidA) === "https://example.test/a", "A keeps its link");
  assert(currentAuthorizeUrl(sidB) === null, "B sees no link before it starts");
  const outB = await startHandshake(sidB, apiFor("https://example.test/b"));
  assert(outB.ok, "B starts");
  assert(currentAuthorizeUrl(sidB) === "https://example.test/b", "B keeps its link");
  assert(currentAuthorizeUrl(sidA) === "https://example.test/a", "A keeps its own link");
  const done = await completeHandshake(sidA, "code-a", apiFor("https://example.test/a"), noSave);
  assert(done.ok, "A finishes");
  assert(currentSignedInAs(sidA) === "Ada Lovelace", "A signs in");
  assert(currentSignedInAs(sidB) === null, "B stays signed out");
  assert(currentAuthorizeUrl(sidA) === null, "A link clears after use");
  assert(currentAuthorizeUrl(sidB) === "https://example.test/b", "B link survives");
});

// The handshake belongs to one browser. The approve screen must read it
// under the session that started it, or every live link hides behind the
// not-ready branch. That branch must also never offer Next, because it
// draws no verifier box for Next to validate.
Deno.test("the approve screen shows the link only to the browser that started it", async () => {
  const { api } = fakeApi();
  const { settingsSteps } = await import("../wizards/expense-split/settings.ts");
  await startHandshake("sid-A", api);
  const connect = settingsSteps()[1] as (
    m: Map<string, string[]>,
    ctx?: { sessionId?: string },
  ) => {
    nodes: unknown[];
    nav?: {
      back?: boolean;
      next?: { label: string; run?: unknown } | string;
      goto?: { step: string; label: string; run?: unknown };
    };
  };

  const mine = connect(new Map(), { sessionId: "sid-A" });
  const mineText = JSON.stringify(mine.nodes);
  assert(mineText.includes("example.test/authorize"), "starter sees the approve link");
  assert(mineText.includes("sw-verifier"), "starter sees the verifier box");
  const mineNext = mine.nav?.next;
  assert(typeof mineNext === "object" && mineNext.label === "Next", "starter keeps Next");
  assert(typeof mineNext === "object" && typeof mineNext.run === "function", "Next keeps its run");

  const other = connect(new Map(), { sessionId: "sid-B" });
  const otherText = JSON.stringify(other.nodes);
  assert(otherText.includes("No approval is waiting"), "other browser sees the plain line");
  assert(!otherText.includes("sw-verifier"), "other browser sees no verifier box");
  assert(other.nav?.goto?.step === "settings", "the dead end offers a way back to settings");
  assert(other.nav?.goto?.label === "Open Settings", "the way back keeps its label");
  assert(other.nav?.next === undefined, "the dead end offers no Next to validate");
});
