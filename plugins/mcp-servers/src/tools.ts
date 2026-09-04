// Pure helpers for turning MCP tool records into DSH tool definitions.
// Kept free of SDK imports so the unit tests run without a live server.
// The definition shape mirrors the built-in dsh-mcp-client plugin.

export interface McpToolRecord {
  name: string;
  description?: string;
  inputSchema: object;
  outputSchema?: object;
}

export interface ToolExecute {
  (args: Record<string, unknown>): Promise<{
    content: unknown;
    structuredContent?: unknown;
  }>;
}

export function publicToolName(server: string, raw: string): string {
  return `mcp__${server}__${raw}`;
}

/** Join the text of all "text" blocks. Fall back to JSON when none carry text. */
export function extractText(content: unknown): string {
  if (Array.isArray(content)) {
    const parts = content
      .filter((b): b is { type: "text"; text: string } => {
        return (
          typeof b === "object" &&
          b !== null &&
          (b as { type?: unknown }).type === "text" &&
          typeof (b as { text?: unknown }).text === "string"
        );
      })
      .map((b) => b.text);
    if (parts.length > 0) return parts.join("\n");
  }
  return JSON.stringify(content);
}

/** Return a copy of the schema with only keywords DSH accepts.
 *
 * The accepted subset is: type, oneOf, properties, required,
 * additionalProperties, items, enum, const, description, title.
 * Everything else is dropped, so one unsupported keyword on a deep node
 * no longer rejects the whole tool at registration.
 * Numeric bounds (minimum, maximum) carry real guidance for the model, so
 * dropping them folds each bound into the node description as text like
 * (minimum 0). The input is not mutated. Non-object input comes back
 * unchanged.
 */
export function sanitizeSchema(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }
  const node = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const bound: { minimum?: string; maximum?: string } = {};
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (
      key === "properties" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const props: Record<string, unknown> = {};
      for (const [name, prop] of Object.entries(value as Record<string, unknown>)) {
        props[name] = sanitizeSchema(prop);
      }
      out[key] = props;
    } else if (key === "items") {
      out[key] = sanitizeSchema(value);
    } else if (key === "oneOf" && Array.isArray(value)) {
      out[key] = value.map((member) => sanitizeSchema(member));
    } else if (key === "additionalProperties") {
      // The accepted subset requires a plain boolean here (DSH's own
      // validator error: "additionalProperties must be a boolean"). A
      // schema-typed value (constraining the SHAPE of extra properties, e.g.
      // {type: "string"}) is unsupported and was passed through verbatim
      // before this fix, rejecting the whole tool. Coerce to permissive
      // (true) instead of dropping the field: a schema-typed constraint here
      // almost always means "extra properties are allowed", just of some
      // shape this subset cannot express, so true keeps that meaning.
      out[key] = typeof value === "boolean" ? value : true;
    } else if (KEEP.has(key)) {
      out[key] = value;
    } else if (key === "minimum" || key === "maximum") {
      bound[key] = String(value);
    }
  }
  // Fold dropped numeric bounds into the description so the model still sees
  // them. Emit minimum before maximum whatever order the source used, so the
  // text does not depend on key order in the incoming schema.
  const bounds: string[] = [];
  if (bound.minimum !== undefined) bounds.push(`minimum ${bound.minimum}`);
  if (bound.maximum !== undefined) bounds.push(`maximum ${bound.maximum}`);
  if (bounds.length > 0) {
    const text = `(${bounds.join(", ")})`;
    const base = typeof out.description === "string" ? out.description : "";
    out.description = base.length > 0 ? `${base} ${text}` : text;
  }
  return out;
}

const KEEP = new Set([
  "type",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "description",
  "title",
]);

export function buildDefinition(opts: {
  server: string;
  tool: McpToolRecord;
  execute: ToolExecute;
}) {
  const { server, tool, execute } = opts;
  // structuredContent is only required when the server declared an output schema.
  const hasStructured = tool.outputSchema !== undefined;
  return {
    name: publicToolName(server, tool.name),
    parameters: sanitizeSchema(tool.inputSchema),
    description: tool.description ?? "",
    output: {
      schema: {
        type: "object",
        properties: {
          content: { type: "array", items: {} },
          structuredContent: hasStructured ? sanitizeSchema(tool.outputSchema) : {},
        },
        required: hasStructured ? ["content", "structuredContent"] : ["content"],
        additionalProperties: false,
      },
      render(_args: unknown, value: { content: unknown }) {
        return [{ type: "text", text: extractText(value.content) }];
      },
    },
    execute: async (args: Record<string, unknown>) => {
      const result = await execute(args);
      return hasStructured
        ? { content: result.content, structuredContent: result.structuredContent }
        : { content: result.content };
    },
  };
}
