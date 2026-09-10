/**
 * session-archive — archived-session cleanup panel, host half.
 *
 * Owns the same-origin routes the browser panel uses:
 *   - GET  /sessions/archived         — archived session logs (id, title,
 *     cwd, createdAt, log file size, live flag)
 *   - POST /sessions/archived/delete  — remove one archived session log
 *     directory from disk
 *   - POST /sessions/archived/delete-batch  — remove many archived session
 *     log directories in one request (body { ids: string[] })
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
import { basename, dirname } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson, readBody, isPlainObject } from "../../shared/http";

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
/**
 * The zero-I/O listing read (#133).
 *
 * This replaced `sessionQuery.readTitleSnapshots(everyArchivedId)`, which
 * looked like an index lookup and was not: per session it performed a full
 * readFile, a full zstd decompress, a full log parse and a structuredClone
 * PER EVENT. The panel therefore paid the cost of fully loading EVERY
 * archived log — measured here at 822 logs / 715MB, twelve over 10MB, worst
 * case 38.6MB expanding to 215MB across 154,865 events — in order to render
 * a one-line title per row.
 *
 * The second-order damage was worse than the first. Upstream retains only
 * FIVE prepared inspections (dsh-session-persistence preparedSessionCacheSize:
 * 5), so fanning out dozens of inspections evicted the very inspection a
 * subsequent session OPEN would have reused. The panel did not merely cost
 * its own load; it made the next click slower too.
 *
 * `cachedSnapshot` is documented upstream as "the zero-I/O listing read:
 * whole values viewed straight from the stored rows... as stale as the last
 * durable checkpoint but never wrong, and never from an unrelated log (the
 * caller's header is the identity witness)". It is synchronous, reads no
 * log, and is the same mechanism the shipped session list already uses.
 */
interface SessionProjectionCacheService {
  cachedSnapshot(meta: SessionHeader): { values?: { title?: unknown } } | undefined;
}

/** Look up one optional host service. */
function service<T>(ctx: Context, name: string): T | undefined {
  return (ctx as { get(name: string): unknown }).get(name) as T | undefined;
}

/**
 * One row's title, or null when the cache cannot supply it.
 *
 * DEGRADES PER ROW, NEVER PER LIST. A session checkpointed before the cache
 * could write (the projection cache only began writing successfully once the
 * lossless-JSON defect #127 was fixed), or one whose row predates the
 * current log lifecycle, simply has no cached title — that row lists without
 * one, exactly as an unresolved title did before. Nothing here may throw or
 * reject: a missing title must never cost the user the whole archive list,
 * which is the only reason it is worth reading a possibly-absent value at
 * all.
 */
export function titleOf(
  cache: SessionProjectionCacheService | undefined,
  header: SessionHeader,
): string | null {
  if (cache === undefined) return null;
  try {
    const snapshot = cache.cachedSnapshot(header);
    const title = snapshot?.values?.title;
    return typeof title === "string" && title !== "" ? title : null;
  } catch {
    // A cache miss must not fail the listing. Same fail-soft contract the
    // upstream cache states for its own durable writes.
    return null;
  }
}

/** The archived sessions list handler. */
function makeListHandler(ctx: Context) {
  return async (_req: IncomingMessage, res: ServerResponse) => {
    const workspace = service<WorkspaceRegistryService>(ctx, "workspaceRegistry");
    const persistence = service<SessionPersistenceService>(ctx, "sessionPersistence");
    if (workspace === undefined || persistence === undefined) {
      sendJson(res, 200, { ok: false, error: "session archive services unavailable" });
      ctx.logger.warn("archived sessions list: services unavailable");
      return;
    }
    try {
      const archived = new Set(workspace.archivedSessionIds);
      const sessions = service<SessionsService>(ctx, "sessions");
      // Looked up ONCE for the whole listing, not per row.
      const projectionCache = service<SessionProjectionCacheService>(
        ctx,
        "sessionProjectionCache",
      );
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
          // Read from the in-memory cache row, in this loop, with no await:
          // the previous implementation gathered ids here and then fanned
          // out a full log load per id after the loop.
          title: titleOf(projectionCache, header),
          cwd: header.cwd ?? null,
          createdAt: header.createdAt,
          size,
          live: sessions?.get(header.id) !== undefined,
        });
      }
      sendJson(res, 200, { ok: true, sessions: rows });
      ctx.logger.info(`listed ${rows.length} archived sessions`);
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      ctx.logger.error(
        "archived sessions list failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };
}

