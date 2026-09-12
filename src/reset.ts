// Factory reset for split-utils. Removes the saved Splitwise token,
// the pushed fingerprint file, and the app data under the state root.
// Returns the paths it removed. Missing paths stay silent.

import { stateRoot } from "./runstate.ts";
import { pushedFilePath, tokenFilePath } from "./splitwise.ts";

// Every path a factory reset removes.
function resetTargets(): string[] {
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
// A second run finds nothing and returns an empty list. Never touch a
// path outside the state root and the two Splitwise cache files.
export async function factoryReset(): Promise<string[]> {
  const root = stateRoot();
  const cacheFiles = new Set([tokenFilePath(), pushedFilePath()]);
  const removed: string[] = [];
  for (const path of resetTargets()) {
    if (!insideRoot(path, root) && !cacheFiles.has(path)) continue;
    try {
      await Deno.remove(path, { recursive: true });
      removed.push(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
  return removed;
}
