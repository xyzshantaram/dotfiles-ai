// Host half of the H2+H3 tool-render client plugin.
//
// The cards live in the browser. This half owns one small route that serves
// image bytes by local file path, and the compaction prettyView projection
// the compaction card reads on the client. A later ticket will point the
// read_image and see cards at this route.
import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname } from "node:path";
import type { Session } from "@deepseek-ai/dsh-session";
import { compactionViewsProjection } from "./projection.js";
import { guardedApprovalsProjection } from "./guarded-approvals.js";

/**
 * The only extensions this route serves. The map is copied from the
 * `read_image` tool, so the route accepts exactly what that tool can produce.
 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Minimal structural views of the DSH services, so this file does not
// depend on the cordis Context type exposing them.
interface WebServerHost {
  register(route: {
    kind: "prefix";
    path: string;
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
  }): () => void;
}

interface SessionProjectionsHost {
  register(definition: unknown): () => void;
  snapshot(session: Session): unknown;
}

interface ScopeContext {
  sessionProjections: SessionProjectionsHost;
  effect(dispose: () => () => void): void;
  on(event: string, fn: (payload: never) => void): void;
}

interface HostContext {
  webServer: WebServerHost;
  inject(services: string[], fn: (scope: ScopeContext) => void): void;
}

/** Stable Cordis plugin name. */
const name = "tool-render";
const inject = ["webServer"];

function apply(ctx: HostContext): () => void {
  const disposeRoute = ctx.webServer.register({
    kind: "prefix",
    path: "/tool-render/image",
    async handler(req, res) {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
      const filePath = url.searchParams.get("path");
      if (req.method !== "GET" || filePath === null || filePath === "")
        return reply(400, { error: "expected a GET request with a ?path= file path" });

      const contentType = IMAGE_EXTENSIONS[extname(filePath).toLowerCase()];
      if (contentType === undefined)
        return reply(400, { error: "not a recognized image extension" });

      // Screenshots can change between requests, so the browser must not
      // cache this response.
      const headers = { "content-type": contentType, "cache-control": "no-store" };

      // Stream the bytes. Do not write the 200 head first: a missing or
      // unreadable file raises a stream error, and this order keeps that
      // error a clean 404.
      const stream = createReadStream(filePath);
      stream.on("open", () => {
        res.writeHead(200, headers);
        stream.pipe(res);
      });
      stream.on("error", () => {
        if (res.headersSent) {
          res.end();
          return;
        }
        reply(404, { error: "not found" });
      });
    },
  });

  // The compaction prettyView projection and the durable guarded-approval
  // projection. Registering and warming ride the injected scope, so a
  // service remount cannot leave a second copy behind. A warm failure must
  // never break session startup, so the call is guarded.
  ctx.inject(["sessionProjections"], (scope) => {
    const dispose = scope.sessionProjections.register(compactionViewsProjection);
    const disposeGuarded = scope.sessionProjections.register(guardedApprovalsProjection);
    scope.effect(() => () => {
      dispose();
      disposeGuarded();
    });
    const warm = (session: Session): void => {
      try {
        scope.sessionProjections.snapshot(session);
      } catch {
        // ignored on purpose
      }
    };
    scope.on("session/created", warm);
    scope.on("agent/session-start", (payload: { agent: { session: Session } }) =>
      warm(payload.agent.session),
    );
  });

  return disposeRoute;
}

export { apply, inject, name };
