// Single path owner for split-utils. This module alone decides where
// app data lives. Every other module imports it. The accessors stay
// synchronous because call sites include Deno.statSync and
// Deno.readTextFileSync.

import { dir } from "jsr:@cross/dir@^1.1.1";

// Resolve the per-platform data dir once, when this module loads.
// @cross/dir is async and the accessors below are not, so a top level
// await buys both: every importer waits for this, and no caller needs
// an init step it could forget. A failure here is not fatal on its
// own, because SPLIT_UTILS_STATE still overrides it, so hold the
// failure and let stateRoot raise it only when it actually matters.
let dataDir: string | null = null;
try {
  dataDir = await dir("data");
} catch {
  // Left null on purpose. stateRoot reports it.
}

// Strip trailing slashes so joins never double them.
function trim(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

// Read the state root. SPLIT_UTILS_STATE wins, which is how the tests
// and a checkout keep their data out of the real one. Everything else
// sits in the platform data dir: ~/.local/share on Linux, Application
// Support on macOS, AppData on Windows. The root must never derive
// from the module URL. A module loaded from a URL has no directory of
// its own, so that resolved to "/" and left the one command run with
// nowhere to write.
export function stateRoot(): string {
  // Prefer the env override for tests and development.
  const override = Deno.env.get("SPLIT_UTILS_STATE");
  if (override !== undefined && override.length > 0) return trim(override);
  // Fail loudly rather than write to a path nobody meant.
  if (dataDir === null) {
    throw new Error(
      "No place for app data. This system exposes no user data dir. " +
        "Set SPLIT_UTILS_STATE to pick one.",
    );
  }
  // Keep the app dir under the platform data dir.
  return trim(dataDir) + "/split-utils";
}

// Read the config dir under the state root.
export function configDir(): string {
  // Join the root and the config path.
  return stateRoot() + "/config";
}

// Read the share dir under the state root.
export function shareDir(): string {
  // Join the root and the share path.
  return stateRoot() + "/share";
}

// Read the Zomato constants file under the share dir.
export function zomatoConfigPath(): string {
  // Join the share dir and the fixed file name.
  return shareDir() + "/config/zomato.json";
}

// Read the live runs dir under the state root.
export function runsDir(): string {
  // Join the root and the share runs path.
  return stateRoot() + "/share/runs";
}

// Read the Splitwise token file under the config dir.
export function tokenFilePath(): string {
  // Join the config dir and the fixed file name.
  return configDir() + "/splitwise_token.json";
}

// Read the pushed fingerprint file under the config dir.
export function pushedFilePath(): string {
  // Join the config dir and the fixed file name.
  return configDir() + "/splitwise_pushed.json";
}

// Read the Splitwise key pair file under the config dir.
export function splitwiseEnvPath(): string {
  // Join the config dir and the fixed file name.
  return configDir() + "/splitwise.env";
}
