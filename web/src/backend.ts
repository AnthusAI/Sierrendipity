import { devBackend, type Config } from "./config";
import { parseSse } from "./sse";

export type BackendStatus = "starting" | "ready" | "error";
export type Language = "python" | "c" | "cpp";

export type RunEvent =
  | { type: "compile"; output: string; ok: boolean }
  | { type: "output"; data: string }
  | { type: "exit"; status: string; exitCode?: number | null; signal?: string | null; wallMs?: number };

export interface RunRequest {
  language: Language;
  files: { path: string; content: string }[];
  entry?: string;
}

const POLL_MS = 1000;
const WARM_DEADLINE_MS = 120_000;
const LAST_RUN_KEY = "sierrendipity.lastRun";

/** Resolves after `ms`; rejects early when `signal` aborts. */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(new Error("aborted"))), { once: true });
  });

/** Talks to the control API (start/poll the workspace) and, with the session token, the proxy API. */
export class Backend {
  private sessionToken?: string;
  private warming?: Promise<void>;
  private readonly lifetime = new AbortController();
  private readonly dev?: string;

  constructor(
    private config: Config,
    private onStatus: (status: BackendStatus, message?: string) => void,
    private getIdToken: () => Promise<string | null>,
  ) {
    this.dev = devBackend(config);
  }

  /** Stop polling and streaming (unmount, sign-out). */
  dispose() {
    this.lifetime.abort();
  }

  private get controlUrl() {
    return this.dev ?? this.config.controlUrl!;
  }

  private get proxyUrl() {
    return this.dev ?? this.config.proxyUrl!;
  }

  private async controlCall(method: "POST" | "GET"): Promise<{ state: string; sessionToken?: string }> {
    const headers: Record<string, string> = {};
    if (!this.dev) {
      const token = await this.getIdToken();
      if (!token) throw new Error("signed out");
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${this.controlUrl}/session`, { method, headers, signal: this.lifetime.signal });
    if (!response.ok) throw new Error(`control /session: HTTP ${response.status}`);
    return response.json();
  }

  /** Start the workspace and wait until it is ready. Safe to call repeatedly; call it early to warm up. */
  warm(): Promise<void> {
    this.warming ??= (async () => {
      this.onStatus("starting");
      const deadline = Date.now() + WARM_DEADLINE_MS;
      let session = await this.controlCall("POST");
      while (session.state !== "ready") {
        if (session.state !== "starting") throw new Error(`workspace state: ${session.state}`);
        if (Date.now() > deadline) throw new Error("timed out waiting for the workspace");
        await sleep(POLL_MS, this.lifetime.signal);
        session = await this.controlCall("GET");
      }
      this.sessionToken = session.sessionToken;
      this.onStatus("ready");
    })().catch((error) => {
      this.warming = undefined;
      if (!this.lifetime.signal.aborted) this.onStatus("error", `Your workspace could not start: ${error.message}`);
      throw error;
    });
    return this.warming;
  }

  private async proxy(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async () => {
      await this.warm();
      const headers = new Headers(init.headers);
      if (!this.dev) headers.set("authorization", `Bearer ${this.sessionToken}`);
      return fetch(`${this.proxyUrl}${path}`, { signal: this.lifetime.signal, ...init, headers });
    };
    let response = await send();
    // An expired session token is safe to renew and retry. A gateway error is only retried for reads:
    // blindly repeating POST /runs could start a program twice.
    const read = (init.method ?? "GET") === "GET";
    if ([401, 403].includes(response.status) || (read && [502, 503, 504].includes(response.status))) {
      this.warming = undefined;
      response = await send();
    }
    return response;
  }

  private postJson(path: string, body: unknown) {
    return this.proxy(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** Stop the run remembered from an earlier page load, if any (the runner has no list endpoint). */
  async stopStale() {
    const id = sessionStorage.getItem(LAST_RUN_KEY);
    if (!id) return;
    sessionStorage.removeItem(LAST_RUN_KEY);
    await this.stop(id).catch(() => {});
  }

  async startRun(request: RunRequest): Promise<string> {
    let response = await this.postJson("/runs", request);
    if (response.status === 409) {
      // A run from before a reload is still active: stop it and retry once.
      await this.stopStale();
      await sleep(500, this.lifetime.signal);
      response = await this.postJson("/runs", request);
      if (response.status === 409) throw new Error("Another run is still active on your workspace. Try again in a moment.");
    }
    if (!response.ok) throw new Error(`could not start the run: HTTP ${response.status}`);
    const { runId } = await response.json();
    sessionStorage.setItem(LAST_RUN_KEY, runId);
    return runId;
  }

  async sendStdin(runId: string, data: string, eof = false) {
    const response = await this.postJson(`/runs/${runId}/stdin`, eof ? { data, eof } : { data });
    if (!response.ok) throw new Error(`could not send input: HTTP ${response.status}`);
  }

  async stop(runId: string) {
    await this.postJson(`/runs/${runId}/stop`, {});
  }

  /** Stream run events until `exit`, resuming with Last-Event-ID if the connection drops. */
  async streamEvents(runId: string, onEvent: (event: RunEvent) => void, signal: AbortSignal) {
    let lastId: string | undefined;
    for (let failures = 0; !signal.aborted && failures < 5; ) {
      try {
        const headers: Record<string, string> = lastId ? { "last-event-id": lastId } : {};
        const response = await this.proxy(`/runs/${runId}/events`, { headers, signal });
        if (!response.ok || !response.body) throw new Error(`events: HTTP ${response.status}`);
        for await (const message of parseSse(response.body)) {
          const data = JSON.parse(message.data);
          failures = 0;
          if (message.id) lastId = message.id; // only after the event parsed
          if (!["compile", "output", "exit"].includes(message.event)) continue; // ignore unknown types
          const event = { type: message.event, ...data } as RunEvent;
          onEvent(event);
          if (event.type === "exit") {
            sessionStorage.removeItem(LAST_RUN_KEY);
            return;
          }
        }
        failures++; // stream ended without an exit event: reconnect and resume
      } catch (error) {
        if (signal.aborted) return;
        failures++;
        if (failures >= 5) throw error;
      }
      await sleep(500, signal).catch(() => {});
    }
  }
}
