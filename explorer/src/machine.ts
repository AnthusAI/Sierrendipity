import { decode, type Decoded } from "./decode.ts";

export type MachineState = "ready" | "running" | "waiting-input" | "halted" | "faulted";

export interface StepResult {
  pc: number;
  word: number;
  decoded: Decoded | null;
  /** Registers whose value changed (never x0). */
  changedRegs: number[];
  memWrite?: { addr: number; length: number };
  state: MachineState;
}

export interface MachineIO {
  write(fd: number, bytes: Uint8Array): void;
  /** Return null when no input is available yet; an empty array means end of input. */
  read(fd: number, max: number): Uint8Array | null;
}

/** Everything one step changed, so that stepBack can undo it. */
interface HistoryEntry {
  pc: number;
  state: MachineState;
  exitCode: number | null;
  fault: string | null;
  reg: number; // register that changed, or -1
  regOld: number;
  memAddr: number;
  memOld: Uint8Array | null;
  input: Uint8Array | null; // input consumed by a read ecall, put back on undo
  counted: boolean; // whether the step counted in `steps` (faults and waiting do not)
}

/** A fault raised while executing; the machine adds the pc to the message. */
class Fault extends Error {}

const HISTORY_LIMIT = 10_000;
const hex = (n: number): string => `0x${(n >>> 0).toString(16)}`;
const SYS_READ = 63;
const SYS_WRITE = 64;
const SYS_EXIT = 93;

export class Machine {
  pc = 0;
  readonly regs = new Uint32Array(32);
  state: MachineState = "ready";
  exitCode: number | null = null;
  steps = 0;
  fault: string | null = null;
  breakpoints = new Set<number>();

  private readonly mem: Uint8Array;
  private readonly view: DataView;
  private readonly stackTop: number;
  private readonly io?: MachineIO;
  private image = new Uint8Array(0);
  private loadAddress = 0;
  private entry = 0;
  private history: HistoryEntry[] = [];
  private input = new Uint8Array(0);
  private inputClosed = false;
  // Working state of the step in progress.
  private current!: HistoryEntry;
  private changed: number[] = [];
  private memWrite: { addr: number; length: number } | undefined;
  private lastWord = 0;

  constructor(opts: { memorySize?: number; stackTop?: number; io?: MachineIO } = {}) {
    const size = opts.memorySize ?? 1 << 20;
    this.mem = new Uint8Array(size);
    this.view = new DataView(this.mem.buffer);
    this.stackTop = opts.stackTop ?? size;
    this.io = opts.io;
    this.reset();
  }

  load(image: Uint8Array, loadAddress: number, entry: number): void {
    if (loadAddress + image.length > this.mem.length) {
      throw new RangeError(`image of ${image.length} bytes at ${hex(loadAddress)} does not fit in memory`);
    }
    this.image = image.slice();
    this.loadAddress = loadAddress;
    this.entry = entry;
    this.reset();
  }

  reset(): void {
    this.mem.fill(0);
    this.mem.set(this.image, this.loadAddress);
    this.regs.fill(0);
    this.regs[2] = this.stackTop;
    this.pc = this.entry;
    this.state = "ready";
    this.exitCode = null;
    this.steps = 0;
    this.fault = null;
    this.history = [];
    this.input = new Uint8Array(0);
    this.inputClosed = false;
  }

  readMem(addr: number, length: number): Uint8Array {
    if (addr < 0 || length < 0 || addr + length > this.mem.length) {
      throw new RangeError(`memory range ${hex(addr)}+${length} is outside memory`);
    }
    return this.mem.slice(addr, addr + length);
  }

  /** Queue input for read ecalls. An empty array marks the end of input. */
  provideInput(bytes: Uint8Array): void {
    if (bytes.length === 0) {
      this.inputClosed = true;
    } else {
      const joined = new Uint8Array(this.input.length + bytes.length);
      joined.set(this.input);
      joined.set(bytes, this.input.length);
      this.input = joined;
    }
    if (this.state === "waiting-input") this.state = "running";
  }

  step(): StepResult {
    const pc = this.pc;
    this.advance();
    return {
      pc,
      word: this.lastWord,
      decoded: decode(this.lastWord),
      changedRegs: this.changed,
      ...(this.memWrite ? { memWrite: this.memWrite } : {}),
      state: this.state,
    };
  }

  run(maxSteps = 1_000_000): MachineState {
    // The first instruction always runs, so that a stopped machine can continue from a breakpoint.
    for (let n = 0; n < maxSteps; n++) {
      if (this.state === "halted" || this.state === "faulted") break;
      if (n > 0 && this.breakpoints.has(this.pc)) break;
      this.advance();
      if (this.state !== "running") break;
    }
    return this.state;
  }

  stepBack(): boolean {
    const entry = this.history.pop();
    if (!entry) return false;
    if (entry.reg >= 0) this.regs[entry.reg] = entry.regOld;
    if (entry.memOld) this.mem.set(entry.memOld, entry.memAddr);
    if (entry.input) {
      const joined = new Uint8Array(entry.input.length + this.input.length);
      joined.set(entry.input);
      joined.set(this.input, entry.input.length);
      this.input = joined;
    }
    this.pc = entry.pc;
    this.state = entry.state;
    this.exitCode = entry.exitCode;
    this.fault = entry.fault;
    if (entry.counted) this.steps--;
    return true;
  }

