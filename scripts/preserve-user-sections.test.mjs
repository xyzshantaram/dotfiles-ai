/**
 * step_set_defaults must preserve runtime-written plugin settings (#159).
 *
 * The step regenerates $DSH_HOME/settings.yaml by copying the repo template
 * over it. Before #159 it preserved exactly two pieces of runtime state
 * (profile.active via sed, profile.chains via preserve-chains.mjs) and
 * silently destroyed every other namespace a plugin persists there — e.g.
 * the `subscriptions` section the subscriptions panel writes through
 * PUT /subscriptions/config, so provider visibility reset on every sync.
 *
 * Like the other step tests in plugins/sync.test.ts, the REAL step body is
 * EXTRACTED from sync.sh rather than retyped, so this cannot drift into
 * passing against a copy of the logic that no longer matches the script.
 * HERE is a temp dir holding a synthetic template plus a SYMLINKED scripts/
 * dir, so the step executes the real helper scripts through the link — no
 * seam exists only for tests. The script as a whole is never executed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const syncSh = join(repoRoot, "sync.sh");

/** Synthetic template: shaped like the real one, small enough to assert on. */
const TEMPLATE = `ui-onboarding:
  welcomeNoticeVersion: 2026-08-13.1
log-viewer:
  command: "journalctl --user -u dsh-web.service -n 2000"
  timeout: 30
llm-pi-ai:
  providers:
    zai:
      models:
        - id: glm-5
          reasoningEfforts:
            off:
            low: low
profile:
  active: personal
  chains:
    frontier:
      - zai/glm-5.3
    flash:
      - zai/glm-5.3-flash
modelSync:
  lastRun: 2026-09-09T08:34:11.496Z
`;

/**
 * A lived-in settings file: the template plus user/runtime state —
 * a flipped profile, custom chains, a template-owned override, the
 * subscriptions visibility map the panel wrote, a never-before-seen
 * future namespace, and its own modelSync stamp.
 */
const PREVIOUS = `ui-onboarding:
  welcomeNoticeVersion: 2026-08-13.1
log-viewer:
  command: "my-custom-log-command --tail"
  timeout: 30
llm-pi-ai:
  providers:
    zai:
      models:
        - id: glm-5
          reasoningEfforts:
            off:
            low: low
profile:
  active: work
  chains:
    frontier:
      - electronhub/glm-5.3:dev
    flash:
      - zai/glm-5.3-flash
subscriptions:
  providers:
    opencode-go: true
    zen: false
  modes:
    off:
    low: low
frobnicate:
  enabled: true
modelSync:
  lastRun: 2026-09-10T00:00:00.000Z
`;

function extractStep(name) {
  const text = readFileSync(syncSh, "utf8");
  const start = text.indexOf(`${name}() {`);
  expect(start, `${name}() not found in sync.sh`).toBeGreaterThan(-1);
  const end = text.indexOf("\n}\n", start);
  expect(end, `end of ${name}() not found`).toBeGreaterThan(start);
  return text.slice(start, end + 3);
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "user-sections-"));
  const here = join(root, "repo");
  const dshHome = join(root, "dsh");
  mkdirSync(join(here, "home"), { recursive: true });
  mkdirSync(dshHome, { recursive: true });
  writeFileSync(join(here, "home", "settings.yaml"), TEMPLATE);
  // Symlink, never copy: the step must run the REAL helper scripts.
  symlinkSync(join(repoRoot, "scripts"), join(here, "scripts"), "dir");
  writeFileSync(join(dshHome, "settings.yaml"), PREVIOUS);
  return { here, dshHome };
}

function runStep(here, dshHome) {
  const body = extractStep("step_set_defaults");
  const script = `set -euo pipefail\nHERE=${JSON.stringify(here)}\nDSH_HOME=${JSON.stringify(dshHome)}\n${body}\nstep_set_defaults\n`;
  return execFileSync("bash", ["-c", script], {
    stdio: "pipe",
    env: { ...process.env, HERE: here, DSH_HOME: dshHome },
  }).toString();
}

function regenerated() {
  const { here, dshHome } = setup();
  runStep(here, dshHome);
  return readFileSync(join(dshHome, "settings.yaml"), "utf8");
}

describe("step_set_defaults preserves runtime-written plugin settings (#159)", () => {
  it("keeps the subscriptions visibility map the panel wrote", () => {
    const out = regenerated();
    expect(out).toContain("subscriptions:");
    expect(out).toMatch(/opencode-go: true/);
    expect(out).toMatch(/zen: false/);
  });

  it("keeps a never-before-seen future namespace without a special case", () => {
    const out = regenerated();
    expect(out).toContain("frobnicate:");
    expect(out).toMatch(/enabled: true/);
  });

  it("preserves a bare `off:` key inside a carried-over section byte-identically", () => {
    const out = regenerated();
    expect(out).toMatch(/^    off:$/m);
    expect(out).toMatch(/^            off:$/m);
  });

  it("keeps preserving profile.active and profile.chains", () => {
    const out = regenerated();
    expect(out).toMatch(/^  active: work$/m);
    expect(out).toMatch(/electronhub\/glm-5\.3:dev/);
  });

  it("leaves the template authoritative for sections it owns", () => {
    const out = regenerated();
    // The hand override of a template-owned key is overwritten...
    expect(out).not.toContain("my-custom-log-command");
    expect(out).toContain('command: "journalctl --user -u dsh-web.service -n 2000"');
    // ...and a template-only key the user deleted comes back.
    expect(out).toMatch(/timeout: 30/);
  });

  it("does not resurrect the stripped modelSync stamp", () => {
    const out = regenerated();
    expect(out).not.toContain("modelSync:");
  });

  it("is stable across a second sync (no duplication, no drift)", () => {
    const { here, dshHome } = setup();
    runStep(here, dshHome);
    const first = readFileSync(join(dshHome, "settings.yaml"), "utf8");
    runStep(here, dshHome);
    const second = readFileSync(join(dshHome, "settings.yaml"), "utf8");
    expect(second).toBe(first);
    expect(second.match(/^subscriptions:$/gm)?.length).toBe(1);
    expect(second.match(/^frobnicate:$/gm)?.length).toBe(1);
  });
});
