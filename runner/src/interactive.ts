import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { classify, cleanUpRun, prepare, resolveLimits, studentEnv, validate, type Limits, type RunRequest } from "./run-project.ts";
import { killUid, settlePipes, terminalCommand, watchDisk } from "./sandbox.ts";

// Replay buffer bounds. A client that falls further behind is told which events were dropped.
const MAX_EVENTS = 2000;
const MAX_BUFFER_BYTES = 256 * 1024;
// A forgotten browser tab must not keep the task alive forever.
const maxWallMs = () => Number(process.env.INTERACTIVE_MAX_WALL_S ?? 1800) * 1000;

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
  private earlyStdin: { data: string; eof: boolean }[] = [];
  private stopRequested = false;
  private emittedBytes = 0;
  private tail = "";

  constructor(
    private request: RunRequest,
    private limits: Limits,
    private uid: number,
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

  /** Input sent before the program has started (it may still be compiling) is held until it does. */
  writeStdin(data: string, eof: boolean): void {
    const stdin = this.child?.stdin;
    if (!stdin) {
      this.earlyStdin.push({ data, eof });
      return;
    }
    if (stdin.writableEnded) return;
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

  // Also by uid: a program can leave its process group (setsid) but not its user.
  private killGroup(): void {
    if (!this.child?.pid) return;
    try {
      process.kill(-this.child.pid, "SIGKILL");
    } catch {
      // already gone
    }
    void killUid(this.uid);
  }

  private async run(): Promise<void> {
    const { request, limits } = this;
    const dir = await realpath(await mkdtemp(path.join(tmpdir(), "sierrendipity-")));
    try {
      const { compile, command } = await prepare(request, dir, limits, this.uid);
      if (compile) this.emit("compile", { output: compile.output, ok: compile.ok });
      if (!command || this.stopRequested) {
        const status = command ? "stopped" : "compile_error";
        return this.emit("exit", { status, exitCode: null, signal: null, wallMs: 0 });
      }
      await this.execute(command, dir);
    } finally {
      await cleanUpRun(dir, this.uid);
    }
  }

  private execute(command: string[], dir: string): Promise<void> {
    const { request, limits } = this;
    const started = Date.now();
    // detached: own process group, so one kill reaches the program and anything it spawned.
    const [program, ...args] = terminalCommand(command, limits.memoryLimitMb, limits.timeLimitMs, this.uid);
    const child = spawn(program, args, {
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
    }, maxWallMs());
    // Files count against the output limit: a run that fills the disk is stopped like one that floods stdout.
    const stopWatching = watchDisk(this.uid, () => {
      outputTruncated = true;
      this.killGroup();
    });

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
    for (const { data, eof } of this.earlyStdin.splice(0)) this.writeStdin(data, eof);
    if (this.stopRequested) this.killGroup();

    return new Promise((resolve, reject) => {
      child.on("error", (error) => {
        clearTimeout(timer);
        stopWatching();
        reject(error);
      });
      // 'exit', not 'close': a straggler holding the pipes open must not keep the run alive.
      child.on("exit", async (exitCode, signal) => {
        clearTimeout(timer);
        stopWatching();
        this.killGroup(); // reap stragglers that outlived the main process
        await killUid(this.uid);
        await settlePipes(child);
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
export function startInteractive(request: RunRequest, uid: number): InteractiveRun {
  validate(request);
  return new InteractiveRun(request, resolveLimits(request.limits), uid);
}
