// Tests for the pure tool-definition helpers.
import { describe, expect, it } from "vitest";
import { buildDefinition, extractText, publicToolName, sanitizeSchema } from "./tools.js";

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
    expect(def.parameters).toEqual(inputSchema);
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
    expect(def.output.schema.properties.structuredContent).toEqual(outputSchema);
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
  describe("sanitizeSchema", () => {
    it("removes $schema from the top level", () => {
      const out = sanitizeSchema({
        type: "object",
        $schema: "https://json-schema.org/draft/2020-12/schema",
      });
      expect(out).toEqual({ type: "object" });
    });

    it("folds minimum and maximum of a nested property into its description", () => {
      const out = sanitizeSchema({
        type: "object",
        properties: {
          count: { type: "number", minimum: 0, maximum: 100, description: "device count" },
        },
      });
      const count = (out as { properties: { count: Record<string, unknown> } }).properties.count;
      expect(count.minimum).toBeUndefined();
      expect(count.maximum).toBeUndefined();
      expect(count.description).toBe("device count (minimum 0, maximum 100)");
    });

    it("emits minimum before maximum even when the source lists maximum first", () => {
      // Object key order decided the text before this was fixed, so a schema
      // written the other way round produced "(maximum 100, minimum 0)".
      const out = sanitizeSchema({
        type: "object",
        properties: {
          count: { type: "number", maximum: 100, minimum: 0 },
        },
      });
      const count = (out as { properties: { count: Record<string, unknown> } }).properties.count;
      expect(count.description).toBe("(minimum 0, maximum 100)");
    });

    it("creates a description from bounds when the node has none", () => {
      const out = sanitizeSchema({ type: "number", minimum: 1 }) as Record<string, unknown>;
      expect(out.description).toBe("(minimum 1)");
    });

    it("sanitises nested items and oneOf members", () => {
      const out = sanitizeSchema({
        type: "array",
        items: {
          type: "object",
          $schema: "x",
          properties: { a: { type: "string", format: "uri" } },
        },
        oneOf: [
          { type: "string", pattern: "ab" },
          { type: "number", default: 1 },
        ],
      }) as { items: Record<string, unknown>; oneOf: Record<string, unknown>[] };
      expect(out.items).toEqual({ type: "object", properties: { a: { type: "string" } } });
      expect(out.oneOf).toEqual([{ type: "string" }, { type: "number" }]);
    });

    it("keeps supported keywords untouched", () => {
      const schema = {
        type: "object",
        title: "T",
        description: "d",
        properties: { id: { type: "string", enum: ["a"], const: "a" } },
        required: ["id"],
        additionalProperties: false,
      };
      expect(sanitizeSchema(schema)).toEqual(schema);
    });
  });
});
