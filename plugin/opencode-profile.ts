import type { Plugin } from "@opencode-ai/plugin"

/**
 * Routes agents between a "work" account (OpenRouter) and a "personal"
 * account (direct DeepSeek key) serving different tiers of the same model
 * family, selected by the OPENCODE_PROFILE env var:
 *
 *   OPENCODE_PROFILE=work (default/unset) -> primary agent (build) inherits
 *     whatever model the session picked; coder/tester/researcher ->
 *     openrouter/deepseek/deepseek-v4-pro
 *
 *   OPENCODE_PROFILE=me -> primary agent -> deepseek/deepseek-v4-pro (direct
 *     key); coder/tester/researcher -> deepseek/deepseek-v4-flash (fast/cheap,
 *     direct key)
 *
 * Projects listed in pinnedToWork always stay on the work profile regardless
 * of OPENCODE_PROFILE, e.g. because they're work repos. Empty by default --
 * every project follows whichever profile OPENCODE_PROFILE selects.
 *
 * Every value below is overridable from opencode.json without touching this
 * file, by passing an options object in the plugin registration tuple:
 *
 *   "plugin": [
 *     ["./plugin/opencode-profile.ts", {
 *       "envVar": "OPENCODE_PROFILE",
 *       "personalValue": "me",
 *       "pinnedToWork": ["some-work-repo"],
 *       "primaryAgent": "build",
 *       "primaryPersonalModel": "deepseek/deepseek-v4-pro",
 *       "subagents": ["coder", "tester", "researcher"],
 *       "subagentWorkModel": "openrouter/deepseek/deepseek-v4-pro",
 *       "subagentPersonalModel": "deepseek/deepseek-v4-flash"
 *     }]
 *   ]
 */

interface ProfileOptions {
  envVar?: string
  personalValue?: string
  pinnedToWork?: string[]
  primaryAgent?: string
  primaryPersonalModel?: string | null
  subagents?: string[]
  subagentWorkModel?: string
  subagentPersonalModel?: string
}

const DEFAULTS: Required<ProfileOptions> = {
  envVar: "OPENCODE_PROFILE",
  personalValue: "me",
  pinnedToWork: [],
  primaryAgent: "build",
  primaryPersonalModel: "deepseek/deepseek-v4-pro",
  subagents: ["coder", "tester", "researcher"],
  subagentWorkModel: "openrouter/deepseek/deepseek-v4-pro",
  subagentPersonalModel: "deepseek/deepseek-v4-flash",
}

export default ((input, options: ProfileOptions = {}) => {
  const opts: Required<ProfileOptions> = { ...DEFAULTS, ...options }

  return {
    config: (cfg) => {
      if (process.env[opts.envVar] !== opts.personalValue) return

      const projectName = input.directory?.split("/").filter(Boolean).pop()
      if (projectName && opts.pinnedToWork.includes(projectName)) return

      if (opts.primaryPersonalModel && cfg.agent) {
        const primary = cfg.agent[opts.primaryAgent]
        if (primary) primary.model = opts.primaryPersonalModel
        // Built-in agents (like `build`) may not have an explicit entry in
        // the merged config unless the user already overrode a field on
        // them — create one rather than silently no-opping.
        else cfg.agent[opts.primaryAgent] = { model: opts.primaryPersonalModel }
      }

      for (const name of opts.subagents) {
        const agent = cfg.agent?.[name]
        if (agent?.model === opts.subagentWorkModel) {
          agent.model = opts.subagentPersonalModel
        }
      }
    },
  }
}) satisfies Plugin
