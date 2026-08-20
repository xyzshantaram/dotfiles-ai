import type { Plugin } from "@opencode-ai/plugin"

/**
 * Tells the agent its own session age and compaction count on every turn, so
 * it stops trusting stale summarized context instead of reading files:
 *
 *   - `chat.message` records the first-seen time for a new session
 *   - `experimental.session.compacting` counts compactions per session
 *   - `experimental.chat.system.transform` appends one short warning to the
 *     system prompt when the session is old or has compacted many times
 *
 * Thresholds, all overridable from opencode.json without touching this file,
 * by passing an options object in the plugin registration tuple:
 *
 *   "plugin": [
 *     ["./plugin/session-hygiene.ts", {
 *       "softAgeHours": 2,
 *       "softCompactions": 5,
 *       "hardAgeHours": 4,
 *       "hardCompactions": 10
 *     }]
 *   ]
 *
 * The deployed config at ~/.config/opencode/opencode.json registers this
 * plugin with an absolute path. The repo config at
 * ~/repos/dotfiles-ai/opencode.json registers it with a relative path.
 *
 * The session age prefers the real creation time from the session record
 * via the SDK client. If that call fails, it falls back to the first-seen
 * time, which resets when opencode restarts.
 */

interface SessionHygieneOptions {
  softAgeHours?: number
  softCompactions?: number
  hardAgeHours?: number
  hardCompactions?: number
}

interface SessionState {
  firstSeen: number
  compactions: number
  /** Real session start time, fetched once and then cached. */
  created?: number
  /** Set after the first fetch attempt, so a failure does not retry every turn. */
  createdTried?: boolean
}

const DEFAULTS: Required<SessionHygieneOptions> = {
  softAgeHours: 2,
  softCompactions: 5,
  hardAgeHours: 4,
  hardCompactions: 10,
}

export default ((input, options: SessionHygieneOptions = {}) => {
  const opts: Required<SessionHygieneOptions> = { ...DEFAULTS, ...options }
  const client = input.client
  const sessions = new Map<string, SessionState>()

  const stateFor = (sessionID: string): SessionState => {
    let state = sessions.get(sessionID)
    if (!state) {
      state = { firstSeen: Date.now(), compactions: 0 }
      sessions.set(sessionID, state)
    }
    return state
  }

  return {
    "chat.message": async (input: { sessionID: string }) => {
      if (!sessions.has(input.sessionID)) {
        sessions.set(input.sessionID, { firstSeen: Date.now(), compactions: 0 })
      }
    },

    "experimental.session.compacting": async (input: { sessionID: string }) => {
      stateFor(input.sessionID).compactions += 1
    },

    "experimental.chat.system.transform": async (
      input: { sessionID?: string },
      output: { system: string[] },
    ) => {
      if (!input.sessionID) return
      const state = stateFor(input.sessionID)

      // The real start time never changes, so fetch it once per session and
      // cache it. Without this the plugin makes one API call every turn.
      if (state.created === undefined && !state.createdTried) {
        state.createdTried = true
        try {
          const res = await client.session.get({ path: { id: input.sessionID } })
          state.created = res.data?.time?.created
        } catch {
          // The first-seen time is the fallback. That age resets when opencode
          // restarts, because the per-session state lives only in this process.
        }
      }

      const start = state.created ?? state.firstSeen
      const ageHours = (Date.now() - start) / 3_600_000

      const hard =
        ageHours >= opts.hardAgeHours || state.compactions >= opts.hardCompactions
      if (hard) {
        output.system.push(
          `This session is ${ageHours.toFixed(1)} hours old and has compacted ` +
            `${state.compactions} times. Your memory of this session is stale. ` +
            `Before you state any fact about the code, read the file that ` +
            `supports the fact. Tell the user to start a new session before ` +
            `new work. Refuse to write merge request or issue prose from ` +
            `context alone.`,
        )
        return
      }

      const soft =
        ageHours >= opts.softAgeHours || state.compactions >= opts.softCompactions
      if (soft) {
        output.system.push(
          `This session is ${ageHours.toFixed(1)} hours old and has compacted ` +
            `${state.compactions} times. Your memory of this session may be ` +
            `stale. Before you state any fact about the code, read the file ` +
            `that supports the fact.`,
        )
      }
    },
  }
}) satisfies Plugin
