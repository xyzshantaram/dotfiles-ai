/**
 * Composer ring composition, pinned across BOTH plugins (#132).
 *
 * WHY THIS TEST EXISTS AT ALL, and why it reads two files.
 *
 * The bug it guards was invisible to every test that checked one signal at a
 * time. composer-approvals declared `box-shadow` outright; approval-comment
 * composed the same property from slots. Each half was individually correct
 * and individually testable, and the defect lived only in their INTERACTION:
 * because box-shadow is a single property, the question rule replaced the
 * approval list wholesale and a pending approval's ring became invisible.
 *
 * The #132 reviewer made exactly this point about the first attempt to close
 * the criterion — the evidence checked each half separately, "not by
 * anything proving the stack", which is the same failure mode that produced
 * the bug. So this file asserts the two halves AGREE, not that each is
 * individually plausible.
 *
 * It reads CSS as source text rather than rendering it. There is no DOM or
 * browser in this suite, and a rendered assertion would need one; the repo
 * already uses source-reading tests where the artefact is not executable
 * (plugin-modal.test.ts, sync.test.ts, and #133's archive guard). The limit
 * is honest and worth stating: this pins the CONTRACT between the two files,
 * not the pixels. Only a live observation can prove the rings look right.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Strip comments: these assertions are about declarations, not prose. */
function code(path: string): string {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

const QUESTIONS = code(join(HERE, "client.module.css"));
const APPROVALS = code(join(HERE, "../../approval-comment/src/client.module.css"));

/** Every `--name: value;` declaration for one custom property. */
function declarationsOf(css: string, prop: string): string[] {
  const found: string[] = [];
  const re = new RegExp("--" + prop + "\\s*:\\s*([^;]+);", "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) found.push(m[1].replace(/\s+/g, " ").trim());
  return found;
}

describe("the question rule fills a slot instead of replacing the property", () => {
  it("declares no box-shadow of its own", () => {
    // THE REGRESSION. A `box-shadow:` here overrides approval-comment's
    // composed list and makes pending approval rings invisible — including
    // for ~4.1s after a question is ANSWERED, since the marker persists
    // through #106's hold-and-fade. Reintroducing it must fail loudly.
    const rule = QUESTIONS.slice(QUESTIONS.indexOf("[data-composer-card][data-dsh-qrings]"));
    const body = rule.slice(rule.indexOf("{"), rule.indexOf("}"));
    expect(body).not.toMatch(/box-shadow\s*:/);
  });

  it("fills the question slot with its two bands", () => {
    const fills = declarationsOf(QUESTIONS, "composer-ring-question");
    expect(fills.length).toBe(1);
    expect(fills[0]).toContain("--dsh-q-bright");
    expect(fills[0]).toContain("--dsh-q-dull");
  });

  it("no longer carries the wrong host elevation token", () => {
    // The old replacement used --dsh-shadow-lv2; the host token is
    // --dsw-shadow-lv2, so while qrings were active the card also lost its
    // own elevation. Comments are stripped, so a mention cannot mask this.
    expect(QUESTIONS).not.toMatch(/--dsh-shadow-lv2/);
  });
});

describe("the two plugins agree on the contract between them", () => {
  it("approval-comment consumes exactly the slot composer-approvals fills", () => {
    // The coupling the reviewer flagged: filled here, consumed there. If
    // either side renames the property, this fails instead of silently
    // painting nothing.
    expect(APPROVALS).toMatch(/box-shadow:[^;]*var\(--composer-ring-question\)/);
    expect(declarationsOf(QUESTIONS, "composer-ring-question").length).toBe(1);
  });

  it("keeps the host elevation as the outermost composed layer", () => {
    const shadow = /box-shadow:([^;]+);/.exec(APPROVALS);
    expect(shadow).not.toBeNull();
    const layers = (shadow as RegExpExecArray)[1].split(",").map((s) => s.trim());
    expect(layers[layers.length - 1]).toContain("--dsw-shadow-lv2");
  });

  it("publishes an outer offset for every approval ring state", () => {
    // The offset is what makes question bands stack OUTSIDE approval rings.
    // Shadow spreads are cumulative from the border box, so a state that
    // sets a ring spread but forgets its matching --composer-ring-outer
    // reproduces the masking bug in the other direction.
    const outers = declarationsOf(APPROVALS, "composer-ring-outer");
    // base 0px, escalated 3px, rewrite 6px, rewrite-only collapse 3px.
    expect(outers).toEqual(["0px", "3px", "6px", "3px"]);
  });

  it("keeps every outer offset equal to its own rule's ring spread", () => {
    // THE DRIFT PIN. A spread changed without its offset is exactly the
    // silent divergence the reviewer named, and it cannot be caught by
    // reading either declaration alone: the two must be compared.
    const rules = APPROVALS.split("}")
      .map((chunk) => chunk + "}")
      .filter((chunk) => chunk.includes("--composer-ring-outer"));
    for (const rule of rules) {
      const outer = declarationsOf(rule, "composer-ring-outer")[0];
      // A LIVE ring spread declared in the SAME rule: `0 0 0 <n>px var(…)`.
      // The trailing `var(` is load-bearing. The base rule declares
      // TRANSPARENT placeholders that also carry spreads (`0 0 0 3px
      // transparent`), and matching those would demand an outer offset for a
      // ring that paints nothing — the first version of this test did
      // exactly that and failed against correct code.
      const ring = /--composer-ring-(?:escalated|rewrite)\s*:\s*0 0 0 (\d+px)\s+var\(/.exec(rule);
      if (ring === null) {
        // The base rule: placeholders only, nothing pending, so 0px.
        expect(outer).toBe("0px");
        continue;
      }
      expect(outer).toBe(ring[1]);
    }
  });

  it("offsets the question bands by that published outer value", () => {
    const fill = declarationsOf(QUESTIONS, "composer-ring-question")[0];
    expect(fill).toContain("--composer-ring-outer");
    // Falls back to 0px so an unmounted approval-comment degrades to bands
    // painted from the border box rather than to a broken declaration.
    expect(fill).toMatch(/var\(--composer-ring-outer,\s*0px\)/);
  });
});
