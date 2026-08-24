/**
 * grant — session-scoped write grant for one path.
 *
 * Ticket H1. The current session's model may write an arbitrary absolute
 * path for the rest of the session, without full danger mode.
 *
 * Why. The fs policy fence is in-process, not a kernel boundary. The
 * sandboxed filesystem wraps every mutation in `checkedTarget`, which denies
 * writes outside the workspace-write roots (dsh-fs-sandbox/lib/index.js,
 * lines 157-171). rc.8 has no per-path allow-list. So this plugin wraps the
 * shared SandboxedFileSystem `writeText` and `editText` and skips the fence
 * when the calling session holds a grant for the target root.
 *
 * The seam (verified against the installed host base, rc.8,
 * dsh-fs-sandbox/lib/index.js):
 *
 *   line 129  async writeText(target, content, expected, signal, sandboxPolicy) {
 *   line 130    return super.writeText(await this.checkedTarget(target, sandboxPolicy), ...);
 *   line 143  async editText(target, edit, expected, signal, sandboxPolicy) {
 *   line 144    return super.editText(await this.checkedTarget(target, sandboxPolicy), ...);
 *   line 157  async checkedTarget(target, sandboxPolicy) {
 *   line 160    if (mode === "danger-full-access") return target;
 *   line 161    if (mode === "read-only") throw new FsError(..., "FS_SANDBOX_DENIED");
 *   line 165    const fresh = await this.resolve(target.displayPath);
 *   line 166    for (const root of writableRoots(policy)) if (await isPathUnder(fresh.targetKey, root)) ...
 *   line 170    if (!contained) throw new FsError(..., "FS_SANDBOX_DENIED");
 *
 * The wrap. Patch SandboxedFileSystem.prototype.writeText and editText. The
 * policy the tool layer stamps on every mutation carries the calling
 * session's id (`sandboxPolicy.sessionId`, set by dsh-sandbox-policy
 * resolve() when a session exists). Resolve that id back to the live session
 * object through the sessions store (`ctx.sessions`, SessionStore.get), then
 * look the session up in the grant registry. On a match with a root that
 * contains the target, re-canonicalize the target (this.resolve — the same
 * hygiene the fence applies, so the checked identity is the mutated one) and
 * run the ORIGINAL method with a synthetic danger-full-access policy: the
 * fence's own danger branch returns the target unfenced and the real atomic
 * write runs unchanged.
 *
 * Delta vs calling super.writeText directly: the bypass goes through the
 * fenced method with a substituted policy instead of reaching
 * LocalFileSystem directly, because the superclass lives in a separate
 * module and has no stable public seam from here. Behavior is identical to
 * danger-full-access for exactly this one call.
 *
 * The registry. A WeakMap keyed by the session object, values are the
 * session id plus the granted absolute root paths. Memory-only, never
 * persisted, dies with the session: the key is garbage once the store drops
 * the session, and nothing else holds a strong reference. Child subagent
 * sessions carry their own session object and are never in the map.
 *
 * The command. `ctx.commands.register` is the composer command API
 * (dsh-commands/lib/index.js, CommandRuntime.register, the same seam
 * dsh-command-goal uses for /goal). One host registration mirrors to the
 * client "/" source through the commands Remote, so the composer UI picks
 * /grant up without client work.
 *
 * Mount on the HOST plane (personal bundle patch):
 *
 *   - id: grant
 *     name: /path/to/plugins/grant.js
 */
import { realpathSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-fs";

export const name = "grant";

/** The fs service is the whole point: enter waiting until it mounts. */
export const inject = ["fs"] as const;

/** The resolved target the backend hands to mutations. */
interface FsTargetLike {
  displayPath: string;
  targetKey: string;
}

/** The per-call policy object stamped by the tool layer. */
interface SandboxPolicyLike {
  mode?: string;
  workspaceRoot?: string;
  sessionId?: string;
}

/** Duck-typed view of the fs service and its prototype chain. */
interface FsLike {
  resolve(input: string): Promise<FsTargetLike>;
  writeText(
    target: FsTargetLike,
    content: string,
    expected: unknown,
    signal: unknown,
    sandboxPolicy?: SandboxPolicyLike,
  ): Promise<unknown>;
  editText(
    target: FsTargetLike,
    edit: unknown,
    expected: unknown,
    signal: unknown,
    sandboxPolicy?: SandboxPolicyLike,
  ): Promise<unknown>;
  checkedTarget(target: FsTargetLike, sandboxPolicy?: SandboxPolicyLike): Promise<FsTargetLike>;
}

/** The prototype object that owns the three fenced methods. */
type FsProto = Required<Pick<FsLike, "writeText" | "editText" | "checkedTarget">>;

interface SessionLike {
  id: string;
}

/** Duck-typed view of the sessions store (SessionStore.get). */
interface SessionsLike {
  get(sessionId: string): SessionLike | undefined;
}

/** One grant entry: which session id owns which roots. */
interface GrantEntry {
  sessionId: string;
  roots: string[];
}

/** The invocation the commands service hands to a handler. */
interface GrantInvocation {
  agent?: { session: SessionLike };
  rawInput: string;
}

/** The CommandResult contract the commands service validates. */
interface CommandResult {
  kind: "success" | "error";
  text: string;
}

/** The descriptor shape `ctx.commands.register` accepts. */
interface CommandDescriptor {
  name: string;
  description: string;
  input?: { hint: string; images?: boolean };
  handler(invocation: GrantInvocation): CommandResult | Promise<CommandResult>;
}

/** Duck-typed view of the commands service. */
interface CommandsLike {
  register(descriptor: CommandDescriptor): () => void;
}

/** Strip one matching pair of surrounding quotes, when present. */
function stripQuotes(raw: string): string {
  if (raw.length >= 2) {
    const first = raw[0];
    if ((first === '"' || first === "'") && raw[raw.length - 1] === first) {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

/**
 * Canonicalize a path for comparison: resolve symlinks when the path
 * exists, else fall back to the normalized absolute spelling. Mirrors the
 * writable-roots derivation in dsh-sandbox (canonicalPath).
 */
function canonicalPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

/** Prefix-safe containment: root itself or root + separator. */
function isUnder(root: string, target: string): boolean {
  if (target === root) return true;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return target.startsWith(prefix);
}

/** Whether a write target lies under any granted root. */
function targetUnderGrant(target: FsTargetLike, roots: readonly string[]): boolean {
  const canonical = canonicalPath(target.displayPath);
  for (const root of roots) {
    if (isUnder(root, canonical)) return true;
  }
  return false;
}

/** The wrap seams we patch: the prototype and the two originals. */
interface Seam {
  proto: FsProto;
  originalWrite: FsProto["writeText"];
  originalEdit: FsProto["editText"];
}

/**
 * Walk the fs prototype chain for the object that owns checkedTarget plus
 * writeText and editText — the sandboxed backend class. Returns null when
 * the mounted backend is not sandboxed (nothing to bypass).
 */
function findSeam(fs: FsLike): Seam | null {
  let proto = Object.getPrototypeOf(fs) as FsProto | null;
  while (proto !== null) {
    if (
      typeof proto.checkedTarget === "function" &&
      typeof proto.writeText === "function" &&
      typeof proto.editText === "function"
    ) {
      return {
        proto,
        originalWrite: proto.writeText,
        originalEdit: proto.editText,
      };
    }
    proto = Object.getPrototypeOf(proto) as FsProto | null;
  }
  return null;
}

/**
 * One wrapped mutation. When the call's policy names a session that holds a
 * grant for the target root, bypass the fence: re-canonicalize the target,
 * then run the original method with a synthetic danger-full-access policy.
 * Every other call passes through untouched, exactly as before the patch.
 */
async function mutation(
  grants: WeakMap<object, GrantEntry>,
  ctx: Context,
  original: (...args: unknown[]) => Promise<unknown>,
  self: FsLike,
  target: FsTargetLike,
  payload: unknown,
  expected: unknown,
  signal: unknown,
  policy: SandboxPolicyLike | undefined,
): Promise<unknown> {
  const sessionId = policy?.sessionId;
  if (sessionId !== undefined) {
    const sessions = ctx.get("sessions") as SessionsLike | undefined;
    const session = sessions?.get(sessionId);
    const entry = session === undefined ? undefined : grants.get(session as object);
    if (
      entry !== undefined &&
      entry.sessionId === sessionId &&
      targetUnderGrant(target, entry.roots)
    ) {
      const fresh = await self.resolve(target.displayPath);
      return original.call(self, fresh, payload, expected, signal, {
        mode: "danger-full-access",
      });
    }
  }
  return original.call(self, target, payload, expected, signal, policy);
}

export function apply(ctx: Context): void {
  const fs = ctx.fs as unknown as FsLike | undefined;
  if (fs === undefined) return;

  const seam = findSeam(fs);
  const grants = new WeakMap<object, GrantEntry>();

  if (seam !== null) {
    const { proto, originalWrite, originalEdit } = seam;
    const wrappedWrite: FsProto["writeText"] = function (
      this: FsLike,
      target: FsTargetLike,
      content: string,
      expected: unknown,
      signal: unknown,
      policy?: SandboxPolicyLike,
    ) {
      return mutation(grants, ctx, originalWrite, this, target, content, expected, signal, policy);
    };
    const wrappedEdit: FsProto["editText"] = function (
      this: FsLike,
      target: FsTargetLike,
      edit: unknown,
      expected: unknown,
      signal: unknown,
      policy?: SandboxPolicyLike,
    ) {
      return mutation(grants, ctx, originalEdit, this, target, edit, expected, signal, policy);
    };
    proto.writeText = wrappedWrite;
    proto.editText = wrappedEdit;

    // Restore the originals on dispose. Only restore when our own wrapper is
    // still in place, so a later wrapper from another plugin is not clobbered.
    ctx.effect(() => () => {
      if (proto.writeText === wrappedWrite) proto.writeText = originalWrite;
      if (proto.editText === wrappedEdit) proto.editText = originalEdit;
    });
  }

  const commands = ctx.get("commands") as CommandsLike | undefined;
  if (commands === undefined) {
    ctx.logger.warn("grant: commands service not mounted; /grant is not registered");
    return;
  }

  commands.register({
    name: "grant",
    description: "grant this session write access to one absolute path for the rest of the session",
    input: { hint: "<absolute path>" },
    handler: (invocation) => {
      const session = invocation.agent?.session;
      if (session === undefined) {
        return { kind: "error", text: "/grant requires a session." };
      }
      const raw = stripQuotes(invocation.rawInput.trim());
      if (raw.length === 0) {
        return { kind: "error", text: "usage: /grant <absolute path>" };
      }
      if (!isAbsolute(raw)) {
        return { kind: "error", text: `path must be absolute: ${raw}` };
      }
      if (seam === null) {
        return {
          kind: "error",
          text: "the sandboxed filesystem seam is not present in this composition; /grant cannot work.",
        };
      }
      const root = canonicalPath(normalize(raw));
      const entry = grants.get(session as object) ?? {
        sessionId: session.id,
        roots: [] as string[],
      };
      if (!entry.roots.includes(root)) entry.roots.push(root);
      grants.set(session as object, entry);
      return {
        kind: "success",
        text: `granted write access under ${root} for session ${session.id}.`,
      };
    },
  });
}
