// Client proof for the API key transport. Each test passes a stub
// fetch, so no test touches the network or the global fetch.

import { errorText, loadCredentials, SplitwiseAPI } from "@app/src/splitwise.ts";
import { assert } from "@std/assert";

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

// A 200 IS NOT A SUCCESS. From the Splitwise API reference for
// create_expense: "200 OK does not indicate a successful response. The
// operation was successful only if `errors` is empty."
// (https://dev.splitwise.com/). The body shapes below are that contract:
// `base` for a whole-request problem, a field name for a per-field one,
// each holding an array of strings. Reading only the HTTP status let
// these through, and the caller reported the ABSENCE of an expense id
// while the reason sat unread in the same response.
Deno.test("a 200 carrying errors throws with Splitwise's own words", async () => {
  const body = JSON.stringify({
    expenses: [],
    errors: { base: ["You are not a member of that group."] },
  });
  const doFetch = ((): Promise<Response> =>
    Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;
  const api = new SplitwiseAPI({ apiKey: "k" }, doFetch);
  let err: unknown = null;
  try {
    await api.createExpense({ cost: "10.00" });
  } catch (e) {
    err = e;
  }
  if (!(err instanceof Error)) throw new Error("assert failed: a 200 with errors throws");
  assert(
    err.message.includes("You are not a member of that group."),
    "the reason survives verbatim",
  );
  assert(err.message.includes("create_expense"), "the message names the endpoint");
  assert(!err.message.includes("base:"), "the base key is not shown as a field name");
});

Deno.test("a 200 carrying a field error names the field", async () => {
  const body = JSON.stringify({
    expenses: [],
    errors: { cost: ["is not a valid number", "must be positive"] },
  });
  const doFetch = ((): Promise<Response> =>
    Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;
  const api = new SplitwiseAPI({ apiKey: "k" }, doFetch);
  let err: unknown = null;
  try {
    await api.createExpense({ cost: "x" });
  } catch (e) {
    err = e;
  }
  if (!(err instanceof Error)) throw new Error("assert failed: a field error throws");
  assert(err.message.includes("cost: is not a valid number"), "the field is named");
  assert(err.message.includes("must be positive"), "every message survives");
});

// An `errors` key present but EMPTY is the documented success shape, so
// it must not throw. This is the pin that stops the fix above from
// turning every successful call into a failure.
Deno.test("an empty errors object is a success, not a failure", async () => {
  const body = JSON.stringify({ expenses: [{ id: 42 }], errors: {} });
  const doFetch = ((): Promise<Response> =>
    Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;
  const api = new SplitwiseAPI({ apiKey: "k" }, doFetch);
  const out = await api.createExpense({ cost: "10.00" });
  assert(out.expenses?.[0]?.id === 42, "the expense id comes back");
});

Deno.test("errorText reads the documented shapes and nothing else", () => {
  assert(errorText({ errors: {} }) === null, "an empty errors object is no error");
  assert(errorText({ expenses: [{ id: 1 }] }) === null, "no errors key is no error");
  assert(errorText(null) === null, "a null body is no error");
  assert(errorText("plain") === null, "a non-object body is no error");
  assert(errorText({ errors: { base: ["one"] } }) === "one", "base prints bare");
  assert(errorText({ errors: { cost: "bad" } }) === "cost: bad", "a bare string reads too");
  const two = errorText({ errors: { base: ["one"], cost: ["bad"] } });
  assert(two === "one; cost: bad", "several problems join, got " + two);
});
