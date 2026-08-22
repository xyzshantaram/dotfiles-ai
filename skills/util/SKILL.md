---
name: util
description: Utilities for time, regex, markdown, and encoding. Gates the tool-time, tool-regex, tool-markdown, and tool-encoding tools from the omdsh-dev/dsh-toolkit plugin collection behind this skill.
whenToUse: The user needs a date or duration calculation, a regex test, extract, or replace, a Markdown-to-HTML or HTML-to-Markdown conversion, or a base64/URL/hex/hash/UUID encoding operation. Trigger phrases are "what date", "days between", "regex", "match", "extract", "convert markdown", "encode", "decode", "base64", "hash", "uuid".
tools-gated: [time, regex, markdown, encoding]
---

# util

This skill gates four zero-dependency host tools: `time`, `regex`, `markdown`,
`encoding`. Each tool stays hidden from the model
until this skill loads. See `plugins/skill-gate.ts` for the gating
mechanism.

Load this skill before you call any of the four tools. A session that has
not loaded `util` cannot call them, even after the plugin is installed and
`dsh web` is restarted.

## Source plugins

The four tools come from four independent sub-packages of the
`omdsh-dev/dsh-toolkit` collection (a ten-tool zero-dependency collection;
this bundle installs only the four this skill needs, not the full set):

| Tool | Package | Capability |
|---|---|---|
| `time` | `github:omdsh-dev/dsh-tool-time` | ISO 8601 parsing, timezone conversion, calendar arithmetic, duration difference |
| `regex` | `github:omdsh-dev/dsh-tool-regex` | Test, extract, replace, static interpretation; runs under a worker with a hard timeout |
| `markdown` | `github:omdsh-dev/dsh-tool-markdown` | HTML-to-Markdown and Markdown-to-HTML, GFM tables, table-of-contents generation, allow-list-based sanitization |
| `encoding` | `github:omdsh-dev/dsh-tool-encoding` | base64, URL encoding, hex, hash functions, UUID generation |

Each sub-package installs and registers independently. None of the four
overlaps an existing tool in this bundle.

## Rules

- Use the narrowest tool for the task. Do not reach for `regex` when a
  plain string method in your own reasoning would do; use it for a real
  test, extract, or replace operation the user asked for.
- `markdown`'s sanitizer runs an allow list. Do not attempt to bypass
  it by pre-encoding disallowed markup; treat a stripped element as the
  tool's answer, not a bug to route around.
- `encoding`'s hash functions are for identification and comparison,
  not for password storage or a security boundary. Say so if a user asks
  for a hash in a security context that needs a purpose-built primitive
  instead.
- State which of the four tools you are about to call and why, before you
  call it, when more than one could plausibly apply (for example, a date
  string that could go through `time` or a regex).

## Installation status

Staged in `sync.sh` step 8, not yet installed live. See `PLAN.md` ticket E4
for the current state. `tool-calculator` and `tool-diff` are a separate,
always-on install (not gated by this skill; see the conflict table's C10
row) and are unrelated to this skill's scope.
