# OpenCode Setup

Detailed setup and operating reference for this OpenCode configuration: the
phone-facing web/proxy stack, work and personal model routing, agents, skills,
plugins, and MCP servers. The tracked files in this repository are the source
of truth for OpenCode configuration. Runtime secrets remain in the ignored
`server.env` file, and the Caddy and systemd units are documented here because
they operate the web endpoint but are managed outside this repository.

---

## Remote Access: Phone -> Caddy -> OpenCode

opencode's web UI, reachable from your phone over TLS, running as a laptop
(`potato`) systemd **user** service.

```
phone --https:1337--> Caddy (0.0.0.0, TLS via internal CA)
                          |
                          v
                    opencode (127.0.0.1:4096 only — not on the LAN)
```

- **URL:** `https://potato.local:1337`
- **Auth:** HTTP basic auth, enforced by opencode itself (not by Caddy — see
  Security below). Credential lives in `~/.config/opencode/server.env`
  (`OPENCODE_SERVER_PASSWORD`, mode `600`) — **not reproduced here**; that
  file got pasted in cleartext into an earlier draft of this doc, which is
  the kind of thing to avoid repeating. If you suspect it's been exposed,
  rotate it.
- **Network:** same wifi only. Off that network (mobile data, VPN), it's
  unreachable by design — `.local` doesn't resolve there, and nothing else
  exposes port 1337.

**Name resolution:** avahi's `potato.local`, *not* opencode's own `--mdns`
flag. Android resolves `.local` via one-shot mDNS queries (RFC 6762 §5.1),
which opencode's own responder doesn't answer (verified: 3/3 failed against
a hand-built one-shot probe, while avahi answered the identical query
correctly) — so `opencode.local` is unreachable from Android no matter what,
while avahi's `potato.local` works and tracks the DHCP lease automatically.
`.local` also doesn't resolve on Android over VPN or mobile data.

**TLS:** Caddy's own internal CA — no public CA can issue for `.local`
(RFC 6762 reserves the TLD; CA/Browser Forum banned internal names in 2015).
Root cert: `~/.local/share/caddy/pki/authorities/local/root.crt` — install
this on a device as a trusted user CA. `auto_https disable_redirects` is set
in the Caddyfile because Caddy otherwise binds `:80` for HTTP→HTTPS
redirects on every auto-HTTPS site, and a systemd *user* service can't bind
privileged ports (permission denied, config fails to load without this).
`admin off` is also set deliberately: Caddy's admin API is an unauthenticated
localhost:2019 listener that can rewrite the whole running config, so it's
disabled — the tradeoff is `caddy reload` no longer works; apply config
changes with `systemctl --user restart caddy` instead.

### Systemd units (`~/.config/systemd/user/`)

| Unit | Role |
|---|---|
| `user-www.target` | Grouping target only — starts nothing itself. `systemctl --user {start,stop,restart} user-www.target` controls both services together (members declare `PartOf=` for this). |
| `opencode-web.service` | `opencode web --hostname 127.0.0.1 --port 4096 --cors https://potato.local:1337`, run inside a login `fish` shell via `exec` (so opencode becomes the tracked process for `Restart=`/signals). PATH is derived at runtime from `fish`'s login-shell config rather than hardcoded, so it tracks `config.fish` changes on restart — this only works because `config.fish` sets PATH unconditionally, outside any `status is-interactive` guard. `BROWSER=/bin/true` neutralizes opencode's normal "open a browser" behavior for headless runs. `Restart=always`, `StartLimitIntervalSec=0` (retries indefinitely — relevant since this starts at login, sometimes before the network is up). |
| `caddy.service` (**user**-level) | `caddy run --config ~/.config/caddy/Caddyfile`. `Wants=` (not `Requires=`) `opencode-web.service`, so a crashed backend doesn't take the proxy down — Caddy just serves a clean 502 until opencode-web restarts. Reverse-proxies to `127.0.0.1:4096` with `flush_interval -1` so opencode's SSE agent-output stream can't stall mid-response. |

Lingering is enabled for this user (`loginctl show-user sid -p Linger` →
`yes`), so the stack comes up on boot without needing a login session.
**Not yet tested against an actual reboot** — only service restarts so far.

