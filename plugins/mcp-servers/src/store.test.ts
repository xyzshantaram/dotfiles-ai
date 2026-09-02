// Tests for the MCP OAuth token store.
import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createStore } from "./store.js";

// The sanctioned scratch space. Fresh directory per run.
const DIR = "/tmp/dsh/mcp-servers-store-test";
const PATH = join(DIR, "mcp-oauth.json");

function reset(): void {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
}

describe("mcp-servers token store", () => {
  it("starts empty when the file is missing", () => {
    reset();
    const store = createStore(PATH);
    expect(store.get("zepto")).toBeUndefined();
    expect(store.getCodeVerifier("zepto")).toBeUndefined();
  });

  it("round-trips tokens through a reload", () => {
    reset();
    const tokens = { accessToken: "a", refreshToken: "b" };
    const first = createStore(PATH);
    first.setTokens("zepto", tokens);
    first.setCodeVerifier("zepto", "verifier-1");
    first.setClientInformation("swiggy-food", { client_id: "cid" });

    const second = createStore(PATH);
    expect(second.get("zepto")?.tokens).toEqual(tokens);
    expect(second.getCodeVerifier("zepto")).toBe("verifier-1");
    expect(second.get("swiggy-food")?.clientInformation).toEqual({ client_id: "cid" });
  });

  it("starts empty without throwing on a malformed file", () => {
    reset();
    writeFileSync(PATH, "{ not json");
    const store = createStore(PATH);
    expect(store.get("zepto")).toBeUndefined();
  });

  it("writes the file with mode 0600", () => {
    reset();
    const store = createStore(PATH);
    store.setTokens("zepto", { accessToken: "a" });
    const mode = statSync(PATH).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
