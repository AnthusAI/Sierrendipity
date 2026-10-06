# `POST /explain` (Compilation Explorer server side)

The runner compiles a student's C project for RISC-V bare metal and returns a flat program image for
the browser emulator plus the instruction list with the source-line mapping. Decoding words into
mnemonics and bit fields happens in the browser; the server returns raw 32-bit words.

## Contract

```ts
interface ExplainRequest { language: "c"; files: { path: string; content: string }[]; optLevel?: "O0" | "Og" } // default O0
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
- 400: language other than `"c"`; `optLevel` other than `"O0"`/`"Og"` (including non-strings); any file
  whose extension is not exactly `.c` or `.h` (`.S`, `.s`, `.ld`, `.cpp`, `.C`, no extension are refused);
  no `.c` file; unsafe or conflicting paths (same checks as `/run`). No compiler flags can be supplied.
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
