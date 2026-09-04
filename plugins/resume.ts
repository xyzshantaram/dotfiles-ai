import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

// resume_search and resume_read — layered recall over the durable session log.
//
// resume_search greps the append-only event log and returns short one-line
// summaries per match, one fixed page at a time, so the agent can pick seqs
// to expand with resume_read. Layers:
//   1. current session events (always)
//   2. other sessions in the listed workspaces (only when `workspaces` is
//      non-empty), loaded via sessionPersistence.list
//
// resume_read expands one hit to its full original content. It reads the
// current session log directly, or any session sessionPersistence.load can
// open.
//
// There is no separate compaction layer. The harness log is append-only and
// survives compaction. A grep of the events array already reaches past a
// compaction, because every token the compaction step elided stays present
// and grep-able.
//
// There is no separate subagent-report layer. Reports arrive as user/message
// events with source.kind "subagent-report" inside the session or peer logs
// above, so the same grep finds them.

export const name = "resume";
export const inject = ["tools"] as const;

/** Hits per returned page of resume_search. */
export const PAGE_SIZE = 15;
/** Other-session cap for the workspace layer of resume_search. */
export const MAX_WORKSPACE_SESSIONS = 12;

type Matcher = (text: string) => boolean;

function makeMatcher(query: string): Matcher {
  const trimmed = query.trim();
  if (trimmed.length > 1 && trimmed.startsWith("/") && trimmed.endsWith("/")) {
    try {
      const re = new RegExp(trimmed.slice(1, -1), "i");
      return (text: string) => re.test(text);
    } catch {
      // fall through to substring
    }
  }
  const lower = trimmed.toLowerCase();
  return (text: string) => text.toLowerCase().includes(lower);
}

interface Hit {
  source: string;
  seq: number;
  role: string;
  text: string;
}

// Short summary text for a search hit. Always truncated: search shows many
// hits, so each one stays a one-line teaser. resume_read uses fullEventText
// for the untruncated content.
function eventText(ev: any): string {
  const d = ev?.data ?? {};
  const t = ev?.type;
  if (t === "user/message" || t === "assistant/message") {
    const content = d?.message?.content;
    let s = "";
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b) continue;
        if (b.type === "text") s += (b.text ?? "") + " ";
        else if (b.type === "tool-call") s += "[tool:" + (b.call?.name ?? "?") + "] ";
        else if (b.type === "tool-result") s += "[result] ";
      }
    }
    return s.trim();
  }
  if (t === "tool/call") return "call " + (d?.call?.name ?? "?");
  if (t === "tool/result") {
    const r = d?.result;
    if (typeof r === "string") return r;
    if (r && typeof r === "object") {
      try {
        return JSON.stringify(r).slice(0, 200);
      } catch {
        return "[unserializable result]";
      }
    }
    return "";
  }
  if (t === "compaction/summary")
    return "compaction shadowed " + ((d?.shadowedSeqs as unknown[])?.length ?? 0) + " seqs";
  if (t === "subagent/descriptor") return "subagent " + (d?.label ?? "") + " " + (d?.mode ?? "");
  if (t === "turn/start") return "turn " + (d?.turn ?? "?");
  return "";
}

// Full, untruncated content for resume_read. Deliberately a second function:
// the search path must keep its 160-char teasers, and folding a `limit`
// through one function would couple the two callers.
function fullEventText(ev: any): string {
  const d = ev?.data ?? {};
  const t = ev?.type;
  if (t === "user/message" || t === "assistant/message") {
    const content = d?.message?.content;
    let s = "";
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b) continue;
        if (b.type === "text") s += (b.text ?? "") + " ";
        else if (b.type === "tool-call") s += "[tool-call " + (b.call?.name ?? "?") + "] ";
        else if (b.type === "tool-result") s += "[tool-result] ";
        else s += "[" + (b.type ?? "unknown-block") + "] ";
      }
    }
    return s.trim();
  }
  if (t === "tool/call") return "call " + (d?.call?.name ?? "?");
  if (t === "tool/result") {
    const r = d?.result;
    if (typeof r === "string") return r;
    if (r && typeof r === "object") {
      try {
        return JSON.stringify(r);
      } catch {
        return "[unserializable result]";
      }
    }
    return "";
  }
  if (t === "compaction/summary")
    return "compaction shadowed " + ((d?.shadowedSeqs as unknown[])?.length ?? 0) + " seqs";
  if (t === "subagent/descriptor") return "subagent " + (d?.label ?? "") + " " + (d?.mode ?? "");
  if (t === "turn/start") return "turn " + (d?.turn ?? "?");
  // Unknown event type: return its whole payload instead of an empty string,
  // so resume_read on a novel seq still shows something useful.
  try {
    return JSON.stringify({ type: t, data: d });
  } catch {
    return "";
  }
}

