import type { Config } from "./config";
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Talks to the control API (start/poll the workspace) and, with the session token, the proxy API. */
export class Backend {
  private sessionToken?: string;
  private warming?: Promise<void>;
  private readonly dev: boolean;

  constructor(
    private config: Config,
    private onStatus: (status: BackendStatus) => void,
    private getIdToken: () => Promise<string | null>,
  ) {
    this.dev = config.devBackend !== undefined;
  }

  private get controlUrl() {
    return this.config.devBackend ?? this.config.controlUrl!;
  }

  private get proxyUrl() {
    return this.config.devBackend ?? this.config.proxyUrl!;
  }

  private async controlCall(method: "POST" | "GET"): Promise<{ state: string; sessionToken?: string }> {
    const headers: Record<string, string> = {};
    if (!this.dev) {
      const token = await this.getIdToken();
      if (!token) throw new Error("signed out");
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${this.controlUrl}/session`, { method, headers });
    if (!response.ok) throw new Error(`control /session: HTTP ${response.status}`);
    return response.json();
  }

  /** Start the workspace and wait until it is ready. Safe to call repeatedly; call it early to warm up. */
  warm(): Promise<void> {
    this.warming ??= (async () => {
      this.onStatus("starting");
      let session = await this.controlCall("POST");
      while (session.state !== "ready") {
        await sleep(POLL_MS);
        session = await this.controlCall("GET");
      }
      this.sessionToken = session.sessionToken;
      this.onStatus("ready");
    })().catch((error) => {
      this.warming = undefined;
      this.onStatus("error");
      throw error;
    });
    return this.warming;
  }

  private async proxy(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async () => {
      await this.warm();
      const headers = new Headers(init.headers);
      if (!this.dev) headers.set("authorization", `Bearer ${this.sessionToken}`);
      return fetch(`${this.proxyUrl}${path}`, { ...init, headers });
    };
    let response = await send();
    if ([401, 403, 502, 503, 504].includes(response.status)) {
      // Session token expired or the task went away: start/refresh the workspace once and retry.
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

  async startRun(request: RunRequest): Promise<string> {
    const response = await this.postJson("/runs", request);
    if (!response.ok) throw new Error(`could not start the run: HTTP ${response.status}`);
    return (await response.json()).runId;
  }

  async sendStdin(runId: string, data: string) {
    await this.postJson(`/runs/${runId}/stdin`, { data });
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
          failures = 0;
          if (message.id) lastId = message.id;
          const event = { type: message.event, ...JSON.parse(message.data) } as RunEvent;
          onEvent(event);
          if (event.type === "exit") return;
        }
        failures++; // stream ended without an exit event: reconnect and resume
      } catch (error) {
        if (signal.aborted) return;
        failures++;
        if (failures >= 5) throw error;
      }
      await sleep(500);
    }
  }
}
