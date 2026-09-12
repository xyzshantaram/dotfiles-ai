#!/usr/bin/env -S deno run --no-lock -A
// Install one wizardkit app: executable through deno install, window
// through the shared runtime, launcher entry through a shortcut.
// Run it with: deno run --no-lock -A jsr:@sid/wizardkit/install
//   --app my-wizard --version 0.1.0 [--scope sid] [--dest DIR] [--dry]
// Scope defaults to sid. Dry prints every step without changing disk.

import { $ } from "zx";

// Runtime release hosting the shared window binary. Override per call
// with --runtime-base. SID fills in at first release.
const RUNTIME_BASE = "https://github.com/SID/wizardkit/releases/download";
const RUNTIME_VERSION = "0.1.0";

// Read --key value pairs from argv. A flag with no value reads "true".
// Unknown bare words throw.
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (!word.startsWith("--")) throw new Error(`Bad flag ${word}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      out[word.slice(2)] = "true";
      continue;
    }
    out[word.slice(2)] = value;
    i++;
  }
  return out;
}

// Install root holding the deno shims. Mirrors deno install rules.
export function shimDir(): string {
  const root = Deno.env.get("DENO_INSTALL_ROOT") ?? `${Deno.env.get("HOME") ?? "."}/.deno`;
  return root.endsWith("/bin") ? root : `${root}/bin`;
}

// Dir holding the shared runtime binary.
export function runtimeDir(): string {
  return `${Deno.env.get("HOME") ?? "."}/.local/share/wizardkit`;
}

// Runtime artifact per platform. Single files only.
export function runtimeArtifact(os: string, arch: string): string | null {
  if (os === "linux" && arch === "x86_64") {
    return "wizardkit-runtime-linux-x86_64";
  }
  if (os === "darwin" && arch === "aarch64") {
    return "wizardkit-runtime-macos-aarch64";
  }
  if (os === "windows" && arch === "x86_64") {
    return "wizardkit-runtime-windows-x86_64.exe";
  }
  return null;
}

// Shortcut Exec line: runtime pointed at the installed wrapper.
export function shortcutExec(
  runtimeBin: string,
  title: string,
  wrapper: string,
): string {
  return `${runtimeBin} --title "${title}" -- ${wrapper}`;
}

// Linux desktop shortcut for one app.
export function desktopEntry(app: string, exec: string): string {
  return (
    `[Desktop Entry]\nType=Application\nName=${app}\n` +
    `Exec=${exec}\nTerminal=false\nCategories=Utility;\n`
  );
}

// Fetch bytes or throw with the URL in the message.
async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} gave ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args);
  const app = args["app"] ?? "";
  const version = args["version"] ?? "";
  const scope = args["scope"] ?? "sid";
  const dry = args["dry"] !== undefined;
  if (!app || !version) throw new Error("Need --app plus --version");
  const spec = `jsr:@${scope}/${app}@${version}`;
  const say = (line: string): void => console.log((dry ? "[dry] " : "") + line);

  say(`deno install -g -A -n ${app} ${spec}`);
  if (!dry) {
    await $`${Deno.execPath()} install --global --allow-all --name ${app} ${spec}`;
  }
  const wrapper = `${shimDir()}/${app}`;

  const { os, arch } = Deno.build;
  const artifact = runtimeArtifact(os, arch);
  if (artifact === null) throw new Error(`No runtime for ${os} ${arch}`);
  const runtimeBase = (args["runtime-base"] ?? RUNTIME_BASE).replace(
    /\/+$/,
    "",
  );
  const fileUrl = `${runtimeBase}/v${RUNTIME_VERSION}/${artifact}`;
  const binPath = `${runtimeDir()}/${
    os === "windows" ? "wizardkit-runtime.exe" : "wizardkit-runtime"
  }`;
  say(`fetch ${fileUrl} to ${binPath}`);
  if (!dry) {
    await Deno.mkdir(runtimeDir(), { recursive: true });
    await Deno.writeFile(binPath, await fetchBytes(fileUrl));
    if (os !== "windows") await Deno.chmod(binPath, 0o755);
  }

  const exec = shortcutExec(binPath, app, wrapper);
  say(`shortcut runs: ${exec}`);
  if (!dry && os === "linux") {
    const apps = `${Deno.env.get("HOME") ?? "."}/.local/share/applications`;
    await Deno.mkdir(apps, { recursive: true });
    await Deno.writeTextFile(`${apps}/${app}.desktop`, desktopEntry(app, exec));
    say("Shortcut added to the launcher.");
  }
  if (!dry && os === "darwin") {
    say("First launch: right-click the app entry, pick Open.");
  }
  say(`Installed ${app} ${version}.`);
}

if (import.meta.main) await main();
