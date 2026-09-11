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
import { normalizeConfiguredOrigin, resolveRedirectOrigin } from "./origin.js";

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

// Plain plugin config from the preset's sync.sh row (the bash-guard pattern:
// `config: { ... }` beside the plugin path), NOT the dsh-settings namespace
// mechanism plugins/see.ts uses. A redirect origin is deployment
// infrastructure, not a user preference: it must equal the redirect_uri
// registered with the OAuth provider, it is the same for every user of this
// deployment, and it must be available at host boot before any settings
// provider may have mounted. A single pinned string fits a plain config row;
// a settings section would imply per-user editability that would only drift
// from the registered value.
export interface McpServersConfig {
  // Exact public origin browsers use, e.g. "https://harness.example.com".
  // Unset (or blank) means loopback-only: OAuth works on loopback requests
  // and fails loudly otherwise. See ./origin.ts for the full decision.
  redirectOrigin?: unknown;
}

function page(title: string, body: string): string {
  return (
    `<!doctype html><html><head><title>${title}</title></head>` +
    `<body><h1>${title}</h1><p>${body}</p><p><a href="/">Back</a></p></body></html>`
  );
}

export function apply(ctx: Context, config?: McpServersConfig): void {
  const dir = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  const path = join(dir, "mcp-servers.json");
  const { servers, error } = readConfig(path);
  ctx.logger.info(`mcp-servers: loaded ${servers.length} server(s) from ${path}`);
  if (error) ctx.logger.warn(`mcp-servers: ${error}`);

  // #137 resolution (replaces the KNOWN DEFECT annotation that used to live
  // on the handler below): the redirect origin is PINNED here when
  // configured, otherwise derived per request for loopback only.
  const normalized = normalizeConfiguredOrigin(config?.redirectOrigin);
  let configuredOrigin = "";
  // An explicitly set but invalid origin is never silently ignored: every
  // authorize attempt fails loudly with this instead of guessing.
  let configError = "";
  if (normalized.ok === false) {
    configError = normalized.error;
    ctx.logger.warn(`mcp-servers: ${configError}`);
  } else {
    configuredOrigin = normalized.origin;
    if (configuredOrigin !== "") {
      ctx.logger.info(`mcp-servers: using configured redirect origin ${configuredOrigin}`);
    }
  }

  const store = createStore(join(dir, "mcp-oauth.json"));
  const registry = createRegistry(ctx, {
    store,
    dshHome: dir,
    getOrigin: () => {
      // Known at boot when redirectOrigin is pinned; otherwise empty until
      // the first request arrives. The http connect path defers the login
      // attempt while the real origin is still unknown.
      return currentOrigin;
    },
  });

  // Per-request origin, set by the mounted route handler. It starts as the
  // pinned origin when one is configured, else stays empty until the first
  // browser request, because the port cannot be guessed and an OAuth
  // redirect_uri must match the browser's origin exactly.
  let currentOrigin = configuredOrigin;
  // The loud failure for the current request, if resolveRedirectOrigin
  // refused it. The authorize endpoint reports this instead of producing a
  // redirect_uri the provider would reject with an opaque error.
  let lastOriginError = configError;

  const webServer = (ctx as unknown as { webServer: WebServerHost }).webServer;
  const disposeRoute = webServer.register({
    kind: "prefix",
    path: "/mcp-servers",
    async handler(req, res) {
      // #137: the browser's true origin is NOT recoverable from this request
      // behind a TLS-terminating proxy (the scheme is lost) or dsh-remote
      // gating (Host and Origin are rewritten to loopback for authenticated
      // requests), so no scheme is guessed and no x-forwarded-* header is
      // trusted — both would make a wrong redirect_uri look plausible. A
      // pinned redirectOrigin always wins (a rewritten proxied request looks
      // exactly like loopback, so derivation must not shadow the pin);
      // otherwise loopback derives http://<host> as before and anything else
      // records a loud error that the authorize endpoint reports.
      const verdict =
        configError !== ""
          ? { ok: false as const, error: configError }
          : resolveRedirectOrigin(req.headers.host, configuredOrigin);
      if (verdict.ok === false) {
        // Never keep a stale origin a later authorize could reuse: with no
        // usable origin the connect path defers, and the authorize endpoint
        // below answers with the loud error.
        currentOrigin = configuredOrigin;
        lastOriginError = verdict.error;
      } else {
        currentOrigin = verdict.origin;
        lastOriginError = "";
      }
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
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
          // Fail loudly instead of starting a login against a guessed
          // redirect_uri: the provider would reject it with an opaque error
          // the user cannot tell apart from a harness defect.
          if (lastOriginError !== "") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: lastOriginError }));
            return;
          }
          const authorizeUrl = await registry.authorize(name);
          if (authorizeUrl === "") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                error:
                  "mcp-servers: the browser origin is still unknown; reload the panel and try again.",
              }),
            );
            return;
          }
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
