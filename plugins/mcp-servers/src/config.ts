// Config reader for the MCP server roster. The roster lives in
// $DSH_HOME/mcp-servers.json and is owned by git, so this module only reads
// and validates it. It never throws. Every problem it finds is collected into
// one error string so a user sees all issues in one run.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

export interface StdioServer {
  name: string;
  type: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

export interface HttpServer {
  name: string;
  type: "http";
  url: string;
}

export type ServerConfig = StdioServer | HttpServer;

export interface ReadResult {
  servers: ServerConfig[];
  error: string;
}

const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const URL_RE = /^https?:\/\//;

/** Expand a leading "~/". A "~" that does not start the string is left alone. */
function expandHome(p: string): string {
  if (p.startsWith("~/")) return joinHome(p.slice(2));
  return p;
}

function joinHome(rest: string): string {
  return homedir() + "/" + rest;
}

export function parseConfig(text: string): ReadResult {
  const errors: string[] = [];

  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (e) {
    return { servers: [], error: `mcp-servers.json is not valid JSON: ${(e as Error).message}` };
  }
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return { servers: [], error: "mcp-servers.json must be a JSON object" };
  }
  const serversRaw = (root as Record<string, unknown>)["mcpServers"];
  if (typeof serversRaw !== "object" || serversRaw === null || Array.isArray(serversRaw)) {
    return { servers: [], error: "mcp-servers.json must have an mcpServers object" };
  }

  const servers: ServerConfig[] = [];
  for (const [name, valueRaw] of Object.entries(serversRaw as Record<string, unknown>)) {
    if (!NAME_RE.test(name)) {
      errors.push(`server name "${name}" is invalid (use 1-32 letters, digits, "_" or "-")`);
      continue;
    }
    if (typeof valueRaw !== "object" || valueRaw === null || Array.isArray(valueRaw)) {
      errors.push(`server "${name}" must be a JSON object`);
      continue;
    }
    const value = valueRaw as Record<string, unknown>;

    // Absent type defaults to http, matching the Claude and Codex convention.
    const type = value["type"] === undefined ? "http" : value["type"];
    if (type === "stdio") {
      const command = value["command"];
      if (typeof command !== "string" || command.length === 0) {
        errors.push(`stdio server "${name}" needs a non-empty command`);
        continue;
      }
      const args = value["args"] ?? [];
      if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) {
        errors.push(`stdio server "${name}" has non-string entries in args`);
        continue;
      }
      const env = value["env"] ?? {};
      const envOk =
        typeof env === "object" &&
        env !== null &&
        !Array.isArray(env) &&
        Object.values(env as Record<string, unknown>).every((v) => typeof v === "string");
      if (!envOk) {
        errors.push(`stdio server "${name}" has an env map with non-string values`);
        continue;
      }
      const server: StdioServer = {
        name,
        type: "stdio",
        command: expandHome(command),
        args: (args as string[]).map((a) => expandHome(a)),
        env: env as Record<string, string>,
      };
      if (value["cwd"] !== undefined) {
        if (typeof value["cwd"] !== "string" || value["cwd"].length === 0) {
          errors.push(`stdio server "${name}" has a non-string cwd`);
          continue;
        }
        server.cwd = expandHome(value["cwd"]);
      }
      servers.push(server);
    } else if (type === "http") {
      const url = value["url"];
      if (typeof url !== "string" || !URL_RE.test(url)) {
        errors.push(`http server "${name}" needs a url starting with http:// or https://`);
        continue;
      }
      servers.push({ name, type: "http", url });
    } else {
      errors.push(`server "${name}" has unknown type ${JSON.stringify(type)} (expected "stdio" or "http")`);
    }
  }

  return { servers, error: errors.join("; ") };
}

export function readConfig(path: string): ReadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return { servers: [], error: `could not read ${path}: ${(e as Error).message}` };
  }
  return parseConfig(text);
}