**There is a separate, unrelated *system*-level `caddy.service`**
(`/etc/caddy/Caddyfile`, `multi-user.target`) — just the untouched stock
Caddy install serving a static welcome page on `:80`, nothing imported into
`Caddyfile.d/`. It's running but has nothing to do with this setup; don't
confuse the two when debugging.

### Security Model

- opencode enforces basic auth even on loopback-origin requests — confirmed:
  `curl http://127.0.0.1:4096/` and `curl https://potato.local:1337/` both
  return `401` with no credentials. Caddy itself does no auth, it's a
  see-through proxy, so if `OPENCODE_SERVER_PASSWORD` were ever unset the
  whole thing would go unauthenticated.
- CORS is scoped to `https://potato.local:1337` — confirmed: that origin
  gets `access-control-allow-origin` echoed back, `https://evil.example`
  gets nothing.
- Basic auth is browser-cached per-origin. A malicious page navigated to in
  the same browser could still fire authenticated side-effecting requests
  using the cached credential — CORS blocks it from *reading* the response,
  not from the request landing. Accepted risk, not mitigated.
- `firewalld` currently has `1025-65535/tcp,udp` open, which incidentally
  covers `kdeconnectd` (1716) being reachable from the LAN. Unrelated to
  this stack, noticed in passing, not yet actioned either way.

Useful commands:

```sh
systemctl --user status caddy.service opencode-web.service
systemctl --user restart user-www.target   # restart both together; drops any open web session
journalctl --user -u opencode-web.service -f
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4096/            # expect 401
curl -sk -o /dev/null -w '%{http_code}\n' https://potato.local:1337/       # expect 401
```

**Apply configuration changes:** Local OpenCode TUI sessions load the config
when they start. Restart the web stack whenever this repository's OpenCode
configuration changes so the always-on web/phone session reloads it:

```sh
systemctl --user restart user-www.target
```

---

## Model Providers and Routing

### Providers (`opencode.json` -> `provider`, plus built-ins)

| Provider | Where | Notes |
|---|---|---|
| `openrouter` | built-in, API key via `opencode auth` | "work" account — billed to OpenRouter credits |
| `deepseek` | built-in, API key via `opencode auth` | "personal" account — direct DeepSeek API key |
| `Lemonade` | `openai-compatible` @ `127.0.0.1:13305` | local server (gpt-oss-20b, gemma4-it-e4b) |
| `llama-server` | `openai-compatible` @ `127.0.0.1:8033` | local llama.cpp (Qwen3.6-35B-A3B, Q4_K_S) |

Check what's authenticated: `opencode auth list` (or `opencode providers`).
Check what's actually resolvable right now: `opencode models`.

The two local providers (Lemonade, llama-server) are **configured but not
always running** — they're local inference servers started manually when
wanted, not systemd-managed. `ps aux | grep -E "lemonade|llama-server"` to
check if either is currently up before picking a model that points at them.

### Work and Personal Routing (`plugin/opencode-profile.ts`)

The `coder`/`tester`/`researcher` subagents are pinned to OpenRouter models in
their agent files. The built-in `build` primary agent inherits the selected
session model for work. The profile plugin rewrites those models at
configuration load time for a personal direct-DeepSeek account:

| | Work (default) | Personal (`OPENCODE_PROFILE=me`) |
|---|---|---|
| `build` | *(unpinned — inherits the selected session model)* | `deepseek/deepseek-v4-pro` (direct key) |
| `coder` / `tester` / `researcher` | `openrouter/deepseek/deepseek-v4-pro` | `deepseek/deepseek-v4-flash` (direct key) |

Toggle it by exporting the env var before launching opencode:

```sh
OPENCODE_PROFILE=me opencode            # personal: build=v4-pro, subagents=v4-flash (direct key)
opencode                                 # work (default): subagents on OpenRouter, build inherits session model
```

The current configuration passes its profile controls as an **options object**
in the plugin registration tuple in `opencode.json`, rather than hardcoding
them in the plugin file:

```json
"plugin": [
  "opencode-btw",
  ["./plugin/opencode-profile.ts", {
    "envVar": "OPENCODE_PROFILE",
    "personalValue": "me",
    "primaryAgent": "build",
    "primaryPersonalModel": "deepseek/deepseek-v4-pro",
    "subagents": ["coder", "tester", "researcher"],
    "subagentWorkModel": "openrouter/deepseek/deepseek-v4-pro",
    "subagentPersonalModel": "deepseek/deepseek-v4-flash"
  }]
]
```

