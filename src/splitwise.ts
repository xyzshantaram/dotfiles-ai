// Splitwise API v3.0 client on node-oauth (OAuth1), ported from the Python
// push_to_splitwise.py. Shares its cache locations so an existing token and
// pushed-tracking work from either implementation.

import { OAuth } from "oauth";

const BASE = "https://secure.splitwise.com/api/v3.0";
const OAUTH_BASE = "https://secure.splitwise.com";

export function tokenFilePath(): string {
  return Deno.env.get("SPLITWISE_TOKEN_FILE") ??
    `${Deno.env.get("HOME")}/.cache/ordersplit/splitwise_token.json`;
}
export function pushedFilePath(): string {
  return Deno.env.get("SPLITWISE_PUSHED_FILE") ??
    `${Deno.env.get("HOME")}/.cache/ordersplit/splitwise_pushed.json`;
}

export interface AccessToken {
  oauth_token: string;
  oauth_token_secret: string;
}

export interface Credentials {
  consumerKey: string;
  consumerSecret: string;
}

/** Loads CONSUMER_KEY/CONSUMER_SECRET from a .env file. */
export async function loadCredentials(envPath: string): Promise<Credentials> {
  const text = await Deno.readTextFile(envPath);
  const map: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  const consumerKey = map.CONSUMER_KEY;
  const consumerSecret = map.CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error(`${envPath} must contain CONSUMER_KEY and CONSUMER_SECRET`);
  }
  return { consumerKey, consumerSecret };
}

interface SignedResponse {
  statusCode: number;
  body: string;
}

/** Minimal typed surface for the untyped oauth module. */
interface OAuthClient {
  get(url: string, token: string, secret: string): Promise<SignedResponse>;
  post(
    url: string,
    token: string,
    secret: string,
    body: Record<string, string>,
    contentType: string,
  ): Promise<SignedResponse>;
  getOAuthRequestToken(): Promise<AccessToken>;
  getOAuthAccessToken(
    token: string,
    secret: string,
    verifier: string,
  ): Promise<AccessToken>;
}

/** node-oauth is callback-style; promisify its surface once, here. */
function createClient(creds: Credentials): OAuthClient {
  const oa = new OAuth(
    `${BASE}/get_request_token`,
    `${BASE}/get_access_token`,
    creds.consumerKey,
    creds.consumerSecret,
    "1.0",
    null,
    "HMAC-SHA1",
  ) as unknown as {
    get: (
      url: string,
      token: string,
      secret: string,
      cb: (e: Error | null, body: string, res: { statusCode: number }) => void,
    ) => void;
    post: (
      url: string,
      token: string,
      secret: string,
      body: string | Record<string, string>,
      contentType: string,
      cb: (e: Error | null, body: string, res: { statusCode: number }) => void,
    ) => void;
    getOAuthRequestToken: (
      cb: (e: Error | null, token: string, secret: string) => void,
    ) => void;
    getOAuthAccessToken: (
      token: string,
      secret: string,
      verifier: string,
      cb: (e: Error | null, token: string, secret: string) => void,
    ) => void;
  };

  return {
    get: (url, token, secret) =>
      new Promise((resolve, reject) =>
        oa.get(
          url,
          token,
          secret,
          (e, body, res) => e ? reject(e) : resolve({ statusCode: res.statusCode, body }),
        )
      ),
    post: (url, token, secret, body, contentType) =>
      new Promise((resolve, reject) =>
        oa.post(
          url,
          token,
          secret,
          body,
          contentType,
          (e, body, res) => e ? reject(e) : resolve({ statusCode: res.statusCode, body }),
        )
      ),
    getOAuthRequestToken: () =>
      new Promise((resolve, reject) =>
        oa.getOAuthRequestToken((e, token, secret) =>
          e ? reject(e) : resolve({ oauth_token: token, oauth_token_secret: secret })
        )
      ),
    getOAuthAccessToken: (token, secret, verifier) =>
      new Promise((resolve, reject) =>
        oa.getOAuthAccessToken(
          token,
          secret,
          verifier,
          (e, accessToken, accessSecret) =>
            e ? reject(e) : resolve({ oauth_token: accessToken, oauth_token_secret: accessSecret }),
        )
      ),
  };
}

