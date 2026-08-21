// Regenerates skills/customize-setup/SKILL.md from its template, filling in
// the live installed dsh version. Run with:  pnpm gen:customize-setup
//
// The template is a plain markdown file with a single {{dshVersion}} token. The
// generator reads the installed dsh version from `dsh --version`, substitutes
// the token, and writes SKILL.md. Keeping the version in one place (the live
// install) means the skill never drifts from what is actually running.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const skillDir = join(here, "skills", "customize-setup");
const templatePath = join(skillDir, "template.md");
const outPath = join(skillDir, "SKILL.md");

// Resolve the installed dsh version. `dsh --version` prints the version alone
// on stdout (e.g. "0.1.0-rc.7").
let version = "";
try {
  version = execFileSync("dsh", ["--version"], { encoding: "utf8" }).trim();
} catch (err) {
  const detail = err instanceof Error ? `: ${err.message}` : "";
  console.error(`customize-setup: could not read the installed dsh version${detail}`);
  process.exit(1);
}
if (!version) {
  console.error("customize-setup: `dsh --version` returned an empty string");
  process.exit(1);
}

const template = readFileSync(templatePath, "utf8");
if (!template.includes("{{dshVersion}}")) {
  console.error("customize-setup: template has no {{dshVersion}} token to fill");
  process.exit(1);
}

const rendered = template.replaceAll("{{dshVersion}}", version);
writeFileSync(outPath, rendered);
console.log(`customize-setup: wrote ${outPath} (dsh ${version})`);
