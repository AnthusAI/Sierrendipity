import { execFile, spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compilerCommand, isLinux, killUid, settlePipes, studentCommand, watchDisk, wipeUid } from "./sandbox.ts";

export type Language = "python" | "c" | "cpp" | "rust";

export interface RunRequest {
  language: Language;
  files: { path: string; content: string }[];
  entry?: string;
  stdin?: string;
  limits?: {
    timeLimitMs?: number;
    compileTimeLimitMs?: number;
    maxOutputBytes?: number;
    memoryLimitMb?: number;
  };
}

export interface RunResult {
  compile?: { ok: boolean; output: string; timedOut: boolean };
  run?: {
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    outputTruncated: boolean;
    wallMs: number;
  };
  status:
    | "ok"
    | "compile_error"
    | "runtime_error"
    | "time_limit_exceeded"
    | "output_limit_exceeded"
    | "memory_limit_exceeded"
    | "internal_error";
}

/** The request itself is invalid (as opposed to the student's program being wrong). */
export class RequestError extends Error {}

export interface Exec {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTruncated: boolean;
  wallMs: number;
}

const compilers = {
  c: { cmd: "gcc", ext: ".c", flags: ["-O2", "-std=c17"], libs: ["-lm"] },
  cpp: { cmd: "g++", ext: ".cpp", flags: ["-O2", "-std=c++20"], libs: [] as string[] },
};

/**
 * Rust is compiled with `rustc` itself, never cargo: no crates, build scripts or proc-macros. The
 * toolchain is pinned in runner/Dockerfile (RUST_VERSION) and linked at /opt/rust/toolchain.
 * - opt-level=2 for speed, debuginfo=0 for small binaries, panic=unwind so a panic prints its message
 *   and exits 101 like `cargo run`.
 * - overflow-checks=on: integer overflow panics ("attempt to add with overflow") as in the debug builds
 *   Rust courses teach with, instead of silently wrapping as a plain release build would.
 * - No flag comes from the student, and RUSTC_BOOTSTRAP is never in the scrubbed environment, so
 *   `#![feature(...)]` is refused by the compiler itself (error[E0554]).
 */
export const RUSTC = process.env.RUSTC ?? "/opt/rust/toolchain/bin/rustc";
const RUSTC_FLAGS = [
  "--edition", "2021", "-C", "opt-level=2", "-C", "debuginfo=0", "-C", "panic=unwind",
  "-C", "overflow-checks=on", "--color", "never", "--error-format=human",
];

/** Run to completion. `uid` is this run's own sandbox user (see UidPool). */
export async function runProject(request: RunRequest, uid?: number): Promise<RunResult> {
  validate(request);
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "sierrendipity-")));
  try {
    return await execute(request, dir, uid);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    console.error(error);
    return { status: "internal_error" };
  } finally {
    await cleanUpRun(dir, uid);
  }
}

/** Nothing of the run may outlive it: processes, its directory, or files elsewhere in /tmp. */
export async function cleanUpRun(dir: string, uid: number | undefined): Promise<void> {
  await killUid(uid);
  await cleanup(dir);
  await wipeUid(uid);
}

// The program may have made directories it cannot read back; never let that fail the response.
export async function cleanup(dir: string): Promise<void> {
  try {
    await makeWritable(dir);
    await rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.error(`could not remove ${dir}`, error);
  }
}

async function makeWritable(dir: string): Promise<void> {
  await chmod(dir, 0o700);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await makeWritable(path.join(dir, entry.name)).catch(() => {});
  }
}

const MAX_LIMITS = { timeLimitMs: 30_000, compileTimeLimitMs: 60_000, maxOutputBytes: 10_000_000, memoryLimitMb: 1024 };
const DEFAULT_LIMITS = { timeLimitMs: 5000, compileTimeLimitMs: 15000, maxOutputBytes: 1_000_000, memoryLimitMb: 256 };

