# `POST /explain` (Compilation Explorer server side)

The runner compiles a student's C or Rust project (Rust: see the last section) for RISC-V bare metal and returns a flat program image for
the browser emulator plus the instruction list with the source-line mapping. Decoding words into
mnemonics and bit fields happens in the browser; the server returns raw 32-bit words.

## Contract

```ts
interface ExplainRequest { language: "c" | "rust"; files: { path: string; content: string }[]; optLevel?: "O0" | "Og"; // default O0
                           checks?: boolean } // Rust only, default false (see "Rust" below)
interface ExplainResponse {
  status: "ok" | "compile_error" | "link_error" | "time_limit_exceeded" | "output_limit_exceeded" | "internal_error";
  compileOutput: string;
  program?: { image: string /* base64 */; loadAddress: number; entry: number; stackTop: number; memorySize: number };
  instructions?: { index: number; addr: number; word: number; origin: "user" | "runtime"; function: string;
                   src?: { path: string; line: number; column: number } }[];
  lineMap?: Record<string, number[]>; // "main.c:3" -> indexes into instructions (user code only, ascending)
}
```

- Same auth (`x-runner-secret`), concurrency cap (429) and error mapping as `POST /run`: 400 for a bad
  request, 413 above 5 MB. Through the proxy it is whitelisted as `POST /explain` only.
- 400: language other than `"c"`/`"rust"`; `optLevel` other than `"O0"`/`"Og"` (including non-strings);
  `checks` that is present and not a boolean (including `null`); for C any file whose extension is not
  exactly `.c` or `.h` (`.S`, `.s`, `.ld`, `.cpp`, `.C`, no extension are refused) and no `.c` file; for Rust
  any file that is not exactly `.rs` and no `main.rs`; unsafe or conflicting paths (same checks as `/run`).
  No compiler flags can be supplied.
- `compileOutput` carries compiler and linker messages with temp paths scrubbed (`main.c:2:11: error:`).
  It is also filled on `ok` (warnings). On `ok`, `program`, `instructions` and `lineMap` are present;
  otherwise they are absent.
