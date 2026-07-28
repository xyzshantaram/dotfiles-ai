# dotfiles-ai

My [opencode](https://opencode.ai) config — agents, skills, tools, plugins, and global rules (AGENTS.md). Clone into `~/.config/opencode` and run `npm install` to replicate the setup on a new machine.

## Structure

```
~/.config/opencode/
├── agent/           # Subagent definitions (coder, researcher, tester)
├── skills/          # Custom skills (software-engineering, grilling, plan, review, etu)
├── tools/           # Custom tools (shell-command-long-running via tmux)
├── plugin/          # Custom plugins (opencode-profile for model routing)
├── AGENTS.md        # Global agent instructions
├── opencode.json    # MCP servers, providers, permissions, agent config
├── btw.jsonc        # opencode-btw plugin config
├── package.json     # Plugin dependency (@opencode-ai/plugin)
└── server.env       # (not tracked) secrets/API keys
```

## Setup

```bash
git clone git@github.com:xyzshantaram/dotfiles-ai.git ~/.config/opencode
cd ~/.config/opencode
npm install
```

Then create `~/.config/opencode/server.env` with any secret environment variables (API keys, etc.) — this file is gitignored.