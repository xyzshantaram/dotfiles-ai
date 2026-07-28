# dotfiles-ai

Config and infrastructure for my AI workstation — a multi-agent coding assistant built on [opencode](https://opencode.ai), exposed securely over the LAN so I can drive it from a phone or tablet.

## What it does

- **Multi-agent coding**: a primary agent orchestrates three subagents — a `coder` (implements), a `researcher` (investigates and reviews), and a `tester` (runs test suites, linters, builds) — all operating on the same model family at different tiers.
- **Model routing by profile**: the same config switches between work (OpenRouter) and personal (direct API key) provider accounts depending on `$OPENCODE_PROFILE`, so personal and work sessions cost different accounts without separate configs.
- **Secure LAN access**: the opencode web server binds to loopback only; Caddy terminates TLS at `potato.local:1337` (mDNS advertised via avahi, internal CA), so a phone or tablet on the same WiFi can drive a full multi-agent session.
- **systemd-managed daemons**: everything runs as a user systemd stack (no root) via a `user-www.target` grouping target — `opencode-web.service` + `caddy.service` — with automatic startup on boot and restart on crash.

## Architecture

```
  Phone / Tablet                 LAN (mDNS)                   This machine
 ┌──────────────┐          ┌──────────────────┐          ┌──────────────────┐
 │  Browser      │ ──TLS──▶ │ potato.local:1337 │ ──────▶ │ Caddy (systemd)  │
 │  https://...  │          │ (avahi mDNS)      │          │ TLS termination  │
 └──────────────┘          └──────────────────┘          └───────┬──────────┘
                                                                 │ loopback:4096
                                                        ┌────────▼──────────┐
                                                        │ opencode web      │
                                                        │ (systemd)         │
                                                        │ CORs: https://... │
                                                        └───────┬──────────┘
                                                                │
                                                ┌───────────────┼───────────────┐
                                                │               │               │
                                           ┌────▼────┐   ┌─────▼──────┐  ┌─────▼──────┐
                                           │  coder   │   │ researcher │  │  tester    │
                                           └─────────┘   └────────────┘  └────────────┘
```

## Infrastructure

### systemd user services (`~/.config/systemd/user/`)

| Unit | Purpose |
|---|---|
| `user-www.target` | Grouping target for the entire web stack. `WantedBy=default.target` pulls it in at boot. |
| `opencode-web.service` | Runs `opencode web` bound to `127.0.0.1:4096`, with `Restart=always`. Reads secrets from `server.env`. PartOf `user-www.target` so a `systemctl --user restart user-www.target` restarts both the backend and Caddy. |
| `caddy.service` | Caddy reverse proxy, TLS-terminating at `potato.local:1337`. Proxies to `127.0.0.1:4096` with unbuffered streaming (`flush_interval -1`) so SSE agent output streams through without stalling. No admin API — config changes need a `systemctl --user restart caddy`. |

Enable and start the whole stack:

```bash
systemctl --user enable --now user-www.target
```

Individual services: `systemctl --user {status,restart,stop} opencode-web caddy`.

### Caddy reverse proxy (`~/.config/caddy/Caddyfile`)

- **Domain**: `potato.local:1337` — mDNS-resolvable on the LAN (avahi advertises it; Android resolves `.local` natively for non-VPN connections).
- **TLS**: internal CA (`tls internal`). Install the root cert on the client device:
  ```
  ~/.local/share/caddy/pki/authorities/local/root.crt
  ```
- **No HTTP redirect**: `auto_https disable_redirects` — the systemd user service can't bind port 80, and nothing needs a redirect; clients connect directly to `https://potato.local:1337`.

### Opencode web server

- Binds to `127.0.0.1:4096` (loopback only — Caddy is the only entry point from the network).
- `--cors https://potato.local:1337` tells the browser the real origin so CORS and WebSocket upgrades work across the proxy.
- `BROWSER=/bin/true` suppresses the auto-open-browser behavior in headless/systemd context.

## Opencode config

### Multi-agent system

The primary agent (default `build`) orchestrates three subagents, each defined as a separate agent with a specific model, permissions, and role:

- **coder** — implements well-scoped units of work. Runs build/typecheck/lint locally, reports back. No task delegation, no skills, no user questions.
- **researcher** — investigates codebase questions, reads specs/NIPs, and reviews coder diffs via the `review` skill. Read-only (no edits, no mutating commands). Can ask the user a single clarifying question during review.
- **tester** — runs test suites, linters, and builds for a given scope. Reports pass/fail with concrete failure details. Never modifies code.

See `agent/*.md` for full definitions.

### Profile switching (`plugin/opencode-profile.ts`)

Routes agents between a work account (OpenRouter) and a personal account (direct API key) depending on `$OPENCODE_PROFILE`:

```
OPENCODE_PROFILE=work (default) → primary inherits session model,
                                  subagents → openrouter/deepseek/deepseek-v4-pro
OPENCODE_PROFILE=me             → primary → deepseek/deepseek-v4-pro (direct),
                                  subagents → deepseek/deepseek-v4-flash (cheap tier)
```

Specific projects can be pinned to the work profile regardless of the env var (see the plugin's `pinnedToWork` option in `opencode.json`).

### Skills

| Skill | Purpose |
|---|---|
| `software-engineering` | Workflow for non-trivial SE tasks: grilling → planning → delegation → review → verification. |
| `grilling` | Structured interview to nail down scope, contracts, and decisions before implementation. |
| `plan` | Creates and maintains `PLAN.md` with phased, ticketed implementation tracking. |
| `review` | Code-quality review: AI-slop patterns, wheel reinvention, scope creep, conventions. |
| `etu` | Time-tracking via the `etu` CLI — check hours, sessions, memos. |

### Custom tools

- **`shell-command-long-running`** — runs commands inside a dedicated tmux session for things that won't finish quickly (heavy builds, test suites, grep over large trees, dev servers). The tool detaches after a few seconds and returns attach/tail commands; the command keeps running in the background.

### MCP servers

| Server | Purpose |
|---|---|
| `fetch` | Fetch and extract web page content |
| `nostrbook` | Read Nostr NIPs, event kinds, and tags |
| `web_search` | Search the web via DuckDuckGo |
| `gitlab` | GitLab API access through `glab` |

### Local model providers

- **Lemonade** — local inference server at `127.0.0.1:13305` (OpenAI-compatible).
- **Llama.cpp** — local server at `127.0.0.1:8033` (`Qwen3.6-35B-A3B`).

## Setup

```bash
git clone git@github.com:xyzshantaram/dotfiles-ai.git ~/.config/opencode
cd ~/.config/opencode
npm install
```

Then create `~/.config/opencode/server.env` with any secret environment variables (API keys, etc.) — this file is gitignored.

For the web server and proxy stack, enable and start the systemd target:

```bash
systemctl --user enable --now user-www.target
```
