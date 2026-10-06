# Compilation Explorer library (`@sierrendipity/explorer`)

A pure TypeScript library (no DOM, no Node-only APIs) shared by the browser UI and the specs:
an RV32IM decoder, a small assembler for the lesson subset, and a stepping emulator. It lives in
the `explorer/` npm workspace and exports its TypeScript source directly (no build step):
`import { decode, assemble, Machine } from "@sierrendipity/explorer"`.

## Contract

```ts
// ---- decode (pure)
export type InstrFormat = "R" | "I" | "S" | "B" | "U" | "J";
export interface Field { name: string; hi: number; lo: number; value: number; label: string } // inclusive bit positions; label is human text such as "rd = a0 (x10)" or "imm = -36"
export interface Decoded { word: number; format: InstrFormat; mnemonic: string; operands: string; text: string; fields: Field[] }
export function decode(word: number, opts?: { aliases?: boolean }): Decoded | null; // null when not a valid RV32IM word. aliases=true prints ret/li/mv/j/nop style; default false prints canonical forms. Registers print as ABI names (zero, ra, sp, a0, s0 ...). Fields for immediates in S/B/J/U formats must cover the scattered bit ranges as separate Field entries with a shared name (e.g. two Fields named "imm" for S-type) so the UI can colour them.
export function registerName(n: number): string; // ABI name
// ---- assembler for the lesson subset (instant, in-browser)
export interface AsmError { line: number; column: number; message: string }
export interface AsmResult { words: number[]; listing: { line: number; addr: number; word: number }[]; labels: Record<string, number>; errors: AsmError[] }
export function assemble(source: string, opts?: { base?: number }): AsmResult; // supports the full RV32IM base+M integer instructions, labels, comments (# and //), numeric literals (decimal, 0x, 0b, negative), pseudo-ops li, mv, nop, j, jr, ret, call (as jal ra), `.word N`, `.text` ignored. li of large constants expands to lui+addi with the bit-11 carry fix. Errors carry line/column and clear messages (unknown mnemonic, bad register, immediate out of range, undefined label). Refuse file-reading directives (.incbin, .include) with a clear error.
export function parseMachineCode(text: string): { words: number[]; errors: AsmError[] }; // one or more 32-bit words per line, hex (0x... or bare 8 hex digits) or binary (0b..., underscores/spaces allowed), '#' and '//' comments
// ---- machine (emulator)
export type MachineState = "ready" | "running" | "waiting-input" | "halted" | "faulted";
export interface StepResult { pc: number; word: number; decoded: Decoded | null; changedRegs: number[]; memWrite?: { addr: number; length: number }; state: MachineState }
export interface MachineIO { write(fd: number, bytes: Uint8Array): void; read(fd: number, max: number): Uint8Array | null } // read returns null when no input is available yet: the machine enters "waiting-input" and the ecall is retried on the next step after provideInput
export class Machine {
  constructor(opts?: { memorySize?: number; stackTop?: number; io?: MachineIO }); // default 1 MiB, stackTop = memorySize
  load(image: Uint8Array, loadAddress: number, entry: number): void; reset(): void; // reset re-loads the original image and clears history; sp = stackTop, all other regs 0
  readonly pc: number; readonly regs: Uint32Array; /* 32 entries, x0 always 0 */ readonly state: MachineState; readonly exitCode: number | null; readonly steps: number; readonly fault: string | null;
  readMem(addr: number, length: number): Uint8Array;
  step(): StepResult; run(maxSteps?: number): MachineState; // run stops at a breakpoint, halt, fault, waiting-input or maxSteps (default 1_000_000)
  stepBack(): boolean; // undo the last step using a recorded trace (bounded history, e.g. last 10_000 steps); false if no history
  breakpoints: Set<number>; provideInput(bytes: Uint8Array): void;
}
```

ecall ABI (Linux-like numbers): `a7=93` exit(a0) -> state `halted` with `exitCode`; `a7=64`
write(a0=fd, a1=buf, a2=len) returns len in a0; `a7=63` read(a0=fd, a1=buf, a2=len) returns bytes
read in a0 (0 at EOF after the input is closed; use `io.read` returning null for "not yet"). Any
other a7 -> `faulted` with a clear message. `ebreak` -> `run` returns with state `halted` and
`exitCode` null. Faults (illegal instruction, misaligned or out-of-range access, bad jump) set state
`faulted` with a message including pc. div/rem by zero follow the RISC-V spec (div -> -1, rem ->
dividend, no trap), INT_MIN/-1 -> INT_MIN with rem 0; mulh/mulhsu/mulhu are exact. Little-endian;
lw/sw require 4-byte alignment (fault otherwise), lh/lhu/sh 2-byte, lb/lbu/sb any.

## Behaviour the contract leaves open

Decoder
- `fields` are ordered from bit 31 down to bit 0 and tile all 32 bits. Scattered immediates are
  several `Field`s named `imm` (S: 2, B: 4, J: 4), each with the raw bits of its piece as `value`
  and a label such as `imm = -36 (bits 11:5)`; a whole immediate is `imm = -36`; U is `imm = 0x12345`.
