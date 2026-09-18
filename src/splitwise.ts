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
    return JSON.parse(text || "{}");
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
  await Deno.mkdir(new URL(".", `file://${pushedFilePath()}`), { recursive: true });
  await Deno.writeTextFile(pushedFilePath(), JSON.stringify({ pushed }, null, 2));
}
