// plugins/resume.ts
var name = "resume";
var inject = ["commands"];
function makeMatcher(query) {
  const trimmed = query.trim();
  if (trimmed.length > 1 && trimmed.startsWith("/") && trimmed.endsWith("/")) {
    try {
      const re = new RegExp(trimmed.slice(1, -1), "i");
      return (text) => re.test(text);
    } catch {
    }
  }
  const lower = trimmed.toLowerCase();
  return (text) => text.toLowerCase().includes(lower);
}
function eventText(ev) {
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
  if (t === "compaction/summary")
    return "compaction shadowed " + (d?.shadowedSeqs?.length ?? 0) + " seqs";
  if (t === "subagent/descriptor") return "subagent " + (d?.label ?? "") + " " + (d?.mode ?? "");
  if (t === "turn/start") return "turn " + (d?.turn ?? "?");
  return "";
}
function eventRole(ev) {
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
function summarize(ev) {
  const text = eventText(ev);
  if (!text) return null;
  const oneLine = text.replace(/\s+/g, " ").slice(0, 160);
  return { source: "", seq: ev?.seq ?? -1, role: eventRole(ev), text: oneLine };
}
function search(events, matcher, sourceLabel, out) {
  if (!Array.isArray(events)) return;
  for (const ev of events) {
    const hit = summarize(ev);
    if (hit && matcher(hit.text)) {
      hit.source = sourceLabel;
      out.push(hit);
    }
  }
}
function shortId(id) {
  return String(id ?? "").slice(0, 8);
}
function apply(ctx) {
  const commands = ctx.get("commands");
  if (commands === void 0) {
    ctx.logger.warn("resume: commands service not mounted; /resume is not registered");
    return;
  }
  ctx.effect(function* () {
    yield commands.register({
      name: "resume",
      description: "Layered recall over the durable session log. Greps the current session, then other sessions in the same workspace (including past compactions and subagent reports), for a natural-language query. Returns short one-line summaries; expand any with recall using its (seq N) pointer.",
      input: { hint: "<natural-language query>" },
      handler: (invocation) => executeResume(invocation, ctx)
    });
  }, "resume command lifecycle");
}
async function executeResume(invocation, ctx) {
  const query = (invocation?.rawInput ?? "").trim();
  if (!query) {
    return { kind: "error", text: "usage: /resume <natural-language query>" };
  }
  const session = invocation?.agent?.session;
  if (!session || !Array.isArray(session.events)) {
    return { kind: "error", text: "no active session log available" };
  }
  const matcher = makeMatcher(query);
  const hits = [];
  search(session.events, matcher, "current", hits);
  const currentId = session.requestHeader?.()?.id ?? session.header?.id;
  const currentCwd = session.requestHeader?.()?.cwd ?? session.header?.cwd;
  const sp = ctx.get?.("sessionPersistence");
  if (sp && typeof sp.list === "function") {
    let headers = [];
    try {
      headers = await sp.list() ?? [];
    } catch {
      headers = [];
    }
    const others = headers.filter((h) => h && h.id !== currentId && h.cwd === currentCwd).slice(0, 12);
    for (const h of others) {
      try {
        const insp = await sp.load(h.id);
        search(insp?.events, matcher, "session:" + shortId(h.id), hits);
      } catch {
      }
    }
  }
  if (hits.length === 0) {
    return {
      kind: "success",
      text: `No matches for "${query}" in this session or its workspace. The durable log is append-only, so try a broader term.`
    };
  }
  hits.sort((a, b) => {
    if (a.source === "current" && b.source !== "current") return -1;
    if (b.source === "current" && a.source !== "current") return 1;
    return a.seq - b.seq;
  });
  const shown = hits.slice(0, 40);
  const lines = shown.map((h) => `[${h.source} seq ${h.seq}] ${h.role}: ${h.text}`);
  const note = hits.length > shown.length ? `

(${hits.length - shown.length} more match(es) omitted; refine the query to narrow.)` : "";
  const text = `Found ${hits.length} match(es) for "${query}". Layers searched: current session, then other workspace sessions (past compactions and subagent reports included). Use recall with a (seq N) pointer to expand any hit.

` + lines.join("\n") + note;
  return { kind: "success", text };
}
export {
  apply,
  inject,
  name
};
