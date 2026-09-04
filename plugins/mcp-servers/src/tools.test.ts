// Tests for the pure tool-definition helpers.
import { describe, expect, it } from "vitest";
import { assertSupportedJsonSchema } from "@deepseek-ai/dsh-tools";
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

    it("coerces a schema-typed additionalProperties to true", () => {
      // Real failure: easyeda's structuredContent named a schema, not a
      // boolean, for additionalProperties on a nested property, and DSH
      // rejected the whole tool with "additionalProperties must be a
      // boolean". A schema-typed value means extra properties of some shape
      // are allowed, so true is the closest expressible meaning.
      const out = sanitizeSchema({
        type: "object",
        properties: {
          feature_flags: { type: "object", additionalProperties: { type: "string" } },
        },
      }) as { properties: { feature_flags: Record<string, unknown> } };
      expect(out.properties.feature_flags.additionalProperties).toBe(true);
    });

    it("keeps a boolean additionalProperties as given", () => {
      const out = sanitizeSchema({
        type: "object",
        additionalProperties: false,
      }) as Record<string, unknown>;
      expect(out.additionalProperties).toBe(false);
    });

    it("reduces a type array to its first non-null type", () => {
      // Real failure, the third in this family: easyeda's structuredContent
      // used ["string", "null"] for a nullable field, and DSH rejected the
      // whole tool with "type must be a single type string (type arrays are
      // not supported)".
      const out = sanitizeSchema({
        type: "object",
        properties: {
          color: { type: ["string", "null"] },
          lineWidth: { type: ["number", "null"] },
        },
      }) as { properties: Record<string, Record<string, unknown>> };
      expect(out.properties.color.type).toBe("string");
      expect(out.properties.lineWidth.type).toBe("number");
    });

    it("drops a type array that names only null", () => {
      const out = sanitizeSchema({ type: ["null"] }) as Record<string, unknown>;
      expect("type" in out).toBe(false);
    });
  });

  // This suite is the checker, not another hand-written expectation. Three
  // separate easyeda outages came from one root cause: a keyword this
  // sanitiser passed through that DSH's registration validator refuses. Each
  // time the fix matched only the symptom that happened to surface. These
  // tests run sanitizeSchema's OUTPUT through assertSupportedJsonSchema --
  // the real validator that produced every one of those errors -- so an
  // unsupported construct fails here instead of at tool registration.
  describe("sanitizeSchema output passes DSH's own schema validator", () => {
    const check = (schema: unknown) => {
      const sanitized = sanitizeSchema(schema);
      expect(() => assertSupportedJsonSchema(sanitized)).not.toThrow();
      return sanitized;
    };

    it("accepts the incident-1 schema: $schema, format, minimum, maximum", () => {
      check({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          count: { type: "number", minimum: 0, maximum: 100 },
          url: { type: "string", format: "uri" },
        },
      });
    });

    it("accepts the incident-2 schema: a schema-typed additionalProperties", () => {
      check({
        type: "object",
        properties: {
          feature_flags: { type: "object", additionalProperties: { type: "string" } },
          feature_maturity: { type: "object", additionalProperties: { type: "string" } },
        },
      });
    });

    it("accepts the incident-3 schema: nullable type arrays inside array items", () => {
      check({
        type: "object",
        properties: {
          wires: {
            type: "array",
            items: {
              type: "object",
              properties: {
                color: { type: ["string", "null"] },
                lineWidth: { type: ["number", "null"] },
              },
            },
          },
        },
      });
    });

    it("accepts one schema carrying every construct all three incidents used", () => {
      check({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://example.invalid/x",
        title: "Everything",
        type: "object",
        additionalProperties: { type: "string" },
        properties: {
          nested: {
            type: ["object", "null"],
            additionalProperties: { type: "number" },
            properties: {
              deep: {
                type: "array",
                items: { type: ["string", "null"], pattern: "^a", default: "a" },
              },
            },
          },
          bounded: { type: "integer", minimum: 1, maximum: 9, exclusiveMinimum: 0 },
          choice: { oneOf: [{ type: "string", format: "date" }, { type: ["number", "null"] }] },
        },
        required: ["nested"],
      });
    });
  });
});
