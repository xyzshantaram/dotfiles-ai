/**
 * Unit tests for the browser-half request helper.
 *
 * The helper calls the global fetch. Each test installs a fake fetch
 * that records the call and returns a canned response, so no real
 * network happens. The original fetch is saved and restored around each
 * test, and console logging is silenced to keep the output readable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "./client-util";

/** A canned fetch response: the fields request() reads. */
interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** One recorded fetch call. */
interface FetchCall {
  url: string;
  opts: Record<string, unknown>;
}

const originalFetch = globalThis.fetch;

let calls: FetchCall[] = [];

/** Install a fake fetch that records its input and returns one response. */
function installFetch(respond: () => Promise<FakeResponse>): void {
  calls = [];
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    calls.push({ url: String(input), opts: (init as Record<string, unknown>) ?? {} });
    return respond();
  }) as unknown as typeof fetch;
}

/** Build a fake response with one canned JSON body. */
function fakeResponse(ok: boolean, status: number, json: unknown): () => Promise<FakeResponse> {
  return () => Promise.resolve({ ok: ok, status: status, json: () => Promise.resolve(json) });
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("request", () => {
  it("GET 200 with a JSON body returns the data and no error", async () => {
    installFetch(fakeResponse(true, 200, { hello: "world" }));
    const result = await request("GET", "/api/thing");
    expect(result).toEqual({ data: { hello: "world" }, error: null });
  });

  it("GET with an error body returns the error and null data", async () => {
    installFetch(fakeResponse(true, 200, { error: "boom" }));
    const result = await request("GET", "/api/thing");
    expect(result).toEqual({ data: null, error: "boom" });
  });

  it("GET with a non-ok status returns HTTP <status> as the error", async () => {
    installFetch(fakeResponse(false, 404, {}));
    const result = await request("GET", "/api/missing");
    expect(result).toEqual({ data: null, error: "HTTP 404" });
  });

  it("GET with a failed fetch returns the error message", async () => {
    installFetch(() => Promise.reject(new Error("network down")));
    const result = await request("GET", "/api/thing");
    expect(result).toEqual({ data: null, error: "network down" });
  });

  it("GET with a non-Error rejection coerces the value to a string", async () => {
    installFetch(() => Promise.reject("oops"));
    const result = await request("GET", "/api/thing");
    expect(result).toEqual({ data: null, error: "oops" });
  });

  it("POST with no body sends no body or headers", async () => {
    installFetch(fakeResponse(true, 200, null));
    await request("POST", "/api/thing");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/thing");
    expect(calls[0].opts.method).toBe("POST");
    expect(calls[0].opts.body).toBeUndefined();
    expect(calls[0].opts.headers).toBeUndefined();
  });

  it("POST with a body sends the JSON body and content-type header", async () => {
    installFetch(fakeResponse(true, 200, null));
    await request("POST", "/api/thing", { name: "x" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/thing");
    expect(calls[0].opts.method).toBe("POST");
    expect(calls[0].opts.body).toBe(JSON.stringify({ name: "x" }));
    expect(calls[0].opts.headers).toEqual({ "content-type": "application/json" });
  });
});
