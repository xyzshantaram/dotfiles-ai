---
name: resume
description: Search and read the durable session event log to find and resume prior context, even past a compaction boundary. Gates the resume_search and resume_read tools behind this skill.
whenToUse: The user refers to earlier work or a past conversation and wants to pick it up again. Trigger phrases are "we were working on this the other day", "resume where we left off", "pick up from where we stopped", "what did we discuss about", "earlier we decided", "continue from last time". Load this before answering any question that depends on context from a previous session or from before a compaction.
tools-gated: [resume_search, resume_read]
---

# resume

This skill gates two host tools: `resume_search` and `resume_read`. Both read
the durable, append-only session event log, which compaction never deletes, so
context lost to compaction or from earlier sessions stays reachable. The tools
stay hidden from the model until this skill loads. See
`plugins/skill-gate.ts` for the gating mechanism.

## What the tools do

| Tool            | Description |
| --------------- | ----------- |
| `resume_search` | Search one or more session event logs. `query` (string, required) is matched case-insensitively; a query wrapped in slashes, like `/pattern/`, is matched as a regular expression instead. `workspaces` (array of strings, optional) names workspace paths to reach other sessions from — omit it or pass an empty list to search only the current session's own log, which still reaches past any compaction boundary. `page` (integer, optional, default 1) is a 1-indexed page number; page size is fixed at 15 hits. Returns `{ hits: [{ source, seq, role, text }], total, page, hasMore }`. Each hit's `text` is a short one-line teaser, not the full content. `source` is `"current"` for this session or `"session:<shortId>"` for another. `hasMore` is true when a later page exists. |
| `resume_read`   | Read one event in full. Takes `sessionId` (string, required; the current session's own id works too) and `seq` (integer, required, from a `resume_search` hit). Returns `{ found: true, sessionId, seq, role, text }` with the full, untruncated original content when the seq exists in that session's log, or `{ found: false, sessionId, seq }` when it does not. Never throws. |

## Escalation policy

1. Always call `resume_search` with no `workspaces` argument first. This
   searches only the current session's own log.
2. Only if that search comes up short — no useful hits, or the user's request
   clearly references a different session or workspace — retry with an
   explicit `workspaces` list naming the relevant workspace path(s).
3. Before acting on any hit, call `resume_read` with that hit's `sessionId`
   and `seq` to get the full original content. Never act on the truncated
   teaser text alone.

## Rules

- Both tools are read-only. Neither modifies any session log.
- `resume_read` needs a `sessionId`/`seq` pair that came from an actual
  `resume_search` hit. Do not guess a seq number.
