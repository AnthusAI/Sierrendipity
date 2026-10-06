import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type Language = "python" | "c" | "cpp";

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

export async function runProject(request: RunRequest): Promise<RunResult> {
  validate(request);
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "sierrendipity-")));
  try {
    return await execute(request, dir);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    console.error(error);
    return { status: "internal_error" };
  } finally {
    await cleanup(dir);
  }
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
  if (!["python", "c", "cpp"].includes(request?.language)) throw new RequestError("unsupported language");
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

const isLinux = process.platform === "linux";
const SANDBOX_EXEC = process.env.SANDBOX_EXEC ?? "/usr/local/bin/sandbox-exec";
// The compiler needs far more address space than student code; this only stops a runaway compile.
const COMPILE_MEMORY_BYTES = 1536 * 1024 * 1024;

/**
 * Wrap a student command in the sandbox launcher (seccomp filter and resource limits).
 * Linux only: elsewhere student code runs unconfined, which is fine for local development.
 */
export function sandboxed(command: string[], limits: Limits): string[] {
  if (!isLinux) return command;
  // The CPU limit is a backstop for the wall-clock timer, hence the extra second.
  const cpu = Math.ceil(limits.timeLimitMs / 1000) + 1;
  return [SANDBOX_EXEC, `--as=${limits.memoryLimitMb * 1024 * 1024}`, `--cpu=${cpu}`, "--", ...command];
}

/** Write the project's files and compile it; returns the command that runs it. */
export async function prepare(
  request: RunRequest,
  dir: string,
  limits: Limits,
): Promise<{ compile?: NonNullable<RunResult["compile"]>; command?: string[] }> {
  for (const file of request.files) {
    const target = path.resolve(dir, file.path);
    if (!target.startsWith(dir + path.sep)) throw new RequestError(`unsafe path: ${file.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }

  if (request.language === "python") {
    return { command: ["python3", "./" + path.normalize(request.entry ?? "main.py")] };
  }
  const { cmd, ext, flags, libs } = compilers[request.language];
  const sources = request.files.map((f) => "./" + path.normalize(f.path)).filter((p) => p.endsWith(ext));
  if (sources.length === 0) throw new RequestError(`no ${ext} files`);
  let compiler = [cmd, ...flags, "-o", "prog", ...sources, ...libs];
  if (isLinux) compiler = ["prlimit", `--as=${COMPILE_MEMORY_BYTES}`, "--", ...compiler];
  const compiled = await exec(compiler, dir, {
    timeoutMs: limits.compileTimeLimitMs,
    maxOutputBytes: limits.maxOutputBytes,
  });
  const ok = compiled.exitCode === 0 && !compiled.timedOut;
  const compile = { ok, output: scrub(compiled.stdout + compiled.stderr, dir), timedOut: compiled.timedOut };
  return ok ? { compile, command: ["./prog"] } : { compile };
}

async function execute(request: RunRequest, dir: string): Promise<RunResult> {
  const limits = resolveLimits(request.limits);
  const { compile, command } = await prepare(request, dir, limits);
  const result: RunResult = { status: "ok", ...(compile && { compile }) };
  if (!command) return { ...result, status: "compile_error" };

  const ran = await exec(sandboxed(command, limits), dir, {
    stdin: request.stdin,
    timeoutMs: limits.timeLimitMs,
    maxOutputBytes: limits.maxOutputBytes,
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
  if (isLinux && /bad_alloc|MemoryError|Cannot allocate memory/.test(run.stderr)) {
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
  opts: { stdin?: string; timeoutMs: number; maxOutputBytes: number },
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

    const killGroup = () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // already gone
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, opts.timeoutMs);

    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      if (outputTruncated) return;
      const room = opts.maxOutputBytes - total;
      if (chunk.length > room) {
        outputTruncated = true;
        chunk = chunk.subarray(0, room);
        killGroup();
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
      reject(e);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      killGroup(); // reap stragglers that outlived the main process
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
