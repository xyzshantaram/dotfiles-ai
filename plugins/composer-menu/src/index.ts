// Host half of the composer overflow menu.
//
// The menu itself lives in the browser. This half owns one small route the
// menu calls to set the sandbox permission preset for a session.
import type { IncomingMessage, ServerResponse } from "node:http";

// Minimal structural view of the DSH web server service, so this file does
// not depend on the cordis Context type exposing it.
interface WebServerHost {
  register(route: {
    kind: "prefix";
    path: string;
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
  }): () => void;
}

interface HostContext {
  webServer: WebServerHost;
  sessions: { get(id: string): unknown };
  permissionPresets: { set(session: unknown, name: string): void };
}

const name = "composer-menu";
const inject = ["webServer", "sessions", "permissionPresets"];

/** Read the whole request body as a UTF-8 string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      text += chunk;
    });
    req.on("end", () => resolve(text));
    req.on("error", reject);
  });
}

function apply(ctx: HostContext): () => void {
  return ctx.webServer.register({
    kind: "prefix",
    path: "/composer-menu",
    async handler(req, res) {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
      if (req.method !== "POST" || url.pathname !== "/composer-menu/api/permission")
        return reply(404, { error: "not found" });

      // This route raises sandbox permissions, so it must not be reachable from
      // any page the browser happens to load. A cross-origin JSON POST is
      // stopped by the CORS preflight, but a text/plain POST carrying a JSON
      // body does not preflight, so the preflight alone is not a defence.
      // Browsers always send Origin on a POST, so demand that it matches.
      if (req.headers.origin !== url.origin)
        return reply(403, { error: "cross-origin request refused" });

      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return reply(400, { error: "the request body must be JSON" });
      }
      if (
        typeof body !== "object" ||
        body === null ||
        typeof (body as { sessionId?: unknown }).sessionId !== "string" ||
        typeof (body as { preset?: unknown }).preset !== "string"
      )
        return reply(400, { error: 'expected a JSON body { "sessionId", "preset" }' });

      const { sessionId, preset } = body as { sessionId: string; preset: string };
      const session = ctx.sessions.get(sessionId);
      if (session === undefined) return reply(404, { error: "no such session: " + sessionId });

      // An unknown preset name throws, so map the failure onto a 400.
      try {
        ctx.permissionPresets.set(session, preset);
      } catch (e) {
        return reply(400, { error: String((e as Error).message ?? e) });
      }
      return reply(200, { ok: true });
    },
  });
}

export { apply, inject, name };
