/**
 * Tests for the user bubble's text model (#125).
 *
 * The two transforms are tested apart because they fail differently: one
 * decorates the wrong thing, the other corrupts pasted code. The code-fence
 * cases below are the ones that matter most — a hard-break transform that
 * runs inside a fence is worse than the paragraph folding it fixes, and the
 * damage would be invisible in a rendered diff.
 */
import { describe, expect, it } from "vitest";
import {
  CHAT_NODE_KEYS,
  CHIP_LINK_PREFIX,
  chipDisplayText,
  encodeRefChip,
  encodeRefsForMarkdown,
  hardBreakOutsideFences,
  joinSegments,
  splitReferences,
  type UserSegment,
} from "./text";

/** Just the chips, for readable assertions. */
function refs(segments: readonly UserSegment[]) {
  return segments.filter((s): s is Extract<UserSegment, { kind: "ref" }> => s.kind === "ref");
}

/** The served name list in tests: one real command, nothing else. */
const NAMES = new Set(["compact"]);

describe("splitReferences: paths are text, not skills", () => {
  it("leaves an absolute path entirely alone", () => {
    // THE REPORTED BUG. The shipped pattern chipped `/home` out of this and
    // labelled it a skill, because [\w-] stops at the second slash.
    const segments = splitReferences("see /home/sid/.dsh for the config", new Set(), NAMES);
    expect(refs(segments)).toEqual([]);
    expect(joinSegments(segments)).toBe("see /home/sid/.dsh for the config");
  });

  it("leaves other path-ish tokens alone", () => {
    for (const text of ["/etc/passwd", "/usr/bin/env", "/a.b", "/tmp/x-y/z", "/var/", "./rel/path"]) {
      expect(refs(splitReferences("path " + text, new Set(), NAMES))).toEqual([]);
    }
  });

  it("a bare /tmp, /etc, /usr, /var and /run are PLAIN TEXT even beside a real command", () => {
    // THE OWNER'S REPORT (#148): shape alone cannot tell /tmp from
    // /compact, so the classifier is membership in the served name list.
    // The list holds a real command and still none of these chip.
    for (const token of ["/tmp", "/etc", "/usr", "/var", "/run"]) {
      const segments = splitReferences(`type ${token} here`, new Set(), NAMES);
      expect(refs(segments)).toEqual([]);
      expect(joinSegments(segments)).toBe(`type ${token} here`);
    }
  });

  it("still chips a bare slash reference, which the owner chose to keep", () => {
    // ARGUMENT FOR THE EDIT (#148): this test used to call splitReferences
    // with no name list, pinning the shape heuristic. The heuristic is
    // deleted per #125's own instruction, so the test now supplies the
    // served names — the fix is name validation, not chip removal.
    const found = refs(splitReferences("run /compact now", new Set(), NAMES));
    expect(found.length).toBe(1);
    expect(found[0].label).toBe("/compact");
    expect(found[0].refKind).toBe("skill");
  });

  it("an unlisted slash token is plain when the names are unknown", () => {
    // The client renders before the served names load; unknown must be
    // plain (the safe direction), never an optimistic chip.
    expect(refs(splitReferences("run /compact now"))).toEqual([]);
    expect(refs(splitReferences("run /compact now", new Set(), new Set()))).toEqual([]);
  });

  it("still chips @-references, which carry real evidence", () => {
    expect(refs(splitReferences("open @src/main.ts"))[0].refKind).toBe("file");
    expect(refs(splitReferences('open @"my file.ts"'))[0].label).toBe('@"my file.ts"');
  });

  it("trusts only runtime-validated labels as sessions, never a guess", () => {
    const validated = new Set(["@alpha"]);
    expect(refs(splitReferences("see @alpha", validated))[0].refKind).toBe("session");
    // Not in the validated set: it is an @-reference, not a session.
    expect(refs(splitReferences("see @beta", validated))[0].refKind).toBe("file");
  });

  it("a bare /notaskill is now PLAIN TEXT: the limitation is retired", () => {
    // ARGUMENT FOR THE EDIT (#148): this test used to assert that
    // /notaskill chips, pinning #125's accepted limitation VISIBLE. The
    // owner has now rejected the limitation, the shape lookahead is
    // deleted, and validation against the served name list replaces it —
    // so the same token must now stay plain. Keeping the old assertion
    // would pin the defect this ticket fixes.
    expect(refs(splitReferences("try /notaskill", new Set(), NAMES))).toEqual([]);
    expect(joinSegments(splitReferences("try /notaskill", new Set(), NAMES))).toBe("try /notaskill");
  });

  it("round-trips: no separator is ever eaten", () => {
    // A tokenizer that swallowed the anchoring whitespace would reintroduce
    // the collapse this ticket also fixes.
    for (const text of [
      "a /skill b",
      "\n/skill\n",
      "  @file  ",
      "line one\nline two /x",
      "/home/x and @y and /z",
    ]) {
      expect(joinSegments(splitReferences(text))).toBe(text);
    }
  });

  it("handles degenerate input without throwing", () => {
    expect(splitReferences("")).toEqual([]);
    expect(splitReferences(undefined)).toEqual([]);
    expect(splitReferences(null)).toEqual([]);
    expect(splitReferences(42)).toEqual([]);
  });
});

