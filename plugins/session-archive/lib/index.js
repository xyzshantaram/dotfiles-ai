// plugins/session-archive/src/index.ts
import { stat, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";

// plugins/shared/http.ts
var DEFAULT_MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
async function readBody(req, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const declared = req.headers["content-length"];
  if (declared !== void 0 && Number(declared) > maxBytes) {
    throw new Error("request body too large");
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("body is not valid JSON");
  }
}

// plugins/session-archive/src/index.ts
var name = "session-archive";
var inject = [];
function service(ctx, name2) {
  return ctx.get(name2);
}
function makeListHandler(ctx) {
  return async (_req, res) => {
    const workspace = service(ctx, "workspaceRegistry");
    const persistence = service(ctx, "sessionPersistence");
    if (workspace === void 0 || persistence === void 0) {
      sendJson(res, 200, { ok: false, error: "session archive services unavailable" });
      ctx.logger.warn("archived sessions list: services unavailable");
      return;
    }
    try {
      const archived = new Set(workspace.archivedSessionIds);
      const sessions = service(ctx, "sessions");
      const headers = await persistence.list();
      const rows = [];
      for (const header of headers) {
        if (!archived.has(header.id)) continue;
        const located = persistence.locate(header);
        if (located === void 0) continue;
        let size = -1;
        try {
          const info = await stat(located.path);
          size = info.size;
        } catch {
        }
        rows.push({
          id: header.id,
          title: null,
          cwd: header.cwd ?? null,
          createdAt: header.createdAt,
          size,
          live: sessions?.get(header.id) !== void 0
        });
      }
      const sessionQuery = service(ctx, "sessionQuery");
      if (sessionQuery !== void 0 && rows.length > 0) {
        const observations = await sessionQuery.readTitleSnapshots(rows.map((row) => row.id));
        const titles = /* @__PURE__ */ new Map();
        for (const observation of observations) {
          if (observation.status !== "fulfilled") continue;
          const title = observation.value.title;
          if (title === void 0) continue;
          titles.set(observation.sessionId, title.title);
        }
        for (const row of rows) {
          const title = titles.get(row.id);
          if (title !== void 0) row.title = title;
        }
      }
      sendJson(res, 200, { ok: true, sessions: rows });
      ctx.logger.info(`listed ${rows.length} archived sessions`);
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      ctx.logger.error(
        "archived sessions list failed: " + (error instanceof Error ? error.message : String(error))
      );
    }
  };
}
function makeDeleteHandler(ctx) {
  return async (req, res) => {
    const persistence = service(ctx, "sessionPersistence");
    if (persistence === void 0) {
      sendJson(res, 200, { ok: false, error: "session persistence service unavailable" });
      ctx.logger.warn("delete refused: session persistence service unavailable");
      return;
    }
    let body;
    try {
      body = await readBody(req, 16 * 1024);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      ctx.logger.warn("delete refused: invalid request body");
      return;
    }
    const id = typeof body === "object" && body !== null && typeof body.id === "string" ? body.id : null;
    if (id === null) {
      sendJson(res, 400, { ok: false, error: "missing id" });
      ctx.logger.warn("delete refused: missing session id");
      return;
    }
    const sessions = service(ctx, "sessions");
    if (sessions?.get(id) !== void 0) {
      sendJson(res, 200, { ok: false, error: "session is live" });
      ctx.logger.warn(`delete refused for session ${id}: session is live`);
      return;
    }
    const workspace = service(ctx, "workspaceRegistry");
    if (workspace !== void 0 && !workspace.archivedSessionIds.includes(id)) {
      sendJson(res, 200, { ok: false, error: "not archived" });
      ctx.logger.warn(`delete refused for session ${id}: not archived`);
      return;
    }
    try {
      const headers = await persistence.list();
      const header = headers.find((candidate) => candidate.id === id);
      if (header === void 0) {
        sendJson(res, 200, { ok: false, error: "not found" });
        ctx.logger.warn(`delete refused for session ${id}: not found`);
        return;
      }
      const located = persistence.locate(header);
      if (located === void 0) {
        sendJson(res, 200, { ok: false, error: "not found" });
        ctx.logger.warn(`delete refused for session ${id}: log not found`);
        return;
      }
      if (basename(dirname(located.path)) !== id) {
        sendJson(res, 200, { ok: false, error: "path mismatch; refusing to delete" });
        ctx.logger.warn(`delete refused for session ${id}: path mismatch`);
        return;
      }
      await rm(dirname(located.path), { recursive: true, force: true });
      sendJson(res, 200, { ok: true });
      ctx.logger.info(`deleted archived session ${id}`);
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
      ctx.logger.error(
        "delete failed for session " + id + ": " + (error instanceof Error ? error.message : String(error))
      );
    }
  };
}
function apply(ctx) {
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = scope.webServer;
      server.register({ kind: "exact", path: "/sessions/archived", handler: makeListHandler(ctx) });
      server.register({
        kind: "exact",
        path: "/sessions/archived/delete",
        handler: makeDeleteHandler(ctx)
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
