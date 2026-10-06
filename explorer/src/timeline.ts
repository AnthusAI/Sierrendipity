import type { Machine, MachineState, StepResult } from "./machine";

/**
 * A scrubbable recording of a Machine run. Pure and synchronous: the interface drives playback.
 *
 * Strategy. The Machine's own undo history is bounded (10,000 to 20,000 steps), so the Timeline never
 * rewinds the Machine. The Machine always sits at the *frontier* (the last recorded step). Every step is
 * recorded with what it changed (new register values, bytes written, the pc and state after it), and a
 * checkpoint (registers, pc, state and the memory pages that differ from the initial image) is kept
 * every CHECKPOINT_INTERVAL steps. The state at any position is the nearest checkpoint at or before it
 * plus at most CHECKPOINT_INTERVAL recorded steps replayed from the log, so seeking costs the same
 * however long the run is, forwards or backwards. Replaying recorded steps never re-executes anything:
 * output is not repeated and input is not consumed again, and scrubbing is exactly repeatable.
 */

declare const TextDecoder: new () => { decode(input: Uint8Array): string };

const CHECKPOINT_INTERVAL = 256;
const PAGE = 1024;
const SYS_WRITE = 64;
const ECALL = 0x73;

export interface Snapshot {
  pc: number;
  /** x0..x31 as unsigned 32-bit numbers. */
  regs: number[];
  state: MachineState;
  exitCode: number | null;
  fault: string | null;
  /** Counted steps, as `Machine.steps` (waiting and faulting steps do not count). */
  steps: number;
  /** The step that led here; absent at position 0. */
  lastStep?: StepResult;
}

export interface RegisterChange {
  reg: number;
  before: number;
  after: number;
}

export interface MemoryChange {
  addr: number;
  before: Uint8Array;
  after: Uint8Array;
}

export interface TimelineDiff {
  pc: { before: number; after: number };
  regs: RegisterChange[];
  /** Runs of bytes that differ, in address order. */
  memory: MemoryChange[];
}

/** Bytes a write ecall passed to the Machine's io, keyed by the (0-based) step that did it. */
export interface OutputEntry {
  step: number;
  fd: number;
  bytes: Uint8Array;
}

/** Input forwarded to the Machine, with the recorded length at that moment. */
export interface InputEntry {
  position: number;
  bytes: Uint8Array;
}

interface Rec {
  result: StepResult;
  regs: [number, number][];
  mem?: { addr: number; bytes: Uint8Array };
  pc: number;
  state: MachineState;
  exitCode: number | null;
  fault: string | null;
  counted: boolean;
}

/** Machine state at one position: registers plus memory pages that differ from the initial image. */
interface View {
  regs: Uint32Array;
  pc: number;
  state: MachineState;
  exitCode: number | null;
  fault: string | null;
  steps: number;
  pages: Map<number, Uint8Array>;
  /** Pages this view may mutate in place; every other page is shared and must be copied first. */
  owned: Set<number>;
}

export class Timeline {
  private readonly machine: Machine;
  private readonly maxSteps: number;
  private readonly size: number;
  private base: Uint8Array;
  private records: Rec[] = [];
  private checkpoints: View[] = [];
  private front!: View;
  private cache: { pos: number; view: View } | null = null;
  private _position = 0;
  private readonly _outputLog: OutputEntry[] = [];
  private readonly _inputLog: InputEntry[] = [];

  /** Takes over `machine`: it is reset, and should only be driven through the Timeline from now on. */
  constructor(machine: Machine, opts: { maxSteps?: number } = {}) {
    this.machine = machine;
    this.maxSteps = opts.maxSteps ?? 500_000;
    this.size = machine.memorySize;
    this.base = new Uint8Array(0);
    this.reset();
  }

  /** Recorded steps. */
  get length(): number {
    return this.records.length;
  }
  /** The step being shown, 0..length. */
  get position(): number {
    return this._position;
  }
  /** At the last recorded step and the program cannot go on (halted or faulted). */
  get isAtEnd(): boolean {
    return this._position === this.records.length && (this.front.state === "halted" || this.front.state === "faulted");
  }
  get outputLog(): readonly OutputEntry[] {
    return this._outputLog;
  }
  get inputLog(): readonly InputEntry[] {
    return this._inputLog;
  }

  /** Forget the recording, reset the Machine (which also drops queued input) and go back to position 0. */
  reset(): void {
    this.machine.reset();
    this.base = this.machine.readMem(0, this.size);
    this.records = [];
    this._outputLog.length = 0;
    this._inputLog.length = 0;
    this._position = 0;
    this.cache = null;
    this.front = {
      regs: Uint32Array.from(this.machine.regs),
      pc: this.machine.pc,
      state: this.machine.state,
      exitCode: this.machine.exitCode,
      fault: this.machine.fault,
      steps: 0,
      pages: new Map(),
      owned: new Set(),
    };
    this.checkpoints = [this.checkpoint(this.front)];
  }