`pinnedToWork` defaults to an empty list in the plugin, so every project
routes based on `OPENCODE_PROFILE`. Add it to the options object only when a
specific repository must always use the work profile.

Verify the resolved model for any agent/project/env combination without
starting a session:

```sh
opencode debug agent coder                                # work, this project
OPENCODE_PROFILE=me opencode debug agent build             # personal, this project
```

---

## Agents (`agent/*.md`)

| Agent | Mode | Model | Role |
|---|---|---|---|
| `build` | built-in primary, **default** | selected session model (work) / `deepseek-v4-pro` direct (personal) | Plans, reviews, dispatches. Full edit/bash access; handles trivial fixes directly. Uses `grilling` + `plan` skills before non-trivial work, delegates execution via the Task tool. |
| `coder` | subagent | `openrouter/deepseek/deepseek-v4-pro` (work) / `deepseek-v4-flash` direct (personal) | Implements a specific, scoped brief handed to it. Edit + bash allowed. Can't self-delegate (`task`/`skill`/`question` denied). |
| `tester` | subagent | same routing as `coder` | Runs tests/lint/build for a given scope, reports pass/fail + failure detail. `edit` denied — reports only, never fixes. |
| `researcher` | subagent | same routing as `coder` | Investigates a specific question (codebase, library/API behavior, docs, Nostr NIPs via nostrbook). Read-only: `edit`/`bash` denied. |
| `see` | subagent | `openrouter/qwen/qwen3.6-flash` | Vision helper for models without native image support. `edit` denied. |

Plus opencode's built-ins: `build`, `plan` (built-in "Plan Mode" agent — not
to be confused with the `plan` *skill*), `general`, `explore`.

The built-in `build` agent is the default primary agent. The profile plugin
overrides only its personal-profile model.

List/inspect: `opencode agent list`, `opencode debug agent <name>`.

---

## Skills (`skills/*/SKILL.md`)

| Skill | Triggers on | Does |
|---|---|---|
| `software-engineering` | non-trivial implementation, fixes, refactors, and multi-step coding tasks | Sets the workflow: scope, plan, delegation, review, and verification. |
| `grilling` | user wants to stress-test a plan/decision, or says "grill" | Interviews the user one question at a time until scope/decisions are nailed down before any implementation starts. |
| `plan` | "planning", "phased implementation plan", "plan.md", "update the plan" | Creates/maintains a single `PLAN.md` per project: phased, living document, updated (and git-tracked) per milestone, completed phases compacted to short summaries, size budget ~3.75% of the codebase's LOC, deleted once the effort ships. |
| `review` | reviewing a coder diff, commit, or pull request | Checks code quality, conventions, AI-slop patterns, and scope creep. |
| `etu` | user wants to check or manage time-tracking (status, sessions, memos) | Wraps the `etu` time-tracking CLI, called **directly** — see below. |
| `customize-opencode` (built-in) | editing opencode's own config/agents/skills/plugins/MCP | Reference for opencode.json shape, agent/skill/command/plugin file conventions; defers to `https://opencode.ai/config.json` as source of truth. |

### `etu` skill, current shape

The old Node confirmation-wrapper approach for `etu` is gone. Confirmation is
now enforced by opencode's own permission system instead of by any
cooperating wrapper script: `permission.bash` in `opencode.json` matches on
`etu` (bare, with args, or via a path — see Permissions) and downgrades those
invocations to `ask`, for **every** subcommand, not just destructive ones.
The skill calls `etu` directly and relies on that prompt reaching the human;
it doesn't implement its own confirmation logic. Caveat carried over from
that design: it's a text-pattern match on the command, so shell indirection
(`sh -c 'etu ...'`, `eval`, building the command in a variable) could evade
it — accepted tradeoff, not solved.

The skill's command reference (the big `<!-- BEGIN/END GENERATED -->` block
in `SKILL.md`) is derived from live `etu --help` output rather than
hand-maintained:

```sh
cd ~/repos/etu && deno task skill ~/.config/opencode/skills/etu/SKILL.md
```

Re-run that whenever `etu`'s CLI surface changes — don't hand-edit inside
the generated markers, it'll just get overwritten next run.

`~/repos/etu` is the source for the `etu` binary, installed at
`~/.local/bin/etu`. `AGENTS.md` wires `grilling` -> `plan` -> subagent
dispatch (`coder`/`tester`/`researcher`) into the standing rules for
medium/large scope work.

