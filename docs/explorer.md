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

## Notes on behaviour the contract leaves open

- `Machine.provideInput(bytes)` queues bytes for `read`; the built-in queue is used when no
  `io.read` is supplied. An empty `provideInput` call signals end of input (EOF).
- The default `io.write` collects nothing; supply `MachineIO` to see output.
- Specs: `features/explorer/*.feature` (`npm test`). Docker-dependent differential and
  riscv-tests specs are tagged `@docker` and run with `npm run test:docker`.
