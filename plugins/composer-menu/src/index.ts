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
  on(event: string, listener: (...args: any[]) => any): () => void;
}

// Sessions with the web tools off, keyed by the id the browser sends.
const webOff = new Map<string, boolean>();

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
  // isOff checks both keys because the browser sends the session id and the
  // gate sees the agent id. Those are expected to be the same value.
  const isOff = (agent: any): boolean => {
    if (webOff.get(agent.id) === true) return true;
    const session = agent.session;
    if (typeof session === "object" && session !== null && typeof session.id === "string")
      return webOff.get(session.id) === true;
    return false;
  };

  const stopCreated = ctx.on("agent/created", (payload: any) => {
    const agent = payload.agent;
    return agent.ctx.effect(() => {
      const stop = agent.ctx.on(
        "system-prompt/assemble",
        async (assembly: any, context: any, next: () => Promise<any>) => {
          const result = await next();
          if (!isOff(agent)) return result;
          return {
            ...result,
            tools: result.tools.filter(
              (tool: any) => tool.name !== "web_search" && tool.name !== "web_fetch",
            ),
          };
        },
      );
      return () => {
        if (stop !== undefined) stop();
      };
    }, "composer-menu: web tools gate");
  });

  const disposeRoutes = ctx.webServer.register({
    kind: "prefix",
    path: "/composer-menu",
    async handler(req, res) {
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
      if (req.method !== "POST") return reply(404, { error: "not found" });

      // One gate for every route here. The permission route raises sandbox
      // permissions, so it must not be reachable from any page the browser
      // happens to load. A cross-origin JSON POST is stopped by the CORS
      // preflight, but a text/plain POST carrying a JSON body does not
      // preflight, so the preflight alone is not a defence. Browsers always
      // send Origin on a POST, so demand that it matches. The web-mode routes
      // hold the same line rather than each inventing their own.
      // Returns the parsed body, or null once it has already replied.
      const readGuardedBody = async (): Promise<Record<string, unknown> | null> => {
        if (req.headers.origin !== url.origin) {
          reply(403, { error: "cross-origin request refused" });
          return null;
        }
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          reply(400, { error: "the request body must be JSON" });
          return null;
        }
        if (typeof body !== "object" || body === null) {
          reply(400, { error: "the request body must be a JSON object" });
          return null;
        }
        return body as Record<string, unknown>;
      };

      if (url.pathname === "/composer-menu/api/permission") {
        const body = await readGuardedBody();
        if (body === null) return;
        if (typeof body.sessionId !== "string" || typeof body.preset !== "string")
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
      }

      if (url.pathname === "/composer-menu/api/web-mode/get") {
        const body = await readGuardedBody();
        if (body === null) return;
        if (typeof body.sessionId !== "string")
          return reply(400, { error: 'expected a JSON body { "sessionId" }' });
        return reply(200, { ok: true, off: webOff.get(body.sessionId) === true });
      }

      if (url.pathname === "/composer-menu/api/web-mode/set") {
        const body = await readGuardedBody();
        if (body === null) return;
        if (typeof body.sessionId !== "string" || typeof body.off !== "boolean")
          return reply(400, { error: 'expected a JSON body { "sessionId", "off" }' });
        if (body.off) webOff.set(body.sessionId, true);
        else webOff.delete(body.sessionId);
        return reply(200, { ok: true });
      }

      return reply(404, { error: "not found" });
    },
  });

  return () => {
    disposeRoutes();
    if (stopCreated !== undefined) stopCreated();
  };
}

export { apply, inject, name };
