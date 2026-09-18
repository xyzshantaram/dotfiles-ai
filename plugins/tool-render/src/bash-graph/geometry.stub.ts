// Shared stub geometry for bash-graph tests ONLY. Never imported by any
// module (see contract.test.ts). One model family serves every test, so all
// sides of every comparison read the same stub DOM: differences are porting
// bugs, never model questions. The model ports the prototype harness family
// (proto/verify-round13.mjs DRIVER); absolute px are estimates, and shared
// estimates cancel out of every equality assertion here.

const unesc = (s: string): string =>
  String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
const dlen = (s: string): number => unesc(String(s).replace(/<[^>]*>/g, "")).length;

export interface StubStats {
  at: string;
  phase: string;
  breaks: unknown[];
  overflows: unknown[];
}

export let STATS: StubStats = { at: "", phase: "", breaks: [], overflows: [] };
export function resetStats(at: string): void {
  STATS = { at, phase: "final", breaks: [], overflows: [] };
}

function atomicize(html: string): { t: string; len: number; kind?: string; word?: string }[] {
  const atoms: { len: number; kind: string }[] = [];
  let s = String(html).replace(
    /<button class="prim-badge"[\s\S]*?>([\s\S]*?)<\/button>/g,
    (_m, inner: string) => {
      atoms.push({ len: Math.min(dlen(inner), 220 / 7.2), kind: "pill" });
      return "";
    },
  );
  s = s.replace(/<span class="hd-label">([\s\S]*?)<\/span>/g, (_m, inner: string) => {
    atoms.push({ len: dlen(inner), kind: "hd" });
    return "";
  });
  s = s.replace(/<span class="seg">(.*?)<\/span>/g, (_m, inner: string) => {
    atoms.push({ len: dlen(inner), kind: "seg" });
    return "";
  });
  s = s.replace(/<wbr>/g, "").replace(/<[^>]*>/g, "");
  s = unesc(s);
  const units: { t: string; len: number; kind?: string; word?: string }[] = [];
  let ai = 0;
  let word = "";
  const flush = (): void => {
    if (word) {
      units.push({ t: "w", len: word.length, word: word.slice(0, 44) });
      word = "";
    }
  };
  for (const ch of s) {
    if (ch === "") {
      flush();
      const a = atoms[ai++];
      units.push({ t: "a", len: a.len, kind: a.kind });
    } else if (ch === "") {
      flush();
      units.push({ t: "wbr", len: 0 });
    } else if (/\s/.test(ch)) {
      flush();
      units.push({ t: "s", len: 1 });
    } else word += ch;
  }
  flush();
  return units;
}

function coreH(html: string, w: number, iconReserve: boolean): number {
  const isOp = /prim-node op/.test(html);
  const units = atomicize(html);
  let chipR = 0;
  const cm = /<span class="op-chip"[^>]*>([\s\S]*?)<\/span>/.exec(String(html));
  if (cm) chipR = Math.min(dlen(cm[1]) * 7.2, 200) + 30;
  const usable = w - (isOp ? 6 : 18) - 20 - chipR;
  const hasIcon = /data-lucide/.test(html);
  const rate = isOp ? 6.6 : 7.2;
  const cpl = Math.max(1, Math.floor(usable / rate));
  const cpl1 = isOp ? cpl : Math.max(1, Math.floor((usable - (hasIcon && iconReserve ? 20 : 0)) / 7.2));
  let lines = 1;
  let rem = cpl1;
  const fresh = (): void => {
    lines += 1;
    rem = cpl;
  };
  for (const u of units) {
    if (u.t === "wbr") continue;
    if (u.t === "s") {
      if (rem >= 1) rem -= 1;
      else {
        fresh();
        rem = cpl - 1;
      }
      continue;
    }
    if (u.t === "a" && (u.kind === "seg" || u.kind === "pill" || u.kind === "hd")) {
      if (u.len <= rem) {
        rem -= u.len;
        continue;
      }
      fresh();
      if (u.len > cpl) {
        STATS.overflows.push({ len: u.len });
        rem = 0;
      } else rem = cpl - u.len;
      continue;
    }
    if (u.len <= rem) {
      rem -= u.len;
      continue;
    }
    fresh();
    if (u.len <= cpl) rem = cpl - u.len;
    else {
      const n = Math.ceil(u.len / cpl);
      lines += n - 1;
      rem = cpl - (u.len - (n - 1) * cpl);
      STATS.breaks.push({ len: u.len });
    }
  }
  return lines;
}

export function modelH(html: string, w: number, vm?: number): number {
  const V = vm == null ? 0 : vm;
  if (/prim-node op/.test(html)) {
    const lines = coreH(html, w, false);
    return Math.max(30, 16 + lines * 16 + 8 + 2 + V);
  }
  return Math.max(30, coreH(html, w, true) * 20 + 14 + V);
}

export function modelNat(html: string): number {
  const parts = String(html).split('<div class="hdock">');
  const tlen = dlen(parts[0]);
  let dock = 0;
  if (parts[1])
    for (const m of parts[1].matchAll(/<button class="prim-badge"[\s\S]*?>([\s\S]*?)<\/button>/g))
      dock += Math.min(dlen(m[1]) * 7.2, 220);
  const icon = /data-lucide/.test(html) ? 20 : 0;
  return Math.ceil(Math.max(tlen * 7.2, dock) + 18 + icon) + 2 + 20;
}

/**
 * Install the stub as globalThis.document. The stub emulates exactly what
 * the measurer reads: innerHTML storage, wrapper width parsing, offsetHeight
 * and boundingRect from the model, scrollWidth/offsetWidth for naturals, and
 * classList membership from the stored HTML. Returns a restore function.
 */
export function installStub(): () => void {
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  const store = { _html: "" };
  const MEAS = {
    get innerHTML(): string {
      return store._html;
    },
    set innerHTML(v: string) {
      store._html = v;
    },
    get firstChild(): unknown {
      const html = store._html;
      const mW = /^<div[^>]*style="width:([^"]*)"/.exec(html);
      const nowrap = !!mW && /max-content/.test(mW[1]);
      const outerW = mW ? parseFloat(mW[1]) || 0 : 0;
      return {
        get offsetHeight(): number {
          return modelH(html, nowrap ? 0 : outerW);
        },
        getBoundingClientRect(): { height: number } {
          return { height: modelH(html, nowrap ? 0 : outerW) };
        },
        style: {} as Record<string, string>,
        classList: { contains: (c: string): boolean => html.includes(c) },
        get firstChild(): unknown {
          return {
            style: {} as Record<string, string>,
            classList: { contains: (c: string): boolean => html.includes(c) },
            get scrollWidth(): number {
              return modelNat(html);
            },
            get offsetWidth(): number {
              return 0;
            },
          };
        },
      };
    },
  };
  g.document = {
    querySelector: (sel: string): unknown => (sel === "#measure" ? MEAS : null),
  };
  return () => {
    g.document = prev;
  };
}
