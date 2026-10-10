import { Machine, type MachineState, type StepResult } from "./machine";
import { Timeline, type Snapshot } from "./timeline";

/** One word of a program image and where it sits. */
export interface ImageRow {
  index: number;
  addr: number;
  word: number;
}

/** What every source of a program produces, ready to run. */
export interface ProgramImage {
  image: Uint8Array;
  loadAddress: number;
  entry: number;
  memorySize: number;
  rows: ImageRow[];
}

export const DEFAULT_MEMORY_SIZE = 65536;
export const DEFAULT_MAX_STEPS = 500_000;

/** A program image from 32-bit words loaded at address 0. Pure: the same words always give the same image. */
export function fromWords(words: readonly number[], opts: { memorySize?: number } = {}): ProgramImage {
  const image = new Uint8Array(words.length * 4);
  const view = new DataView(image.buffer);
  const rows: ImageRow[] = words.map((word, index) => ({ index, addr: index * 4, word: word >>> 0 }));
  rows.forEach((row) => view.setUint32(row.addr, row.word, true));
  return { image, loadAddress: 0, entry: 0, memorySize: opts.memorySize ?? DEFAULT_MEMORY_SIZE, rows };
}

/** The row at byte address `pc`, if the program has one there. */
export function rowAt(program: ProgramImage, pc: number): ImageRow | undefined {
  return pc % 4 === 0 ? program.rows[pc / 4] : undefined;
}

/** The read side of a machine: what the checker and the player look at. A real Machine fits it. */
export interface MachineView {
  readonly regs: ArrayLike<number>;
  readonly pc: number;
  readonly state: MachineState;
  readonly exitCode: number | null;
  readonly fault: string | null;
  readonly steps: number;
  readonly memorySize: number;
  readMem(addr: number, length: number): Uint8Array;
}

export interface SessionOptions {
  /** Most steps recorded before the program counts as running away. Default 500,000. */
  maxSteps?: number;
  /** The last word of the program is a hidden end marker: it runs by itself after the last visible card. */
  hideEnd?: boolean;
  /** Registers (number to value) that hold a value before the first step, and again after reset. */
  startRegs?: Record<number, number>;
  /** How many words follow the end marker (custom card bodies); they are not cards. Default 0. */
  tail?: number;
}

const EMPTY_STEPS: StepResult[] = [];

/**
 * The one machine behind every view. It owns a Machine through a Timeline, so Back is a move along the
 * recording, never a re-run, and every view reads registers, memory and pc at the current position.
 * Pure and synchronous: no DOM, no timers.
 */
export class Session {
  readonly timeline: Timeline;
  readonly program: ProgramImage;
  readonly hideEnd: boolean;
  /** Student-visible cards: every word except the hidden end marker. */
  readonly cards: number;
  readonly maxSteps: number;
  readonly machine: MachineView;
  private viewCache: { position: number; length: number; snapshot: Snapshot } | null = null;

  constructor(program: ProgramImage, opts: SessionOptions = {}) {
    this.program = program;
    this.hideEnd = opts.hideEnd === true;
    const words = program.image.length / 4;
    this.cards = (this.hideEnd ? words - 1 : words) - (opts.tail ?? 0);
    const machine = new Machine({ memorySize: program.memorySize });
    machine.load(program.image, program.loadAddress, program.entry);
    if (opts.startRegs) machine.setStartRegs(opts.startRegs);
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    this.timeline = new Timeline(machine, { maxSteps: this.maxSteps });
    this.machine = this.makeView();
    this.autoStop();
  }

  get position(): number {
    return this.timeline.position;
  }

  /** Steps the student has taken at the current position: the hidden end marker is not one. */
  get steps(): number {
    return this.snapshot().steps - (this.markerRan() ? 1 : 0);
  }

  /** True when the recording stopped at `maxSteps` and the position is at its end: the machine could go on but will not. */
  get hitStepLimit(): boolean {
    return this.timeline.hitStepLimit && this.timeline.position === this.timeline.length;
  }

  get canStep(): boolean {
    const state = this.snapshot().state;
    return (state === "ready" || state === "running") && !this.hitStepLimit;
  }

  /** One student step: runs the next card, then the hidden end marker if that was the last card. Null when the machine cannot step. */
  stepForward(): StepResult | null {
    if (!this.canStep || !this.timeline.stepForward()) return null;
    const result = this.timeline.snapshotAt(this.timeline.position).lastStep!;
    this.autoStop();
    return result;
  }

  /** One student Back: undoes the last visible step, and the hidden end marker with it. False at the start. */
  stepBackward(): boolean {
    if (this.steps === 0) return false;
    if (this.markerRan()) this.timeline.stepBackward();
    return this.timeline.stepBackward();
  }

  /** Forget the recording and start over at position 0. */
  reset(): void {
    this.timeline.reset();
    this.viewCache = null;
    this.autoStop();
  }

  /** Record the rest of the run ahead of the current position, without moving it. */
  recordAll(): void {
    const position = this.timeline.position;
    this.timeline.seek(this.timeline.length);
    this.timeline.runToEnd();
    this.timeline.seek(position);
  }

  /** The steps that led to the current position, oldest first. */
  history(): StepResult[] {
    const out: StepResult[] = [];
    for (let at = 1; at <= this.timeline.position; at++) out.push(this.timeline.snapshotAt(at).lastStep!);
    return out.length > 0 ? out : EMPTY_STEPS;
  }

  readMem(addr: number, length: number, position?: number): Uint8Array {
    return this.timeline.readMem(addr, length, position);
  }

  rowAt(pc: number): ImageRow | undefined {
    return rowAt(this.program, pc);
  }

  private snapshot(): Snapshot {
    const position = this.timeline.position;
    const length = this.timeline.length;
    const cached = this.viewCache;
    if (cached && cached.position === position && cached.length === length) return cached.snapshot;
    const snapshot = this.timeline.snapshotAt(position);
    this.viewCache = { position, length, snapshot };
    return snapshot;
  }

  private markerRan(): boolean {
    const s = this.snapshot();
    return this.hideEnd && s.state === "halted" && s.exitCode === null && s.pc === this.cards * 4;
  }

  private autoStop(): void {
    const s = this.snapshot();
    if (this.hideEnd && (s.state === "ready" || s.state === "running") && s.pc === this.cards * 4) this.timeline.stepForward();
  }

  private makeView(): MachineView {
    const session = this;
    return {
      get regs() {
        return session.snapshot().regs;
      },
      get pc() {
        return session.snapshot().pc;
      },
      get state() {
        return session.snapshot().state;
      },
      get exitCode() {
        return session.snapshot().exitCode;
      },
      get fault() {
        return session.snapshot().fault;
      },
      get steps() {
        return session.snapshot().steps;
      },
      memorySize: this.program.memorySize,
      readMem: (addr, length) => session.timeline.readMem(addr, length),
    };
  }
}
