// Icon swap: <i data-lucide> placeholders become real lucide SVGs.
//
// primitives.ts Icon() emits placeholders and the measurer reserves their
// space structurally (measure.ts clause 4, styles.css D1). The swap runs
// AFTER measurement on the finished panel strings, so it cannot move text.
//
// BUNDLE RULE (client.tsx import block): per-glyph imports only, never a
// dynamic lookup by string, so esbuild keeps these glyphs and drops the
// other ~1500. These deep __iconData imports are the same property in a
// different shape: each file carries one glyph's path data plus the shared
// createLucideIcon helper, and nothing else enters the bundle. A top-level
// `import { Check } from "lucide-react"` cannot serve here: panels are HTML
// strings (dangerouslySetInnerHTML) and React components cannot render into
// them without ReactDOM, which the bundle externalises. The __iconData node
// arrays are the same glyph the component would draw (same d strings, same
// 24-grid, same stroke), only serialised by hand.
//
// pipe-glyph IS NOT LUCIDE. Icon() returns the inline owner <symbol> plus
// <use> for it before any placeholder exists, so no data-lucide="pipe-glyph"
// ever reaches this pass. There is deliberately no pipe-glyph entry below:
// adding one would break the only icon that renders today.
//
// chevron-right IS imported although the ticket brief lists 23 names, not
// 24. model.ts falls back to "chevron-right" for any op or redir node whose
// operator misses OP_ICON (buildSpecs, two sites). Leaving it out would
// leave exactly that fallback blank. Unknown names stay placeholders: the
// pass never invents a glyph, it only fills known ones.

import { __iconData as arrowDownWideNarrowData } from "lucide-react/dist/esm/icons/arrow-down-wide-narrow.mjs";
import { __iconData as checkData } from "lucide-react/dist/esm/icons/check.mjs";
import { __iconData as chevronRightData } from "lucide-react/dist/esm/icons/chevron-right.mjs";
import { __iconData as chevronsDownData } from "lucide-react/dist/esm/icons/chevrons-down.mjs";
import { __iconData as chevronsUpData } from "lucide-react/dist/esm/icons/chevrons-up.mjs";
import { __iconData as circlePlusData } from "lucide-react/dist/esm/icons/circle-plus.mjs";
import { __iconData as fileCodeData } from "lucide-react/dist/esm/icons/file-code.mjs";
import { __iconData as fileOutputData } from "lucide-react/dist/esm/icons/file-output.mjs";
import { __iconData as fileTextData } from "lucide-react/dist/esm/icons/file-text.mjs";
import { __iconData as folderData } from "lucide-react/dist/esm/icons/folder.mjs";
import { __iconData as gitBranchData } from "lucide-react/dist/esm/icons/git-branch.mjs";
import { __iconData as hashData } from "lucide-react/dist/esm/icons/hash.mjs";
import { __iconData as hexagonData } from "lucide-react/dist/esm/icons/hexagon.mjs";
import { __iconData as listChecksData } from "lucide-react/dist/esm/icons/list-checks.mjs";
import { __iconData as listData } from "lucide-react/dist/esm/icons/list.mjs";
import { __iconData as megaphoneData } from "lucide-react/dist/esm/icons/megaphone.mjs";
import { __iconData as mergeData } from "lucide-react/dist/esm/icons/merge.mjs";
import { __iconData as packageData } from "lucide-react/dist/esm/icons/package.mjs";
import { __iconData as scissorsData } from "lucide-react/dist/esm/icons/scissors.mjs";
import { __iconData as scrollTextData } from "lucide-react/dist/esm/icons/scroll-text.mjs";
import { __iconData as searchData } from "lucide-react/dist/esm/icons/search.mjs";
import { __iconData as shellData } from "lucide-react/dist/esm/icons/shell.mjs";
import { __iconData as timerData } from "lucide-react/dist/esm/icons/timer.mjs";
import { __iconData as uploadData } from "lucide-react/dist/esm/icons/upload.mjs";

type IconNode = [tag: string, attrs: Record<string, string | number>][];
interface IconData {
  name: string;
  size: number;
  node: IconNode;
}

/** Kebab lucide name to its path data. No pipe-glyph entry by design. */
const ICONS: Record<string, IconData> = {
  "arrow-down-wide-narrow": arrowDownWideNarrowData as IconData,
  check: checkData as IconData,
  "chevron-right": chevronRightData as IconData,
  "chevrons-down": chevronsDownData as IconData,
  "chevrons-up": chevronsUpData as IconData,
  "circle-plus": circlePlusData as IconData,
  "file-code": fileCodeData as IconData,
  "file-output": fileOutputData as IconData,
  "file-text": fileTextData as IconData,
  folder: folderData as IconData,
  "git-branch": gitBranchData as IconData,
  hash: hashData as IconData,
  hexagon: hexagonData as IconData,
  list: listData as IconData,
  "list-checks": listChecksData as IconData,
  megaphone: megaphoneData as IconData,
  merge: mergeData as IconData,
  package: packageData as IconData,
  scissors: scissorsData as IconData,
  "scroll-text": scrollTextData as IconData,
  search: searchData as IconData,
  shell: shellData as IconData,
  timer: timerData as IconData,
  upload: uploadData as IconData,
};

/** Every kebab name this pass can fill. */
export function knownIconNames(): string[] {
  return Object.keys(ICONS);
}

/** True when the pass would fill this placeholder. */
export function isKnownIcon(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderNode(tag: string, attrs: Record<string, string | number>): string {
  let out = "<" + tag;
  for (const k of Object.keys(attrs)) {
    if (k === "key") continue;
    out += " " + k + '="' + escAttr(String(attrs[k])) + '"';
  }
  return out + "/>";
}

/**
 * One placeholder becomes one svg. data-lucide STAYS on the svg so every
 * downstream hasIcon check (specMinW, geometry.stub) keeps seeing the icon;
 * data-fb is carried over VERBATIM (it arrives entity-escaped from Icon()
 * and is re-emitted untouched, never unescaped and re-escaped). Sizing stays
 * with the stylesheet: the svg carries width/height 24 fallbacks and the
 * existing .prim-icon rules draw 14px (16px op discs, 18px pipe tags), the
 * exact boxes the measurer reserved. aria-hidden: the node title tooltip
 * already carries the meaning, the glyph is decorative.
 */
export function iconSVG(name: string, fbRaw: string): string {
  const data = ICONS[name];
  if (!data) return "";
  const inner = data.node.map(([tag, attrs]) => renderNode(tag, attrs)).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `class="lucide lucide-${escAttr(name)}" aria-hidden="true" data-lucide="${escAttr(name)}" data-fb="${fbRaw}">${inner}</svg>`
  );
}

const PLACEHOLDER_RE = /<i data-lucide="([^"]+)" data-fb="([^"]*)"><\/i>/g;

/**
 * Fill every KNOWN placeholder in an HTML string. Unknown names (a future
 * module addition, a typo) stay placeholders: blank as today, never a wrong
 * glyph. The pipe <use> markup contains no data-lucide and passes through
 * untouched.
 */
export function swapIcons(html: string): string {
  return String(html).replace(PLACEHOLDER_RE, (m, name: string, fb: string) => {
    if (!isKnownIcon(name)) return m;
    return iconSVG(name, fb);
  });
}
