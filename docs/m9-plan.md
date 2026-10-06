# M9 plan: Compilation Explorer, RV32 emulator, machine code to Rust

Summary of the detailed plan and an outside review (2026-10-06). The Kanbus epic is SIE-fbf66b.

## Decisions

- ISA: RISC-V RV32IM, built `-march=rv32im -mabi=ilp32` (fixed 32-bit instructions, no compressed).
- The same instructions at every level: hand-written machine code, hand-written assembly, and what the compiler emits for C at `-O0`.
- Explorer: source lines, assembly, machine-code bytes, and the bit fields of each instruction, with linked highlighting. Two adjacent levels by default; the bit card on demand.
- Emulator: our own RV32IM in TypeScript, running in the browser (stepping, step back, registers, memory, breakpoints). Linux-style `ecall` ABI: a7=93 exit, 64 write, 63 read.
- Compile-and-show runs on the runner (`POST /explain`); machine code and assembly lessons need no backend.
- Judged practice runs stay on the native Python, C and C++ toolchains.

## Facts verified in a Debian 12 arm64 container

- GCC cross toolchain (`gcc-riscv64-linux-gnu`) is about +115 MB; with C++ headers about +220 MB; Clang about +426 MB; Rust (rustup, riscv32 target) about +590 MB.
- Debian's `libgcc` has no rv32 build with the linux-gnu cross compiler, so 64-bit division helpers are needed there; `gcc-riscv64-unknown-elf` (189 MB) ships an rv32 libgcc. `picolibc` is about 1 GB, so we write a tiny libc.
- Linker relaxation shrinks `call` (auipc+jalr) to one `jal`, so line mapping must come from the linked ELF's DWARF, not from `-S` output. `-g` is required.
- `readelf --debug-dump=decodedline` has no column; `rawline` does.
- Compile-time file reads (`#include`, `.incbin`, `include_str!`) work, but only for files the compile uid can already read; infinite files must be capped.
- Native gcc and g++ compile fine under the existing seccomp filter.
- At `-O0` the compiler emits instructions beyond the lesson list (`lbu`, `sb`, `divu`, `mulhu`, `rem`, libgcc calls for `double`), so the lesson subset must be derived from a corpus of real curriculum programs.

## Sub-epics (dependency order)

1. ISA core: decode and encode tables, bit fields, objdump differential test.
2. Emulator: riscv-tests (rv32ui, rv32um) and a qemu differential test.
3. Lesson assembler and editor languages (Monarch tokenizers, hover docs, error markers); tested against GNU `as`.
4. Machine-code and assembly lessons UI: registers, memory, bit card, stepping.
5. `/explain` for C and C++ (C++ is compile-and-show only); blocking security review.
6. Compilation Explorer view: ELF and DWARF line parsing in TypeScript, linked panes.
7. Run compiled C in the emulator with a tiny freestanding libc.
8. Rust on RV32 (`no_std`, `rustc --emit`, safety-check toggle).
9. Native Rust as a fourth practice language (later).
10. Lessons on the M7 framework: emulator checks (registers, memory, output, step limits, instruction whitelist).

## Risks

- Image growth and cold start (measure before adding Rust).
- DWARF edge cases: DWARF 4 and 5, line 0, `is_stmt` false; differential-test against `readelf`.
- Emulator bugs teach wrong things: riscv-tests and qemu are blocking checkpoints.
- Rust output is noisy at `-O0` (iterators, overflow checks); collapse core-library rows and offer a safety-check toggle.
- Scope: C++ explorer is show-only; Rust and native Rust are later.

## Cost

The browser emulator and assembler cost nothing server-side. `/explain` compiles take 10-500 ms on the existing task. A larger image costs seconds of cold start and cents of ECR storage; keep retained image versions bounded.
