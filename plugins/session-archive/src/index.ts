/**
 * session-archive — archived-session cleanup panel, host half.
 *
 * Owns the same-origin routes the browser panel uses:
 *   - GET  /sessions/archived         — archived session logs (id, title,
 *     cwd, createdAt, log file size, live flag)
 *   - POST /sessions/archived/delete  — remove one archived session log
 *     directory from disk
 *
 * The archive set is read-only here. There is no unarchive or remove API,
 * so the panel never mutates the workspace registry. Deletion removes the
 * log directory only; the session stops appearing in the panel once its log
 * is gone.
 *
 * Service facts (verified against the live harness):
 *   - workspaceRegistry exposes a GETTER `archivedSessionIds` (readonly
 *     array of session id strings) — read it as a property, not a method.
 *   - sessionPersistence.list(signal?) -> SessionHeader[] where each header
 *     has { id, cwd?, createdAt }; locate(meta) -> { path } | undefined.
 *   - sessions.get(id) -> Session | undefined (the live session).
 *   - The fs service has no delete/unlink, so node:fs/promises removes the
 *     log directory (same import style as plugins/bash-guard.ts).
 *
 * The route registration is lazy: ctx.inject(["webServer"], ...) keeps the
 * plugin loadable when no web server mounts, and every handler answers a
 * JSON error object instead of throwing when a host service is missing.
 */

import { stat, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Stable Cordis plugin name; also the client loader entry id. */
export const name = "session-archive";

/** No hard host dependencies: services are looked up lazily per request. */
export const inject = [];

/** Minimal structural view of one persisted session header. */
interface SessionHeader {
  id: string;
  cwd?: string;
  createdAt: string | number;
}

/** The host services, looked up lazily and cast to these shapes. */
interface WorkspaceRegistryService {
  archivedSessionIds: readonly string[];
}
interface SessionPersistenceService {
  list(signal?: AbortSignal): Promise<SessionHeader[]>;
  locate(meta: SessionHeader): { path: string } | undefined;
}
interface SessionsService {
  get(id: string): unknown;
}
interface SessionQueryService {
  readTitleSnapshots(
    sessionIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<
    Array<
      | {
          sessionId: string;
          status: "fulfilled";
          value: { session: unknown; title?: { title: string } };
        }
      | { sessionId: string; status: "rejected"; reason: unknown }
    >
  >;
}

/** Look up one optional host service. */
function service<T>(ctx: Context, name: string): T | undefined {
  return (ctx as { get(name: string): unknown }).get(name) as T | undefined;
}

// TODO(dedup): use plugins/shared/http.ts sendJson/readBody
/** Write a small JSON response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 16 * 1024;

/** Read and parse a JSON request body. Throws on bad or oversized input. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const declared = req.headers["content-length"];
  if (declared !== undefined && Number(declared) > MAX_BODY_BYTES) {
    throw new Error("request body too large");
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("body is not valid JSON");
  }
}

/** The archived sessions list handler. */
function makeListHandler(ctx: Context) {
  return async (_req: IncomingMessage, res: ServerResponse) => {
    const workspace = service<WorkspaceRegistryService>(ctx, "workspaceRegistry");
    const persistence = service<SessionPersistenceService>(ctx, "sessionPersistence");
    if (workspace === undefined || persistence === undefined) {
      sendJson(res, 200, { ok: false, error: "session archive services unavailable" });
      return;
    }
    try {
      const archived = new Set(workspace.archivedSessionIds);
      const sessions = service<SessionsService>(ctx, "sessions");
      const headers = await persistence.list();
      const rows: Array<{
        id: string;
        title: string | null;
        cwd: string | null;
        createdAt: string | number;
        size: number;
        live: boolean;
      }> = [];
      for (const header of headers) {
        if (!archived.has(header.id)) continue;
        const located = persistence.locate(header);
        if (located === undefined) continue;
        let size = -1;
        try {
          const info = await stat(located.path);
          size = info.size;
        } catch {
          // log file unreadable: report -1 so the row still lists
        }
        rows.push({
          id: header.id,
          title: null,
          cwd: header.cwd ?? null,
          createdAt: header.createdAt,
          size,
          live: sessions?.get(header.id) !== undefined,
        });
      }
      const sessionQuery = service<SessionQueryService>(ctx, "sessionQuery");
      if (sessionQuery !== undefined && rows.length > 0) {
        const observations = await sessionQuery.readTitleSnapshots(rows.map((row) => row.id));
        const titles = new Map<string, string>();
        for (const observation of observations) {
          if (observation.status !== "fulfilled") continue;
          const title = observation.value.title;
          if (title === undefined) continue;
          titles.set(observation.sessionId, title.title);
        }
        for (const row of rows) {
          const title = titles.get(row.id);
          if (title !== undefined) row.title = title;
        }
      }
      sendJson(res, 200, { ok: true, sessions: rows });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

/** The archived session deletion handler. */
function makeDeleteHandler(ctx: Context) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const persistence = service<SessionPersistenceService>(ctx, "sessionPersistence");
    if (persistence === undefined) {
      sendJson(res, 200, { ok: false, error: "session persistence service unavailable" });
      return;
    }
    let body: unknown;
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const id =
      typeof body === "object" && body !== null && typeof (body as { id?: unknown }).id === "string"
        ? (body as { id: string }).id
        : null;
    if (id === null) {
      sendJson(res, 400, { ok: false, error: "missing id" });
      return;
    }
    const sessions = service<SessionsService>(ctx, "sessions");
    if (sessions?.get(id) !== undefined) {
      sendJson(res, 200, { ok: false, error: "session is live" });
      return;
    }
    try {
      const headers = await persistence.list();
      const header = headers.find((candidate) => candidate.id === id);
      if (header === undefined) {
        sendJson(res, 200, { ok: false, error: "not found" });
        return;
      }
      const located = persistence.locate(header);
      if (located === undefined) {
        sendJson(res, 200, { ok: false, error: "not found" });
        return;
      }
      await rm(dirname(located.path), { recursive: true, force: true });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function apply(ctx: Context): void {
  // Lazy inject: the plugin still loads where no web server mounts. Each
  // handler also answers JSON errors instead of throwing on missing hosts.
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = (scope as unknown as { webServer: { register(options: unknown): unknown } })
        .webServer;
      server.register({ kind: "exact", path: "/sessions/archived", handler: makeListHandler(ctx) });
      server.register({
        kind: "exact",
        path: "/sessions/archived/delete",
        handler: makeDeleteHandler(ctx),
      });
    });
  } catch {
    // no webServer: the panel still loads and shows a fetch error
  }
}
