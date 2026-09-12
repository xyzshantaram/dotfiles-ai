#!/usr/bin/env -S deno run --no-lock -A
// Shared chromeless runtime for wizardkit apps. Usage:
//   wizardkit-runtime --title "My App" -- <command...>
// Spawns the command with WIZARD_PORT set, waits for its HTTP server,
// and opens one chromeless window on it. Closing the window kills the
// child. Without a desktop shell it prints the URL and waits instead.

import { parseArgs } from "./install.ts";

const WAIT_MS = 15000;

// Pick a free local port by binding zero once, then closing.
async function pickPort(): Promise<number> {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  await new Promise<void>((done) => {
    listener.close();
    done();
  });
  return port;
}

// Wait for a 200 from the root path, else throw after WAIT_MS.
async function waitForServe(port: number): Promise<void> {
  const end = Date.now() + WAIT_MS;
  while (Date.now() < end) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      // Drain the body so the socket closes cleanly.
      await res.arrayBuffer();
      if (res.ok) return;
    } catch {
      // Not up yet. Sleep below, then retry.
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Nothing serves on ${port} after ${WAIT_MS}ms`);
}

async function main(): Promise<void> {
  const raw = [...Deno.args];
  const gap = raw.indexOf("--");
  if (gap === -1 || gap === raw.length - 1) {
    throw new Error('Need --title "Name" -- <command...>');
  }
  const args = parseArgs(raw.slice(0, gap));
  const title = args["title"] ?? "Wizard";
  const width = Number(args["width"] ?? 880);
  const height = Number(args["height"] ?? 960);
  const cmd = raw.slice(gap + 1);
  const port = await pickPort();
  const child = new Deno.Command(cmd[0] as string, {
    args: cmd.slice(1),
    env: { WIZARD_PORT: String(port) },
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  const url = `http://127.0.0.1:${port}/`;
  try {
    await waitForServe(port);
  } catch (e) {
    child.kill("SIGTERM");
    throw e;
  }
  const denoNs = Deno as unknown as {
    BrowserWindow?: new (opts: {
      title: string;
      width: number;
      height: number;
    }) => { navigate(u: string): void; onclose: (() => void) | null };
  };
  if (denoNs.BrowserWindow === undefined) {
    // Plain deno run: the browser draws the window instead.
    console.log(`Open ${url}`);
    await child.status;
    return;
  }
  const win = new denoNs.BrowserWindow({ title, width, height });
  win.navigate(url);
  await new Promise<void>((done) => {
    win.onclose = () => done();
  });
  try {
    child.kill("SIGTERM");
  } catch {
    // Already gone. Exit below anyway.
  }
  Deno.exit(0);
}

if (import.meta.main) await main();
