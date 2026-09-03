// plugins/composer-menu/src/index.ts
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
  return ctx.webServer.register({
    kind: "prefix",
    path: "/composer-menu",
    async handler(req, res) {
      const reply = (status, body2) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body2));
      };
      const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
      if (req.method !== "POST" || url.pathname !== "/composer-menu/api/permission")
        return reply(404, { error: "not found" });
      if (req.headers.origin !== url.origin)
        return reply(403, { error: "cross-origin request refused" });
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return reply(400, { error: "the request body must be JSON" });
      }
      if (typeof body !== "object" || body === null || typeof body.sessionId !== "string" || typeof body.preset !== "string")
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
  });
}
export {
  apply,
  inject,
  name
};
