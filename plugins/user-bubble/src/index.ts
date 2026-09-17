/**
 * Host row of the user-bubble takeover (#125, #148).
 *
 * The client-module registry discovers the `dsh.client` entry through this
 * row; behaviour used to live entirely in the browser bundle. #148 adds
 * one small route: the served slash-name list the bubble validates chips
 * against.
 *
 * WHY A ROUTE (#148, defect A). A bare `/tmp` is shape-identical to
 * `/compact`, so no shape test can separate paths from commands — and the
 * composer lexicon that could is unreachable from a `conversation.chat.node`
 * entry (it rides the composer-bar inject hooks only; see the verdict
 * recorded in ./text.ts). The host, however, owns both registries, so it
 * serves their names and the client chips a slash token if and only if its
 * name is listed. Unknown names stay plain text (the safe direction).
 */
import type { IncomingMessage, ServerResponse } from "node:http";

// Minimal structural views of the DSH services, so this file does not
// depend on the host Context type exposing them (the tool-render precedent).
interface SkillSummary {
  name: string;
}

interface SkillsHost {
  list(options?: { cwd?: string; signal?: AbortSignal }): Promise<readonly SkillSummary[]>;
}

interface SessionHeaderView {
  cwd?: string;
}

interface SessionView {
  header: SessionHeaderView;
}

interface SessionsHost {
  get(id: string): SessionView | undefined;
}

interface CommandsHost {
  layers: {
    merge<V>(scope: undefined, pick: (layer: { commands: Map<string, V> }) => Map<string, V>): Map<string, V>;
  };
}

interface Logger {
  warn(message: string): void;
}

interface HostContext {
  get(name: "skills"): SkillsHost | undefined;
  get(name: "commands"): CommandsHost | undefined;
  get(name: "sessions"): SessionsHost | undefined;
  get(name: string): unknown;
  logger: Logger;
  inject(services: string[], fn: (scope: unknown) => void): void;
}

const name = "user-bubble";
const inject: string[] = [];

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * Collect the GLOBAL skill names, preferring the session's working
 * directory for project-root discovery when a session id is given.
 * Skills resolve per scope and cwd in the composer; a transcript renderer
 * was never given a session address, so the global view plus cwd
 * discovery is the honest answer, and anything missed renders plain.
 */
async function skillNames(ctx: HostContext, sessionId: string | null): Promise<string[]> {
  const skills = ctx.get("skills");
  if (skills === undefined) return [];
  let cwd: string | undefined;
  if (sessionId !== null) {
    try {
      cwd = ctx.get("sessions")?.get(sessionId)?.header.cwd;
    } catch {
      cwd = undefined;
    }
  }
  const summaries = await skills.list(typeof cwd === "string" && cwd !== "" ? { cwd } : {});
  const names: string[] = [];
  for (const summary of summaries) {
    if (typeof summary?.name === "string" && summary.name !== "") names.push(summary.name);
  }
  return names.sort();
}

/**
 * Collect the GLOBAL command names. commands.list(agent) is the public
 * read, but it needs the exact receiving agent — and resolving an agent
 * from a transcript row is precisely what the slot seam withholds (no
 * sessionId in owner props). The global layer holds every plain-context
 * registration (including /compact), so merge(undefined, ...) — the
 * documented "global view" of ScopedLayers — is the right read here.
 * Agent-scoped shadows are missed and render plain (safe direction).
 */
function commandNames(ctx: HostContext): string[] {
  const commands = ctx.get("commands");
  if (commands === undefined) return [];
  const merged = commands.layers.merge(undefined, (layer) => layer.commands);
  return [...merged.keys()].sort();
}

function makeNamesHandler(ctx: HostContext) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "GET") return sendJson(res, 400, { error: "expected a GET request" });
    // The "http://" here is a PARSING BASE, not a claim about the scheme:
    // only searchParams is read, so a TLS-terminated request parses
    // identically (the tool-render precedent carries the same note).
    const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "127.0.0.1"));
    const rawSession = url.searchParams.get("sessionId");
    const sessionId = rawSession !== null && rawSession !== "" ? rawSession : null;
    let skills: string[] = [];
    let commands: string[] = [];
    try {
      skills = await skillNames(ctx, sessionId);
    } catch (error) {
      ctx.logger.warn(`user-bubble: skill names unavailable: ${String((error as Error)?.message ?? error)}`);
    }
    try {
      commands = commandNames(ctx);
    } catch (error) {
      ctx.logger.warn(`user-bubble: command names unavailable: ${String((error as Error)?.message ?? error)}`);
    }
    // Per-source degradation, never a throw: a bubble with no names renders
    // every slash token plain, which is correct-but-conservative.
    sendJson(res, 200, { skills, commands });
  };
}

function apply(ctx: HostContext): void {
  // Lazy inject: the plugin still loads where no web server mounts. Then
  // the client fetch fails and every slash token renders plain — the same
  // safe direction as an empty name list.
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = (scope as unknown as {
        webServer: { register(options: unknown): unknown };
      }).webServer;
      server.register({
        kind: "exact",
        path: "/user-bubble/slash-names",
        handler: makeNamesHandler(ctx),
      });
    });
  } catch {
    // no webServer: the bubble still loads and renders slash tokens plain
  }
}

export { apply, inject, name };
