// OAuth client provider for the http MCP servers. Implements the SDK
// interface. The SDK handles discovery, dynamic client registration, PKCE,
// the code exchange and refresh. We only store state and capture the
// authorization URL so the panel can show it instead of opening a browser.
import { randomBytes } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { TokenStore } from "./store.js";

// The SDK exports the provider interface but not the payload type names.
// Derive them so the provider stays compatible by construction.
type ClientMetadata = OAuthClientProvider["clientMetadata"];
type ClientInformation = NonNullable<Awaited<ReturnType<OAuthClientProvider["clientInformation"]>>>;
type Tokens = Parameters<OAuthClientProvider["saveTokens"]>[0];

export interface ProviderOpts {
  server: string;
  store: TokenStore;
  redirectUrl: string;
  // Called with the authorization URL when a login is needed. Must not
  // open a browser.
  onAuthorizationUrl(url: string): void;
}

export function createProvider(opts: ProviderOpts) {
  const { server, store, redirectUrl, onAuthorizationUrl } = opts;
  return {
    get redirectUrl(): string {
      return redirectUrl;
    },

    get clientMetadata(): ClientMetadata {
      return {
        redirect_uris: [redirectUrl],
        client_name: "dsh-mcp-servers",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },

    clientInformation(): ClientInformation | undefined {
      return store.get(server)?.clientInformation as ClientInformation | undefined;
    },

    saveClientInformation(info: ClientInformation): void {
      store.setClientInformation(server, info);
    },

    tokens(): Tokens | undefined {
      return store.get(server)?.tokens as Tokens | undefined;
    },

    saveTokens(tokens: Tokens): void {
      store.setTokens(server, tokens);
    },

    // Store the URL for the panel. Never open a browser here.
    redirectToAuthorization(authorizationUrl: URL): void {
      onAuthorizationUrl(authorizationUrl.toString());
    },

    saveCodeVerifier(codeVerifier: string): void {
      store.setCodeVerifier(server, codeVerifier);
    },

    codeVerifier(): string {
      const verifier = store.getCodeVerifier(server);
      if (verifier === undefined) throw new Error(`mcp-servers: no code verifier stored for ${server}`);
      return verifier;
    },

    // One random value per authorization attempt, persisted so the callback
    // can prove it belongs to a login this host started.
    state(): string {
      const value = randomBytes(16).toString("hex");
      store.setState(server, value);
      return value;
    },
  };
}
