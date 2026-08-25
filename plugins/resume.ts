import type { Context } from "@deepseek-ai/cordis";

// /resume — layered recall over the durable session log.
//
// Greps the append-only event log and returns SHORT one-line summaries per
// match, so the agent can pick seqs to expand with the recall tool. Layers:
//   1. current session events
//   2. other sessions in the same workspace (same cwd)
//   3. past compactions (the durable log keeps shadowed content, so a grep
//      already reaches past a compaction; compaction/summary events also list
//      their shadowedSeqs)
//   4. subagent reports — user/message events whose source.kind is
//      "subagent-report", plus child sessions (origin: "subagent") whose last
//      non-empty assistant/message is the report.
//
// The harness log is append-only and survives compaction, so every token the
// compaction step ever elided stays present and grep-able.

export const name = "resume";
export const inject = ["commands"] as const;

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

interface Hit { source: string; seq: number; role: string; text: string; }

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
    if (r && typeof r === "object") return JSON.stringify(r).slice(0, 200);
    return "";
  }
  if (t === "compaction/summary") return "compaction shadowed " + ((d?.shadowedSeqs as unknown[])?.length ?? 0) + " seqs";
  if (t === "subagent/descriptor") return "subagent " + (d?.label ?? "") + " " + (d?.mode ?? "");
  if (t === "turn/start") return "turn " + (d?.turn ?? "?");
  return "";
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
  if (t === "compaction/summary" || t === "compaction/start" || t === "compaction/end") return "compaction";
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

interface ResumeInvocation {
  rawInput?: string;
  agent?: { session?: any };
}

export function apply(ctx: Context): void {
  ctx.effect(
    function* () {
      yield ctx.commands.register({
        name: "resume",
        description:
          "Layered recall over the durable session log. Greps the current session, then other sessions in the same workspace (including past compactions and subagent reports), for a natural-language query. Returns short one-line summaries; expand any with recall using its (seq N) pointer.",
        handler: (invocation: ResumeInvocation) => executeResume(invocation, ctx),
      });
    },
    "resume command lifecycle",
  );
}

async function executeResume(invocation: ResumeInvocation, ctx: Context): Promise<any> {
  const query = (invocation?.rawInput ?? "").trim();
  if (!query) {
    return { kind: "error", text: "usage: /resume <natural-language query>" };
  }
  const session = invocation?.agent?.session;
  if (!session || !Array.isArray(session.events)) {
    return { kind: "error", text: "no active session log available" };
  }

  const matcher = makeMatcher(query);
  const hits: Hit[] = [];

  // Layer 1: current session.
  search(session.events, matcher, "current", hits);
  const currentId = session.requestHeader?.()?.id ?? session.header?.id;
  const currentCwd = session.requestHeader?.()?.cwd ?? session.header?.cwd;

  // Layer 2: other sessions in the same workspace (includes subagent children
  // and compaction boundaries, which live in their event logs).
  const sp: any = (ctx as any).get?.("sessionPersistence");
  if (sp && typeof sp.list === "function") {
    let headers: any[] = [];
    try {
      headers = (await sp.list()) ?? [];
    } catch {
      headers = [];
    }
    const others = headers
      .filter((h) => h && h.id !== currentId && h.cwd === currentCwd)
      .slice(0, 12);
    for (const h of others) {
      try {
        const insp = await sp.load(h.id);
        search(insp?.events, matcher, "session:" + shortId(h.id), hits);
      } catch {
        // skip unreadable sessions
      }
    }
  }

  if (hits.length === 0) {
    return {
      kind: "success",
      text: `No matches for "${query}" in this session or its workspace. The durable log is append-only, so try a broader term.`,
    };
  }

  hits.sort((a, b) => {
    if (a.source === "current" && b.source !== "current") return -1;
    if (b.source === "current" && a.source !== "current") return 1;
    return a.seq - b.seq;
  });

  const shown = hits.slice(0, 40);
  const lines = shown.map((h) => `[${h.source} seq ${h.seq}] ${h.role}: ${h.text}`);
  const note =
    hits.length > shown.length
      ? `\n\n(${hits.length - shown.length} more match(es) omitted; refine the query to narrow.)`
      : "";
  const text =
    `Found ${hits.length} match(es) for "${query}". ` +
    `Layers searched: current session, then other workspace sessions (past compactions and subagent reports included). ` +
    `Use recall with a (seq N) pointer to expand any hit.\n\n` +
    lines.join("\n") +
    note;
  return { kind: "success", text };
}
