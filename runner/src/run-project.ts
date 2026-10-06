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

interface Exec {
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
async function cleanup(dir: string): Promise<void> {
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

function resolveLimits(given: unknown) {
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

function validate(request: RunRequest): void {
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

async function execute(request: RunRequest, dir: string): Promise<RunResult> {
  const limits = resolveLimits(request.limits);

  for (const file of request.files) {
    const target = path.resolve(dir, file.path);
    if (!target.startsWith(dir + path.sep)) throw new RequestError(`unsafe path: ${file.path}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }

  const result: RunResult = { status: "ok" };
  let command: string[];

  if (request.language === "python") {
    command = ["python3", "./" + path.normalize(request.entry ?? "main.py")];
  } else {
    const { cmd, ext, flags, libs } = compilers[request.language];
    const sources = request.files.map((f) => "./" + path.normalize(f.path)).filter((p) => p.endsWith(ext));
    if (sources.length === 0) throw new RequestError(`no ${ext} files`);
    const compiled = await exec([cmd, ...flags, "-o", "prog", ...sources, ...libs], dir, {
      timeoutMs: limits.compileTimeLimitMs,
      maxOutputBytes: limits.maxOutputBytes,
    });
    const ok = compiled.exitCode === 0 && !compiled.timedOut;
    result.compile = {
      ok,
      output: scrub(compiled.stdout + compiled.stderr, dir),
      timedOut: compiled.timedOut,
    };
    if (!ok) return { ...result, status: "compile_error" };
    command = ["./prog"];
  }

  // prlimit is Linux-only (util-linux); elsewhere the memory limit is not enforced.
  const limited = process.platform === "linux";
  if (limited) command = ["prlimit", `--as=${limits.memoryLimitMb * 1024 * 1024}`, "--", ...command];

  const ran = await exec(command, dir, {
    stdin: request.stdin,
    timeoutMs: limits.timeLimitMs,
    maxOutputBytes: limits.maxOutputBytes,
  });
  ran.stderr = scrub(ran.stderr, dir);
  result.run = ran;
  result.status = classify(ran, limited);
  return result;
}

function classify(run: Exec, memoryLimited: boolean): RunResult["status"] {
  if (run.timedOut) return "time_limit_exceeded";
  if (run.outputTruncated) return "output_limit_exceeded";
  // Under an address-space limit a failed allocation is reported by the runtime, not by a signal.
  if (memoryLimited && /bad_alloc|MemoryError|Cannot allocate memory/.test(run.stderr)) {
    return "memory_limit_exceeded";
  }
  return run.exitCode === 0 ? "ok" : "runtime_error";
}

/** Remove the temp dir from messages so they read `main.cpp:3:5: error: ...`. */
function scrub(text: string, dir: string): string {
  return text.split(dir + path.sep).join("").split(dir).join(".");
}

function exec(
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
      env: { PATH: process.env.PATH, HOME: cwd, LANG: "C.UTF-8", PYTHONUNBUFFERED: "1" },
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