function eventRole(ev: any): string {
  const d = ev?.data ?? {};
  const t = ev?.type;
  if (t === "user/message") {
    if (d?.source?.kind === "subagent-report") return "subagent-report";
    if (d?.source?.kind === "plugin") return "plugin";
    return "user";
  }
  if (t === "assistant/message") return "assistant";
  if (t === "tool/call") return "tool-call";
  if (t === "tool/result") return "tool-result";
  if (t === "compaction/summary" || t === "compaction/start" || t === "compaction/end")
    return "compaction";
  if (t === "subagent/descriptor") return "subagent";
  return t ?? "?";
}

function summarize(ev: any): Hit | null {
  const text = eventText(ev);
  if (!text) return null;
  const oneLine = text.replace(/\s+/g, " ").slice(0, 160);
  return { source: "", seq: ev?.seq ?? -1, role: eventRole(ev), text: oneLine };
}

function search(events: any[], matcher: Matcher, sourceLabel: string, out: Hit[]): void {
  if (!Array.isArray(events)) return;
  for (const ev of events) {
    const hit = summarize(ev);
    if (hit && matcher(hit.text)) {
      hit.source = sourceLabel;
      out.push(hit);
    }
  }
}

function shortId(id: unknown): string {
  return String(id ?? "").slice(0, 8);
}

function hitLine(h: Hit): string {
  return `[${h.source} seq ${h.seq}] ${h.role}: ${h.text}`;
}

