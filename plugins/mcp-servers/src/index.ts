// Host half of the mcp-servers plugin. Reads the roster, connects every
// configured server, and registers its tools on ctx.tools as
// mcp__<server>__<rawName>. Http servers use OAuth: a login need surfaces as
// an authorization URL on /mcp-servers/api, and the browser callback
// completes the flow.
import { join } from "node:path";
import { homedir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import { readConfig } from "./config.js";
import { createRegistry } from "./connect.js";
import { createStore } from "./store.js";

// Minimal structural view of the DSH web server service, so this file does
// not depend on the cordis Context type exposing it.
interface WebServerHost {
  register(route: {
    kind: "prefix";
    path: string;
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
  }): () => void;
}
export const name = "mcp-servers";
export const inject = ["tools", "webServer"];

function page(title: string, body: string): string {
  return (
    `<!doctype html><html><head><title>${title}</title></head>` +
    `<body><h1>${title}</h1><p>${body}</p><p><a href="/">Back</a></p></body></html>`
  );
}

export function apply(ctx: Context): void {
  const dir = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  const path = join(dir, "mcp-servers.json");
  const { servers, error } = readConfig(path);
  ctx.logger.info(`mcp-servers: loaded ${servers.length} server(s) from ${path}`);
  if (error) ctx.logger.warn(`mcp-servers: ${error}`);

  const store = createStore(join(dir, "mcp-oauth.json"));
  const registry = createRegistry(ctx, {
    store,
    dshHome: dir,
    getOrigin: () => {
      // Empty until the first request arrives. The http connect path defers
      // the login attempt while the real origin is still unknown.
      return currentOrigin;
    },
  });

  // Per-request origin, set by the mounted route handler. It stays empty until
  // the first browser request, because the port cannot be guessed and an OAuth
  // redirect_uri must match the browser's origin exactly.
  let currentOrigin = "";

  const webServer = (ctx as unknown as { webServer: WebServerHost }).webServer;
  const disposeRoute = webServer.register({
    kind: "prefix",
    path: "/mcp-servers",
    async handler(req, res) {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      currentOrigin = url.origin;
      const parts = url.pathname.split("/").filter(Boolean);

      if (req.method === "GET" && parts[1] === "callback" && parts[2] !== undefined) {
        const name = decodeURIComponent(parts[2]);
        const code = url.searchParams.get("code");
        const oauthError = url.searchParams.get("error");
        // The state value ties this callback to a login this host started.
        // Without the check, any page could steer the browser here carrying a
        // foreign code, and bind that account to this harness.
        const expectedState = store.getState(name);
        const givenState = url.searchParams.get("state");
        let title: string;
        let body: string;
        if (oauthError) {
          title = "Authorization failed";
          body = `The server reported: ${oauthError}`;
        } else if (
          expectedState === undefined ||
          expectedState === "" ||
          givenState !== expectedState
        ) {
          title = "Authorization failed";
          body =
            `This callback for ${name} does not match a login started here. ` +
            `Start again from Settings.`;
        } else if (code) {
          try {
            await registry.finishAuth(name, code);
            // One state value is good for one exchange. Clearing it stops a
            // replay of the same callback URL.
            store.setState(name, "");
            title = "Authorized";
            body = `The server ${name} is authorized and its tools are registered.`;
          } catch (e) {
            title = "Authorization failed";
            body = `Could not complete authorization for ${name}: ${(e as Error).message}`;
          }
        } else {
          title = "Authorization failed";
          body = `The callback for ${name} carried no code.`;
        }
        res.writeHead(200, { "content-type": "text/html" });
        res.end(page(title, body));
        return;
      }

      if (req.method === "GET" && url.pathname === "/mcp-servers/api/servers") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ servers: registry.list() }));
        return;
      }

      if (
        req.method === "POST" &&
        parts[1] === "api" &&
        parts[2] === "servers" &&
        parts[3] !== undefined &&
        parts[4] === "authorize"
      ) {
        const name = decodeURIComponent(parts[3]);
        try {
          const authorizeUrl = await registry.authorize(name);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ authorizeUrl }));
        } catch (e) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
        return;
      }

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    },
  });

  // Cordis takes the RETURN VALUE of the effect body as the dispose callback.
  // Returning the cleanup arrow here is what defers it to teardown time.
  ctx.effect(() => () => {
    disposeRoute();
    void registry.stop();
  });
  void registry.start(servers);
}
