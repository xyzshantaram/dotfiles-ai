// The OAuth callback must only act on a login this host started. Without the
// state check, another page could steer the browser to the callback carrying a
// foreign authorization code, and that account would be bound to this harness.
// An empty roster keeps this test off the network.
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "./index.js";

type Handler = (req: unknown, res: unknown) => Promise<void>;

function bootPlugin(seedState: string | undefined) {
  const home = mkdtempSync(join(tmpdir(), "mcp-servers-cb-"));
  writeFileSync(join(home, "mcp-servers.json"), JSON.stringify({ mcpServers: {} }));
  if (seedState !== undefined) {
    // The store loads once at apply time, so the file stands in for the state
    // the same store would have written while starting a login.
    writeFileSync(
      join(home, "mcp-oauth.json"),
      JSON.stringify({ example: { state: seedState } }),
    );
  }
  process.env.DSH_HOME = home;

  let handler: Handler | undefined;
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    tools: { register: () => () => {} },
    webServer: {
      register(route: { handler: Handler }) {
        handler = route.handler;
        return () => {};
      },
    },
    effect: () => {},
  };
  apply(ctx as never);
  if (handler === undefined) throw new Error("no route was registered");

  return async function hit(query: string): Promise<string> {
    let out = "";
    const res = { writeHead: () => {}, end: (b: string) => { out = b; } };
    const req = {
      method: "GET",
      url: `/mcp-servers/callback/example${query}`,
      headers: { host: "127.0.0.1:3080" },
    };
    await handler!(req, res);
    return out;
  };
}

const MISMATCH = "does not match a login started here";

describe("mcp-servers oauth callback", () => {
  it("rejects a code when no login is pending", async () => {
    const hit = bootPlugin(undefined);
    expect(await hit("?code=abc&state=attacker")).toContain(MISMATCH);
  });

  it("rejects a code whose state does not match the stored one", async () => {
    const hit = bootPlugin("real-state");
    expect(await hit("?code=abc&state=attacker")).toContain(MISMATCH);
  });

  it("rejects a code that carries no state at all", async () => {
    const hit = bootPlugin("real-state");
    expect(await hit("?code=abc")).toContain(MISMATCH);
  });

  it("passes the guard when the state matches", async () => {
    const hit = bootPlugin("real-state");
    const body = await hit("?code=abc&state=real-state");
    expect(body).not.toContain(MISMATCH);
    // The exchange itself fails here, because no transport is pending in this
    // harness. Reaching that message proves the guard let the request through.
    expect(body).toContain("no pending authorization");
  });
});