export function resolveLimits(given: unknown) {
  if (given !== undefined && (typeof given !== "object" || given === null)) throw new RequestError("limits must be an object");
  const input = (given ?? {}) as Record<string, unknown>;
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new RequestError(`${key} must be a positive integer`);
    }
    limits[key] = Math.min(value, MAX_LIMITS[key]);
  }
  return limits;
}

export function validate(request: RunRequest): void {
  if (!["python", "c", "cpp", "rust"].includes(request?.language)) throw new RequestError("unsupported language");
  if (!Array.isArray(request.files) || request.files.length === 0) throw new RequestError("files are required");
  for (const file of request.files) {
    if (typeof file?.path !== "string" || typeof file.content !== "string") throw new RequestError("invalid file");
    checkRelative(file.path);
  }
  if (request.stdin !== undefined && typeof request.stdin !== "string") throw new RequestError("stdin must be a string");
  const paths = request.files.map((f) => path.posix.normalize(f.path.replaceAll("\\", "/")));
  for (const p of paths) {
    // "a" and "a/b" cannot both be files.
    if (paths.filter((q) => q === p).length > 1 || paths.some((q) => q.startsWith(p + "/"))) {
      throw new RequestError(`conflicting path: ${p}`);
    }
  }
  if (request.language === "rust") {
    const other = request.files.find((f) => !f.path.endsWith(".rs"));
    if (other) throw new RequestError(`only .rs files are accepted: ${other.path}`);
  }
  if (request.entry !== undefined && !request.files.some((f) => f.path === request.entry)) {
    throw new RequestError("entry must be one of the submitted files");
  }
  resolveLimits(request.limits);
}

function checkRelative(p: string): void {
  const segments = p.split(/[\\/]/);
  if (p === "" || p.includes("\0") || path.posix.isAbsolute(p) || path.win32.isAbsolute(p) || segments.includes("..")) {
    throw new RequestError(`unsafe path: ${p}`);
  }
}

export type Limits = ReturnType<typeof resolveLimits>;

/**
 * Write the project's files under `dir`, then hand `owner` (default `dir`) to the run's uid: it must
 * own its directory, and nobody else can enter it.
 */
