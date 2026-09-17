// Client proof for the API key transport. Each test passes a stub
// fetch, so no test touches the network or the global fetch.

import { loadCredentials, SplitwiseAPI } from "../src/splitwise.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

Deno.test("getCurrentUser sends the bearer key and returns the user", async () => {
  let seenAuth: string | null = null;
  let seenUrl = "";
  const doFetch = ((
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    seenUrl = String(input);
    seenAuth = new Headers(init?.headers).get("Authorization");
    const body = JSON.stringify({ user: { first_name: "Ada", last_name: "Lovelace" } });
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof fetch;
  const api = new SplitwiseAPI({ apiKey: "key-one" }, doFetch);
  const user = await api.getCurrentUser();
  assert(seenAuth === "Bearer key-one", "auth header holds the bearer key");
  assert(seenUrl.endsWith("/get_current_user"), "request hits the user endpoint");
  assert(user.first_name === "Ada", "parsed user record returns");
});

Deno.test("createExpense posts form fields back to the API", async () => {
  let seenMethod: string | null = null;
  let seenType = "";
  let seenBody = "";
  const doFetch = ((
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    seenMethod = init?.method ?? null;
    seenType = new Headers(init?.headers).get("Content-Type") ?? "";
    seenBody = typeof init?.body === "string" ? init.body : "";
    return Promise.resolve(
      new Response(JSON.stringify({ expenses: [{ id: 7 }] }), { status: 200 }),
    );
  }) as typeof fetch;
  const api = new SplitwiseAPI({ apiKey: "key-one" }, doFetch);
  const fields = { cost: "10.00", description: "Noodles", currency_code: "INR" };
  const out = await api.createExpense(fields);
  assert(seenMethod === "POST", "expense create uses POST");
  assert(
    seenType.includes("application/x-www-form-urlencoded"),
    "body is form urlencoded",
  );
  const back = new URLSearchParams(seenBody);
  for (const [key, value] of Object.entries(fields)) {
    assert(back.get(key) === value, "field round trips: " + key);
  }
  assert(out.expenses?.[0]?.id === 7, "expense id returns");
});

Deno.test("a 401 response throws with the status and the body", async () => {
  const doFetch =
    (() => Promise.resolve(new Response("Invalid API key", { status: 401 }))) as typeof fetch;
  const api = new SplitwiseAPI({ apiKey: "bad-key" }, doFetch);
  let err: unknown = null;
  try {
    await api.getCurrentUser();
  } catch (e) {
    err = e;
  }
  if (!(err instanceof Error)) throw new Error("assert failed: a 401 throws an error");
  assert(err.message.includes("401"), "message holds the status");
  assert(err.message.includes("Invalid API key"), "message holds the body");
});

Deno.test("loadCredentials reads API_KEY and names a bad file", async () => {
  const base = await Deno.makeTempDir({ dir: "/tmp", prefix: "sw-client-" });
  try {
    const good = base + "/splitwise.env";
    await Deno.writeTextFile(good, "API_KEY=key-nine\n");
    const creds = await loadCredentials(good);
    assert(creds.apiKey === "key-nine", "key loads from the file");
    const bad = base + "/empty.env";
    await Deno.writeTextFile(bad, "OTHER=1\n");
    let err: unknown = null;
    try {
      await loadCredentials(bad);
    } catch (e) {
      err = e;
    }
    if (!(err instanceof Error)) throw new Error("assert failed: a missing key throws");
    assert(err.message.includes(bad), "error names the path");
  } finally {
    await Deno.remove(base, { recursive: true }).catch(() => {});
  }
});