/** Pull the verifier out of a pasted bare code or full callback URL. */
export function parseVerifier(raw: string): string {
  const text = raw.trim();
  const key = "oauth_verifier=";
  const at = text.indexOf(key);
  if (at < 0) return text;
  const rest = text.slice(at + key.length);
  const end = rest.search(/[&\s]/);
  return end < 0 ? rest : rest.slice(0, end);
}

// Display name from a get_current_user user record. Non-string or
// missing parts count as empty, so no stray spaces appear.
export function fullName(user: Record<string, unknown>): string {
  const first = typeof user.first_name === "string" ? user.first_name : "";
  const last = typeof user.last_name === "string" ? user.last_name : "";
  return (first + " " + last).trim();
}

export class SplitwiseAPI {
  private client: OAuthClient;

  constructor(private credentials: Credentials, private accessToken?: AccessToken) {
    this.client = createClient(credentials);
  }

  private async call(path: string, data?: Record<string, string>): Promise<unknown> {
    const token = this.accessToken ?? { oauth_token: "", oauth_token_secret: "" };
    let res: SignedResponse;
    if (data) {
      // Pass the params object, not a string: node-oauth signs form params
      // (Splitwise requires them in the signature base) and builds the body.
      res = await this.client.post(
        `${BASE}/${path}`,
        token.oauth_token,
        token.oauth_token_secret,
        data,
        "application/x-www-form-urlencoded",
      );
    } else {
      res = await this.client.get(`${BASE}/${path}`, token.oauth_token, token.oauth_token_secret);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Splitwise ${path}: ${res.statusCode} ${res.body}`);
    }
    return JSON.parse(res.body || "{}");
  }

  /** Step 1 of OAuth: request token + authorize URL to open in a browser. */
  async getAuthorizeUrl(): Promise<{ url: string; requestToken: AccessToken }> {
    const requestToken = await this.client.getOAuthRequestToken();
    return {
      url: `${OAUTH_BASE}/authorize?oauth_token=${requestToken.oauth_token}`,
      requestToken,
    };
  }

  /** Step 2 of OAuth: exchange request token + verifier for an access token. */
  async getAccessToken(requestToken: AccessToken, verifier: string): Promise<AccessToken> {
    return await this.client.getOAuthAccessToken(
      requestToken.oauth_token,
      requestToken.oauth_token_secret,
      verifier,
    );
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

/** On-disk token cache: also mirrors the consumer creds alongside the token. */
interface TokenCache {
  consumer_key: string;
  consumer_secret: string;
  access_token: AccessToken;
}

export async function loadToken(): Promise<AccessToken | null> {
  try {
    const cache: TokenCache = JSON.parse(await Deno.readTextFile(tokenFilePath()));
    const t = cache.access_token;
    return t?.oauth_token && t?.oauth_token_secret ? t : null;
  } catch {
    return null;
  }
}

export async function saveToken(
  token: AccessToken,
  consumerKey?: string,
  consumerSecret?: string,
): Promise<void> {
  let cache: TokenCache | null = null;
  try {
    cache = JSON.parse(await Deno.readTextFile(tokenFilePath()));
  } catch {
    cache = null;
  }
  const updated: TokenCache = {
    consumer_key: consumerKey ?? cache?.consumer_key ?? "",
    consumer_secret: consumerSecret ?? cache?.consumer_secret ?? "",
    access_token: token,
  };
  // Write owner only so secrets stay private.
  await Deno.mkdir(new URL(".", `file://${tokenFilePath()}`), { recursive: true });
  await Deno.writeTextFile(tokenFilePath(), JSON.stringify(updated, null, 2), { mode: 0o600 });
  // Fix the mode again for existing files.
  try {
    await Deno.chmod(tokenFilePath(), 0o600);
  } catch {
    // Ignore chmod errors on non posix disks.
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
