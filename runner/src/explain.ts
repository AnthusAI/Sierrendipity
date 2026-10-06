import { lstat, mkdir, mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ElfError, parseElf, parseLineTable, rowAt, type Elf, type Sequence } from "./elf.ts";
import { cleanUpRun, exec, RequestError, scrub, validate, writeFiles, type Exec } from "./run-project.ts";
import { compilerCommand } from "./sandbox.ts";

export interface ExplainRequest {
  language: "c";
  files: { path: string; content: string }[];
  optLevel?: "O0" | "Og";
}

export interface ExplainInstruction {
  index: number;
  addr: number;
  word: number;
  origin: "user" | "runtime";
  function: string;
  src?: { path: string; line: number; column: number };
}

export interface ExplainResponse {
  status: "ok" | "compile_error" | "link_error" | "time_limit_exceeded" | "output_limit_exceeded" | "internal_error";
  compileOutput: string;
  program?: { image: string; loadAddress: number; entry: number; stackTop: number; memorySize: number };
  instructions?: ExplainInstruction[];
  lineMap?: Record<string, number[]>;
}

// Fixed, not caller-supplied: /explain has no limits field.
const COMPILE_TIME_LIMIT_MS = 10_000;
const MAX_COMPILER_OUTPUT_BYTES = 1_000_000;
const MAX_COMPILE_OUTPUT_CHARS = 100_000;
const MAX_ELF_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_INSTRUCTIONS = 20_000;
const MAX_RESPONSE_BYTES = 4_000_000;

// crt0.o and libruntime.o are built from runner/riscv when the image is built (see the Dockerfile).
const RUNTIME_SOURCES = path.join(__dirname, "..", "riscv");
const RUNTIME_OBJECTS = process.env.RISCV_RUNTIME_DIR ?? "/opt/riscv-runtime";
const GCC = "riscv64-unknown-elf-gcc";
const TARGET = ["-march=rv32im", "-mabi=ilp32"];

export function validateExplain(request: ExplainRequest): { files: ExplainRequest["files"]; optLevel: "O0" | "Og" } {
  if (request?.language !== "c") throw new RequestError("only C is supported");
  validate({ language: "c", files: request.files }); // shape and path checks shared with /run
  const optLevel = request.optLevel ?? "O0";
  if (optLevel !== "O0" && optLevel !== "Og") throw new RequestError("optLevel must be O0 or Og");
  for (const file of request.files) {
    if (!file.path.endsWith(".c") && !file.path.endsWith(".h")) throw new RequestError(`only .c and .h files are accepted: ${file.path}`);
  }
  if (!request.files.some((f) => f.path.endsWith(".c"))) throw new RequestError("no .c files");
  return { files: request.files, optLevel };
}

export interface BuildResult {
  status: "ok" | "compile_error" | "link_error" | "time_limit_exceeded" | "output_limit_exceeded";
  output: string;
  /** The linked ELF, when status is ok. */
  elf?: string;
}

// The compiler ran out of memory or address space on something endless (an #include of /dev/zero ...).
const RESOURCE_EXHAUSTED = /virtual memory exhausted|out of memory|Cannot allocate memory|memory exhausted/i;

function failure(run: Exec, fallback: "compile_error" | "link_error"): BuildResult["status"] {
  if (run.timedOut) return "time_limit_exceeded";
  if (run.outputTruncated || RESOURCE_EXHAUSTED.test(run.stderr + run.stdout)) return "output_limit_exceeded";
  return fallback;
}

/**
 * Compile each source and link the program under `dir` (a fresh directory). The compiler and linker
 * run as the run's own uid under the seccomp filter, with one shared time budget.
 */
