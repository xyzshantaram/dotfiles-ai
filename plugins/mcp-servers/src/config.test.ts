// Tests for the mcp-servers roster reader.
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig, readConfig } from "./config.js";

const FULL_ROSTER = `{
  "mcpServers": {
    "nostrbook": { "type": "stdio", "command": "npx", "args": ["-y", "@nostrbook/mcp@latest"] },
    "gitlab": { "type": "stdio", "command": "glab", "args": ["mcp", "serve"] },
    "easyeda": { "type": "stdio", "command": "npx", "args": ["-y", "easyeda-mcp-pro@latest"], "env": { "TOOL_PROFILE": "core" } },
    "blinkit": { "type": "stdio", "command": "node", "args": ["~/installs/blinkit-mcp/dist/index.js"] },
    "swiggy-food": { "type": "http", "url": "https://mcp.swiggy.com/food" },
    "swiggy-instamart": { "type": "http", "url": "https://mcp.swiggy.com/im" },
    "zepto": { "type": "http", "url": "https://mcp.zepto.co.in/mcp" }
  }
}`;

describe("mcp-servers config reader", () => {
  it("parses all seven servers from the shipped roster", () => {
    const { servers, error } = parseConfig(FULL_ROSTER);
    expect(error).toBe("");
    expect(servers.map((s) => s.name)).toEqual([
      "nostrbook",
      "gitlab",
      "easyeda",
      "blinkit",
      "swiggy-food",
      "swiggy-instamart",
      "zepto",
    ]);
    expect(servers[0]).toEqual({
      name: "nostrbook",
      type: "stdio",
      command: "npx",
      args: ["-y", "@nostrbook/mcp@latest"],
      env: {},
    });
  });

  it("returns an error and no servers for malformed JSON", () => {
    const { servers, error } = parseConfig("{ not json");
    expect(servers).toEqual([]);
    expect(error).toContain("not valid JSON");
  });

  it("skips an invalid server name and reports it", () => {
    const { servers, error } = parseConfig(
      JSON.stringify({
        mcpServers: {
          "bad name!": { url: "https://x.example" },
          good: { url: "https://y.example" },
        },
      }),
    );
    expect(servers.map((s) => s.name)).toEqual(["good"]);
    expect(error).toContain("bad name!");
  });

  it("expands a leading ~/ in args", () => {
    const { servers, error } = parseConfig(
      JSON.stringify({
        mcpServers: {
          blinkit: {
            type: "stdio",
            command: "node",
            args: ["~/installs/blinkit-mcp/dist/index.js"],
          },
        },
      }),
    );
    expect(error).toBe("");
    const stdio = servers[0] as { type: "stdio"; command: string; args: string[] };
    expect(stdio.args[0]).not.toContain("~");
    expect(stdio.args[0]).toContain("installs/blinkit-mcp/dist/index.js");
  });

  it("defaults type to http", () => {
    const { servers, error } = parseConfig(
      JSON.stringify({ mcpServers: { zepto: { url: "https://mcp.zepto.co.in/mcp" } } }),
    );
    expect(error).toBe("");
    expect(servers[0]).toEqual({ name: "zepto", type: "http", url: "https://mcp.zepto.co.in/mcp" });
  });

  it("rejects an http entry with a bad url", () => {
    const { servers, error } = parseConfig(
      JSON.stringify({ mcpServers: { broken: { type: "http", url: "ftp://nope" } } }),
    );
    expect(servers).toEqual([]);
    expect(error).toContain("broken");
    expect(error).toContain("http:// or https://");
  });

  it("returns an error for a missing file instead of throwing", () => {
    const { servers, error } = readConfig(join(tmpdir(), "does-not-exist-mcp-servers.json"));
    expect(servers).toEqual([]);
    expect(error).toContain("could not read");
  });

  it("reads a real file from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-servers-test-"));
    try {
      const path = join(dir, "mcp-servers.json");
      writeFileSync(path, FULL_ROSTER);
      const { servers, error } = readConfig(path);
      expect(error).toBe("");
      expect(servers).toHaveLength(7);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
