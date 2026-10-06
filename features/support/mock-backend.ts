import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

// A small in-repo mock of the Control, Proxy and Runner APIs in docs/architecture.md, served from
// one origin. It runs a fake program chosen from the submitted source (the same for every language,
// Python, C, C++ and Rust alike; POST /runs bodies are recorded in `runRequests`):
//   "#error <text>"   -> compile error "main.cpp:1:2: error: <text>"
//   "while True"      -> prints "still running" and waits for Stop
//   more than 1 file  -> prints "files: <names>"
//   anything else     -> prints "Name: ", reads a line, prints "Hello, <line>!"
// POST /explain answers with the canned compilation below ("#error <text>" -> compile_error).
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

// A small RV32 program, hand-assembled once and pasted here so the mock needs no assembler. The C it
// stands for (the specs paste it into the editor):
//   1 int putchar(int c);          6   }
//   2 int main(void) {             7   putchar('0' + sum);
//   3   int sum = 0;               8   return 0;
//   4   for (int i = 1; ...) {     9 }
//   5     sum += i;
// [word, function, source line (0 = runtime)]. It prints "6" through putchar's write ecall and exits 0.
const PROGRAM: [number, string, number][] = [
  [0x030000ef, "_start", 0], // jal ra, main
  [0x05d00893, "_start", 0], // addi a7, zero, 93
  [0x00000073, "_start", 0], // ecall
  [0xff010113, "putchar", 0], // addi sp, sp, -16
  [0x00a107a3, "putchar", 0], // sb a0, 15(sp)
  [0x00100513, "putchar", 0], // addi a0, zero, 1
  [0x00f10593, "putchar", 0], // addi a1, sp, 15
  [0x00100613, "putchar", 0], // addi a2, zero, 1
  [0x04000893, "putchar", 0], // addi a7, zero, 64
  [0x00000073, "putchar", 0], // ecall
  [0x01010113, "putchar", 0], // addi sp, sp, 16
  [0x00008067, "putchar", 0], // jalr zero, 0(ra)
  [0xfe010113, "main", 2], // addi sp, sp, -32
  [0x00112e23, "main", 2], // sw ra, 28(sp)
  [0x00812c23, "main", 2], // sw s0, 24(sp)
  [0x02010413, "main", 2], // addi s0, sp, 32
  [0xfe042623, "main", 3], // sw zero, -20(s0)
  [0x00100793, "main", 4], // addi a5, zero, 1
  [0xfef42423, "main", 4], // sw a5, -24(s0)
  [0x0200006f, "main", 4], // jal zero, 32
  [0xfec42703, "main", 5], // lw a4, -20(s0)
  [0xfe842783, "main", 5], // lw a5, -24(s0)
  [0x00f707b3, "main", 5], // add a5, a4, a5
  [0xfef42623, "main", 5], // sw a5, -20(s0)
  [0xfe842783, "main", 4], // lw a5, -24(s0)
  [0x00178793, "main", 4], // addi a5, a5, 1
  [0xfef42423, "main", 4], // sw a5, -24(s0)
  [0xfe842703, "main", 4], // lw a4, -24(s0)
  [0x00300793, "main", 4], // addi a5, zero, 3
  [0xfce7dee3, "main", 4], // bge a5, a4, -36
  [0xfec42783, "main", 7], // lw a5, -20(s0)
  [0x03078793, "main", 7], // addi a5, a5, 48
  [0x00078513, "main", 7], // addi a0, a5, 0
  [0xf89ff0ef, "main", 7], // jal ra, -120
  [0x00000513, "main", 8], // addi a0, zero, 0
  [0x01c12083, "main", 9], // lw ra, 28(sp)
  [0x01812403, "main", 9], // lw s0, 24(sp)
  [0x02010113, "main", 9], // addi sp, sp, 32
  [0x00008067, "main", 9], // jalr zero, 0(ra)
];

type MockInstruction = { word: number; fn: string; path: string; line: number }; // line 0 = runtime

/** "// big" in the source: 20,000 nops (4 per C line) then exit(0). */
function bigProgram(): MockInstruction[] {
  const list: MockInstruction[] = Array.from({ length: 20_000 }, (_, i) => ({ word: 0x13, fn: "main", path: "main.c", line: 1 + (i >> 2) }));
  list.push({ word: 0x05d00893, fn: "main", path: "main.c", line: 5001 }, { word: 0x73, fn: "main", path: "main.c", line: 5001 });
  return list;
}

