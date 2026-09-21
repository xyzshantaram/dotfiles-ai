// plugins/shared/http.ts
var DEFAULT_MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

// plugins/user-bubble/src/index.ts
var name = "user-bubble";
var inject = [];
async function skillNames(ctx, sessionId) {
  const skills = ctx.get("skills");
  if (skills === void 0) return [];
  let cwd;
  if (sessionId !== null) {
    try {
      cwd = ctx.get("sessions")?.get(sessionId)?.header.cwd;
    } catch {
      cwd = void 0;
    }
  }
  const summaries = await skills.list(typeof cwd === "string" && cwd !== "" ? { cwd } : {});
  const names = [];
  for (const summary of summaries) {
    if (typeof summary?.name === "string" && summary.name !== "") names.push(summary.name);
  }
  return names.sort();
}
function commandNames(ctx) {
  const commands = ctx.get("commands");
  if (commands === void 0) return [];
  const merged = commands.layers.merge(void 0, (layer) => layer.commands);
  return [...merged.keys()].sort();
}
function makeNamesHandler(ctx) {
  return async (req, res) => {
    if (req.method !== "GET") return sendJson(res, 400, { error: "expected a GET request" });
    const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
    const rawSession = url.searchParams.get("sessionId");
    const sessionId = rawSession !== null && rawSession !== "" ? rawSession : null;
    let skills = [];
    let commands = [];
    try {
      skills = await skillNames(ctx, sessionId);
    } catch (error) {
      ctx.logger.warn(`user-bubble: skill names unavailable: ${String(error?.message ?? error)}`);
    }
    try {
      commands = commandNames(ctx);
    } catch (error) {
      ctx.logger.warn(`user-bubble: command names unavailable: ${String(error?.message ?? error)}`);
    }
    sendJson(res, 200, { skills, commands });
  };
}
function apply(ctx) {
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = scope.webServer;
      server.register({
        kind: "exact",
        path: "/user-bubble/slash-names",
        handler: makeNamesHandler(ctx)
      });
    });
  } catch {
  }
}
export {
  apply,
  inject,
  name
};