  /** Move one step on, recording it from the Machine if it is new. False at the end, at the step limit, or while waiting for input. */
  stepForward(): boolean {
    if (this._position < this.records.length || this.record()) {
      this._position++;
      return true;
    }
    return false;
  }

  stepBackward(): boolean {
    if (this._position === 0) return false;
    this._position--;
    return true;
  }

  /** Show position `position` (0..length). Seeking never runs the Machine. */
  seek(position: number): void {
    if (!Number.isInteger(position) || position < 0 || position > this.records.length) {
      throw new RangeError(`position ${position} must be a whole number from 0 to ${this.records.length}`);
    }
    this._position = position;
  }

  /**
   * Step forward up to `steps` times (default 1), stopping early at the end, while waiting for input,
   * or just before executing a card at a Machine breakpoint (the first step always runs). Returns how
   * many steps it advanced.
   */
  play(opts: { steps?: number } = {}): number {
    const wanted = opts.steps ?? 1;
    let advanced = 0;
    while (advanced < wanted) {
      if (advanced > 0 && this.machine.breakpoints.has(this.view(this._position).pc)) break;
      if (!this.stepForward()) break;
      advanced++;
    }
    return advanced;
  }

  /** Step forward until the program ends, waits for input, or `maxSteps` more steps ran. Returns the steps advanced. */
  runToEnd(maxSteps = this.maxSteps): number {
    let advanced = 0;
    while (advanced < maxSteps && this.stepForward()) advanced++;
    return advanced;
  }

  /** Forward `bytes` to the Machine (an empty array marks end of input) and log it. It reaches the end of the recording, wherever the position is. */
  provideInput(bytes: Uint8Array): void {
    this.machine.provideInput(bytes);
    this._inputLog.push({ position: this.records.length, bytes: bytes.slice() });
  }

  snapshotAt(position: number): Snapshot {
    const v = this.view(this.check(position));
    const last = position === 0 ? undefined : this.records[position - 1]!.result;
    return {
      pc: v.pc,
      regs: Array.from(v.regs),
      state: v.state,
      exitCode: v.exitCode,
      fault: v.fault,
      steps: v.steps,
      ...(last ? { lastStep: last } : {}),
    };
  }

  /** Memory as it was at `position` (default: the current one). */
  readMem(addr: number, length: number, position: number = this._position): Uint8Array {
    if (addr < 0 || length < 0 || addr + length > this.size) {
      throw new RangeError(`memory range ${addr}+${length} is outside memory`);
    }
    return this.read(this.view(this.check(position)), addr, length);
  }

