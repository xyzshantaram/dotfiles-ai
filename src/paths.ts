// Single path owner for split-utils. This module alone reads an
// environment variable for a path. Every other module imports it.
// Each function resolves lazily on every call. Tests set
// SPLIT_UTILS_STATE inside the test body, so no read happens once
// at module load.

// Read the state root from the env or the repo layout.
export function stateRoot(): string {
  // Prefer the env override for tests and installs.
  const override = Deno.env.get("SPLIT_UTILS_STATE");
  // Use the override when it holds a value.
  if (override !== undefined && override.length > 0) {
    // Strip trailing slashes for stable joins.
    return override.replace(/\/+$/, "") || "/";
  }
  // Fall back to repo state beside src.
  const path = decodeURIComponent(new URL("../state/", import.meta.url).pathname);
  // Strip trailing slashes for stable joins.
  return path.replace(/\/+$/, "") || "/";
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

// Read the old Zomato constants file under the config dir.
export function legacyZomatoConfigPath(): string {
  // Join the config dir and the fixed file name.
  return configDir() + "/zomato.json";
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

// Old token file location under the user cache. Returns null when
// HOME misses, so callers skip the move on odd installs.
export function legacyTokenFilePath(): string | null {
  // Read HOME lazily on every call.
  const home = Deno.env.get("HOME");
  // Skip the move when HOME holds nothing.
  if (home === undefined || home.length === 0) return null;
  // Join the old cache dir and the fixed file name.
  return home.replace(/\/+$/, "") + "/.cache/ordersplit/splitwise_token.json";
}

// Old fingerprint file location under the user cache. Returns null
// when HOME misses, so callers skip the move on odd installs.
export function legacyPushedFilePath(): string | null {
  // Read HOME lazily on every call.
  const home = Deno.env.get("HOME");
  // Skip the move when HOME holds nothing.
  if (home === undefined || home.length === 0) return null;
  // Join the old cache dir and the fixed file name.
  return home.replace(/\/+$/, "") + "/.cache/ordersplit/splitwise_pushed.json";
}

// Copy the old file to the new path when the new path holds nothing
// and the old path holds a file. Never delete the old copy. Keep the
// new copy owner only.
export async function migrateIfMissing(
  newPath: string,
  oldPath: string | null,
  ownerOnly: boolean,
): Promise<void> {
  // Skip when the old path misses.
  if (oldPath === null || oldPath.length === 0) return;
  // Skip when both paths name the same file.
  if (oldPath === newPath) return;
  // Return when the new path already holds a file.
  try {
    const info = await Deno.stat(newPath);
    if (info.isFile) return;
  } catch {
    // Fall through to the old path check.
  }
  // Return when the old path holds nothing.
  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(oldPath);
  } catch {
    return;
  }
  // Make the new parent dirs.
  await Deno.mkdir(newPath.slice(0, newPath.lastIndexOf("/")), { recursive: true });
  // Copy the bytes to the new path.
  if (ownerOnly) {
    await Deno.writeFile(newPath, bytes, { mode: 0o600 });
  } else {
    await Deno.writeFile(newPath, bytes);
  }
  // Fix the mode again for existing files.
  if (ownerOnly) {
    try {
      await Deno.chmod(newPath, 0o600);
    } catch {
      // Ignore chmod errors on non posix disks.
    }
  }
}