function explain(files: { path: string; content: string }[]) {
  const source = files.map((f) => f.content).join("\n");
  const error = /#error (.*)/.exec(source);
  if (error) return { status: "compile_error", compileOutput: `main.c:1:2: error: ${error[1]}\n` };
  if (source.includes("// noprogram")) return { status: "ok", compileOutput: "" };
  const big = source.includes("// big");
  const runtimeOnly = source.includes("// runtimeonly");
  const twoFiles = files.length > 1;
  const list: MockInstruction[] = big
    ? bigProgram()
    : PROGRAM.map(([word, fn, line]) => ({
        word,
        fn,
        // With two files, the loop body (C line 5) lives in util.c line 1.
        path: twoFiles && line === 5 ? "util.c" : "main.c",
        line: twoFiles && line === 5 ? 1 : runtimeOnly ? 0 : line,
      }));
  const image = Buffer.alloc(list.length * 4);
  list.forEach(({ word }, i) => image.writeUInt32LE(word, i * 4));
  const lineMap: Record<string, number[]> = {};
  const instructions = list.map(({ word, fn, path, line }, index) => {
    if (line) (lineMap[`${path}:${line}`] ??= []).push(index);
    return {
      index,
      addr: index * 4,
      word,
      origin: line ? "user" : "runtime",
      function: fn,
      ...(line ? { src: { path, line, column: 1 } } : {}),
    };
  });
  return {
    status: "ok",
    compileOutput: "",
    program: { image: image.toString("base64"), loadAddress: 0, entry: 0, stackTop: 0x20000, memorySize: 0x20000 },
    instructions,
    lineMap,
  };
}

export interface MockBackend {
  url: string;
  /** When set, /session requires `Bearer <token>` and runner calls require the session token. */
  requireControlToken(token: string): void;
  /** While true, /session reports the unknown state "failed". */
  setSessionFailing(failing: boolean): void;
  /** Every POST /runs body so far, so specs can check the language and files the IDE sent. */
  runRequests: { language: string; files: { path: string; content: string }[] }[];
  close(): Promise<void>;
}

export async function startMockBackend(options: { startDelayMs?: number; port?: number } = {}): Promise<MockBackend> {
  const startDelayMs = options.startDelayMs ?? 0;
  let startedAt: number | undefined;
  let controlToken: string | undefined;
  let sessionFailing = false;
  const runs = new Map<string, Run>();
  const runRequests: MockBackend["runRequests"] = [];
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
      if (sessionFailing) return json(response, 200, { state: "failed" });
      if (request.method === "POST") startedAt ??= Date.now();
      const ready = startedAt !== undefined && Date.now() - startedAt >= startDelayMs;
      return json(response, 200, ready ? { state: "ready", sessionToken: SESSION_TOKEN } : { state: "starting" });
    }

    if (path === "/healthz") return json(response, 200, { ok: true });
    if (controlToken && bearer !== SESSION_TOKEN) return json(response, 401, { error: "unauthorized" });

    if (request.method === "POST" && path === "/runs") {
      if ([...runs.values()].some((r) => !r.done)) return json(response, 409, { error: "a run is active" });
      const body = await readJson(request);
      runRequests.push({ language: body.language, files: body.files });
      const runId = `run-${nextRun++}`;
      const run: Run = { events: [], done: false, subscribers: new Set() };
      runs.set(runId, run);
      json(response, 202, { runId });
      return setTimeout(() => program(run, body.files), 50);
    }

    if (request.method === "POST" && path === "/explain") {
      const body = await readJson(request);
      // "// slow" in the source: answer after a delay (for the specs about stale results).
      if (body.files.some((f: { content: string }) => f.content.includes("// slow"))) await new Promise((r) => setTimeout(r, 1500));
      return json(response, 200, explain(body.files));
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
      const { data, eof } = await readJson(request);
      if (eof && !run.done) {
        emit(run, "output", { data: "end of input\n" });
        emit(run, "exit", { status: "ok", exitCode: 0, signal: null, wallMs: 1 });
      } else if (data) run.onStdin?.(data);
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
    runRequests,
    requireControlToken: (token) => {
      controlToken = token;
    },
    setSessionFailing: (failing) => {
      sessionFailing = failing;
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
