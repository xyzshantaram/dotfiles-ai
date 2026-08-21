/**
 * W11 — manifest-guard: deny direct write/edit of dependency manifests and
 * lockfiles (personal bundle). Dependencies change only through the package
 * tool (plugins/package-tool.ts) or the user.
 *
 * Seam: the fs mutation intent waterfalls.
 *   - write: `ctx.waterfall('fs/write-intent', target, exec, () => undefined)`
 *     DSH/dsh-tool-fs/README.md:49
 *   - edit:  `ctx.waterfall('fs/edit-intent', target, exec, () => undefined)`
 *     DSH/dsh-tool-fs/README.md:50
 *   - listener shape `(target, actor, next)` and single-slot veto semantics:
 *     DSH/dsh-fs-observation-policy/lib/index.js:82-91 (comment lines 82-84)
 *   - the observation policy occupies the single decision slot, so this guard
 *     MUST be prepended: a later-registered listener never runs once the
 *     policy returns an intent (cordis waterfall veto: DSH/cordis/lib/index.js
 *     `waterfall` — "a listener that does not call next() vetoes the rest").
 *   - denial by throwing FsError('...', 'FS_PERMISSION_DENIED') flows through
 *     ToolRuntime.execute() into an isError result with { name, code }:
 *     DSH/dsh-tool-fs/README.md:52; code vocabulary
 *     DSH/dsh-fs/lib/types/types.d.ts:162.
 *
 * Coverage: the builtin write (write-intent), builtin edit (edit-intent), and
 * dsh-better-edit's hashline edit/batch_edit/undo_last_edit (their fs bridge
 * writes dispatch fs/write-intent too: ~/.dsh/profiles/web/node_modules/
 * dsh-better-edit/lib/fs-bridge.js:82).
 *
 * Matching: basename of `target.displayPath` (FsTarget shape
 * DSH/dsh-fs/lib/types/types.d.ts:52-60), case-insensitive so `Cargo.toml`
 * and `cargo.toml` both match. The SPEC list is normative; this guard applies
 * it verbatim, plus the two flags below.
 *
 * SCOPE: the guard is HOST-PLANE — it applies to every agent in every preset
 * (personal bundle W11). No preset scoping.
 *
 * FLAG (DECIDED by user): requirements.txt is EXEMPT. It is a bare, hand-editable
 * dependency list and pip workflows legitimately edit it, so it is removed from
 * the deny set below.
 * FLAG (not implemented): a read-deny is optional (read is read-only); it
 * would need a tools/pre-execute deny by path because there is no read-intent
 * waterfall, and it would also hit hashline's read. Left out deliberately.
 *
 * Mount on the HOST plane (web profile cordis.patch.yml or personal bundle patch):
 *
 *   - id: manifest-guard
 *     name: /path/to/plugins/manifest-guard.js
 */
import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FsError } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'

export const name = 'manifest-guard'

export const inject = []

export const Config = z.object({})

type ManifestGuardConfig = Record<string, never>

/** SPEC-W.md W11 list, matched case-insensitively against the basename. */
const MANIFEST_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'cargo.toml',
  'Cargo.lock',
  'pyproject.toml',
  'poetry.lock',
  'Pipfile',
  'go.mod',
  'go.sum',
  'Gemfile',
])

const DENY_MESSAGE = (name: string): string =>
  `Direct edits to ${name} are denied. ` +
  'Use the package tool for dependency changes. ' +
  'Ask the user to run the change when the tool cannot.'

function isManifestPath(displayPath: string): boolean {
  const name = basename(displayPath)
  return MANIFEST_NAMES.has(name.toLowerCase()) || MANIFEST_NAMES.has(name)
}

export function apply(ctx: Context, config: ManifestGuardConfig): void {
  void config
  // The guard is HOST-PLANE (personal bundle): it applies to every agent in
  // every preset, because dependency changes go through the package tool
  // everywhere (W11). No preset scoping: a manifest path is denied for any
  // agent that touches it directly.

  // Deny core: throws for a manifest path, else no-op.
  const denyIfManifest = (
    target: { displayPath: string },
  ): void => {
    if (!isManifestPath(target.displayPath)) return
    throw new FsError(DENY_MESSAGE(basename(target.displayPath)), 'FS_PERMISSION_DENIED')
  }

  // prepend: the observation policy vetoes the chain by returning an intent;
  // without prepend this guard would never run (see header note). Listeners
  // that return without calling next() veto the chain, so the pass-through
  // calls next() to let the policy decide.
  ctx.on('fs/write-intent', async (target, _actor, next) => {
    denyIfManifest(target)
    return next()
  }, { prepend: true })
  ctx.on('fs/edit-intent', async (target, _actor, next) => {
    denyIfManifest(target)
    return next()
  }, { prepend: true })
}
