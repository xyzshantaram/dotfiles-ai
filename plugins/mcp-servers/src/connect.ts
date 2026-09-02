// Connection registry for the configured MCP servers. Connects each server
// concurrently, lists tools, and registers them on ctx.tools. One server
// failing must never stop the others. Http servers use OAuth: a login need
// is captured as an authorization URL, not a hard error.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ServerConfig } from "./config.js";
import { createProvider } from "./oauth.js";
import type { TokenStore } from "./store.js";
import { buildDefinition, extractText } from "./tools.js";

export type ServerStatus = "connecting" | "connected" | "error" | "needs-auth";

export interface LiveServer {
  name: string;
  type: "stdio" | "http";
  status: ServerStatus;
  error: string;
  toolCount: number;
  // Authorization URL while awaiting a browser login. Empty otherwise.
  authUrl: string;
}

export interface RegistryOptions {
  store: TokenStore;
  // DSH home directory. The store owns the token file path, so this is
  // context for logging and future path needs.
  dshHome: string;
  // Current browser origin, derived per request by the caller.
  getOrigin(): string;
}

// Minimal structural view of the DSH tools service, so this file does not need
// the cordis types to compile in isolation.
interface ToolsHost {
  register(definition: unknown): () => void;
}

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}

// Shape of a callTool result we rely on. The SDK types are looser, so we cast.
interface CallToolResult {
  content: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}

export function createRegistry(
  ctx: { tools: ToolsHost; logger: Logger },
  opts: RegistryOptions,
) {
  // Per server: the live status, the client and http transport to keep
  // alive, and the tool disposers to unwind.
  const live = new Map<
    string,
    {
      info: LiveServer;
      server: ServerConfig;
      client: Client | undefined;
      transport: StreamableHTTPClientTransport | undefined;
      // Closure returning the URL captured by the provider during the
      // current connect attempt. Empty string when none was captured.
      capturedAuthUrl: (() => string) | undefined;
      disposers: Array<() => void>;
    }
  >();

  async function connectOne(server: ServerConfig): Promise<void> {
    const entry = live.get(server.name);
    if (!entry) return;
    // A reconnect must not double-register tools or leak the old client.
    for (const dispose of entry.disposers) dispose();
    entry.disposers = [];
    if (entry.client !== undefined) {
      try {
        await entry.client.close();
      } catch {
        // A half-open server can fail on close. The reconnect still proceeds.
      }
      entry.client = undefined;
    }
    entry.info.status = "connecting";
    entry.info.authUrl = "";

    const client = new Client({ name: "dsh-mcp-servers", version: "0.1.0" });
    entry.client = client;
    try {
      // StdioClientTransport already merges its env over the default SDK
      // environment, so pass our env straight through. Do not add process.env.
      let transport: StdioClientTransport | StreamableHTTPClientTransport;
      if (server.type === "stdio") {
        transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: server.env,
          cwd: server.cwd,
        });
      } else {
        // The redirect_uri must carry the exact origin the browser uses, port
        // included. At boot no request has arrived, so the origin is not known
        // yet. Defer the login rather than register a client against a wrong
        // redirect_uri: the panel's authorize call retries with the real origin.
        const origin = opts.getOrigin();
        if (origin === "" && opts.store.get(server.name)?.tokens === undefined) {
          entry.info.status = "needs-auth";
          entry.info.error = "";
          entry.info.toolCount = 0;
          entry.info.authUrl = "";
          ctx.logger.info(`mcp-servers: ${server.name} awaiting authorization`);
          return;
        }
        // The provider captures the authorization URL instead of opening a
        // browser. finishAuth must run on the SAME transport instance, so the
        // transport stays on the live entry.
        let capturedUrl = "";
        const provider = createProvider({
          server: server.name,
          store: opts.store,
          redirectUrl: `${origin}/mcp-servers/callback/${server.name}`,
          onAuthorizationUrl: (url) => {
            capturedUrl = url;
          },
        });
        transport = new StreamableHTTPClientTransport(new URL(server.url), { authProvider: provider });
        entry.transport = transport;
        entry.capturedAuthUrl = () => capturedUrl;
      }
      await client.connect(transport);

      // Page through the tool list. Loop while nextCursor is set.
      const tools = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools({ cursor });
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor !== undefined);

      for (const tool of tools) {
        const dispose = ctx.tools.register(
          buildDefinition({
            server: server.name,
            tool,
            execute: async (args) => {
              const result = (await client.callTool({
                name: tool.name,
                arguments: args,
              })) as CallToolResult;
              if (result.isError) {
                throw new Error(extractText(result.content));
              }
              return { content: result.content, structuredContent: result.structuredContent };
            },
          }),
        );
        entry.disposers.push(dispose);
      }
      entry.info.status = "connected";
      entry.info.toolCount = tools.length;
      ctx.logger.info(`mcp-servers: ${server.name} connected, ${tools.length} tool(s)`);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        // A browser login is needed. Surface the authorization URL for the
        // panel. This is a state, not a hard error.
        entry.info.status = "needs-auth";
        entry.info.error = "";
        entry.info.toolCount = 0;
        entry.info.authUrl = entry.capturedAuthUrl?.() ?? "";
        ctx.logger.info(`mcp-servers: ${server.name} needs authorization`);
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      entry.info.status = "error";
      entry.info.error = message;
      entry.info.toolCount = 0;
      ctx.logger.warn(`mcp-servers: ${server.name} failed to connect: ${message}`);
    }
  }

  return {
    async start(servers: ServerConfig[]): Promise<void> {
      for (const server of servers) {
        live.set(server.name, {
          info: {
            name: server.name,
            type: server.type,
            status: "connecting",
            error: "",
            toolCount: 0,
            authUrl: "",
          },
          server,
          client: undefined,
          transport: undefined,
          capturedAuthUrl: undefined,
          disposers: [],
        });
      }
      // Concurrent by design. connectOne catches its own errors, so no
      // Promise.all rejection can stop the other servers.
      await Promise.all(servers.map((s) => connectOne(s)));
    },

    list(): LiveServer[] {
      return Array.from(live.values(), (e) => ({ ...e.info }));
    },

    // Complete the OAuth code exchange on the stored transport, then
    // reconnect this one server and register its tools.
    async finishAuth(name: string, code: string): Promise<void> {
      const entry = live.get(name);
      const transport = entry?.transport;
      if (entry === undefined || transport === undefined) {
        throw new Error(`mcp-servers: no pending authorization for ${name}`);
      }
      await transport.finishAuth(code);
      await connectOne(entry.server);
    },

    // Build a fresh authorization URL. This always reconnects, because any
    // URL captured at boot was built before a request revealed the real origin.
    async authorize(name: string): Promise<string> {
      const entry = live.get(name);
      if (entry === undefined) {
        throw new Error(`mcp-servers: unknown server ${name}`);
      }
      await connectOne(entry.server);
      return entry.info.authUrl;
    },

    async stop(): Promise<void> {
      for (const entry of live.values()) {
        for (const dispose of entry.disposers) dispose();
        entry.disposers = [];
        if (entry.client === undefined) continue;
        try {
          await entry.client.close();
        } catch {
          // A half-open stdio server can fail on close. Stop must still
          // unwind the rest.
        }
      }
    },
  };
}