export function apply(ctx: Context): void {
  const tools: any = ctx.get("tools");
  if (tools === undefined) {
    ctx.logger.warn("resume: tools service not mounted; resume_search/resume_read not registered");
    return;
  }
  ctx.effect(function* () {
    yield tools.register(
      defineTool({
        name: "resume_search",
        description:
          "Search the durable session log. " +
          "Returns short one-line summaries, one page at a time, plus a total count and a hasMore flag. " +
          "With no workspaces, searches only the current session's own event log (past compactions included). " +
          "Pass workspace paths in workspaces to also search other sessions in those workspaces. " +
          "Expand any hit with resume_read using its sessionId and seq before acting on it.",
        parameters: {
          query: {
            type: "string",
            required: true,
            description:
              'Text to find, matched case-insensitively. "/pattern/" form matches as a regular expression.',
          },
          workspaces: {
            type: "array",
            items: { type: "string" },
            description:
              "Workspace paths to reach other sessions from. Omit or pass empty to search only the current session.",
          },
          page: {
            type: "integer",
            description: "1-indexed page of hits to return. Default 1. Page size is 15.",
          },
        },
        output: {
          schema: {
            type: "object",
            properties: {
              hits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    seq: { type: "integer" },
                    role: { type: "string" },
                    text: { type: "string" },
                  },
                  additionalProperties: false,
                },
              },
              total: { type: "integer" },
              page: { type: "integer" },
              hasMore: { type: "boolean" },
            },
            additionalProperties: false,
          },
          render: (_args, value: any) => {
            const header =
              `Found ${value.total} match(es), showing page ${value.page} (${value.hits.length} shown).` +
              (value.hasMore ? " More pages exist; pass the next page number." : "");
            const lines = (value.hits as Hit[]).map(hitLine);
            return [{ type: "text", text: lines.length > 0 ? header + "\n" + lines.join("\n") : header }];
          },
        },
        async execute(args, exec) {
          const { query, workspaces, page: pageArg } = args;
          const page = Math.max(1, Math.trunc(pageArg ?? 1));
          const session = (exec as any)?.agent?.session;
          if (!session || !Array.isArray(session.events)) {
            ctx.logger.warn("resume_search invoked without an active session log");
            return { hits: [], total: 0, page, hasMore: false };
          }
          ctx.logger.info(
            `resume_search for session ${shortId(
              session.requestHeader?.()?.id ?? session.header?.id,
            )}, page ${page}`,
          );

          const matcher = makeMatcher(query);
          const hits: Hit[] = [];

          // Layer 1: current session.
          search(session.events, matcher, "current", hits);
          const currentId = session.requestHeader?.()?.id ?? session.header?.id;

          // Layer 2: other sessions in the listed workspaces (includes
          // subagent children and compaction boundaries, which live in their
          // event logs). Only runs when workspaces names at least one path.
          if (workspaces && workspaces.length > 0) {
            const sp: any = (ctx as any).get?.("sessionPersistence");
            if (sp && typeof sp.list === "function") {
              let headers: any[] = [];
              try {
                headers = (await sp.list()) ?? [];
              } catch {
                ctx.logger.warn("failed to list workspace sessions; workspace-session layer skipped");
                headers = [];
              }
              const wanted = new Set(workspaces);
              const others = headers
                .filter((h) => h && h.id !== currentId && wanted.has(h.cwd))
                .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
                .slice(0, MAX_WORKSPACE_SESSIONS);
              for (const h of others) {
                try {
                  const insp = await sp.load(h.id);
                  search(insp?.events, matcher, "session:" + shortId(h.id), hits);
                } catch {
                  ctx.logger.debug(`failed to load session ${shortId(h.id)}; skipping`);
                  // skip unreadable sessions
                }
              }
            } else {
              ctx.logger.debug("sessionPersistence unavailable; workspace-session layer skipped");
            }
          }

          hits.sort((a, b) => {
            if (a.source === "current" && b.source !== "current") return -1;
            if (b.source === "current" && a.source !== "current") return 1;
            return a.seq - b.seq;
          });

          const start = (page - 1) * PAGE_SIZE;
          const pageHits = hits.slice(start, start + PAGE_SIZE);
          return {
            hits: pageHits,
            total: hits.length,
            page,
            hasMore: start + PAGE_SIZE < hits.length,
          };
        },
      }),
    );

    yield tools.register(
      defineTool({
        name: "resume_read",
        description:
          "Read one event from a session log in full. " +
          "Use it to expand a resume_search hit before acting on its one-line summary. " +
          "sessionId is the session's id; the current session's id works too. seq is the event's seq number. " +
          "Returns found: false when the session cannot be loaded or the seq is absent.",
        parameters: {
          sessionId: {
            type: "string",
            required: true,
            description: "Id of the session to read. The current session's own id is allowed.",
          },
          seq: {
            type: "integer",
            required: true,
            description: "Seq number of the event to read.",
          },
        },
        output: {
          schema: {
            type: "object",
            properties: {
              found: { type: "boolean" },
              sessionId: { type: "string" },
              seq: { type: "integer" },
              role: { type: "string" },
              text: { type: "string" },
            },
            additionalProperties: false,
          },
          render: (_args, value: any) => {
            if (!value.found) {
              return [
                { type: "text", text: `Not found: session ${value.sessionId} has no seq ${value.seq}.` },
              ];
            }
            return [{ type: "text", text: `[${value.sessionId} seq ${value.seq}] ${value.role}: ${value.text}` }];
          },
        },
        async execute(args, exec) {
          const { sessionId, seq } = args;
          const session = (exec as any)?.agent?.session;
          const currentId = session?.requestHeader?.()?.id ?? session?.header?.id;

          // Must not throw for a missing session or seq: the model gets a
          // clean found:false instead of an error result.
          try {
            let events: any[];
            if (session && Array.isArray(session.events) && sessionId === currentId) {
              events = session.events;
            } else {
              const sp: any = (ctx as any).get?.("sessionPersistence");
              if (!sp || typeof sp.load !== "function") {
                ctx.logger.debug("sessionPersistence unavailable; cannot read another session");
                return { found: false, sessionId, seq };
              }
              const insp = await sp.load(sessionId);
              if (!insp || !Array.isArray(insp.events)) return { found: false, sessionId, seq };
              events = insp.events;
            }
            const ev = events.find((e) => e?.seq === seq);
            if (!ev) return { found: false, sessionId, seq };
            return { found: true, sessionId, seq, role: eventRole(ev), text: fullEventText(ev) };
          } catch (err) {
            ctx.logger.debug(`resume_read failed for ${shortId(sessionId)} seq ${seq}: ${err}`);
            return { found: false, sessionId, seq };
          }
        },
      }),
    );

    ctx.logger.info("resume tools registered");
  }, "resume tools lifecycle");
}