- `fence` (exactly 0x0ff0000f, `fence iorw, iorw`) decodes, assembles and executes as a no-op; other
  MISC-MEM words (`fence.i`, `fence.tso`) are invalid.
- Shift-immediates are I-format with fields `funct7`, `shamt` (not `imm`). Only `ecall` (0x73) and
  `ebreak` (0x100073) are accepted in the SYSTEM opcode.
- Branch and `jal` operands are the relative byte offset as a decimal number (the pc is unknown).
- Aliases: `nop`, `li rd, imm` (addi from zero), `mv rd, rs` (addi with imm 0), `ret`, `jr rs`, `j off`.

Assembler
- Lines end at `\n`, `\r\n`, a lone `\r`, U+2028 or U+2029. A line longer than 4096 characters is an
  error (column 1) and is not scanned; `parseMachineCode` has the same cap. Mnemonics, directives and
  register names are case-insensitive; labels are case-sensitive. A number too big for a double is
  `number is too large`.
- Line and column are 1-based; a program with any error returns empty `words` and `listing`.
- Operands: `rd, rs1, rs2`; `imm(reg)` (offset optional); branch and `jal` targets are a label or a
  plain relative byte offset (so decoder output assembles again); `jal label` means `jal ra, label`;
  `jalr rs` means `jalr ra, 0(rs)`. Registers are ABI names, `x0`..`x31` and `fp`.
- Ignored directives: `.text`, `.globl`, `.global`. `.word` takes one or more numbers.
- `call label` is a single `jal ra, label` (range +-1 MiB), unlike GNU as, which emits auipc+jalr.
- `li` takes -2^31..2^32-1 and emits one word if it fits in 12 bits, else `lui` (+ `addi` unless the
  low 12 bits are zero) with the bit-11 carry fix.

Machine
- `load` validates before changing anything and throws `RangeError`: load address inside memory, image
  fits, entry 4-byte aligned and inside memory. `pc`, `state`, `exitCode`, `steps` and `fault` are
  read-only getters. If `io.read` returns more than asked, the excess is kept for the next read.
- `provideInput(bytes)` queues bytes for `read`; an empty array marks end of input (read then
  returns 0). If `io.read` is supplied it is asked when the queue is empty. While `waiting-input`,
  `step()` and `run()` retry the ecall (so a custom `io.read` is polled); `provideInput` moves the
  state back to `running`. A read with no data does not count as a step.
- Without `io`, `write` output is discarded.
- `exit` and `ebreak` leave `pc` at the halting instruction and count as a step. Faults do not count
  as a step and leave `pc` at the faulting instruction; messages end with `at pc 0x...`.
- `changedRegs` lists registers whose value changed. `memWrite` is set by stores and by `read`.
- `stepBack` undoes registers, memory, pc, state, exit code, fault and the step counter, and puts input
  consumed by a `read` back. Output already passed to `io.write` is not retracted. History keeps
  between 10,000 and 20,000 steps and at most about 16 MiB of saved read data (oldest dropped first).
  Stepping back over a read that had waited leaves the state `running`, and back to step 0 `ready`. `reset()` also clears memory, queued input and history.
- `run()` always executes at least one instruction before checking breakpoints, so a machine stopped
  at a breakpoint can continue. `step()` ignores breakpoints.

## Specs

`npm test` runs `features/explorer/*.feature` without Docker. `npx cucumber-js --profile explorer`
runs only those. Tagged `@docker` and run with `npm run test:docker` (builds
`features/explorer/docker/Dockerfile`, a `debian:bookworm-slim` image with
`binutils-riscv64-unknown-elf` and `gcc-riscv64-unknown-elf`):

- `differential.feature`: a generated corpus of every mnemonic is assembled with
  `riscv64-unknown-elf-as -march=rv32im -mabi=ilp32` and with `assemble`, and the words compared;
  the same words are disassembled with `objdump -d -M no-aliases` and compared with `decode`.
  Normalisations: GNU takes `.+N` where we take the plain offset `N`; objdump prints branch and `jal`
  targets as absolute hex addresses (the words are placed at 0x200000 so they stay positive) and shift
  amounts in hex, ours are relative decimals; spaces after commas are ignored. `call` is not in the
  corpus (see above), and other pseudo-ops (`li`, `mv`, `nop`, `ret`, `jr`, `j`) are compared as
  assembled words only.
- `riscv-tests.feature`: rv32ui and rv32um from riscv-software-src/riscv-tests (BSD-3-Clause, commit
  recorded in `/riscv-tests.commit`) are built with our own minimal environment
  (`features/explorer/docker/riscv_test.h`, `link.ld`) and run in `Machine`; pass means `exit(0)`.
  Skipped: `fence_i` (Zifencei and self-modifying code) and `ma_data` (needs a trap handler for
  misaligned accesses; the Machine faults instead).