---

## Plugins (`plugin/*.ts` and npm)

| Plugin | Source | Does |
|---|---|---|
| `opencode-btw` | npm (`kldzj/opencode-btw`) | Hint injection: `/btw <hint>` drops a note into the model's context on the next LLM call without sending a new user message — useful to nudge a model stuck in a tool loop. |
| `opencode-profile` | local, `plugin/opencode-profile.ts` | Work/personal model routing described in Model Providers and Routing. Fully driven by the options object passed to it in `opencode.json`. |

Custom tool (not a plugin, but same directory-convention idea):
`~/.config/opencode/tools/shell-command-long-running.ts` exports a
`tool(...)` definition directly and is auto-loaded as the
`shell-command-long-running` tool. It runs slow/long-lived commands (builds,
heavy searches, dev servers) inside a dedicated tmux session so a detached
command can be tailed/attached-to/sent-input later, instead of blocking the
agent loop — deliberately *not* named `bash`, since opencode's TUI has a
hardcoded renderer for that exact tool name that ignores anything the tool
returns beyond `$ <command>`.

---

## MCP Servers (`opencode.json` -> `mcp`)

| Name | Command | Purpose |
|---|---|---|
| `fetch` | `uvx mcp-server-fetch` | Generic URL fetching. |
| `nostrbook` | `npx -y @nostrbook/mcp@latest` | Nostr NIP/kind/tag lookups — always used instead of relying on memory when a NIP or event kind comes up (per `AGENTS.md`). |
| `web_search` | `duckduckgo-mcp-server` | Web search. |
| `gitlab` | `glab mcp serve` | GitLab operations via the `glab` CLI (issues, MRs, CI, etc.). |

---

## Permissions (`opencode.json` -> `permission`, plus per-agent overrides)

Global:

- `todowrite`: allow.
- `external_directory`: `~/ai-scratch` and `~/ai-scratch/**` allowed (scratch
  workspace outside any project root).
- `bash`: allow by default; any invocation of `etu` (bare, with args, or via
  a path) is downgraded to `ask`:
  ```json
  "bash": {
    "*": "allow",
    "etu": "ask", "etu *": "ask", "*/etu": "ask", "*/etu *": "ask"
  }
  ```
  This is what the `etu` skill (Skills) leans on instead of implementing its own
  confirmation flow — enforced by opencode's permission system itself, not
  by the skill's cooperation. Same pattern-match caveat as noted above:
  shell indirection around the literal string `etu` isn't caught.

Per-agent overrides live in each agent's frontmatter (see Agents) — `tester` and
`researcher` deny `edit`; `researcher` also denies `bash`; the three fast
subagents all deny `task`/`skill`/`question` so they can't spawn further
subagents, invoke skills meant for interactive use, or block on a question
they can't get answered non-interactively.

---

## Operational Notes

- **Reboot untested.** Lingering is on and both units are enabled, but the
  whole stack has only been validated via `systemctl --user restart`, never
  an actual machine reboot.
- `kdeconnectd` (1716) is reachable from the LAN per the current `firewalld`
  port range — noticed incidentally while checking the security model in
  Remote Access, unrelated to this stack, not actioned.

---

## File Map

```
~/.config/opencode/
├── opencode.json                  global config: MCP, plugins, providers, permissions
├── AGENTS.md                       standing rules for every session
├── server.env                       OPENCODE_SERVER_PASSWORD for opencode-web (mode 600, value not reproduced here)
├── btw.jsonc                       schema pointer for opencode-btw
├── agent/
│   ├── coder.md
│   ├── tester.md
│   └── researcher.md
├── skills/
│   ├── grilling/SKILL.md
│   ├── plan/SKILL.md
│   ├── review/SKILL.md
│   ├── software-engineering/SKILL.md
│   └── etu/SKILL.md                regenerated from `etu --help`, see Skills
├── plugin/
│   └── opencode-profile.ts
└── tools/
    └── shell-command-long-running.ts

~/repos/etu/                        source for the `etu` CLI + generate-skill.ts
~/.config/caddy/Caddyfile            potato.local:1337 -> 127.0.0.1:4096
~/.config/systemd/user/
├── user-www.target
├── caddy.service
└── opencode-web.service
```
