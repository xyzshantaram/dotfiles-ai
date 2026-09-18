// Splitwise API v3.0 client on a personal API key, ported from the Python
// push_to_splitwise.py. Its files live under the state root, like every
// other file this app writes. The Python tool kept its own copies.

import { pushedFilePath, tokenFilePath } from "./paths.ts";

export { pushedFilePath, tokenFilePath };

const BASE = "https://secure.splitwise.com/api/v3.0";

export interface Credentials {
  apiKey: string;
}

/** Loads API_KEY from a .env file. */
export async function loadCredentials(envPath: string): Promise<Credentials> {
  const text = await Deno.readTextFile(envPath);
  const map: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  const apiKey = map.API_KEY;
  if (!apiKey) {
    throw new Error(`${envPath} must contain API_KEY`);
  }
  return { apiKey };
}

// Display name from a get_current_user user record. Non-string or
// missing parts count as empty, so no stray spaces appear.
export function fullName(user: Record<string, unknown>): string {
  const first = typeof user.first_name === "string" ? user.first_name : "";
  const last = typeof user.last_name === "string" ? user.last_name : "";
  return (first + " " + last).trim();
}

// Read Splitwise's own complaint out of a response body, or null when
// the body carries none. The shape is documented as an object, with no
// promise about what sits under each key, so this handles the forms the
// API actually uses: `{"base": ["..."]}` for a whole-request problem and
// a field name for a per-field one, with either an array of strings or a
// bare string under it. An `errors` key present but EMPTY means success,
// which is why an empty object must return null rather than "".
export function errorText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const errors = (body as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    const messages = Array.isArray(value) ? value : [value];
    for (const message of messages) {
      if (typeof message !== "string" || message === "") continue;
      // "base" is Splitwise's name for a problem with the request as a
      // whole. Printing it would name a field the reader cannot find.
      parts.push(key === "base" ? message : `${key}: ${message}`);
    }
  }
  return parts.length === 0 ? null : parts.join("; ");
}

export class SplitwiseAPI {
  private doFetch: typeof fetch;

  constructor(private credentials: Credentials, doFetch: typeof fetch = fetch) {
    this.doFetch = doFetch;
  }

  private async call(path: string, data?: Record<string, string>): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.credentials.apiKey}`,
    };
    let res: Response;
    if (data) {
      // POST sends the fields as a form urlencoded body.
      headers["content-type"] = "application/x-www-form-urlencoded";
      res = await this.doFetch(`${BASE}/${path}`, {
        method: "POST",
        headers,
        body: new URLSearchParams(data).toString(),
      });
    } else {
      res = await this.doFetch(`${BASE}/${path}`, { headers });
    }
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Splitwise ${path}: ${res.status} ${text}`);
    }
    const body = JSON.parse(text || "{}");
    // A 200 IS NOT A SUCCESS HERE. The Splitwise docs state it outright
    // for create_expense: "200 OK does not indicate a successful
    // response. The operation was successful only if `errors` is empty."
    // (https://dev.splitwise.com/). So a rejected expense arrives as a
    // 200 whose body holds the reason and an empty `expenses` array.
    // Reading only the status let that body through, and the caller then
    // reported the ABSENCE of an id — "Splitwise gave no expense id" —
    // while the reason sat unread one field away. Raise it here, once,
    // where every endpoint passes.
    const problem = errorText(body);
    if (problem !== null) throw new Error(`Splitwise ${path}: ${problem}`);
    return body;
  }

  getCurrentUser(): Promise<Record<string, unknown>> {
    return this.call("get_current_user").then((
      d,
    ) => ((d as { user?: Record<string, unknown> }).user ?? {}));
  }

  getFriends(): Promise<Record<string, unknown>[]> {
    return this.call("get_friends").then((
      d,
    ) => ((d as { friends?: Record<string, unknown>[] }).friends ?? []));
  }

  getGroups(): Promise<Record<string, unknown>[]> {
    return this.call("get_groups").then((
      d,
    ) => ((d as { groups?: Record<string, unknown>[] }).groups ?? []));
  }

  createExpense(data: Record<string, string>): Promise<{ expenses?: { id?: number }[] }> {
    return this.call("create_expense", data) as Promise<{ expenses?: { id?: number }[] }>;
  }

  createComment(expenseId: number, content: string): Promise<unknown> {
    return this.call("create_comment", { expense_id: String(expenseId), content });
  }

  deleteExpense(expenseId: number): Promise<unknown> {
    return this.call("delete_expense", { id: String(expenseId) });
  }
}

export async function loadPushed(): Promise<Record<string, number>> {
  try {
    const data = JSON.parse(await Deno.readTextFile(pushedFilePath()));
    return data.pushed ?? {};
  } catch {
    return {};
  }
}

export async function savePushed(pushed: Record<string, number>): Promise<void> {
  const path = pushedFilePath();
  // Take the parent as plain text. Building a file URL by hand broke on
  // a path holding a "#", because the rest of the path read as a URL
  // fragment and the dir was created in the wrong place.
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify({ pushed }, null, 2));
}