  // ---- one instruction

  /** Execute the instruction at pc, updating state, and record what is needed to undo it. */
  private advance(): void {
    this.changed = [];
    this.memWrite = undefined;
    this.lastWord = 0;
    if (this.state === "halted" || this.state === "faulted") return;
    const pc = this.pc;
    this.current = {
      pc, state: this.state, exitCode: this.exitCode, fault: this.fault,
      reg: -1, regOld: 0, memAddr: 0, memOld: null, input: null, counted: false,
    };
    this.state = "running";
    try {
      if (pc % 4 !== 0) throw new Fault(`misaligned instruction fetch`);
      if (pc + 4 > this.mem.length) throw new Fault(`instruction fetch out of range`);
      this.lastWord = this.view.getUint32(pc, true);
      if (this.execute(this.lastWord, pc) === "wait") {
        this.state = "waiting-input";
        return;
      }
      this.current.counted = true;
      this.steps++;
    } catch (e) {
      if (!(e instanceof Fault)) throw e;
      this.state = "faulted";
      this.fault = `${e.message} at pc ${hex(pc)}`;
    }
    this.history.push(this.current);
    if (this.history.length > 2 * HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
  }

  private setReg(rd: number, value: number): void {
    const v = value >>> 0;
    if (rd === 0 || this.regs[rd] === v) return;
    this.current.reg = rd;
    this.current.regOld = this.regs[rd]!;
    this.regs[rd] = v;
    this.changed.push(rd);
  }

  private checkAccess(addr: number, size: number, op: string): void {
    if (size > 1 && addr % size !== 0) throw new Fault(`misaligned ${op} address ${hex(addr)}`);
    if (addr + size > this.mem.length) throw new Fault(`${op} address ${hex(addr)} out of range`);
  }

  private recordWrite(addr: number, length: number): void {
    this.current.memAddr = addr;
    this.current.memOld = this.mem.slice(addr, addr + length);
    this.memWrite = { addr, length };
  }

  private jump(target: number): void {
    if (target % 4 !== 0) throw new Fault(`misaligned jump target ${hex(target)}`);
    if (target + 4 > this.mem.length) throw new Fault(`jump target ${hex(target)} out of range`);
    this.pc = target;
  }

  private execute(w: number, pc: number): "ok" | "wait" | "halt" {
    const rd = (w >>> 7) & 31;
    const rs1 = (w >>> 15) & 31;
    const rs2 = (w >>> 20) & 31;
    const f3 = (w >>> 12) & 7;
    const f7 = w >>> 25;
    const a = this.regs[rs1]!;
    const b = this.regs[rs2]!;
    const immI = w >> 20;
    const illegal = () => new Fault(`illegal instruction 0x${(w >>> 0).toString(16).padStart(8, "0")}`);
    const next = pc + 4;

    switch (w & 0x7f) {
      case 0x33: {
        const result = alu(f7 * 8 + f3, a, b);
        if (result === null) throw illegal();
        this.setReg(rd, result);
        break;
      }
      case 0x13: {
        let key = f3;
        let operand = immI;
        if (f3 === 1 || f3 === 5) {
          if (f7 !== 0 && !(f3 === 5 && f7 === 0x20)) throw illegal();
          key = f3 === 5 && f7 === 0x20 ? 0x100 + 5 : f3;
          operand = rs2;
        }
        const result = aluImmediate(key, a, operand);
        if (result === null) throw illegal();
        this.setReg(rd, result);
        break;
      }
      case 0x03: {
        const addr = (a + immI) >>> 0;
        let value: number;
        switch (f3) {
          case 0: this.checkAccess(addr, 1, "lb"); value = this.view.getInt8(addr); break;
          case 1: this.checkAccess(addr, 2, "lh"); value = this.view.getInt16(addr, true); break;
          case 2: this.checkAccess(addr, 4, "lw"); value = this.view.getInt32(addr, true); break;
          case 4: this.checkAccess(addr, 1, "lbu"); value = this.view.getUint8(addr); break;
          case 5: this.checkAccess(addr, 2, "lhu"); value = this.view.getUint16(addr, true); break;
          default: throw illegal();
        }
        this.setReg(rd, value);
        break;
      }
      case 0x23: {
        if (f3 > 2) throw illegal();
        const addr = (a + ((w >> 25 << 5) | rd)) >>> 0;
        const size = 1 << f3;
        this.checkAccess(addr, size, STORE_NAMES[f3]!);
        this.recordWrite(addr, size);
        if (f3 === 0) this.view.setUint8(addr, b);
        else if (f3 === 1) this.view.setUint16(addr, b, true);
        else this.view.setUint32(addr, b, true);
        break;
      }
      case 0x63: {
        const offset = (w >> 31 << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1);
        const taken = branchTaken(f3, a, b);
        if (taken === null) throw illegal();
        if (taken) {
          this.jump((pc + offset) >>> 0);
          return "ok";
        }
        break;
      }
      case 0x37:
        this.setReg(rd, w & 0xfffff000);
        break;
      case 0x17:
        this.setReg(rd, pc + (w & 0xfffff000));
        break;
      case 0x6f: {
        const offset = (w >> 31 << 20) | (w & 0xff000) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1);
        this.jump((pc + offset) >>> 0);
        this.setReg(rd, next);
        return "ok";
      }
      case 0x67: {
        if (f3 !== 0) throw illegal();
        this.jump(((a + immI) & ~1) >>> 0);
        this.setReg(rd, next);
        return "ok";
      }
      case 0x73:
        if (w === 0x100073) return this.halt(); // ebreak
        if (w !== 0x73) throw illegal();
        return this.ecall();
      default:
        throw illegal();
    }
    this.pc = next;
    return "ok";
  }

