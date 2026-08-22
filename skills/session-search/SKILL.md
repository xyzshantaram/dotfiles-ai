---
name: session-search
description: Cross-agent session search across dsh, Codex, Claude Code, pi, and OpenCode session logs. Gates the agent_session_search and agent_session_read tools from the dsh-session-search plugin behind this skill.
whenToUse: The user asks to find something discussed in a past session, across any of dsh, Codex, Claude Code, pi, or OpenCode, or asks to search session history, recall an earlier conversation, or read a specific past session by id. Trigger phrases are "find that session", "search my sessions", "what did we discuss about", "past conversation", "session history".
tools-gated: [agent_session_search, agent_session_read]
---

# session-search

This skill gates two host tools from the `dsh-session-search` plugin
(`github:Tieboyh/dsh-session-search`): `agent_session_search` and
`agent_session_read`. Both stay hidden from the model until this skill
loads. See `plugins/skill-gate.ts` for the gating mechanism.

## What the tools do

| Tool | Description |
|---|---|
| `agent_session_search` | Case-insensitive literal search across current session log files. Returns, per matching session: the strongest message, a snippet, and a message window. Accepts `sources`, `cwd`, `sort`, and `limit` filters. |
| `agent_session_read` | Reads one discovered session's metadata and a message window, targeted with `aroundSeq`. |

Supported sources: `dsh`, `codex`, `claude`, `pi`, `opencode`. Every source
is read-only. The plugin builds no index and no derived database; each call
scans the current session log files directly.

## Why this is gated, not always-on

DSH already ships a native `session.search` projection through
`dsh-session-query`/`dsh-session-query-sqlite`, backed by SQLite. This
plugin is an index-free, direct-scan alternative that also reaches beyond
dsh's own sessions into Codex, Claude Code, pi, and OpenCode logs. The two
tools overlap on dsh sessions. Gating this skill keeps the plugin's broader
but slower cross-agent search available on demand, without adding it to
every session's default tool set.


## Rules

- Prefer the native `session.search` projection first when the question is
  about dsh sessions only. Load this skill, and reach for
  `agent_session_search`, when the user asks about a Codex, Claude Code,
  pi, or OpenCode session, or explicitly wants cross-agent coverage.
- A broad, unscoped search across all sources decompresses the full dsh
  session corpus (concatenated zstd frames, decoded frame by frame). Narrow
  with `sources`, `cwd`, or `limit` when the user's request lets you.
- `agent_session_read` needs a session identifier from a prior
  `agent_session_search` result. Do not guess an id.
- Every result is read-only. Neither tool modifies a session log. State
  this if the user asks whether a search can also change or delete
  anything.

## Installation status

Staged in `sync.sh` step 8, not yet installed live. See `PLAN.md` ticket E4
for the current state.
