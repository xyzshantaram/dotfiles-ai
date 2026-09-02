// Tests for the pure tool-definition helpers.
import { describe, expect, it } from "vitest";
import { buildDefinition, extractText, publicToolName } from "./tools.js";

describe("mcp-servers tool helpers", () => {
  it("builds the public tool name", () => {
    expect(publicToolName("nostrbook", "fetch_event")).toBe("mcp__nostrbook__fetch_event");
  });

  it("joins the text of one text block", () => {
    expect(extractText([{ type: "text", text: "hello" }])).toBe("hello");
  });

  it("joins several text blocks with newlines", () => {
    expect(
      extractText([
        { type: "text", text: "first" },
        { type: "text", text: "second" },
        { type: "text", text: "third" },
      ]),
    ).toBe("first\nsecond\nthird");
  });

  it("falls back to JSON for content with no text block", () => {
    const content = [{ type: "image", data: "abc" }];
    expect(extractText(content)).toBe(JSON.stringify(content));
  });

  it("builds a definition without a structured schema", () => {
    const inputSchema = { type: "object", properties: { id: { type: "string" } } };
    const def = buildDefinition({
      server: "gitlab",
      tool: { name: "list_issues", description: "list issues", inputSchema },
      execute: async () => ({ content: [] }),
    });
    expect(def.name).toBe("mcp__gitlab__list_issues");
    expect(def.description).toBe("list issues");
    expect(def.parameters).toBe(inputSchema);
    expect(def.output.schema.required).toEqual(["content"]);
    expect(def.output.schema.properties.structuredContent).toEqual({});
  });

  it("builds a definition with a structured schema", () => {
    const outputSchema = { type: "object", properties: { total: { type: "number" } } };
    const def = buildDefinition({
      server: "zepto",
      tool: { name: "search", inputSchema: {}, outputSchema },
      execute: async () => ({ content: [], structuredContent: { total: 1 } }),
    });
    expect(def.output.schema.required).toEqual(["content", "structuredContent"]);
    expect(def.output.schema.properties.structuredContent).toBe(outputSchema);
  });

  it("wraps execute and drops structuredContent when no schema is declared", async () => {
    const content = [{ type: "text", text: "result body" }];
    const def = buildDefinition({
      server: "s",
      tool: { name: "t", inputSchema: {} },
      execute: async (args) => ({ content, structuredContent: { got: args } }),
    });
    const result = await def.execute({ a: 1 });
    expect(result.content).toBe(content);
    expect(result.structuredContent).toBeUndefined();
    expect(def.output.render({}, result)).toEqual([{ type: "text", text: "result body" }]);
  });

  it("keeps structuredContent when an output schema exists", async () => {
    const content = [{ type: "text", text: "result body" }];
    const def = buildDefinition({
      server: "s",
      tool: { name: "t", inputSchema: {}, outputSchema: { type: "object" } },
      execute: async (args) => ({ content, structuredContent: { got: args } }),
    });
    const result = await def.execute({ a: 1 });
    expect(result.content).toBe(content);
    expect(result.structuredContent).toEqual({ got: { a: 1 } });
  });
});
