import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { classify, cleanup, prepare, resolveLimits, sandboxed, studentEnv, validate, type Limits, type RunRequest } from "./run-project.ts";

// Programs run on a pseudo-terminal so a prompt like printf("Name: ") appears before input is given.
const PTY_RUN = path.join(__dirname, "..", "launcher", "pty-run.py");

// Replay buffer bounds. A client that falls further behind is told which events were dropped.
const MAX_EVENTS = 2000;
const MAX_BUFFER_BYTES = 256 * 1024;
// A forgotten browser tab must not keep the task alive forever.
const MAX_WALL_MS = 30 * 60_000;

export interface RunEvent {
  id: number;
  type: "compile" | "output" | "exit";
  data: unknown;
  size: number;
}

export class InteractiveRun {
  readonly id = randomUUID();
  finished = false;
  readonly exited: Promise<void>;
  private events: RunEvent[] = [];
  private nextId = 1;
  private buffered = 0;
  private listeners = new Set<(event: RunEvent) => void>();
  private child?: ChildProcess;
  private stopRequested = false;
  private emittedBytes = 0;
  private tail = "";

  constructor(
    private request: RunRequest,
    private limits: Limits,
  ) {
    this.exited = this.run().catch((error) => {
      console.error(error);
      this.emit("exit", { status: "internal_error", exitCode: null, signal: null, wallMs: 0 });
    });
  }

  /** Events after `after`, and the first buffered id if events were dropped since then. */
  replay(after: number): { events: RunEvent[]; droppedBefore?: number } {
    const first = this.events.length ? this.events[0].id : this.nextId;
    return { events: this.events.filter((e) => e.id > after), droppedBefore: first > after + 1 ? first : undefined };
  }

  subscribe(listener: (event: RunEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  writeStdin(data: string, eof: boolean): void {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.writableEnded) return;
    if (data) stdin.write(data);
    if (eof) stdin.end();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.killGroup();
    await this.exited;
  }

  private emit(type: RunEvent["type"], data: unknown): void {
    const size = JSON.stringify(data).length;
    const event = { id: this.nextId++, type, data, size };
    this.events.push(event);
    this.buffered += size;
    while (this.events.length > 1 && (this.events.length > MAX_EVENTS || this.buffered > MAX_BUFFER_BYTES)) {
      this.buffered -= this.events.shift()!.size;
    }
    if (type === "exit") this.finished = true;
    for (const listener of this.listeners) listener(event);
  }

  private killGroup(): void {
    if (!this.child?.pid) return;
    try {
      process.kill(-this.child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }

  private async run(): Promise<void> {
    const { request, limits } = this;
    const dir = await realpath(await mkdtemp(path.join(tmpdir(), "sierrendipity-")));
    try {
      const { compile, command } = await prepare(request, dir, limits);
      if (compile) this.emit("compile", { output: compile.output, ok: compile.ok });
      if (!command || this.stopRequested) {
        const status = command ? "stopped" : "compile_error";
        return this.emit("exit", { status, exitCode: null, signal: null, wallMs: 0 });
      }
      await this.execute(command, dir);
    } finally {
      await cleanup(dir);
    }
  }

  private execute(command: string[], dir: string): Promise<void> {
    const { request, limits } = this;
    const started = Date.now();
    // detached: own process group, so one kill reaches the program and anything it spawned.
    const child = spawn("python3", [PTY_RUN, ...sandboxed(command, limits)], {
      cwd: dir,
      detached: true,
      env: studentEnv(dir),
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.child = child;
    let timedOut = false;
    let outputTruncated = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.killGroup();
    }, MAX_WALL_MS);

    const decoder = new StringDecoder("utf8");
    child.stdout!.on("data", (chunk: Buffer) => {
      if (outputTruncated) return;
      const room = limits.maxOutputBytes - this.emittedBytes;
      if (chunk.length > room) {
        outputTruncated = true;
        chunk = chunk.subarray(0, room);
        this.killGroup();
      }
      this.emittedBytes += chunk.length;
      const text = decoder.write(chunk);
      this.tail = (this.tail + text).slice(-4096);
      if (text) this.emit("output", { data: text });
    });
    child.stdin!.on("error", () => {}); // program may exit without reading its input
    if (request.stdin) child.stdin!.write(request.stdin);
    if (this.stopRequested) this.killGroup();

    return new Promise((resolve, reject) => {
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode, signal) => {
        clearTimeout(timer);
        this.killGroup(); // reap stragglers that outlived the main process
        const status = this.stopRequested
          ? "stopped"
          : classify({ exitCode, stderr: this.tail, timedOut, outputTruncated, signal });
        this.emit("exit", { status, exitCode, signal, wallMs: Date.now() - started });
        resolve();
      });
    });
  }
}

/** Validate a request and start it; the run proceeds in the background. */
export function startInteractive(request: RunRequest): InteractiveRun {
  validate(request);
  return new InteractiveRun(request, resolveLimits(request.limits));
}
