// Regression cover for the boot-origin rule. An http server must not start an
// OAuth login before a browser request has revealed the real origin: a
// redirect_uri built from a guessed origin omits the port, and the callback
// then lands on an unreachable address. This path returns before any network
// call, so the test needs no server.
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRegistry } from "./connect.js";
import { createStore } from "./store.js";
import type { ServerConfig } from "./config.js";

function fakeCtx() {
  const logs: string[] = [];
  return {
    logs,
    ctx: {
      tools: { register: () => () => {} },
      logger: {
        info: (m: string) => logs.push(m),
        warn: (m: string) => logs.push(m),
      },
    },
  };
}

const httpServer: ServerConfig = {
  name: "example",
  type: "http",
  url: "https://mcp.example.invalid/mcp",
};

describe("mcp-servers registry", () => {
  it("defers an http login while the browser origin is unknown", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-servers-"));
    const store = createStore(join(dir, "tokens.json"));
    const { ctx } = fakeCtx();

    const registry = createRegistry(ctx, {
      store,
      dshHome: dir,
      // Empty origin models boot, before any request has arrived.
      getOrigin: () => "",
    });
    await registry.start([httpServer]);

    const live = registry.list();
    expect(live).toHaveLength(1);
    expect(live[0].status).toBe("needs-auth");
    expect(live[0].authUrl).toBe("");
    // Nothing may be persisted for a login that never started.
    expect(store.get("example")).toBeUndefined();
  });

  it("reports an unknown server by name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-servers-"));
    const { ctx } = fakeCtx();
    const registry = createRegistry(ctx, {
      store: createStore(join(dir, "tokens.json")),
      dshHome: dir,
      getOrigin: () => "",
    });
    await registry.start([]);

    await expect(registry.authorize("nope")).rejects.toThrow(/unknown server nope/);
  });
});