describe("hardBreakOutsideFences: typed breaks survive, code does not change", () => {
  it("makes a single newline a hard break", () => {
    expect(hardBreakOutsideFences("one\ntwo")).toBe("one  \ntwo");
  });

  it("leaves the last line and blank-separated paragraphs alone", () => {
    // A break before a blank line is stray whitespace, not a break.
    expect(hardBreakOutsideFences("one\n\ntwo")).toBe("one\n\ntwo");
    expect(hardBreakOutsideFences("only")).toBe("only");
  });

  it("DOES NOT TOUCH ANYTHING INSIDE A FENCED BLOCK", () => {
    // The load-bearing case: appending two spaces to pasted code corrupts it
    // and the damage is invisible once rendered.
    const code = ["intro", "```js", "const a = 1", "const b = 2", "```", "outro"].join("\n");
    const out = hardBreakOutsideFences(code);
    expect(out).toContain("const a = 1\nconst b = 2");
    expect(out).not.toContain("const a = 1  ");
    // The fence delimiters themselves must not gain trailing spaces either:
    // that would change what the fence is.
    expect(out).not.toContain("```js  ");
    // Text outside the fence still breaks.
    expect(out.startsWith("intro  \n")).toBe(true);
  });

  it("handles tilde fences and longer markers", () => {
    const out = hardBreakOutsideFences(["~~~", "a", "b", "~~~"].join("\n"));
    expect(out).toBe(["~~~", "a", "b", "~~~"].join("\n"));
    const long = hardBreakOutsideFences(["````", "a", "b", "````"].join("\n"));
    expect(long).toBe(["````", "a", "b", "````"].join("\n"));
  });

  it("does not let a shorter inner marker close a longer fence", () => {
    // ``` inside a ```` block is content, not a terminator. Getting this
    // wrong would resume breaking in the middle of pasted code.
    const out = hardBreakOutsideFences(["````", "```", "still code", "````", "after"].join("\n"));
    expect(out).toContain("```\nstill code");
    expect(out).not.toContain("still code  ");
  });

  it("resumes breaking after a fence closes", () => {
    const out = hardBreakOutsideFences(["```", "code", "```", "one", "two"].join("\n"));
    expect(out).toContain("one  \ntwo");
  });

  it("leaves an unterminated fence as code to the end", () => {
    // Better to decline a break than to corrupt what the user is mid-pasting.
    const out = hardBreakOutsideFences(["```", "a", "b"].join("\n"));
    expect(out).toBe(["```", "a", "b"].join("\n"));
  });

  it("skips indented code, the approximate case", () => {
    const out = hardBreakOutsideFences(["    const a = 1", "    const b = 2", "tail"].join("\n"));
    expect(out).not.toContain("const a = 1  ");
  });

  it("does not double an existing hard break", () => {
    expect(hardBreakOutsideFences("one  \ntwo")).toBe("one  \ntwo");
    expect(hardBreakOutsideFences("one\\\ntwo")).toBe("one\\\ntwo");
  });

  it("handles degenerate input without throwing", () => {
    expect(hardBreakOutsideFences("")).toBe("");
    expect(hardBreakOutsideFences(undefined)).toBe("");
    expect(hardBreakOutsideFences(null)).toBe("");
  });

  it("DISCRIMINATES: differs from a blanket newline replace exactly inside fences", () => {
    // The fence-aware transform must not be replaceable by a blanket
    // `text.replace(/\n/g, "  \n")`. Both agree in paragraphs; only the
    // blanket version corrupts fenced code. If this fails because the
    // transform was simplified into a blanket replace, pasted code breaks.
    const text = ["intro", "```js", "const a = 1", "const b = 2", "```", "outro"].join("\n");
    const blanket = text.replace(/\n/gu, "  \n");
    const out = hardBreakOutsideFences(text);
    expect(out).not.toBe(blanket);
    expect(blanket).toContain("const a = 1  \n");
    expect(out).toContain("const a = 1\n");
    // And the paragraph behaviour the blanket version delivers is kept.
    expect(out).toContain("intro  \n```js");
    // The final line still never gains a stray break.
    expect(out.endsWith("outro")).toBe(true);
  });
});

