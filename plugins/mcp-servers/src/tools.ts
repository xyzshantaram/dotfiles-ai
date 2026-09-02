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
        return typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text" &&
          typeof (b as { text?: unknown }).text === "string";
      })
      .map((b) => b.text);
    if (parts.length > 0) return parts.join("\n");
  }
  return JSON.stringify(content);
}

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
    description: tool.description ?? "",
    parameters: tool.inputSchema,
    output: {
      schema: {
        type: "object",
        properties: {
          content: { type: "array", items: {} },
          structuredContent: hasStructured ? tool.outputSchema : {},
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
