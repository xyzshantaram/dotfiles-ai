/**
 * Pin for the ElectronHub DevPass models block in home/settings.yaml (#68).
 *
 * Commit 6a50a61 (#99's reseed) dropped a `sync-models:begin` marker inside
 * this block and overwrote the hand-seeded DevPass caps with cross-vendor
 * models.dev guesses — glm-5.3:dev read 1048576 context where the live
 * catalog says 262000. The block's own comment keeps markers out on
 * purpose, so this test reads the committed file and asserts the restored
 * values plus the marker's absence: a future reseed that stomps the block
 * turns the suite red instead of silently moving the owner's context
 * numbers again.
 *
 * The parse is a deliberate line scan, not a YAML dependency: the block is
 * flat (`- id:` entries with scalar `contextWindow:`/`maxTokens:` lines)
 * and the repo carries no YAML parser for vitest to borrow.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

/** The indented provider block, from `    electronhub:` to the next sibling. */
function electronHubBlock() {
  const text = readFileSync(join(here, "settings.yaml"), "utf8");
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^    electronhub:\s*$/.test(line));
  if (start === -1) throw new Error("electronhub provider block not found");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^    [A-Za-z]/.test(lines[i]) && !/^      /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

/** id -> { contextWindow, maxTokens } for every `- id:` entry in the block. */
function blockEntries(block) {
  const entries = {};
  let current = null;
  for (const line of block) {
    const id = /^      - id: (\S+)\s*$/.exec(line);
    if (id !== null) {
      current = id[1];
      entries[current] = {};
      continue;
    }
    if (current === null) continue;
    const num = /^        (contextWindow|maxTokens): (\d+)\s*$/.exec(line);
    if (num !== null) entries[current][num[1]] = Number(num[2]);
  }
  return entries;
}

describe("electronhub DevPass models block", () => {
  it("carries no sync-models marker (hand-seeded, kept out on purpose)", () => {
    const block = electronHubBlock();
    expect(block.length).toBeGreaterThan(0);
    for (const line of block) {
      expect(line).not.toContain("sync-models:begin");
      expect(line).not.toContain("sync-models:end");
    }
  });

  it("keeps the hand-seeded DevPass caps the #99 reseed stomped", () => {
    const entries = blockEntries(electronHubBlock());
    // The two the owner caught: 1M context rendered where 262k is real.
    expect(entries["glm-5.3:dev"].contextWindow).toBe(262000);
    expect(entries["glm-5.3:dev"].maxTokens).toBe(65536);
    expect(entries["deepseek-v4-flash-0731:dev"].contextWindow).toBe(400000);
    expect(entries["deepseek-v4-flash-0731:dev"].maxTokens).toBe(65536);
    // The rest of the restored block, so a partial stomp still fails.
    expect(entries["glm-5.3-flash:dev"].contextWindow).toBe(1000000);
    expect(entries["glm-5.3-flash:dev"].maxTokens).toBe(131072);
    expect(entries["deepseek-v4-flash:dev"].contextWindow).toBe(1000000);
    expect(entries["deepseek-v4-flash:dev"].maxTokens).toBe(131072);
    expect(entries["mimo-v2.5:dev"].contextWindow).toBe(1000000);
    expect(entries["minimax-m2.7:dev"].contextWindow).toBe(180000);
    expect(entries["minimax-m2.7:dev"].maxTokens).toBe(65536);
  });

  it("still lists qwen3.8-27b:dev (no hand-seeded value, kept from the reseed)", () => {
    const entries = blockEntries(electronHubBlock());
    expect(entries["qwen3.8-27b:dev"].contextWindow).toBe(262144);
  });
});
