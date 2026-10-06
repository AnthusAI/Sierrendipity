import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { startInteractive, type InteractiveRun, type RunEvent } from "./interactive.ts";
import { RequestError, runProject } from "./run-project.ts";
import { UidPool } from "./sandbox.ts";

const MAX_BODY_BYTES = 5_000_000;
const MAX_SLOW_CLIENT_BYTES = 1_000_000;

class TooLargeError extends Error {}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) {
      req.resume();
      return reject(new TooLargeError());
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but keep draining, so the client finishes its upload and can read the 413.
        req.removeAllListeners("data");
        req.resume();
        reject(new TooLargeError());
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const body = await readBody(req);
  try {
    return JSON.parse(body);
  } catch {
    throw new RequestError("invalid JSON");
  }
}

/** Server-Sent Events: replay what the client missed, then follow the run until it exits. */
function streamEvents(res: http.ServerResponse, run: InteractiveRun, after: number): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "x-accel-buffering": "no",
  });
  res.flushHeaders();
  const write = (e: RunEvent) => {
    res.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
    // A client too slow to keep up is dropped rather than buffered without bound; it can resume.
    if (res.writableLength > MAX_SLOW_CLIENT_BYTES) res.destroy();
  };
  const { events, droppedBefore } = run.replay(after);
  // No id, so the gap notice never becomes the client's resume point.
  if (droppedBefore) res.write(`event: gap\ndata: ${JSON.stringify({ firstId: droppedBefore })}\n\n`);
  events.forEach(write);
  if (run.finished) return void res.end();

  const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
  const unsubscribe = run.subscribe((e) => {
    write(e);
    if (e.type === "exit") res.end();
  });
  res.on("close", () => {
    clearInterval(ping);
    unsubscribe();
  });
}

export interface ServerOptions {
  /** Simultaneous runs (batch and interactive) before new ones get 429. */
  maxConcurrentRuns?: number;
  /** Call `onIdle` after this long with no requests and no active run. */
  idleTimeoutS?: number;
  onIdle?: () => void;
  /** When set, every request except GET /healthz must send it as `x-runner-secret`. */
  secret?: string;
}

function hasSecret(req: http.IncomingMessage, secret: string): boolean {
  const given = Buffer.from(String(req.headers["x-runner-secret"] ?? ""));
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function startServer(port: number, options: ServerOptions = {}): Promise<http.Server> {
  const { maxConcurrentRuns = 4, idleTimeoutS, onIdle, secret } = options;
  // One sandbox uid per concurrent run: holding a uid is holding a slot.
  const uids = new UidPool(maxConcurrentRuns);
  let requestsInFlight = 0;
  let lastActivity = Date.now();
  let current: InteractiveRun | undefined; // the most recent interactive run

  const touch = () => (lastActivity = Date.now());

  const server = http.createServer(async (req, res) => {
    requestsInFlight++;
    res.on("close", () => {
      requestsInFlight--;
      touch();
    });
    try {
      const url = new URL(req.url ?? "/", "http://runner");
      const route = `${req.method} ${url.pathname}`;
      const runRoute = /^\/runs\/([^/]+)\/(events|stdin|stop)$/.exec(url.pathname);

      if (route === "GET /healthz") return send(res, 200, { ok: true });
      if (secret && !hasSecret(req, secret)) {
        req.resume();
        return send(res, 401, { error: "unauthorized" });
      }

      if (route === "POST /run" || route === "POST /runs") {
        const interactive = route === "POST /runs";
        if (interactive && current && !current.finished) {
          req.resume();
          return send(res, 409, { error: "a run is already active" });
        }
        const uid = uids.acquire();
        if (uid === undefined) {
          req.resume();
          return send(res, 429, { error: "too many runs in progress" });
        }
        let handedOff = false;
        try {
          const request = await readJson(req);
          if (!interactive) return send(res, 200, await runProject(request, uid));
          if (current && !current.finished) return send(res, 409, { error: "a run is already active" });
          const run = startInteractive(request, uid);
          current = run;
          handedOff = true;
          void run.exited.then(() => {
            uids.release(uid);
            touch();
          });
          return send(res, 202, { runId: run.id });
        } finally {
          if (!handedOff) uids.release(uid);
        }
      }

      if (runRoute) {
        const [, id, action] = runRoute;
        const run = current?.id === id ? current : undefined;
        if (!run) return send(res, 404, { error: "unknown run" });
        if (req.method === "GET" && action === "events") {
          const after = Number(url.searchParams.get("after") ?? req.headers["last-event-id"] ?? 0);
          return streamEvents(res, run, Number.isFinite(after) && after > 0 ? after : 0);
        }
        if (req.method === "POST" && action === "stdin") {
          const { data = "", eof = false } = await readJson(req);
          if (typeof data !== "string" || typeof eof !== "boolean") throw new RequestError("invalid stdin");
          if (run.finished) return send(res, 409, { error: "run has finished" });
          run.writeStdin(data, eof);
          return send(res, 200, { ok: true });
        }
        if (req.method === "POST" && action === "stop") {
          await run.stop();
          return send(res, 200, { ok: true });
        }
      }
      send(res, 404, { error: "not found" });
    } catch (error) {
      if (error instanceof TooLargeError) {
        return send(res, 413, { error: "request too large" });
      }
      if (error instanceof RequestError) return send(res, 400, { error: error.message });
      console.error(error);
      send(res, 500, { status: "internal_error" });
    }
  });

  if (idleTimeoutS !== undefined) {
    const idleMs = idleTimeoutS * 1000;
    const watchdog = setInterval(() => {
      const idle = requestsInFlight === 0 && uids.inUse === 0;
      if (idle && Date.now() - lastActivity >= idleMs) onIdle?.();
    }, Math.min(1000, idleMs / 4));
    server.on("close", () => clearInterval(watchdog));
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}
