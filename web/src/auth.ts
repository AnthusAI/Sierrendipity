import type { Config } from "./config";

// Cognito hosted UI, Google as identity provider, authorization code + PKCE.
// Tokens live in memory and in sessionStorage (cleared when the tab closes).

interface Tokens {
  idToken: string;
  refreshToken?: string;
  expiresAt: number; // ms since epoch
}

const PKCE_KEY = "sierrendipity.pkce";
const TOKENS_KEY = "sierrendipity.tokens";

let tokens: Tokens | null = readStored();

function readStored(): Tokens | null {
  try {
    return JSON.parse(sessionStorage.getItem(TOKENS_KEY) ?? "null");
  } catch {
    return null;
  }
}

function setTokens(next: Tokens | null) {
  tokens = next;
  if (next) sessionStorage.setItem(TOKENS_KEY, JSON.stringify(next));
  else sessionStorage.removeItem(TOKENS_KEY);
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const random = () => base64url(crypto.getRandomValues(new Uint8Array(48)));

export function claims(): { email?: string; sub?: string } | null {
  if (!tokens) return null;
  try {
    const payload = tokens.idToken.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(payload));
  } catch {
    return {};
  }
}

export const isSignedIn = () => tokens !== null;

export async function startLogin(config: Config) {
  const verifier = random();
  const state = random();
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const query = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId!,
    redirect_uri: config.redirectUri!,
    scope: "openid email profile",
    identity_provider: "Google",
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  location.assign(`${config.cognitoDomain}/oauth2/authorize?${query}`);
}

async function tokenRequest(config: Config, params: Record<string, string>): Promise<Tokens> {
  const response = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId!, ...params }),
  });
  if (!response.ok) throw new Error(`token endpoint: HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body.id_token !== "string") throw new Error("token endpoint returned no id_token");
  return {
    idToken: body.id_token,
    refreshToken: body.refresh_token ?? tokens?.refreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}

/** If this page load is the OAuth redirect, exchange the code for tokens. */
export async function handleCallback(config: Config): Promise<string | undefined> {
  const url = new URL(location.href);
  if (!config.redirectUri || url.pathname !== new URL(config.redirectUri).pathname) return;
  const code = url.searchParams.get("code");
  const refused = url.searchParams.get("error");
  if (!code && !refused) return;
  let saved: { verifier: string; state: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? "null");
  } catch {
    /* treated as missing */
  }
  sessionStorage.removeItem(PKCE_KEY);
  history.replaceState(null, "", "/");
  if (refused) return url.searchParams.get("error_description") ?? refused;
  if (!saved || saved.state !== url.searchParams.get("state")) return "Sign-in could not be verified. Please try again.";
  try {
    setTokens(
      await tokenRequest(config, {
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: config.redirectUri,
        code_verifier: saved.verifier,
      }),
    );
  } catch (error) {
    return `Sign-in failed: ${(error as Error).message}`;
  }
}

/** A valid ID token (refreshed when close to expiry), or null when the student must sign in again. */
export async function getIdToken(config: Config): Promise<string | null> {
  if (!tokens) return null;
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.idToken;
  if (tokens.refreshToken) {
    try {
      setTokens(await tokenRequest(config, { grant_type: "refresh_token", refresh_token: tokens.refreshToken }));
      return tokens!.idToken;
    } catch {
      /* fall through to re-login */
    }
  }
  setTokens(null);
  return null;
}

export function signOut(config: Config) {
  setTokens(null);
  const query = new URLSearchParams({
    client_id: config.clientId!,
    logout_uri: new URL("/", config.redirectUri).href,
  });
  location.assign(`${config.cognitoDomain}/logout?${query}`);
}
