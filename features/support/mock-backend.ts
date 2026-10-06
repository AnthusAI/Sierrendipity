import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

// A small in-repo mock of the Control, Proxy and Runner APIs in docs/architecture.md, served from
// one origin. It runs a fake program chosen from the submitted source:
//   "#error <text>"   -> compile error "main.cpp:1:2: error: <text>"
//   "while True"      -> prints "still running" and waits for Stop
//   more than 1 file  -> prints "files: <names>"
//   anything else     -> prints "Name: ", reads a line, prints "Hello, <line>!"
// Standalone for manual smoke tests: `npx tsx features/support/mock-backend.ts [port] [startMs]`.

export const SESSION_TOKEN = "mock-session-token";

interface StoredEvent {
  id: number;
  type: string;
  data: unknown;
}

interface Run {
  events: StoredEvent[];
  done: boolean;
  subscribers: Set<ServerResponse>;
  onStdin?: (line: string) => void;
}

export interface MockBackend {
  url: string;
  /** When set, /session requires `Bearer <token>` and runner calls require the session token. */
  requireControlToken(token: string): void;
  close(): Promise<void>;
}

export async function startMockBackend(options: { startDelayMs?: number; port?: number } = {}): Promise<MockBackend> {
  const startDelayMs = options.startDelayMs ?? 0;
  let startedAt: number | undefined;
  let controlToken: string | undefined;
  const runs = new Map<string, Run>();
  let nextRun = 1;

  const emit = (run: Run, type: string, data: unknown) => {
    const event = { id: run.events.length + 1, type, data };
    run.events.push(event);
    if (type === "exit") run.done = true;
    for (const response of run.subscribers) write(response, event);
    if (run.done) for (const response of run.subscribers) response.end();
  };

  const write = (response: ServerResponse, event: StoredEvent) =>
    response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);

  const program = (run: Run, files: { path: string; content: string }[]) => {
    const source = files.map((f) => f.content).join("\n");
    const exit = (status: string) => emit(run, "exit", { status, exitCode: 0, signal: null, wallMs: 1 });
    const error = /#error (.*)/.exec(source);
    if (error) {
      emit(run, "compile", { output: `main.cpp:1:2: error: ${error[1]}\n`, ok: false });
      return exit("compile_error");
    }
    emit(run, "compile", { output: "", ok: true });
    if (source.includes("while True")) return emit(run, "output", { data: "still running\n" });
    if (files.length > 1) {
      emit(run, "output", { data: `files: ${files.map((f) => f.path).sort().join(" ")}\n` });
      return exit("ok");
    }
    emit(run, "output", { data: "Name: " });
    run.onStdin = (line) => {
      emit(run, "output", { data: `Hello, ${line.trim()}!\n` });
      exit("ok");
    };
  };

  const readJson = async (request: IncomingMessage) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    return body ? JSON.parse(body) : {};
  };

  const json = (response: ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-headers", "authorization, content-type, last-event-id");
    response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    if (request.method === "OPTIONS") return response.writeHead(204).end();

    const path = new URL(request.url!, "http://mock").pathname;
    const bearer = request.headers.authorization?.replace(/^Bearer /, "");

    if (path === "/session") {
      if (controlToken && bearer !== controlToken) return json(response, 401, { error: "unauthorized" });
      if (request.method === "DELETE") {
        startedAt = undefined;
        return json(response, 200, { state: "stopped" });
      }
      if (request.method === "POST") startedAt ??= Date.now();
      const ready = startedAt !== undefined && Date.now() - startedAt >= startDelayMs;
      return json(response, 200, ready ? { state: "ready", sessionToken: SESSION_TOKEN } : { state: "starting" });
    }

    if (path === "/healthz") return json(response, 200, { ok: true });
    if (controlToken && bearer !== SESSION_TOKEN) return json(response, 401, { error: "unauthorized" });

    if (request.method === "POST" && path === "/runs") {
      if ([...runs.values()].some((r) => !r.done)) return json(response, 409, { error: "a run is active" });
      const body = await readJson(request);
      const runId = `run-${nextRun++}`;
      const run: Run = { events: [], done: false, subscribers: new Set() };
      runs.set(runId, run);
      json(response, 202, { runId });
      return setTimeout(() => program(run, body.files), 50);
    }

    const match = /^\/runs\/([^/]+)\/(events|stdin|stop)$/.exec(path);
    const run = match && runs.get(match[1]);
    if (!match || !run) return json(response, 404, { error: "not found" });

    if (match[2] === "events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const url = new URL(request.url!, "http://mock");
      const after = Number(request.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0);
      run.events.filter((e) => e.id > after).forEach((e) => write(response, e));
      if (run.done) return response.end();
      run.subscribers.add(response);
      return response.on("close", () => run.subscribers.delete(response));
    }
    if (match[2] === "stdin") {
      const { data } = await readJson(request);
      run.onStdin?.(data);
      return json(response, 200, { ok: true });
    }
    if (!run.done) emit(run, "exit", { status: "killed", exitCode: null, signal: "SIGKILL", wallMs: 1 });
    return json(response, 200, { ok: true });
  };

  const server: Server = createServer((request, response) => {
    handle(request, response).catch((error) => json(response, 500, { error: String(error) }));
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("no address");

  return {
    url: `http://127.0.0.1:${address.port}`,
    requireControlToken: (token) => {
      controlToken = token;
    },
    close: () =>
      new Promise((resolve) => {
        for (const run of runs.values()) run.subscribers.forEach((r) => r.end());
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

if (require.main === module) {
  const port = Number(process.argv[2] ?? 8787);
  startMockBackend({ port, startDelayMs: Number(process.argv[3] ?? 5000) }).then((mock) =>
    console.log(`mock backend on ${mock.url}`),
  );
}
