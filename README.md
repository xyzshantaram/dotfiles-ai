# dotfiles-ai

Config and infrastructure for my AI workstation — a multi-agent coding assistant built on [opencode](https://opencode.ai), exposed securely over the LAN so I can drive it from a phone or tablet.

## What it does

- **Multi-agent coding**: a primary agent orchestrates three subagents — a `coder` (implements), a `researcher` (investigates and reviews), and a `tester` (runs test suites, linters, builds) — all operating on the same model family at different tiers.
- **Model routing by profile**: work sessions use the meridian service (`rynfar/meridian`, a local Anthropic-compatible proxy for Claude models) as the orchestrator; personal sessions use a direct DeepSeek key; subagents run on the OpenCode Go subscription (`deepseek-v4-flash`). A profile switch (plugin or manual model pick) selects which account a session costs.
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

The workstation runs a small user systemd stack (no root). `user-www.target`
groups `opencode-web.service` (the opencode web server on `127.0.0.1:4096`)
and `caddy.service` (Caddy reverse proxy, TLS at `potato.local:1337` via
mDNS/avahi and an internal CA). The **work AI** is the meridian service
([`rynfar/meridian`](https://github.com/rynfar/meridian)) at `127.0.0.1:9000`,
an Anthropic-compatible proxy for Claude models.

The configs for these — the Caddyfile, the systemd units, meridian's config —
live in the deployed locations (`~/.config/caddy/Caddyfile`,
`~/.config/systemd/user/`, meridian's own directory) and are not part of this
repo. See [`OPENCODE_SETUP.md`](OPENCODE_SETUP.md) for the full reference.

```bash
systemctl --user enable --now user-www.target
```

## Opencode config

### Multi-agent system

The primary agent (default `build`) orchestrates three subagents, each defined as a separate agent with a specific model, permissions, and role:

- **coder** — implements well-scoped units of work. Runs build/typecheck/lint locally, reports back. No task delegation, no skills, no user questions.
- **researcher** — investigates codebase questions, reads specs/NIPs, and reviews coder diffs via the `review` skill. Read-only (no edits, no mutating commands). Can ask the user a single clarifying question during review.
- **tester** — runs test suites, linters, and builds for a given scope. Reports pass/fail with concrete failure details. Never modifies code.

See `agent/*.md` for full definitions.

### Profile switching (`plugin/opencode-profile.ts`)

A legacy env-var switch for routing agents between a work account and a
personal account. In practice the models are picked manually per session. The
work account is the meridian proxy; personal is a direct DeepSeek key; the
OpenCode Go subscription covers subagents (`deepseek-v4-flash`). The dsh
harness port replaces this with a Profile submenu in the model selector (see
`DSH.md` in the harness scratch dir).

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
| `ste-writing` | Rewrites prose (docs, READMEs, PR text, error messages, release notes, comments) into ASD-STE100 Simplified Technical English to cut AI slop. |
| `devtunnel` | Exposes a local dev server over HTTPS on the LAN via `~/.local/bin/devtunnel` (start/stop/restart/list/logs), reusing the same Caddy + local-CA + mDNS setup as the web stack above. |
| `share-caddy-cert` | Temporarily shares this machine's Caddy local CA root certificate with a new LAN device, so it can trust HTTPS on `potato.local:<port>` addresses. |
| `caffeine` | Toggles a `systemd-logind` sleep/idle inhibitor so the machine stays reachable over SSH without suspending. |

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

For the detailed configuration, security, and operating reference, see
[`OPENCODE_SETUP.md`](OPENCODE_SETUP.md).

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
