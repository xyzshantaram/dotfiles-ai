// plugins/composer-menu/src/index.ts
var webOff = /* @__PURE__ */ new Map();
var name = "composer-menu";
var inject = ["webServer", "sessions", "permissionPresets"];
function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      text += chunk;
    });
    req.on("end", () => resolve(text));
    req.on("error", reject);
  });
}
function apply(ctx) {
  const isOff = (agent) => {
    if (webOff.get(agent.id) === true) return true;
    const session = agent.session;
    if (typeof session === "object" && session !== null && typeof session.id === "string")
      return webOff.get(session.id) === true;
    return false;
  };
  const stopCreated = ctx.on("agent/created", (payload) => {
    const agent = payload.agent;
    return agent.ctx.effect(() => {
      const stop = agent.ctx.on(
        "system-prompt/assemble",
        async (assembly, context, next) => {
          const result = await next();
          if (!isOff(agent)) return result;
          return {
            ...result,
            tools: result.tools.filter(
              (tool) => tool.name !== "web_search" && tool.name !== "web_fetch"
            )
          };
        }
      );
      return () => {
        if (stop !== void 0) stop();
      };
    }, "composer-menu: web tools gate");
  });
  const disposeRoutes = ctx.webServer.register({
    kind: "prefix",
    path: "/composer-menu",
    async handler(req, res) {
      const reply = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
      if (req.method !== "POST") return reply(404, { error: "not found" });
      const readGuardedBody = async () => {
        if (req.headers.origin !== url.origin) {
          reply(403, { error: "cross-origin request refused" });
          return null;
        }
        let body;
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
        return body;
      };
      if (url.pathname === "/composer-menu/api/permission") {
        const body = await readGuardedBody();
        if (body === null) return;
        if (typeof body.sessionId !== "string" || typeof body.preset !== "string")
          return reply(400, { error: 'expected a JSON body { "sessionId", "preset" }' });
        const { sessionId, preset } = body;
        const session = ctx.sessions.get(sessionId);
        if (session === void 0) return reply(404, { error: "no such session: " + sessionId });
        try {
          ctx.permissionPresets.set(session, preset);
        } catch (e) {
          return reply(400, { error: String(e.message ?? e) });
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
    }
  });
  return () => {
    disposeRoutes();
    if (stopCreated !== void 0) stopCreated();
  };
}
export {
  apply,
  inject,
  name
};
