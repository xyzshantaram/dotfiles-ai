// Tests for the browser wizard Splitwise key check. A fake IdentityApi
// stands in for SplitwiseAPI, so no network call happens. Each test uses
// a fresh session id, so sign-in state never leaks across tests.
import { currentSignedInAs, type IdentityApi, verifyKey } from "@app/app/expense-split/connect.ts";
import { fullName } from "@app/src/splitwise.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

// Fail unless the outcome failed, then hand back its error text.
function assertFails(
  out: { ok: true; name: string } | { ok: false; error: string },
  msg: string,
): string {
  if (out.ok) throw new Error("assert failed: " + msg);
  return out.error;
}

// Fake API with one scripted getCurrentUser outcome.
function fakeApi(options?: {
  name?: Record<string, unknown>;
  fault?: unknown;
}): { api: IdentityApi } {
  return {
    api: {
      getCurrentUser: () => {
        if (options?.fault !== undefined) throw options.fault;
        return Promise.resolve(
          options?.name ?? { first_name: "Ada", last_name: "Lovelace" },
        );
      },
    },
  };
}

Deno.test("fullName joins the name parts", () => {
  assert(fullName({ first_name: "Ada", last_name: "Lovelace" }) === "Ada Lovelace", "both parts");
  assert(fullName({}) === "", "empty record");
});

Deno.test("verifyKey returns the account name and reports it", async () => {
  const { api } = fakeApi();
  const out = await verifyKey("t-key-1", api);
  assert(out.ok && out.name === "Ada Lovelace", "name returned");
  assert(currentSignedInAs("t-key-1") === "Ada Lovelace", "sign-in state set");
});

Deno.test("a 401 fault names the status and hides the key", async () => {
  const secretKey = "sk-live-abc123XYZ";
  const { api } = fakeApi({
    fault: new Error("Splitwise /me: 401 Unauthorized body=" + secretKey),
  });
  const error = assertFails(await verifyKey("t-key-2", api), "key rejected");
  assert(error.includes("401"), "status named");
  assert(!error.includes(secretKey), "no key in message");
  assert(!error.includes("Unauthorized body"), "no raw body in message");
  assert(currentSignedInAs("t-key-2") === null, "no sign-in on failure");
});

Deno.test("two browser sessions keep their own sign-in state", async () => {
  const sidA = "iso-key-A";
  const sidB = "iso-key-B";
  const ada = fakeApi({ name: { first_name: "Ada", last_name: "Lovelace" } });
  const bob = fakeApi({ name: { first_name: "Bob", last_name: "Jones" } });
  const doneA = await verifyKey(sidA, ada.api);
  assert(doneA.ok && doneA.name === "Ada Lovelace", "A signs in");
  assert(currentSignedInAs(sidA) === "Ada Lovelace", "A keeps its name");
  assert(currentSignedInAs(sidB) === null, "B stays signed out");
  const doneB = await verifyKey(sidB, bob.api);
  assert(doneB.ok && doneB.name === "Bob Jones", "B signs in");
  assert(currentSignedInAs(sidB) === "Bob Jones", "B keeps its name");
  assert(currentSignedInAs(sidA) === "Ada Lovelace", "A keeps its own name");
});

Deno.test("an unknown fault points at the server log and hides detail", async () => {
  const { api } = fakeApi({ fault: new Error("weird boom secret=hushhush") });
  const error = assertFails(await verifyKey("t-key-4", api), "unknown fault");
  assert(error.includes("server log"), "server log wording");
  assert(!error.includes("hushhush"), "no raw detail in message");
  assert(!error.includes("weird boom"), "no raw cause in message");
  assert(currentSignedInAs("t-key-4") === null, "no sign-in on failure");
});