export async function buildProgram(
  files: ExplainRequest["files"],
  optLevel: "O0" | "Og",
  dir: string,
  uid?: number,
  opts: { linkScript?: string } = {},
): Promise<BuildResult> {
  const src = path.join(dir, "src");
  const out = path.join(dir, "out");
  await mkdir(src);
  await mkdir(out);
  await writeFiles(files, src, uid, dir);

  const deadline = Date.now() + COMPILE_TIME_LIMIT_MS;
  const step = (command: string[], cwd: string) =>
    exec(uid === undefined ? command : compilerCommand(command, uid, { seccomp: true }), cwd, {
      timeoutMs: Math.max(1, deadline - Date.now()),
      maxOutputBytes: MAX_COMPILER_OUTPUT_BYTES,
      uid,
    });
  const clean = (text: string) => {
    let t = scrub(scrub(text, src), dir);
    // The linker names objects by file; show the student's file instead of our numbered object.
    sources.forEach((s, i) => (t = t.split(`out/${i}.o`).join(s.replace(/^\.\//, ""))));
    return t.length > MAX_COMPILE_OUTPUT_CHARS ? t.slice(0, MAX_COMPILE_OUTPUT_CHARS) + "\n[output truncated]\n" : t;
  };

  const sources = files.map((f) => f.path).filter((p) => p.endsWith(".c"));
  let output = "";
  let failed: BuildResult["status"] | undefined;
  for (const [i, file] of sources.entries()) {
    const compile = [
      GCC, ...TARGET, `-${optLevel}`, "-g", "-ffreestanding", "-fno-pic", "-static", "-nostdlib",
      "-isystem", path.join(RUNTIME_SOURCES, "include"),
      `-ffile-prefix-map=${src}=.`, `-ffile-prefix-map=${dir}=.`,
      "-c", "./" + path.normalize(file), "-o", path.join(out, `${i}.o`),
    ];
    const run = await step(compile, src);
    output += run.stdout + run.stderr;
    if (run.exitCode !== 0 || run.timedOut) {
      failed = failure(run, "compile_error");
      if (failed !== "compile_error") break; // a limit was hit: there is no point in compiling on
    }
  }
  if (failed) return { status: failed, output: clean(output) };

  const elf = path.join(out, "prog.elf");
  const link = [
    GCC, ...TARGET, "-static", "-nostdlib", "-T", opts.linkScript ?? path.join(RUNTIME_SOURCES, "link.ld"),
    "-Wl,--no-warn-rwx-segments", "-Wl,--build-id=none", "-o", elf,
    path.join(RUNTIME_OBJECTS, "crt0.o"),
    ...sources.map((_, i) => path.join(out, `${i}.o`)),
    path.join(RUNTIME_OBJECTS, "libruntime.o"), "-lgcc",
  ];
  const linked = await step(link, src);
  output += linked.stdout + linked.stderr;
  if (linked.exitCode !== 0 || linked.timedOut) return { status: failure(linked, "link_error"), output: clean(output) };
  return { status: "ok", output: clean(output), elf };
}

export async function explainProject(request: ExplainRequest, uid?: number): Promise<ExplainResponse> {
  const { files, optLevel } = validateExplain(request);
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "sierrendipity-")));
  try {
    const built = await buildProgram(files, optLevel, dir, uid);
    if (built.status !== "ok") return { status: built.status, compileOutput: built.output };
    return await describe(built.elf!, built.output, files.map((f) => f.path));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    console.error(error);
    return { status: "internal_error", compileOutput: "" };
  } finally {
    await cleanUpRun(dir, uid);
  }
}

const tooBig = (compileOutput: string): ExplainResponse => ({ status: "output_limit_exceeded", compileOutput });

/** Turn the linked ELF into the program image, the instruction list and the line map. */
async function describe(elfPath: string, compileOutput: string, studentPaths: string[]): Promise<ExplainResponse> {
  const info = await lstat(elfPath);
  if (!info.isFile() || info.size > MAX_ELF_BYTES) return tooBig(compileOutput);
  let elf: Elf;
  try {
    elf = parseElf(await readFile(elfPath));
  } catch (error) {
    if (!(error instanceof ElfError)) throw error;
    console.error(error);
    return { status: "internal_error", compileOutput };
  }

  const loadAddress = Math.min(...elf.segments.map((s) => s.paddr));
  const imageEnd = Math.max(...elf.segments.map((s) => s.paddr + s.filesz));
  if (!elf.segments.length || imageEnd - loadAddress > MAX_IMAGE_BYTES) return tooBig(compileOutput);
  const image = Buffer.alloc(imageEnd - loadAddress);
  for (const s of elf.segments) elf.buf.copy(image, s.paddr - loadAddress, s.offset, s.offset + s.filesz);

  const stackTop = elf.symbols.get("__stack_top");
  const memorySize = elf.symbols.get("__memory_size");
  const userStart = elf.symbols.get("__user_text_start");
  const userEnd = elf.symbols.get("__user_text_end");
  if (stackTop === undefined || memorySize === undefined || userStart === undefined || userEnd === undefined) {
    console.error("the linked program lacks the runtime's symbols");
    return { status: "internal_error", compileOutput };
  }

  // Only code the function symbols cover is listed: alignment padding between functions is not an
  // instruction anyone wrote.
  let total = 0;
  for (const f of elf.functions) total += Math.floor(f.size / 4);
  if (total > MAX_INSTRUCTIONS) return tooBig(compileOutput);

  const submitted = new Map(studentPaths.map((p) => [normalizePath(p), p]));
  let sequences: Sequence[] = [];
  const lineSection = elf.section(".debug_line");
  if (lineSection) {
    try {
      sequences = parseLineTable(lineSection, elf.section(".debug_line_str"));
    } catch (error) {
      if (!(error instanceof ElfError)) throw error;
      console.error("unreadable line table:", error.message); // the program still runs; only the mapping is lost
    }
  }

  const instructions: ExplainInstruction[] = [];
  const lineMap: Record<string, number[]> = {};
  for (const f of elf.functions) {
    for (let addr = f.addr; addr + 4 <= f.addr + f.size; addr += 4) {
      const offset = addr - loadAddress;
      if (offset < 0 || offset + 4 > image.length) break;
      const index = instructions.length;
      const origin = addr >= userStart && addr < userEnd ? "user" : "runtime";
      const instruction: ExplainInstruction = { index, addr, word: image.readUInt32LE(offset), origin, function: f.name };
      // Rows with line 0 mean "no source line" and rows for files that are not the student's own
      // (the runtime's headers) are left unmapped.
      const row = origin === "user" ? rowAt(sequences, addr) : undefined;
      const file = row && row.line > 0 ? submitted.get(normalizePath(row.file)) : undefined;
      if (row && file !== undefined) {
        instruction.src = { path: file, line: row.line, column: row.column };
        (lineMap[`${file}:${row.line}`] ??= []).push(index);
      }
      instructions.push(instruction);
    }
  }

  const response: ExplainResponse = {
    status: "ok",
    compileOutput,
    program: { image: image.toString("base64"), loadAddress, entry: elf.entry, stackTop, memorySize },
    instructions,
    lineMap,
  };
  return JSON.stringify(response).length > MAX_RESPONSE_BYTES ? tooBig(compileOutput) : response;
}

function normalizePath(p: string): string {
  return path.posix.normalize(p.replaceAll("\\", "/")).replace(/^\.\//, "");
}