- Limits: the image is at most 1 MiB (the linker's RAM region, which also bounds the program), at most
  20 000 instructions, the response JSON at most 4 MB; beyond that the status is `output_limit_exceeded`.
  Compile and link share a 10 s budget (`time_limit_exceeded`). Compiler output beyond 1 MB, more than
  200 MB of files, or the compiler running out of memory (for example `#include "/dev/zero"`) is
  `output_limit_exceeded`.
- Hardening of the ELF analysis (it runs on the server's thread, on student-controlled bytes): the
  line table may have at most 10 000 sequences and 500 000 rows, and parsing plus mapping share a 3 s
  wall-clock budget; exceeding any of them is `output_limit_exceeded` (the line map is not silently
  dropped). Lookups are binary searches. A program that does not fit the 1 MiB RAM region (linker
  "region overflowed" / "cannot move location counter backwards") or hits a file size limit is
  `output_limit_exceeded`. File paths longer than 200 characters are a 400.

## Toolchain and flags

Debian `gcc-riscv64-unknown-elf` 12.2 and `binutils-riscv64-unknown-elf` 2.40 in the runtime image
(rv32 libgcc included, so 64-bit division and soft-float helpers link). Fixed flags, per source file:

```
riscv64-unknown-elf-gcc -march=rv32im -mabi=ilp32 -O0|-Og -g -ffreestanding -fno-pic -static -nostdlib -pipe \
  -isystem runner/riscv/include -ffile-prefix-map=<tmp>=. -c ./main.c -o out/N.o
riscv64-unknown-elf-gcc -march=rv32im -mabi=ilp32 -static -nostdlib -T runner/riscv/link.ld \
  -Wl,--no-warn-rwx-segments -Wl,--build-id=none -Wl,--gc-sections \
  crt0.o out/*.o libruntime.o -lgcc
```

No compressed instructions: every instruction is 32 bits. Both steps run through the runner's per-run uid
sandbox helpers (`compilerCommand` in `sandbox.ts`, now with an option to keep the seccomp filter on)
under the seccomp filter: the riscv toolchain works under it unchanged. The compiler can read only what
that uid can read (`#include "/etc/..."` works for world-readable files, which is accepted).

## Runtime (`runner/riscv/`)

- `crt0.S`: sets `sp` from `__stack_top`, zeroes `.bss`, calls `main`, then `ecall` exit (a7=93) with
  main's return value. It is the entry point (address 0).
- `link.ld`: one flat 1 MiB RAM region at 0: `crt0` first, then the student's `.text`
  (`__user_text_start`..`__user_text_end`), then runtime and libgcc code, `.rodata`, `.data`, `.bss`,
  heap, and a 64 KiB stack at the top. Exports `__stack_top` (1048576) and `__memory_size`. Memory is
  little-endian and flat; `.bss` and the heap are not part of the image (the program zeroes `.bss`).
- `libruntime.c` (built once at image build time with `-O1` into `/opt/riscv-runtime`) and `include/`:
  `stdio.h` (`putchar getchar puts printf scanf fflush`), `stdlib.h` (`exit abs atoi malloc free`),
  `string.h` (`strlen strcmp strcpy memcpy memset memcmp`). I/O uses the ecall ABI: a7=93 exit(a0),
  a7=64 write(a0=fd,a1=buf,a2=len), a7=63 read(a0=fd,a1=buf,a2=len).
  - `printf`: `%d %i %u %x %X %c %s %%` with `-` and `0` flags and a width; `l` modifiers are ignored.
  - `scanf`: `%d`, `%c`, `%s` (optional width), whitespace in the format; returns the number of
    conversions, or `EOF` if input ended first.
  - `malloc` is a bump allocator (16-byte aligned) that never frees and returns `NULL` when the heap
    (between `.bss` and the stack) is exhausted.
  - Floating point: float and double programs compile (libgcc soft-float) but printing them is
    unsupported (no `%f`).

## Mapping (from the linked ELF, never from `-S`)

Linker relaxation shrinks `call` (auipc+jalr) to `jal`, so everything is derived from the linked ELF
with a small bounds-checked parser in `runner/src/elf.ts` (no objdump or readelf subprocess):

- ELF32: the `PT_LOAD` segments with file bytes give the image (copied to their physical addresses,
  starting at `loadAddress`, the lowest one); `e_entry` is `entry`; `__stack_top` and `__memory_size`
  come from the symbol table.
- Instructions: every `STT_FUNC` symbol with a size contributes its 4-byte words, in address order;
  alignment padding between functions is not listed. Symbols outside `.text` or at unaligned addresses are ignored; aliases share an address, so one symbol is kept per address (global first) and each function is clipped at the next one, making `addr` unique and ascending. `function` is the symbol name. `origin` is `user`
  when the address lies between `__user_text_start` and `__user_text_end` (the student's objects), else
  `runtime` (crt0, libruntime, libgcc). Unused runtime functions are removed by `--gc-sections`.
- Source lines: the DWARF line table (`.debug_line`, versions 2-5, gcc 12 emits 5) is parsed directly,
  with file and directory entries from `.debug_line_str`. The row covering an address is the last row
  at the greatest row address not above it; among rows at one address a statement row (`is_stmt`) is
  preferred, otherwise the last row is used. Columns come from the rows (`readelf --debug-dump=decodedline`
  has none). Line 0 means "no source line" and leaves the instruction without `src`, as do rows for files
  that are not the student's (runtime headers) and all runtime instructions.
- Paths: directory plus file name, normalized (`./main.c` becomes `main.c`) and matched against the
  submitted paths; `src.path` and the `lineMap` keys use the student's own relative path.
- `lineMap` keys are `"path:line"`; values are ascending indexes into `instructions`, user code only.
  A line can map to several non-contiguous groups (a `for` loop's init, body, increment and condition).
- A malformed line table (only possible via hostile inline asm) is logged and the mapping is left empty;
  the program is still returned.

## Deviations from the brief

- The image comes from the loadable segments rather than `objcopy -O binary`; the bytes are the same.
- `.incbin "/dev/zero"` and `"/dev/urandom"` in inline asm are refused by the assembler quickly
  (`unable to include`: not a regular file), so they end as `compile_error`, not a limit status.
  `#include "/dev/zero"` runs the compiler out of memory and ends as `output_limit_exceeded`.
- The 10 s compile budget and the other limits are constants (no `limits` field).

## Tests

Specs live in `features/runner/explain.feature` (toolchain scenarios are `@linux-only`; run
`npm run test:linux` in the runner image) and the proxy whitelist in `features/cloud/proxy.feature`.
The runnable-image specs use `qemu-riscv32` (qemu-user, installed only in the Dockerfile's `test`
stage). qemu-user cannot map guest address 0, so those specs re-link the same objects with the RAM
region at 0x10000 (using the same compile and link steps) and run that ELF; the returned image itself
is checked against `objdump -d` and by its first words and header values rather than executed.

## Rust (`language: "rust"`)

The student writes ordinary Rust: `fn main()` in `main.rs`, `use std::io;`, `println!`, `String`, `Vec`,
`Box`, `format!`, `std::process::exit`, `mod foo;` files. The response has the same shape as for C.

### How `std` is provided (the `sier` crate)

`runner/riscv/rust/sier/lib.rs` is a `#![no_std]` crate over `core` and `alloc`, built once when the image is
built (Dockerfile; `RUSTC_BOOTSTRAP=1` for that one command only, for the `start` and `termination` lang items
and `rustc_std_internal_symbol`) into `/opt/riscv-runtime/rust/libstd.rlib` (about 250 KB). Its crate name is
`std`. The student's crate is compiled with `--extern std=libstd.rlib`: the compiler's implicit `extern crate
std` and `use std::prelude::rust_2021::*` resolve to it, so `use std::io::{self, BufRead}`,
`std::process::exit(7)` and `std::collections::BTreeMap::new()` resolve natively, in every module, with no
source rewriting. This replaced the first design (a generated wrapper crate root with a compatibility `std`
module): it needs no `#[path]` or `include!` tricks, the student's `main.rs` stays the crate root (so `mod foo;`
resolves next to it and messages carry the student's own `main.rs:2:18`), and symbols read `main::sum_to`
rather than `main::student::sum_to`. Measured on rustc 1.99: the compiler no longer injects `#[macro_use]
extern crate std`, so the macros are re-exported from the prelude module; `-C symbol-mangling-version=legacy`
needs `-Z unstable-options`, so symbols are v0.

- `print!`, `println!`, `eprint!`, `eprintln!`, `dbg!` write through the ecall ABI (a7=64, fd 1 and 2), unbuffered.
- `String`, `Vec`, `Box`, `Rc`, `format!`, `vec!` and `std::collections::{BTreeMap, BTreeSet, BinaryHeap,
  VecDeque, LinkedList}` come from `alloc` over a bump allocator on the linker script's heap (`__heap_start` to
  `__heap_end`; only the newest block can grow in place or be given back, nothing else is ever reused).
- `io::stdin()` with `read_line`, `lines()` (also on `lock()`), `read_to_string`, and `io::read_to_string`; one read
  ecall per byte (the emulator's `waiting-input` handling applies). `io::stdout()` and `stderr()` with `Write`,
  `flush` (a no-op) and `write!`.
- `process::exit(n)`, `process::ExitCode`, and `main` returning `Result<(), E: Debug>` (prints `Error: ...`, exit 1).
- A panic prints `thread 'main' panicked at main.rs:5:20:` and the message on fd 2 and exits with code 101
  (overflow, bounds, `unwrap` and `expect` messages are rustc's own).
- `f32` and `f64` `sqrt`, `floor`, `ceil`, `round`, `trunc`, `powi` (core has no libm), as a prelude trait.
- Not available: `HashMap` and `HashSet` (no random source), threads, `Mutex`, `Arc` and atomics (riscv32im has
  none), `std::fs`, `net`, `time`, `env`, and `powf`, `sin`, `ln` and the other libm functions. Unsupported `std`
  paths fail in rustc; the runner rewrites those messages (below).

### Pipeline and flags (fixed, none from the student)

```
rustc --edition 2021 --target riscv32im-unknown-none-elf --crate-type bin --crate-name main \
  -C opt-level=<0|1> -C debuginfo=2 -C panic=abort -C relocation-model=static \
  -C overflow-checks=<off|on> -C codegen-units=1 --remap-path-prefix=<tmp>=. \
  -L <sier dir> --extern std=<sier dir>/libstd.rlib --color never --emit=obj -o out/main.o main.rs   (cwd: src)
riscv64-unknown-elf-ld -m elf32lriscv -T runner/riscv/link.ld --gc-sections --build-id=none \
  --no-warn-rwx-segments -o out/prog.elf crt0.o out/main.o libstd.rlib liballoc-*.rlib libcore-*.rlib \
  libcompiler_builtins-*.rlib
```

`optLevel` O0 and Og map to `opt-level` 0 and 1. `checks` false (the default) is `-C overflow-checks=off`: the
beginner view has no overflow branches (a `while` loop at O0 is about as short as in C, and `i += 1` wraps).
`checks` true shows the overflow and bounds machinery on the student's own line, and an overflow panics with
`attempt to add with overflow`. Bounds checks cannot be switched off; a `for` loop at O0 pulls in
`core::iter::range` rows, which are runtime. `-C force-frame-pointers` is not used.

Why rustc does not link (`-C link-arg=-T...` with its bundled rust-lld): that worked unsandboxed, but rustc spawns
the linker through a `socketpair(AF_UNIX, SOCK_SEQPACKET)`, which the sandbox's seccomp filter denies on purpose
(`socket` and `socketpair`). Instead of weakening the filter, rustc stops at the object file (`--emit=obj`) and the
same GNU linker, `link.ld` and `crt0.o` as C do the link, as the same per-run uid under the same filter. The two
allocator-shim symbols rustc would generate at link time (`__rust_no_alloc_shim_is_unstable_v2`,
`__rust_alloc_error_handler`) are therefore defined in `sier`. rustc runs under the same 1.5 GB address-space limit
as before (about 512 MB is needed). Compile and link share a 30 s budget (`time_limit_exceeded`), against C's 10 s.

### Mapping

- DWARF from rustc 1.99 and the GNU linker: line program version 4 (not 5: no `DW_FORM_line_strp`, inline
  strings), one unit per object (the student's crate, `sier`, `core`, `alloc`, `compiler_builtins`: about 10), columns
  present, `is_stmt` toggled. Directory 0 is the compilation directory (`.` after `--remap-path-prefix`),
  `/rustc/<hash>/library/...` is the standard library and `/sier` is `sier`. The existing parser reads it
  unchanged; student files come back as `main.rs`, `util.rs`, `geometry/mod.rs`.
- Functions: symbols are v0 (`_RNvCs..._4main6sum_to`). `runner/src/rust-demangle.ts` turns them into
  `main::sum_to`, `<main::Point as core::fmt::Display>::fmt`, `core::fmt::Formatter::pad`: no hash, no
  disambiguators, generic arguments left out, closures as `{closure#N}`. It is bounds-checked and capped (steps,
  depth, length) and returns the plain symbol for anything it cannot read, because symbol names are
  student-controlled (`#[export_name]`, `global_asm!`). It is also applied to linker messages.
- Origin: `user` when the item is defined in the student's crate (the root crate of the symbol is `main`: its
  functions, impls, closures and generic functions); everything else is `runtime`, including `core`, `alloc`, `std`
  (sier) and `compiler_builtins` code that was instantiated in the student's crate. Symbols that are not mangled
  (`#[no_mangle]`, `memcpy`, the C entry `main`, `_start`) are `user` only if the line table puts their first
  instruction in one of the student's files. `std::lang_start` calls `main::main` through `black_box`, so it stays
  its own function at every optimization level. `lineMap` covers user instructions that have rows in student
  files, as for C. The C text markers (`__user_text_start`) are not used for Rust.

### Errors and limits

Compiler messages have the temp path scrubbed (`main.rs:2:18`, `geometry/mod.rs:1:34`). An error about a `std` path
that `sier` lacks is rewritten, for example `error[E0432]: This is not available in the emulator yet:
std::collections::HashMap`, followed by a note listing what is supported (`runner/src/rust-errors.ts`; E0432,
E0433, E0425, E0412, E0405, E0423 and E0574; the item is cut after the first missing segment, e.g. `std::fs`).
The limits are those of C: image at most 1 MiB, at most 20 000 instructions, response at most 4 MB (an instruction
is about 130 bytes of JSON), the line table caps and the 3 s mapping budget. Finding: 20 000 instructions is tight
for Rust. Hello world is about 1 300, a `BTreeMap` program 13 000, and one that uses `sort`, `u128` and `{:#x}`
25 000 to 32 000 (the formatting and collection code is listed too), and those end as `output_limit_exceeded`.
Raising the cap needs a smaller response encoding (a function-name table).

Hostile input: `include_str!("/etc/hostname")` works (world-readable); `/proc/1/environ` is a compile error (the
uid cannot read it); `include_bytes!`, `include!` and `global_asm!(".incbin ...")` of `/dev/zero` end with a limit
status or `compile_error` and never hang; redefining `_start` is a `link_error` ("multiple definition", pointing at
`main.rs`) and a `#[no_mangle] extern "C" fn main` a `compile_error` (the entry's type must be `Termination`);
a malformed `.debug_line` from `global_asm!` only loses the mapping; unstable features are refused by rustc.

### Timings (0.5 vCPU: cgroup `cpu.max` 50000/100000; per-run uid and seccomp on; arm64)

Hello world 0.3 s, a `for` loop 0.2 to 0.3 s, a `BTreeMap` program 0.45 s, end to end including the mapping.
Image growth from this feature: 250 KB (`libstd.rlib`); the Rust toolchain and the `riscv32im-unknown-none-elf`
target were already in the image.

### Specs

`features/runner/explain-rust.feature` (toolchain scenarios are `@linux-only`; they run the returned image in the
real explorer `Machine`: `npx cucumber-js --profile rust-linux` in the runner image, or all of `npm run
test:linux`), `features/runner/rust-demangle.feature` (no toolchain: `--profile rust`), and the UI in
`features/web/explore-rust.feature` against the mock backend (`--profile web-explore`).
