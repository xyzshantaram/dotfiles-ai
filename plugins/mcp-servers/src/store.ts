// JSON token store for MCP OAuth state. One file, keyed by server name.
// The file holds secrets, so it is written with mode 0600. Every method
// tolerates a missing or malformed file by starting empty. It never throws.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Structural types mirroring the SDK token shapes. The store never inspects
// them beyond passing them through.
export interface StoredEntry {
  clientInformation?: unknown;
  tokens?: unknown;
  codeVerifier?: string;
  // The OAuth state value of the login this host started. The callback must
  // present the same value before any code is exchanged.
  state?: string;
}

type StoreData = Record<string, StoredEntry>;

export function createStore(path: string) {
  let data: StoreData = {};

  // Load once. Any read or parse problem leaves the store empty.
  try {
    const raw = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      data = parsed as StoreData;
    }
  } catch {
    data = {};
  }

  function persist(): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  function entry(name: string): StoredEntry {
    const existing = data[name];
    if (existing !== undefined) return existing;
    const fresh: StoredEntry = {};
    data[name] = fresh;
    return fresh;
  }

  return {
    get(name: string): StoredEntry | undefined {
      return data[name];
    },

    setClientInformation(name: string, info: unknown): void {
      entry(name).clientInformation = info;
      persist();
    },

    setTokens(name: string, tokens: unknown): void {
      entry(name).tokens = tokens;
      persist();
    },

    setCodeVerifier(name: string, verifier: string): void {
      entry(name).codeVerifier = verifier;
      persist();
    },

    getCodeVerifier(name: string): string | undefined {
      return data[name]?.codeVerifier;
    },

    setState(name: string, state: string): void {
      entry(name).state = state;
      persist();
    },

    getState(name: string): string | undefined {
      return data[name]?.state;
    },
  };
}

export type TokenStore = ReturnType<typeof createStore>;