describe("encodeRefsForMarkdown: one text flow with chips inline (#148)", () => {
  /** Tokenize with the served names, then encode — the client's pipeline. */
  function encode(body: string, sessionLabels: ReadonlySet<string> = new Set()) {
    return encodeRefsForMarkdown(body, splitReferences(body, sessionLabels, NAMES));
  }

  it("encodes a validated command as a chip link inside the running text", () => {
    const out = encode("for example if i type /compact that gets rendered");
    expect(out).toContain(`[/compact](<${CHIP_LINK_PREFIX}skill/compact> "/compact")`);
    // One flow: no renderer split, the chip sits inside the sentence.
    expect(out.startsWith("for example if i type ")).toBe(true);
    expect(out.endsWith(" that gets rendered")).toBe(true);
  });

  it("leaves /tmp literal while /compact in the same message chips", () => {
    const out = encode("type /tmp then run /compact now");
    expect(out).toContain("type /tmp then run ");
    expect(out).toContain(`[/compact](<${CHIP_LINK_PREFIX}skill/compact> "/compact")`);
    expect(out).not.toContain(CHIP_LINK_PREFIX + "/tmp");
  });

  it("encodes @-references with the basename shown and the full label kept", () => {
    const out = encode("open @src/main.ts now", new Set());
    expect(out).toContain(`[main.ts](<${CHIP_LINK_PREFIX}file/src%2Fmain.ts> "@src/main.ts")`);
    const quoted = encode('open @"my file.ts" now', new Set());
    expect(quoted).toContain("my file.ts");
    expect(quoted).not.toContain('@"my file.ts" now');
  });

  it("DOES NOT TOUCH ANYTHING INSIDE A FENCED BLOCK", () => {
    // Encoding inside a fence would write link syntax into code the user
    // pasted — the same corruption class the hard-break transform avoids.
    const code = ["run this", "```sh", "run /compact", "type /tmp", "```", "done /compact"].join("\n");
    const out = encode(code);
    expect(out).toContain("run /compact\ntype /tmp");
    expect(out).toContain(`done [/compact](<${CHIP_LINK_PREFIX}skill/compact> "/compact")`);
    // The fence delimiters and code lines are byte-identical (this helper
    // skips the hard-break pass; the client applies it before tokenizing).
    expect(out.startsWith("run this\n```sh\n")).toBe(true);
  });

  it("leaves references inside inline code spans literal", () => {
    const out = encode("use `/compact` here, but run /compact there");
    expect(out).toContain("use `/compact` here");
    expect(out).toContain(`run [/compact](<${CHIP_LINK_PREFIX}skill/compact> "/compact") there`);
  });

  it("leaves references on indented-code lines literal", () => {
    const out = encode("example:\n    run /compact\nreally run /compact");
    expect(out).toContain("    run /compact\n");
    expect(out).toContain(`really run [/compact](<${CHIP_LINK_PREFIX}skill/compact> "/compact")`);
  });

  it("escapes label characters that would break the link syntax", () => {
    const tricky = { kind: "ref", raw: '@"a[b]c"', label: '@"a[b]c"', refKind: "file" } as const;
    const out = encodeRefChip(tricky);
    // Link text: brackets escaped so the chip does not close early.
    expect(out).toContain("[a\\[b\\]c]");
    // Title: the full label with its quotes escaped.
    expect(out).toContain('"@\\"a[b]c\\""');
  });

  it("chipDisplayText keeps the shipped label contract", () => {
    expect(chipDisplayText({ kind: "ref", raw: "/compact", label: "/compact", refKind: "skill" })).toBe(
      "/compact",
    );
    expect(chipDisplayText({ kind: "ref", raw: "@alpha", label: "@alpha", refKind: "session" })).toBe(
      "alpha",
    );
    expect(
      chipDisplayText({ kind: "ref", raw: "@src/main.ts", label: "@src/main.ts", refKind: "file" }),
    ).toBe("main.ts");
  });

  it("handles degenerate input without throwing", () => {
    expect(encodeRefsForMarkdown("", [])).toBe("");
    expect(encode("")).toBe("");
  });
});

describe("CHAT_NODE_KEYS: both shipped keys are taken over", () => {
  // `user` and `steering` map to the same shipped component, so taking only
  // one leaves half the transcript rendering through the broken projector.
  it("covers user and steering, without duplicates", () => {
    expect(CHAT_NODE_KEYS).toContain("user");
    expect(CHAT_NODE_KEYS).toContain("steering");
    expect(new Set(CHAT_NODE_KEYS).size).toBe(CHAT_NODE_KEYS.length);
  });
});
