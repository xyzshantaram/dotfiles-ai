/**
 * Hook-order pin for the composer indicator (#150).
 *
 * WHY A SOURCE TEST AND NOT A RENDER TEST: there is no jsdom/React render
 * harness in this repo, and the three existing test files here cover the
 * PURE modules (badge, attention, questions) -- the component that actually
 * renders was untested, which is exactly where the defect lived.
 *
 * WHAT IT PINS: `Indicator` returns null early when the badge is hidden.
 * Every React hook must therefore be declared ABOVE that gate, or the render
 * that first sees a pending item runs more hooks than the one before it and
 * React throws #310. The slot error boundary then LATCHES, replacing the
 * entry with a dead <div data-slot-error> for the life of the mount -- so the
 * badge silently never appears again for any pending item of any kind. That
 * shipped, and cost a live-repro session to find (owner, 2026-09-17).
 *
 * The file's own comment already stated this rule ("hooks cannot sit below
 * the badge-hidden early return") and a `React.useRef` went in below it
 * anyway, 46 lines later. A comment could not enforce it; this can.
 *
 * DELIBERATELY NARROW: it polices hook PLACEMENT only. It says nothing about
 * which hooks exist, what they do, or how the badge looks.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "client.tsx"), "utf8");
const LINES = SOURCE.split("\n");

/** The early return that makes hook placement load-bearing. */
const GATE = LINES.findIndex((line) =>
  line.includes("if (!badgeVisible(tone, confirming)) return null;"),
);

describe("Indicator hook order (#150)", () => {
  it("has the badge-visibility gate this pin is about", () => {
    // If this fails the gate was renamed or removed; the assertions below
    // would then silently pass over nothing, so fail loudly here instead.
    expect(GATE).toBeGreaterThan(-1);
  });

  it("declares no hook call of ANY kind below the early return", () => {
    // Scan to the top-level close of makeIndicator (a `}` in column 0),
    // so unrelated code further down the file is not policed.
    let end = LINES.length;
    for (let i = GATE + 1; i < LINES.length; i++) {
      if (LINES[i] === "}") {
        end = i;
        break;
      }
    }
    const offenders: string[] = [];
    for (let i = GATE + 1; i < end; i++) {
      const code = LINES[i].trim();
      // A comment NAMING a hook is not a hook call. This file leans hard on
      // its comments; a pin that tripped on prose would punish them.
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) continue;
      // Any `useX(` call, not just `React.useX`. A CUSTOM hook below the gate
      // (useBuiltInSurfaces, props.useSession) breaks hook order just as
      // fatally, and the original pattern could not see it -- named by the
      // reviewer of 5e64d9a as the one real hole left in this pin.
      if (/\buse[A-Z][A-Za-z0-9_$]*\s*\(/.test(LINES[i])) offenders.push(`${i + 1}: ${code}`);
    }
    // A hook here is React error #310 waiting to happen.
    expect(offenders).toEqual([]);
  });

  it("declares liveHandlers above the gate, not below it", () => {
    // The specific regression: this ref was the hook that sat below the
    // return. Pinning its position makes a revert fail rather than just
    // making the generic scan above go red.
    const decl = LINES.findIndex((line) => line.includes("var liveHandlers = React.useRef("));
    expect(decl).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(GATE);
  });
});
