/**
 * W4 — Session hygiene prompt section (personal bundle).
 *
 * An evolution of the legacy session-hygiene plugin
 * (staging `_src/plugin/session-hygiene.ts`) onto dsh's prompt-section seam.
 *
 * dsh has no `experimental.chat.system.transform` hook. Instead this plugin
 * registers one prompt VARIABLE whose provider is evaluated at every
 * system-prompt assembly, plus one SECTION whose text is that variable. The
 * provider reads the LIVE agent's session:
 *
 *   - age          from `session.header.createdAt` (epoch ms;
 *                  DSH/dsh-session/lib/types/types.d.ts:49-50)
 *   - compaction   count of `compaction/end` events in `session.events`
 *                  (event type DSH/dsh-compaction/lib/types/types.d.ts:72;
 *                  events array DSH/dsh-session/lib/types/index.d.ts:174)
 *
 * When no warning applies the provider returns '' and the section renders
 * empty and is dropped (`renderPrompt` filters empty sections;
 * DSH/dsh-system-prompt/lib/index.js `renderPrompt`). The variable must never
 * return `undefined` — an undefined value throws at render
 * (DSH/dsh-system-prompt/lib/index.js `interpolate`).
 *
 * Thresholds are plugin-row `config` (schemastery), so the preset tunes them
 * without editing this file. Defaults are:
 * (2h / 5 compactions soft, 4h / 10 hard).
 *
 * NOT-VERIFIED: the exact `compaction/*` event payload fields (only the
 * `type` discriminator is read here, which IS verified). The full payload
 * catalog lives in the generated docs/persistence-catalog.md, not shipped in
 * the installed packages. Counting by `type` needs no payload.
 *
 * Mount as a preset row (kebab-case id), e.g. in the personal preset's
 * agent.cordis.yml:
 *
 *   - id: session-hygiene
 *     name: ../plugins/session-hygiene.ts
 *     config:
 *       softAgeHours: 2
 *       softCompactions: 5
 *       hardAgeHours: 4
 *       hardCompactions: 10
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'

export const name = 'session-hygiene'

export const inject = ['systemPrompt']

export const Config = z.object({
  softAgeHours: z.number().default(2),
  softCompactions: z.number().default(5),
  hardAgeHours: z.number().default(4),
  hardCompactions: z.number().default(10),
})

type HygieneConfig = {
  softAgeHours?: number
  softCompactions?: number
  hardAgeHours?: number
  hardCompactions?: number
}

/**
 * Count completed compactions. The `compaction/end` event type is a
 * `SessionEventMap` augmentation declared by dsh-compaction; the comparison is
 * written against a string-typed view so the plugin typechecks without that
 * augmentation being in scope (two type universes can share one runtime).
 */
function compactionCount(events: readonly { type: string }[]): number {
  return events.filter((event) => event.type === 'compaction/end').length
}

/**
 * The section sits after the tool guidance band (100-199) so the warning is
 * read near the end of the assembled prompt. 180 collides with no shipped
 * section (tool:bash 105, tool:read 130, tool:edit 131, tool:batch_edit 132,
 * tool:undo_last_edit 133, tools:sdk 150).
 */
const SECTION_ORDER = 180

const SOFT_WARNING = (age: string, count: number): string =>
  `This session is ${age} hours old and has compacted ${count} times. ` +
  'Your memory of this session may be stale. ' +
  'Before you state any fact about the code, read the file that supports the fact.'

const HARD_WARNING = (age: string, count: number): string =>
  `This session is ${age} hours old and has compacted ${count} times. ` +
  'Your memory of this session is stale. ' +
  'Before you state any fact about the code, read the file that supports the fact. ' +
  'Tell the user to start a new session before new work. ' +
  'Refuse to write merge request or issue prose from context alone.'

export function apply(ctx: Context, config: HygieneConfig): void {
  // The cordis loader applies schemastery defaults before apply(); the
  // nullish fallbacks keep the plugin safe if a loader passes raw config.
  const opts = {
    softAgeHours: config.softAgeHours ?? 2,
    softCompactions: config.softCompactions ?? 5,
    hardAgeHours: config.hardAgeHours ?? 4,
    hardCompactions: config.hardCompactions ?? 10,
  }

  ctx.systemPrompt.variable('session_hygiene_warning', (context) => {
    const agent = context.agent
    if (!agent) return ''
    const session = agent.session
    const ageHours = (Date.now() - session.header.createdAt) / 3_600_000
    const compactions = compactionCount(session.events)
    const hard = ageHours >= opts.hardAgeHours || compactions >= opts.hardCompactions
    if (hard) return HARD_WARNING(ageHours.toFixed(1), compactions)
    const soft = ageHours >= opts.softAgeHours || compactions >= opts.softCompactions
    if (soft) return SOFT_WARNING(ageHours.toFixed(1), compactions)
    return ''
  })

  ctx.systemPrompt.section({
    name: 'session:hygiene',
    order: SECTION_ORDER,
    text: '{{session_hygiene_warning}}',
  })
}
