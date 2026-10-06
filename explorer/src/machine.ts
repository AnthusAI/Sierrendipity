import { decode } from "./codec.ts";

export type Status = "running" | "halted" | "faulted";

/** A small RV32I machine: 32 registers, a program counter and flat little-endian memory. */
export class Machine {
  readonly regs = new Int32Array(32);
  readonly memory: Uint8Array;
  pc = 0;
  status: Status = "running";
  exitCode: number | undefined;
  fault: string | undefined;
  steps = 0;
  output = "";

  constructor(memorySize = 64 * 1024) {
    this.memory = new Uint8Array(memorySize);
    this.regs[2] = memorySize; // sp starts at the top
  }

  load(words: number[], address = 0): void {
    words.forEach((w, i) => this.store(address + i * 4, 4, w));
    this.pc = address;
  }

  private stop(message: string) { this.status = "faulted"; this.fault = message; }

  private check(addr: number, size: number): boolean {
    const hex = `0x${(addr >>> 0).toString(16)}`;
    if (addr < 0 || addr + size > this.memory.length) { this.stop(`memory access out of range at ${hex}`); return false; }
    if (addr % size) { this.stop(`misaligned ${size}-byte access at ${hex}`); return false; }
    return true;
  }

  read(addr: number, size: number, signed: boolean): number {
    addr >>>= 0;
    if (!this.check(addr, size)) return 0;
    let v = 0;
    for (let i = size - 1; i >= 0; i--) v = (v << 8) | this.memory[addr + i];
    if (size < 4) v = signed ? (v << (32 - 8 * size)) >> (32 - 8 * size) : v;
    return v | 0;
  }

  store(addr: number, size: number, value: number): void {
    addr >>>= 0;
    if (!this.check(addr, size)) return;
    for (let i = 0; i < size; i++) this.memory[addr + i] = (value >>> (8 * i)) & 0xff;
  }

  /** Executes one instruction. Does nothing unless the machine is running. */
  step(): void {
    if (this.status !== "running") return;
    const word = this.read(this.pc, 4, false);
    if (this.status !== "running") return;
    const i = decode(word);
    if (!i) { this.stop(`illegal instruction 0x${(word >>> 0).toString(16).padStart(8, "0")} at 0x${this.pc.toString(16)}`); return; }
    const r = this.regs, a = r[i.rs1], b = r[i.rs2];
    let next = this.pc + 4;
    let rd: number | undefined;
    switch (i.op) {
      case "lui": rd = i.imm; break;
      case "auipc": rd = this.pc + i.imm; break;
      case "jal": rd = next; next = this.pc + i.imm; break;
      case "jalr": rd = next; next = (a + i.imm) & ~1; break;
      case "beq": if (a === b) next = this.pc + i.imm; break;
      case "bne": if (a !== b) next = this.pc + i.imm; break;
      case "blt": if (a < b) next = this.pc + i.imm; break;
      case "bge": if (a >= b) next = this.pc + i.imm; break;
      case "bltu": if (a >>> 0 < b >>> 0) next = this.pc + i.imm; break;
      case "bgeu": if (a >>> 0 >= b >>> 0) next = this.pc + i.imm; break;
      case "lb": rd = this.read(a + i.imm, 1, true); break;
      case "lh": rd = this.read(a + i.imm, 2, true); break;
      case "lw": rd = this.read(a + i.imm, 4, true); break;
      case "lbu": rd = this.read(a + i.imm, 1, false); break;
      case "lhu": rd = this.read(a + i.imm, 2, false); break;
      case "sb": this.store(a + i.imm, 1, b); break;
      case "sh": this.store(a + i.imm, 2, b); break;
      case "sw": this.store(a + i.imm, 4, b); break;
      case "addi": rd = a + i.imm; break;
      case "slti": rd = a < i.imm ? 1 : 0; break;
      case "sltiu": rd = a >>> 0 < i.imm >>> 0 ? 1 : 0; break;
      case "xori": rd = a ^ i.imm; break;
      case "ori": rd = a | i.imm; break;
      case "andi": rd = a & i.imm; break;
      case "slli": rd = a << i.imm; break;
      case "srli": rd = a >>> i.imm; break;
      case "srai": rd = a >> i.imm; break;
      case "add": rd = a + b; break;
      case "sub": rd = a - b; break;
      case "sll": rd = a << (b & 31); break;
      case "slt": rd = a < b ? 1 : 0; break;
      case "sltu": rd = a >>> 0 < b >>> 0 ? 1 : 0; break;
      case "xor": rd = a ^ b; break;
      case "srl": rd = a >>> (b & 31); break;
      case "sra": rd = a >> (b & 31); break;
      case "or": rd = a | b; break;
      case "and": rd = a & b; break;
      case "ecall": this.ecall(); break;
      case "ebreak": this.status = "halted"; break;
    }
    if ((this.status as Status) === "faulted") return;
    if (rd !== undefined && i.rd !== 0) r[i.rd] = rd;
    this.pc = next | 0;
    this.steps++;
  }

  /** Teaching environment calls: a7=93 exits with a0, a7=1 prints a0 as a number, a7=11 prints a0 as a character. */
  private ecall(): void {
    const n = this.regs[17];
    if (n === 93) { this.exitCode = this.regs[10]; this.status = "halted"; }
    else if (n === 1) this.output += String(this.regs[10]);
    else if (n === 11) this.output += String.fromCharCode(this.regs[10] & 0xff);
    else this.stop(`unsupported ecall ${n}`);
  }

  run(maxSteps = 1_000_000): void {
    while (this.status === "running" && this.steps < maxSteps) this.step();
  }
}
