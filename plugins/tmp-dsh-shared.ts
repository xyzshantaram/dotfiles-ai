/**
 * tmp-dsh-shared — expose /tmp/dsh to both the user and every bash call.
 *
 * Why. Every bash call under `workspace-write` runs inside a bwrap sandbox
 * whose profile mounts a FRESH tmpfs at /tmp (`--tmpfs /tmp` in
 * dsh-sandbox-local's bwrapProfileArgs). The sandbox's /tmp is therefore
 * separate from the host's real /tmp: the user's /tmp/dsh (exposed to the
 * file panel via dsh-remote files.roots) is invisible to bash, and files
 * bash writes to /tmp/dsh are wiped on the next call. Landlock and Seatbelt
 * do not have this split — their /tmp IS the host's — so the fix is a bwrap
 * concern only.
 *
 * The fix. Wrap the host `sandbox.confine(argv, policy)` seam. When the
 * wrapped argv contains bwrap's `--tmpfs /tmp` pair, splice in a
 * `--bind <hostTmpDsh> /tmp/dsh` immediately after it, so the later bind
 * wins the mount point inside the tmpfs. `<hostTmpDsh>` is the real
 * `os.tmpdir()/dsh` (host /tmp/dsh on Linux), created on demand by this host
 * plugin (host code runs outside any sandbox, so node:fs is available).
 *
 * Result: one shared ephemeral scratch. The user drops files into
 * /tmp/dsh on the host and the agent sees them; the agent writes scripts
 * into /tmp/dsh and the user finds them; files persist across bash calls
 * for the boot's lifetime (real /tmp semantics — gone on reboot). Durable
 * scratch beyond that is a separate concern (the user's own plugin).
 *
 * We restore the original confine on dispose so a stop/update leaves no
 * wrapper behind.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Context } from "@deepseek-ai/cordis";

export const name = "tmp-dsh-shared";

/** The sandbox service is the whole point: enter waiting until it mounts. */
export const inject = ["sandbox"] as const;

/** Shape of the confine result we only need to look at. */
interface ConfinedArgvLike {
  argv: string[];
  [key: string]: unknown;
}

/**
 * Insert `--bind <hostTmpDsh> /tmp/dsh` after bwrap's `--tmpfs /tmp` pair.
 * Returns the input untouched when the pair is absent (read-only mode,
 * Landlock, Seatbelt), so non-bwrap backends are never altered.
 */
export function bindDurableTmp(
  confined: ConfinedArgvLike,
  hostTmpDsh: string,
): ConfinedArgvLike {
  const argv = confined.argv;
  const idx = argv.findIndex((arg, i) => arg === "--tmpfs" && argv[i + 1] === "/tmp");
  if (idx < 0) return confined;
  try {
    mkdirSync(hostTmpDsh, { recursive: true });
  } catch {
    // A missing source dir makes bwrap fail the whole call. If the host dir
    // cannot be created, leave the sandbox untouched rather than break every
    // bash invocation.
    return confined;
  }
  const next = [
    ...argv.slice(0, idx + 2),
    "--bind",
    hostTmpDsh,
    "/tmp/dsh",
    ...argv.slice(idx + 2),
  ];
  return { ...confined, argv: next };
}

export function apply(ctx: Context): void {
  const sandbox = ctx.sandbox as unknown as {
    confine(argv: readonly string[], policy: unknown): ConfinedArgvLike;
  };

  const original = sandbox.confine.bind(sandbox);
  const hostTmpDsh = join(tmpdir(), "dsh");

  sandbox.confine = (argv, policy) => {
    const confined = original(argv, policy);
    return bindDurableTmp(confined, hostTmpDsh);
  };

  ctx.effect(() => {
    // Restore the original method on dispose. If another instance already
    // replaced confine after us, do not clobber its wrapper.
    if (sandbox.confine !== undefined) {
      sandbox.confine = original;
    }
  });
}