  /** Stop at the current instruction without an exit code. */
  private halt(): "halt" {
    this.state = "halted";
    return "halt";
  }

  private ecall(): "ok" | "wait" | "halt" {
    const number = this.regs[17]!;
    const [a0, a1, a2] = [this.regs[10]!, this.regs[11]!, this.regs[12]!];
    switch (number) {
      case SYS_EXIT:
        this.exitCode = a0 | 0;
        return this.halt();
      case SYS_WRITE: {
        if (a1 + a2 > this.mem.length) throw new Fault(`write buffer ${hex(a1)}+${a2} out of range`);
        if (a2 > 0) this.io?.write(a0, this.mem.slice(a1, a1 + a2));
        this.setReg(10, a2);
        break;
      }
      case SYS_READ: {
        if (a1 + a2 > this.mem.length) throw new Fault(`read buffer ${hex(a1)}+${a2} out of range`);
        let data: Uint8Array | null = null;
        if (this.input.length > 0) {
          data = this.input.slice(0, a2);
          this.input = this.input.slice(data.length);
        } else if (a2 > 0) {
          const fresh = this.io?.read(a0, a2) ?? (this.inputClosed ? new Uint8Array(0) : null);
          if (fresh === null) return "wait";
          data = fresh.slice(0, a2);
        } else {
          data = new Uint8Array(0);
        }
        this.current.input = data;
        if (data.length > 0) {
          this.recordWrite(a1, data.length);
          this.mem.set(data, a1);
        }
        this.setReg(10, data.length);
        break;
      }
      default:
        throw new Fault(`unsupported ecall ${number}`);
    }
    this.pc += 4;
    return "ok";
  }
}

const STORE_NAMES = ["sb", "sh", "sw"];

/** Register-register operations keyed by funct7 * 8 + funct3; null when the pair is not an instruction. */
function alu(key: number, a: number, b: number): number | null {
  switch (key) {
    case 0: return a + b;
    case 0x100: return a - b;
    case 1: return a << (b & 31);
    case 2: return (a | 0) < (b | 0) ? 1 : 0;
    case 3: return a < b ? 1 : 0;
    case 4: return a ^ b;
    case 5: return a >>> (b & 31);
    case 0x105: return (a | 0) >> (b & 31);
    case 6: return a | b;
    case 7: return a & b;
    case 8: return Math.imul(a, b);
    case 9: return Number((BigInt(a | 0) * BigInt(b | 0)) >> 32n);
    case 10: return Number((BigInt(a | 0) * BigInt(b)) >> 32n);
    case 11: return Number((BigInt(a) * BigInt(b)) >> 32n);
    case 12: // div
      if (b === 0) return -1;
      if ((a | 0) === -2147483648 && (b | 0) === -1) return a;
      return Math.trunc((a | 0) / (b | 0));
    case 13: return b === 0 ? 0xffffffff : Math.floor(a / b); // divu
    case 14: // rem
      if (b === 0) return a;
      if ((a | 0) === -2147483648 && (b | 0) === -1) return 0;
      return (a | 0) % (b | 0);
    case 15: return b === 0 ? a : a % b; // remu
    default: return null;
  }
}

/** Register-immediate operations; shifts use the key 0x100 + 5 for srai. */
function aluImmediate(key: number, a: number, imm: number): number | null {
  switch (key) {
    case 0: return a + imm;
    case 1: return a << imm;
    case 2: return (a | 0) < imm ? 1 : 0;
    case 3: return a < imm >>> 0 ? 1 : 0;
    case 4: return a ^ imm;
    case 5: return a >>> imm;
    case 0x105: return (a | 0) >> imm;
    case 6: return a | imm;
    case 7: return a & imm;
    default: return null;
  }
}

function branchTaken(f3: number, a: number, b: number): boolean | null {
  switch (f3) {
    case 0: return a === b;
    case 1: return a !== b;
    case 4: return (a | 0) < (b | 0);
    case 5: return (a | 0) >= (b | 0);
    case 6: return a < b;
    case 7: return a >= b;
    default: return null;
  }
}