  /** What changed between two positions (either order): the interface animates tokens from this. */
  diff(a: number, b: number): TimelineDiff {
    this.check(a);
    this.check(b);
    const va = this.clone(this.view(a));
    const vb = this.view(b);
    const regs: RegisterChange[] = [];
    for (let reg = 0; reg < 32; reg++) {
      if (va.regs[reg] !== vb.regs[reg]) regs.push({ reg, before: va.regs[reg]!, after: vb.regs[reg]! });
    }
    // Candidate byte ranges: everything written by the steps between the two positions, merged.
    const ranges: [number, number][] = [];
    for (let i = Math.min(a, b); i < Math.max(a, b); i++) {
      const mem = this.records[i]!.mem;
      if (mem) ranges.push([mem.addr, mem.addr + mem.bytes.length]);
    }
    ranges.sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }
    const memory: MemoryChange[] = [];
    for (const [start, end] of merged) {
      const before = this.read(va, start, end - start);
      const after = this.read(vb, start, end - start);
      let i = 0;
      while (i < before.length) {
        if (before[i] === after[i]) {
          i++;
          continue;
        }
        let j = i;
        while (j < before.length && before[j] !== after[j]) j++;
        memory.push({ addr: start + i, before: before.slice(i, j), after: after.slice(i, j) });
        i = j;
      }
    }
    return { pc: { before: va.pc, after: vb.pc }, regs, memory };
  }

  /** Text a program wrote to `fd` before `position` (default: the current one), decoded as UTF-8. */
  outputText(fd = 1, position: number = this._position): string {
    const parts = this._outputLog.filter((e) => e.fd === fd && e.step < position).map((e) => e.bytes);
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      joined.set(p, at);
      at += p.length;
    }
    return new TextDecoder().decode(joined);
  }

  // ---- recording

  /** Run the Machine one step and append it to the log. */
  private record(): boolean {
    const f = this.front;
    if (f.state === "halted" || f.state === "faulted") return false;
    if (this.records.length >= this.maxSteps) return false;
    const m = this.machine;
    const written = this.pendingWrite();
    const before = m.steps;
    const result = m.step();
    const last = this.records[this.records.length - 1];
    if (result.state === "waiting-input" && last?.state === "waiting-input") {
      return false; // still waiting (the Machine keeps no history for a wait): nothing happened
      return false;
    }
    const rec: Rec = {
      result,
      regs: result.changedRegs.map((r): [number, number] => [r, m.regs[r]!]),
      ...(result.memWrite ? { mem: { addr: result.memWrite.addr, bytes: m.readMem(result.memWrite.addr, result.memWrite.length) } } : {}),
      pc: m.pc,
      state: m.state,
      exitCode: m.exitCode,
      fault: m.fault,
      counted: m.steps > before,
    };
    if (written && result.state !== "faulted") this._outputLog.push({ step: this.records.length, ...written });
    this.records.push(rec);
    this.apply(f, rec);
    if (this.records.length % CHECKPOINT_INTERVAL === 0) this.checkpoints.push(this.checkpoint(f));
    return true;
  }

  /** The bytes the next step would pass to io.write, if it is a write ecall. */
  private pendingWrite(): { fd: number; bytes: Uint8Array } | null {
    const m = this.machine;
    const pc = m.pc;
    if (pc % 4 !== 0 || pc + 4 > this.size) return null;
    const w = m.readMem(pc, 4);
    const word = (w[0]! | (w[1]! << 8) | (w[2]! << 16) | (w[3]! << 24)) >>> 0;
    if (word !== ECALL || m.regs[17] !== SYS_WRITE) return null;
    const [fd, addr, length] = [m.regs[10]!, m.regs[11]!, m.regs[12]!];
    if (length === 0 || addr + length > this.size) return null;
    return { fd, bytes: m.readMem(addr, length) };
  }

  // ---- states

  private check(position: number): number {
    if (!Number.isInteger(position) || position < 0 || position > this.records.length) {
      throw new RangeError(`position ${position} must be a whole number from 0 to ${this.records.length}`);
    }
    return position;
  }

  /** The state at `position`. Read-only for callers; one slot is cached so stepping by one is O(1). */
  private view(position: number): View {
    const cached = this.cache;
    if (cached?.pos === position) return cached.view;
    if (cached && cached.pos === position - 1) {
      this.apply(cached.view, this.records[position - 1]!);
      cached.pos = position;
      return cached.view;
    }
    const index = Math.floor(position / CHECKPOINT_INTERVAL);
    const v = this.clone(this.checkpoints[index]!);
    for (let i = index * CHECKPOINT_INTERVAL; i < position; i++) this.apply(v, this.records[i]!);
    this.cache = { pos: position, view: v };
    return v;
  }

  private clone(v: View): View {
    return { ...v, regs: Uint32Array.from(v.regs), pages: new Map(v.pages), owned: new Set() };
  }

  /** Freeze `v` as a checkpoint: later writes to `v` copy pages instead of changing the frozen ones. */
  private checkpoint(v: View): View {
    v.owned.clear();
    return { ...v, regs: Uint32Array.from(v.regs), pages: new Map(v.pages), owned: new Set() };
  }

  private apply(v: View, rec: Rec): void {
    for (const [reg, value] of rec.regs) v.regs[reg] = value;
    if (rec.mem) this.write(v, rec.mem.addr, rec.mem.bytes);
    v.pc = rec.pc;
    v.state = rec.state;
    v.exitCode = rec.exitCode;
    v.fault = rec.fault;
    if (rec.counted) v.steps++;
  }

  private write(v: View, addr: number, bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; ) {
      const at = addr + i;
      const page = Math.floor(at / PAGE);
      if (!v.owned.has(page)) {
        v.pages.set(page, (v.pages.get(page) ?? this.base.subarray(page * PAGE, (page + 1) * PAGE)).slice());
        v.owned.add(page);
      }
      const data = v.pages.get(page)!;
      const offset = at - page * PAGE;
      const n = Math.min(bytes.length - i, data.length - offset);
      data.set(bytes.subarray(i, i + n), offset);
      i += n;
    }
  }

  private read(v: View, addr: number, length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; ) {
      const at = addr + i;
      const page = Math.floor(at / PAGE);
      const data = v.pages.get(page) ?? this.base.subarray(page * PAGE, (page + 1) * PAGE);
      const offset = at - page * PAGE;
      const n = Math.min(length - i, data.length - offset);
      out.set(data.subarray(offset, offset + n), i);
      i += n;
    }
    return out;
  }
}