export async function writeFiles(files: { path: string; content: string }[], dir: string, uid?: number, owner = dir): Promise<void> {
  for (const file of files) {
    const target = path.resolve(dir, file.path);
    if (!target.startsWith(dir + path.sep)) throw new RequestError(`unsafe path: ${file.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  if (isLinux && uid !== undefined) {
    await new Promise<void>((resolve, reject) =>
      execFile("chown", ["-R", `${uid}:${uid}`, owner], (error) => (error ? reject(error) : resolve())),
    );
  }
}

/** Write the project's files and compile it; returns the command that runs it. */
export async function prepare(
  request: RunRequest,
  dir: string,
  limits: Limits,
  uid?: number,
): Promise<{ compile?: NonNullable<RunResult["compile"]>; command?: string[] }> {
  await writeFiles(request.files, dir, uid);

  if (request.language === "python") {
    return { command: ["python3", "./" + path.normalize(request.entry ?? "main.py")] };
  }
  let compiler: string[];
  if (request.language === "rust") {
    // The crate root; `mod` declarations pull in the other files, relative to it.
    const root = request.entry ?? "main.rs";
    if (!request.files.some((f) => f.path === root)) throw new RequestError(`no ${root}`);
    if (!root.endsWith(".rs")) throw new RequestError("entry must be a .rs file");
    compiler = [RUSTC, ...RUSTC_FLAGS, "-o", "prog", "./" + path.normalize(root)];
  } else {
    const { cmd, ext, flags, libs } = compilers[request.language];
    const sources = request.files.map((f) => "./" + path.normalize(f.path)).filter((p) => p.endsWith(ext));
    if (sources.length === 0) throw new RequestError(`no ${ext} files`);
    compiler = [cmd, ...flags, "-o", "prog", ...sources, ...libs];
  }
  const compiled = await exec(uid === undefined ? compiler : compilerCommand(compiler, uid), dir, {
    timeoutMs: limits.compileTimeLimitMs,
    maxOutputBytes: limits.maxOutputBytes,
    uid,
  });
  const ok = compiled.exitCode === 0 && !compiled.timedOut;
  const compile = { ok, output: scrub(compiled.stdout + compiled.stderr, dir), timedOut: compiled.timedOut };
  return ok ? { compile, command: ["./prog"] } : { compile };
}

async function execute(request: RunRequest, dir: string, uid?: number): Promise<RunResult> {
  const limits = resolveLimits(request.limits);
  const { compile, command } = await prepare(request, dir, limits, uid);
  const result: RunResult = { status: "ok", ...(compile && { compile }) };
  if (!command) return { ...result, status: "compile_error" };

  const confined = uid === undefined ? command : studentCommand(command, limits.memoryLimitMb, limits.timeLimitMs, uid);
  const ran = await exec(confined, dir, {
    stdin: request.stdin,
    timeoutMs: limits.timeLimitMs,
    maxOutputBytes: limits.maxOutputBytes,
    uid,
  });
  ran.stderr = scrub(ran.stderr, dir);
  result.run = ran;
  result.status = classify(ran);
  return result;
}

export function classify(run: Pick<Exec, "timedOut" | "outputTruncated" | "stderr" | "exitCode" | "signal">): RunResult["status"] {
  // SIGXCPU: the sandbox's CPU limit fired before the wall-clock timer.
  if (run.timedOut || run.signal === "SIGXCPU") return "time_limit_exceeded";
  if (run.outputTruncated) return "output_limit_exceeded";
  // Under an address-space limit a failed allocation is reported by the runtime, not by a signal.
  if (isLinux && /bad_alloc|MemoryError|Cannot allocate memory|memory allocation of \d+ bytes failed/.test(run.stderr)) {
    return "memory_limit_exceeded";
  }
  return run.exitCode === 0 ? "ok" : "runtime_error";
}

/** Remove the temp dir from messages so they read `main.cpp:3:5: error: ...`. */
export function scrub(text: string, dir: string): string {
  return text.split(dir + path.sep).join("").split(dir).join(".");
}

/** The only environment student code sees: nothing from the task (AWS_*, ECS_*, ...) leaks through. */
export function studentEnv(home: string): Record<string, string | undefined> {
  return { PATH: process.env.PATH, HOME: home, LANG: "C.UTF-8", PYTHONUNBUFFERED: "1" };
}

export function exec(
  command: string[],
  cwd: string,
  opts: { stdin?: string; timeoutMs: number; maxOutputBytes: number; uid?: number },
): Promise<Exec> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    // detached: own process group, so one kill reaches any children the program spawned.
    const child = spawn(command[0], command.slice(1), {
      cwd,
      detached: true,
      env: studentEnv(cwd),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let total = 0;
    let timedOut = false;
    let outputTruncated = false;

    // Also by uid: a program can leave its process group (setsid) but not its user.
    const killAll = () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // already gone
      }
      void killUid(opts.uid);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killAll();
    }, opts.timeoutMs);
    // Files count against the output limit: a run that fills the disk is stopped like one that floods stdout.
    const stopWatching = watchDisk(opts.uid, () => {
      outputTruncated = true;
      killAll();
    });

    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      if (outputTruncated) return;
      const room = opts.maxOutputBytes - total;
      if (chunk.length > room) {
        outputTruncated = true;
        chunk = chunk.subarray(0, room);
        killAll();
      }
      total += chunk.length;
      into.push(chunk);
    };
    child.stdout.on("data", collect(out));
    child.stderr.on("data", collect(err));

    child.stdin.on("error", () => {}); // program may exit without reading its input
    child.stdin.end(opts.stdin ?? "");

    child.on("error", (e) => {
      clearTimeout(timer);
      stopWatching();
      reject(e);
    });
    // 'exit', not 'close': a straggler holding the pipes open must not keep the run alive.
    child.on("exit", async (exitCode, signal) => {
      clearTimeout(timer);
      stopWatching();
      killAll(); // reap stragglers that outlived the main process
      await killUid(opts.uid);
      await settlePipes(child);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        timedOut,
        outputTruncated,
        wallMs: Date.now() - started,
      });
    });
  });
}
