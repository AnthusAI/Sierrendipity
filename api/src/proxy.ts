import { verifySession } from "./token";

export const RUNNER_PORT = 8080;

export type ProxyEvent = {
  rawPath: string;
  rawQueryString?: string;
  headers: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
};
export type ProxyResult = { statusCode: number; headers: Record<string, string>; body: AsyncIterable<Uint8Array> };

export type ProxyDeps = {
  key: string;
  now: () => number; // ms
  fetch: (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: Uint8Array<ArrayBuffer>; signal: AbortSignal },
  ) => Promise<Response>;
  connectTimeoutMs?: number;
};

// Mirrors the Runner API in docs/architecture.md.
const ALLOWED: [method: string, path: RegExp][] = [
  ["POST", /^\/run$/],
  ["POST", /^\/runs$/],
  ["POST", /^\/explain$/],
  ["GET", /^\/runs\/[A-Za-z0-9_-]+\/events$/],
  ["POST", /^\/runs\/[A-Za-z0-9_-]+\/stdin$/],
  ["POST", /^\/runs\/[A-Za-z0-9_-]+\/stop$/],
  ["GET", /^\/healthz$/],
];

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection",
  "te", "trailer", "transfer-encoding", "upgrade",
]);
// Never forwarded to the runner: the session token, and headers fetch must derive itself.
const NOT_FORWARDED = new Set([...HOP_BY_HOP, "authorization", "host", "content-length", "x-forwarded-for", "x-runner-secret"]);

const message = (statusCode: number, error: string): ProxyResult => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: (async function* () {
    yield Buffer.from(JSON.stringify({ error }));
  })(),
});

const keep = (headers: Iterable<[string, string]>, drop: Set<string>) =>
  Object.fromEntries([...headers].filter(([k]) => !drop.has(k.toLowerCase()) && !k.toLowerCase().startsWith("x-amz")));

export function createProxyHandler(deps: ProxyDeps) {
  return async (event: ProxyEvent): Promise<ProxyResult> => {
    const token = /^Bearer (.+)$/i.exec(event.headers.authorization ?? "")?.[1];
    const claims = token && verifySession(token, deps.key, Math.floor(deps.now() / 1000));
    if (!claims) return message(401, "Invalid or expired session token.");

    const method = event.requestContext.http.method;
    if (!ALLOWED.some(([m, p]) => m === method && p.test(event.rawPath))) return message(404, "Not found.");

    const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
    const body = event.body ? new Uint8Array(Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")) : undefined;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), deps.connectTimeoutMs ?? 10_000);
    try {
      const res = await deps.fetch(`http://${claims.taskIp}:${RUNNER_PORT}${event.rawPath}${query}`, {
        method,
        // The per-task secret proves to the runner that the request came through the proxy.
        headers: { ...keep(Object.entries(event.headers) as [string, string][], NOT_FORWARDED), "x-runner-secret": claims.secret },
        body: method === "GET" ? undefined : body,
        signal: abort.signal,
      });
      clearTimeout(timer);
      // Once headers arrive the body (e.g. SSE) may legitimately stay open for a long time.
      return {
        statusCode: res.status,
        headers: keep(res.headers.entries(), HOP_BY_HOP),
        body: res.body ? (res.body as unknown as AsyncIterable<Uint8Array>) : (async function* () {})(),
      };
    } catch {
      clearTimeout(timer);
      return message(502, "The runner is unreachable; the task may have stopped. Start a new session.");
    }
  };
}
