#!/usr/bin/env -S deno run --no-lock -A
// Compile this wizard into a desktop binary plus a Linux shortcut.
// Run it with: deno task compile
// It reads the desktop block of the local deno.json, so any wizard
// reuses it unchanged: copy this file next to that wizard's deno.json.

import { $ } from "wizardkit";

const dir = import.meta.dirname ?? ".";
const meta = JSON.parse(await Deno.readTextFile(dir + "/deno.json"));
const app: string = meta.desktop?.app?.name ?? "wizard";
const entry = Deno.args[0] ?? "demo.ts";

const run = $({ cwd: dir });
await run`deno desktop --output ./dist/${app} ${entry}`;

const shortcut = `[Desktop Entry]
Type=Application
Name=${app}
Exec=${dir}/dist/${app}/${app}
Terminal=false
Categories=Utility;
`;

await Deno.writeTextFile(`${dir}/dist/${app}.desktop`, shortcut);
console.log(`Built ${app} plus its shortcut in ./dist.`);
