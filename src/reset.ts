// Factory reset for split-utils. Removes the saved Splitwise token,
// the pushed fingerprint file, and the app data under the state root.
// Returns the paths it removed. Missing paths stay silent.

import {
  legacyPushedFilePath,
  legacyTokenFilePath,
  pushedFilePath,
  stateRoot,
  tokenFilePath,
} from "./paths.ts";

// The two credential files this app used to keep under the user cache.
// A reset must clear them too. Leaving them behind is not a leftover:
// the move forward copies whichever one still exists back into the
// state root on the next read, so the reset would undo itself.
function legacyTargets(): string[] {
  const paths = [legacyTokenFilePath(), legacyPushedFilePath()];
  return paths.filter((path): path is string => path !== null);
}

// Every path a factory reset removes.
export function resetTargets(): string[] {
  const root = stateRoot();
  return [
    tokenFilePath(),
    pushedFilePath(),
    root + "/config",
    root + "/share/runs",
    root + "/share/profiles",
    root + "/share/zomato-tokens.json",
    root + "/share/zomato-login-state.json",
  ];
}

// True when the path sits inside the state root.
function insideRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(root + "/");
}

// Remove every reset target that exists and return the removed paths.
// A second run finds nothing and returns an empty list. Only two paths
// outside the state root are ever touched: the two legacy credential
// files named below, each an exact file this app wrote.
export async function factoryReset(): Promise<string[]> {
  const root = stateRoot();
  const removed: string[] = [];
  for (const path of resetTargets()) {
    if (!insideRoot(path, root)) continue;
    try {
      await Deno.remove(path, { recursive: true });
      removed.push(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  // These two sit outside the root by history, so the guard above skips
  // them. Each is one exact file path this app wrote, and the removal
  // never recurses.
  for (const path of legacyTargets()) {
    try {
      await Deno.remove(path);
      removed.push(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  return removed;
}