/** The result of one archived-session delete attempt. */
export interface DeleteOutcome {
  id: string;
  ok: boolean;
  error?: string;
}

/** Delete one archived session log directory. This helper never throws. */
export async function deleteArchivedSession(ctx: Context, id: string): Promise<DeleteOutcome> {
  const persistence = service<SessionPersistenceService>(ctx, "sessionPersistence");
  if (persistence === undefined) {
    ctx.logger.warn("delete refused: session persistence service unavailable");
    return { id, ok: false, error: "session persistence service unavailable" };
  }
  const sessions = service<SessionsService>(ctx, "sessions");
  if (sessions?.get(id) !== undefined) {
    ctx.logger.warn(`delete refused for session ${id}: session is live`);
    return { id, ok: false, error: "session is live" };
  }
  const workspace = service<WorkspaceRegistryService>(ctx, "workspaceRegistry");
  if (workspace !== undefined && !workspace.archivedSessionIds.includes(id)) {
    ctx.logger.warn(`delete refused for session ${id}: not archived`);
    return { id, ok: false, error: "not archived" };
  }
  try {
    const headers = await persistence.list();
    const header = headers.find((candidate) => candidate.id === id);
    if (header === undefined) {
      ctx.logger.warn(`delete refused for session ${id}: not found`);
      return { id, ok: false, error: "not found" };
    }
    const located = persistence.locate(header);
    if (located === undefined) {
      ctx.logger.warn(`delete refused for session ${id}: log not found`);
      return { id, ok: false, error: "not found" };
    }
    if (basename(dirname(located.path)) !== id) {
      ctx.logger.warn(`delete refused for session ${id}: path mismatch`);
      return { id, ok: false, error: "path mismatch; refusing to delete" };
    }
    await rm(dirname(located.path), { recursive: true, force: true });
    ctx.logger.info(`deleted archived session ${id}`);
    return { id, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.logger.error("delete failed for session " + id + ": " + message);
    return { id, ok: false, error: message };
  }
}

/** The single archived session deletion handler. */
function makeDeleteHandler(ctx: Context) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    let body: unknown;
    try {
      body = await readBody(req, 16 * 1024);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      ctx.logger.warn("delete refused: invalid request body");
      return;
    }
    const id =
      isPlainObject(body) && typeof (body as { id?: unknown }).id === "string"
        ? (body as { id: string }).id
        : null;
    if (id === null) {
      sendJson(res, 400, { ok: false, error: "missing id" });
      ctx.logger.warn("delete refused: missing session id");
      return;
    }
    const outcome = await deleteArchivedSession(ctx, id);
    const payload: { ok: boolean; error?: string } = { ok: outcome.ok };
    if (outcome.error !== undefined) payload.error = outcome.error;
    sendJson(res, 200, payload);
  };
}

/** The batch archived session deletion handler. */
export function makeBatchDeleteHandler(ctx: Context) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    let body: unknown;
    try {
      body = await readBody(req, 16 * 1024);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      ctx.logger.warn("batch delete refused: invalid request body");
      return;
    }
    const ids =
      isPlainObject(body) &&
      Array.isArray(body.ids) &&
      body.ids.length > 0 &&
      body.ids.every((entry) => typeof entry === "string")
        ? (body.ids as string[])
        : null;
    if (ids === null) {
      sendJson(res, 400, { ok: false, error: "missing ids" });
      ctx.logger.warn("batch delete refused: missing ids");
      return;
    }
    const results: DeleteOutcome[] = [];
    for (const id of ids) {
      results.push(await deleteArchivedSession(ctx, id));
    }
    const deleted = results.filter((outcome) => outcome.ok).length;
    ctx.logger.info(`batch deleted ${deleted} of ${ids.length} archived sessions`);
    sendJson(res, 200, { ok: true, results });
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
      server.register({
        kind: "exact",
        path: "/sessions/archived/delete-batch",
        handler: makeBatchDeleteHandler(ctx),
      });
    });
  } catch {
    // no webServer: the panel still loads and shows a fetch error
  }
}
