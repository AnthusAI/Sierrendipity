import { execFile, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// Everything here is Linux-only: elsewhere student code runs unconfined (local development).
export const isLinux = process.platform === "linux";
const LAUNCHER = process.env.SANDBOX_EXEC ?? "/usr/local/bin/sandbox-exec";
const PTY_RUN = path.join(__dirname, "..", "launcher", "pty-run.py");

const FIRST_UID = 20001;
// The compiler needs far more address space than student code; this only stops a runaway compile.
const COMPILE_MEMORY_BYTES = 1536 * 1024 * 1024;
// Files a run leaves in the shared scratch areas; the run directory lives in /tmp too.
const SCRATCH = ["/tmp", "/var/tmp", "/dev/shm"];
export const MAX_DISK_BYTES = 200 * 1024 * 1024;
const DISK_CHECK_MS = 1000;
// After the main process exits, how long output already in the pipes may take to arrive.
const PIPE_GRACE_MS = 300;

/** One unprivileged uid per concurrent run, so runs cannot touch each other or the server. */
export class UidPool {
  private free: number[];
  constructor(readonly size: number) {
    this.free = Array.from({ length: size }, (_, i) => FIRST_UID + i);
  }
  get inUse(): number {
    return this.size - this.free.length;
  }
  acquire(): number | undefined {
    return this.free.shift();
  }
  release(uid: number): void {
    this.free.push(uid);
  }
}

const run = (command: string, args: string[]) =>
  new Promise<string>((resolve) => execFile(command, args, { maxBuffer: 10_000_000 }, (_e, stdout) => resolve(stdout)));

/** Student program under the full sandbox: its own uid, resource limits and seccomp filter. */
export function studentCommand(command: string[], memoryLimitMb: number, timeLimitMs: number, uid: number): string[] {
  if (!isLinux) return command;
  return [LAUNCHER, ...studentOptions(memoryLimitMb, timeLimitMs, uid), "--", ...command];
}

function studentOptions(memoryLimitMb: number, timeLimitMs: number, uid?: number): string[] {
  // The CPU limit is a backstop for the wall-clock timer, hence the extra second.
  const cpu = Math.ceil(timeLimitMs / 1000) + 1;
  return [...(uid === undefined ? [] : [`--uid=${uid}`]), `--as=${memoryLimitMb * 1024 * 1024}`, `--cpu=${cpu}`];
}

/** Like studentCommand, on a pseudo-terminal so a prompt appears before input is given. */
export function terminalCommand(command: string[], memoryLimitMb: number, timeLimitMs: number, uid: number): string[] {
  if (!isLinux) return ["python3", PTY_RUN, ...command];
  // The wrapper is trusted code but runs as the run's uid too; only the program gets the filter.
  const inner = [LAUNCHER, ...studentOptions(memoryLimitMb, timeLimitMs), "--", ...command];
  return [LAUNCHER, `--uid=${uid}`, "--no-seccomp", "--", "python3", PTY_RUN, ...inner];
}

/** The compiler needs /tmp and processes, so no seccomp filter, but it keeps the uid and a memory bound. */
export function compilerCommand(command: string[], uid: number): string[] {
  if (!isLinux) return command;
  return [LAUNCHER, `--uid=${uid}`, "--no-seccomp", `--as=${COMPILE_MEMORY_BYTES}`, "--", ...command];
}

/** Kill every process of the run's uid, including ones that escaped the process group. */
export async function killUid(uid: number | undefined): Promise<void> {
  if (!isLinux || uid === undefined) return;
  await run(LAUNCHER, [`--kill-uid=${uid}`]);
}

/** Delete everything the run's uid left in the scratch areas. */
export async function wipeUid(uid: number | undefined): Promise<void> {
  if (!isLinux || uid === undefined) return;
  await run("find", [...SCRATCH, "-xdev", "-user", String(uid), "-delete"]);
}

async function diskUsage(uid: number): Promise<number> {
  const sizes = await run("find", [...SCRATCH, "-xdev", "-user", String(uid), "-type", "f", "-printf", "%s\\n"]);
  return sizes.split("\n").reduce((sum, line) => sum + (Number(line) || 0), 0);
}

/** Call `onExceeded` once if the run's files grow past the limit. Returns a function that stops watching. */
export function watchDisk(uid: number | undefined, onExceeded: () => void): () => void {
  if (!isLinux || uid === undefined) return () => {};
  let stopped = false;
  void (async () => {
    while (!stopped) {
      await sleep(DISK_CHECK_MS);
      if (!stopped && (await diskUsage(uid)) > MAX_DISK_BYTES) {
        onExceeded();
        return;
      }
    }
  })();
  return () => {
    stopped = true;
  };
}

/**
 * The main process has exited: let output already in the pipes arrive, then close them, so a
 * straggler holding a pipe open cannot hang the run.
 */
export async function settlePipes(child: ChildProcess): Promise<void> {
  const closed = (stream: NodeJS.ReadableStream & { closed?: boolean }) =>
    stream.closed ? Promise.resolve() : new Promise<void>((resolve) => stream.once("close", () => resolve()));
  const streams = [child.stdout, child.stderr].filter((s): s is NonNullable<typeof s> => !!s);
  await Promise.race([Promise.all(streams.map(closed)), sleep(PIPE_GRACE_MS)]);
  for (const stream of streams) stream.destroy();
}
