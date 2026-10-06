import { lstat, mkdir, mkdtemp, readdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ElfError, ElfLimitError, indexSequences, parseElf, parseLineTable, rowAt, type Elf, type Sequence } from "./elf.ts";
import { cleanUpRun, exec, RequestError, RUSTC, scrub, validate, writeFiles, type Exec } from "./run-project.ts";
import { demangleRust, parseRustSymbol } from "./rust-demangle.ts";
import { friendlyRustErrors } from "./rust-errors.ts";
import { compilerCommand } from "./sandbox.ts";

export interface ExplainRequest {
  language: "c" | "rust";
  files: { path: string; content: string }[];
  optLevel?: "O0" | "Og";
  /** Rust only: keep the overflow and bounds checks (default false: the beginner-level output is cleaner). */
  checks?: boolean;
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
// Wall-clock budget for parsing and mapping the ELF, which runs on the server's own thread.
const ANALYSIS_BUDGET_MS = 3000;
const MAX_PATH_CHARS = 200;

// crt0.o and libruntime.o are built from runner/riscv when the image is built (see the Dockerfile).
const RUNTIME_SOURCES = path.join(__dirname, "..", "riscv");
const RUNTIME_OBJECTS = process.env.RISCV_RUNTIME_DIR ?? "/opt/riscv-runtime";
// libstd.rlib is the `sier` crate (runner/riscv/rust/sier), built once when the image is built; the
// student's crate is compiled against it as `std`.
const SIER_DIR = process.env.SIER_DIR ?? path.join(RUNTIME_OBJECTS, "rust");
const RUST_TARGET = "riscv32im-unknown-none-elf";
// rustc is much slower than gcc on the small task.
const RUST_COMPILE_TIME_LIMIT_MS = 30_000;
const GCC = "riscv64-unknown-elf-gcc";
const LD = "riscv64-unknown-elf-ld";
const TARGET = ["-march=rv32im", "-mabi=ilp32"];

export function validateExplain(request: ExplainRequest): {
  language: "c" | "rust";
  files: ExplainRequest["files"];
  optLevel: "O0" | "Og";
  checks: boolean;
} {
  const language = request?.language;
  if (language !== "c" && language !== "rust") throw new RequestError("only C and Rust are supported");
  validate({ language, files: request.files }); // shape and path checks shared with /run
  const optLevel = request.optLevel ?? "O0";
  if (optLevel !== "O0" && optLevel !== "Og") throw new RequestError("optLevel must be O0 or Og");
  if (request.checks !== undefined && typeof request.checks !== "boolean") throw new RequestError("checks must be true or false");
  for (const file of request.files) {
    if (file.path.length > MAX_PATH_CHARS) throw new RequestError(`path too long: ${file.path.slice(0, 40)}...`);
    if (language === "c" && !file.path.endsWith(".c") && !file.path.endsWith(".h")) {
      throw new RequestError(`only .c and .h files are accepted: ${file.path}`);
    }
    if (language === "rust" && !file.path.endsWith(".rs")) throw new RequestError(`only .rs files are accepted: ${file.path}`);
  }
  if (language === "c" && !request.files.some((f) => f.path.endsWith(".c"))) throw new RequestError("no .c files");
  if (language === "rust" && !request.files.some((f) => f.path === "main.rs")) throw new RequestError("no main.rs");
  return { language, files: request.files, optLevel, checks: request.checks ?? false };
}

export interface BuildResult {
  status: "ok" | "compile_error" | "link_error" | "time_limit_exceeded" | "output_limit_exceeded";
  output: string;
  /** The linked ELF, when status is ok. */
  elf?: string;
}

// The compiler ran out of memory or address space on something endless (an #include of /dev/zero ...).
// Also a program that does not fit the 1 MiB RAM region (the linker's own wording), or a file too big.
const RESOURCE_EXHAUSTED =
  /virtual memory exhausted|out of memory|memory allocation of \d+ bytes failed|Cannot allocate memory|memory exhausted|cannot move location counter backwards|region `?\w+'? overflowed|program too large|File size limit exceeded/i;

function failure(run: Exec, fallback: "compile_error" | "link_error"): BuildResult["status"] {
  if (run.timedOut) return "time_limit_exceeded";
  if (run.outputTruncated || run.signal === "SIGXFSZ" || RESOURCE_EXHAUSTED.test(run.stderr + run.stdout)) return "output_limit_exceeded";
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
    // Sources are compiled as ./name (so a file called -v.c is not an option); show them as name.
    t = t.replace(/(^|[\s'"`(])\.\/(?=[\w.-])/g, "$1");
    // With -pipe gcc keeps no temporary files, but the driver may still name one.
    t = t.replace(/\/(?:var\/)?tmp\/\S+/g, "<temporary file>");
    // The linker names objects by file; show the student's file instead of our numbered object.
    sources.forEach((s, i) => (t = t.split(`out/${i}.o`).join(s.replace(/^\.\//, ""))));
    return t.length > MAX_COMPILE_OUTPUT_CHARS ? t.slice(0, MAX_COMPILE_OUTPUT_CHARS) + "\n[output truncated]\n" : t;
  };

  const sources = files.map((f) => f.path).filter((p) => p.endsWith(".c"));
  let output = "";
  let failed: BuildResult["status"] | undefined;
  for (const [i, file] of sources.entries()) {
    const compile = [
      GCC, ...TARGET, `-${optLevel}`, "-g", "-ffreestanding", "-fno-pic", "-static", "-nostdlib", "-pipe",
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
    // gc-sections drops the runtime functions the program does not call, so the list shows only what runs.
    "-Wl,--no-warn-rwx-segments", "-Wl,--build-id=none", "-Wl,--gc-sections", "-o", elf,
    path.join(RUNTIME_OBJECTS, "crt0.o"),
    ...sources.map((_, i) => path.join(out, `${i}.o`)),
    path.join(RUNTIME_OBJECTS, "libruntime.o"), "-lgcc",
  ];
  const linked = await step(link, src);
  output += linked.stdout + linked.stderr;
  if (linked.exitCode !== 0 || linked.timedOut) return { status: failure(linked, "link_error"), output: clean(output) };
  return { status: "ok", output: clean(output), elf };
}

/**
 * Compile the student's Rust crate (`main.rs` is the root; `mod` pulls in the other files) against the
 * precompiled `sier` crate, which plays `std`. The same sandbox, link script and crt0 as C; fixed flags only.
 * The build is bare metal: `-C panic=abort`, no unwinding, no libc.
 */
export async function buildRust(
  files: ExplainRequest["files"],
  optLevel: "O0" | "Og",
  checks: boolean,
  dir: string,
  uid?: number,
  opts: { linkScript?: string } = {},
): Promise<BuildResult> {
  const src = path.join(dir, "src");
  const out = path.join(dir, "out");
  await mkdir(src);
  await mkdir(out);
  await writeFiles(files, src, uid, dir);
  const object = path.join(out, "main.o");
  const elf = path.join(out, "prog.elf");

  const deadline = Date.now() + RUST_COMPILE_TIME_LIMIT_MS;
  const step = (command: string[]) =>
    exec(uid === undefined ? command : compilerCommand(command, uid, { seccomp: true }), src, {
      timeoutMs: Math.max(1, deadline - Date.now()),
      maxOutputBytes: MAX_COMPILER_OUTPUT_BYTES,
      uid,
    });
  const clean = (text: string, rust: boolean) => {
    let t = scrub(scrub(text, src), dir);
    t = t.replace(/(^|[\s'"`(])\.\/(?=[\w.-])/g, "$1").replace(/\/(?:var\/)?tmp\/\S+/g, "<temporary file>");
    // The linker names our object file; show the student's crate root. Symbols read as Rust paths.
    t = t.split("out/main.o").join("main.rs").replace(/_R[A-Za-z0-9_]+/g, (symbol) => demangleRust(symbol));
    if (rust) t = friendlyRustErrors(t);
    return t.length > MAX_COMPILE_OUTPUT_CHARS ? t.slice(0, MAX_COMPILE_OUTPUT_CHARS) + "\n[output truncated]\n" : t;
  };

  // rustc stops at the object file: its own linker step spawns rust-lld through a socketpair, which the
  // sandbox's seccomp filter denies. The same GNU linker, link script and crt0 as C do the link.
  const compile = [
    RUSTC, "--edition", "2021", "--target", RUST_TARGET, "--crate-type", "bin", "--crate-name", "main",
    "-C", `opt-level=${optLevel === "O0" ? 0 : 1}`, "-C", "debuginfo=2", "-C", "panic=abort",
    "-C", "relocation-model=static", "-C", `overflow-checks=${checks ? "on" : "off"}`, "-C", "codegen-units=1",
    `--remap-path-prefix=${src}=.`, `--remap-path-prefix=${dir}=.`,
    "-L", SIER_DIR, "--extern", `std=${path.join(SIER_DIR, "libstd.rlib")}`,
    "--color", "never", "--error-format=human", "--emit=obj", "-o", object, "main.rs",
  ];
  const compiled = await step(compile);
  if (compiled.exitCode !== 0 || compiled.timedOut) {
    return { status: failure(compiled, "compile_error"), output: clean(compiled.stdout + compiled.stderr, true) };
  }

  // The runtime crates: sier (as std), then the prebuilt alloc, core and compiler_builtins of the target.
  const libs = [path.join(SIER_DIR, "libstd.rlib"), ...(await sysrootRlibs())];
  const link = [
    LD, "-m", "elf32lriscv", "-T", opts.linkScript ?? path.join(RUNTIME_SOURCES, "link.ld"),
    "--gc-sections", "--build-id=none", "--no-warn-rwx-segments", "-o", elf,
    path.join(RUNTIME_OBJECTS, "crt0.o"), object, ...libs,
  ];
  const linked = await step(link);
  const output = clean(compiled.stdout + compiled.stderr + linked.stdout + linked.stderr, true);
  if (linked.exitCode !== 0 || linked.timedOut) return { status: failure(linked, "link_error"), output };
  return { status: "ok", output, elf };
}

let rlibs: Promise<string[]> | undefined;
/** alloc, core and compiler_builtins of the pinned toolchain (their file names carry a hash). */
function sysrootRlibs(): Promise<string[]> {
  rlibs ??= (async () => {
    const dir = process.env.RUST_TARGET_LIB ?? path.join(path.dirname(RUSTC), "..", "lib", "rustlib", RUST_TARGET, "lib");
    const names = await readdir(dir);
    return ["liballoc-", "libcore-", "libcompiler_builtins-"].map((prefix) => {
      const found = names.find((n) => n.startsWith(prefix) && n.endsWith(".rlib"));
      if (!found) throw new Error(`no ${prefix}*.rlib in ${dir}`);
      return path.join(dir, found);
    });
  })();
  return rlibs;
}

export async function explainProject(request: ExplainRequest, uid?: number): Promise<ExplainResponse> {
  const { language, files, optLevel, checks } = validateExplain(request);
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "sierrendipity-")));
  try {
    const built =
      language === "rust" ? await buildRust(files, optLevel, checks, dir, uid) : await buildProgram(files, optLevel, dir, uid);
    if (built.status !== "ok") return { status: built.status, compileOutput: built.output };
    return await describe(built.elf!, built.output, files.map((f) => f.path), language);
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
async function describe(
  elfPath: string,
  compileOutput: string,
  studentPaths: string[],
  language: "c" | "rust" = "c",
): Promise<ExplainResponse> {
  const deadline = Date.now() + ANALYSIS_BUDGET_MS;
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
  // Rust is classified by symbol (the student's crate is `main`), so it does not need the C text markers.
  if (stackTop === undefined || memorySize === undefined || (language === "c" && (userStart === undefined || userEnd === undefined))) {
    console.error("the linked program lacks the runtime's symbols");
    return { status: "internal_error", compileOutput };
  }

  // Only code that function symbols cover is listed: alignment padding between functions is not an
  // instruction anyone wrote. Symbols outside .text (data) or at unaligned addresses are not code. Aliases
  // share an address, so one symbol is kept per address (global first), and each function ends where the
  // next begins: addresses are unique and ascending.
  const text = elf.text;
  if (!text) {
    console.error("the linked program has no .text");
    return { status: "internal_error", compileOutput };
  }
  const textEnd = text.addr + text.size;
  const candidates = elf.functions
    .filter((f) => f.addr % 4 === 0 && f.addr >= text.addr && f.addr < textEnd)
    .sort((a, b) => a.addr - b.addr || Number(b.global) - Number(a.global));
  const listed: { name: string; addr: number; end: number }[] = [];
  for (const f of candidates) {
    const previous = listed[listed.length - 1];
    if (previous && previous.addr === f.addr) continue;
    if (previous) previous.end = Math.min(previous.end, f.addr);
    listed.push({ name: f.name, addr: f.addr, end: Math.min(f.addr + f.size, textEnd) });
  }
  let total = 0;
  for (const f of listed) total += Math.floor((f.end - f.addr) / 4);
  if (total > MAX_INSTRUCTIONS) return tooBig(compileOutput);

  const submitted = new Map(studentPaths.map((p) => [normalizePath(p), p]));
  let sequences: Sequence[] = [];
  const lineSection = elf.section(".debug_line");
  if (lineSection) {
    try {
      sequences = indexSequences(parseLineTable(lineSection, elf.section(".debug_line_str"), deadline));
    } catch (error) {
      if (error instanceof ElfLimitError) return tooBig(compileOutput);
      if (!(error instanceof ElfError)) throw error;
      console.error("unreadable line table:", error.message); // the program still runs; only the mapping is lost
    }
  }

  const instructions: ExplainInstruction[] = [];
  const lineMap: Record<string, number[]> = {};
  for (const f of listed) {
    if (Date.now() > deadline) return tooBig(compileOutput);
    // Rust: the name is demangled, and the code is the student's when the item is defined in the crate `main`.
    // Symbols that are not mangled (`#[no_mangle]`, compiler_builtins, the C entry `main`) are the student's
    // only when the debug line table puts their first instruction in one of the student's files.
    const rust = language === "rust" ? parseRustSymbol(f.name) : undefined;
    const functionName = rust?.name ?? (f.name.length > 200 ? f.name.slice(0, 200) + "..." : f.name);
    let rustOrigin: "user" | "runtime" = "runtime";
    if (language === "rust") {
      if (rust) rustOrigin = rust.crate === "main" ? "user" : "runtime";
      else if (f.name !== "main" && f.name !== "_start") {
        const first = rowAt(sequences, f.addr);
        rustOrigin = first && first.line > 0 && submitted.has(normalizePath(first.file)) ? "user" : "runtime";
      }
    }
    for (let addr = f.addr; addr + 4 <= f.end; addr += 4) {
      const offset = addr - loadAddress;
      if (offset < 0 || offset + 4 > image.length) break;
      const index = instructions.length;
      const origin = language === "rust" ? rustOrigin : addr >= userStart! && addr < userEnd! ? "user" : "runtime";
      const instruction: ExplainInstruction = { index, addr, word: image.readUInt32LE(offset), origin, function: functionName };
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
