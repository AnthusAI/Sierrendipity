import { Machine, type MachineState } from "@sierrendipity/explorer";
import type { Program } from "./program";

export type OutKind = "output" | "note" | "error";

const SLICE_MS = 12;
const REDRAW_MS = 100;

/** Wraps the explorer Machine for the UI: time-sliced Continue, change tracking and terminal output. */
export class Emulator {
  readonly machine: Machine;
  readonly breakpoints = new Set<number>();
  /** Registers that changed in the last Step / Step Back / Continue. */
  changed = new Set<number>();
  /** The bytes written by the most recent store, if any. */
  lastWrite?: { addr: number; length: number };
  version = 0;
  private looping = false;
  /** Bumped by every run/stop/reset so an older Continue loop knows to quit. */
  private generation = 0;
  private resumeOnInput = false;
  private announced = false;
  private stopped = false;
  private regsBefore = new Uint32Array(32);
  private listeners = new Set<() => void>();
  private decoder = new TextDecoder();

  constructor(
    readonly program: Program,
    private out: (text: string, kind: OutKind) => void,
  ) {
    this.machine = new Machine({
      memorySize: program.memorySize,
      stackTop: program.stackTop,
      io: {
        write: (_fd, bytes) => this.out(this.decoder.decode(bytes, { stream: true }), "output"),
        read: () => null, // no input yet: the machine waits until provideInput()
      },
    });
    this.machine.breakpoints = this.breakpoints;
    this.machine.load(program.image, program.loadAddress, program.entry);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private notify() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get state(): MachineState {
    if (this.looping) return "running";
    return this.machine.state === "running" ? "ready" : this.machine.state; // "running" = between steps
  }

  /** True while a Continue is in progress or the program waits for typed input. */
  get active() {
    return this.looping || (this.machine.state === "waiting-input" && !this.stopped);
  }

  get statusText() {
    const m = this.machine;
    switch (this.state) {
      case "halted":
        return m.exitCode === null ? "Halted (ebreak)" : `Halted, exit code ${m.exitCode}`;
      case "faulted":
        return `Faulted: ${m.fault ?? "unknown fault"}`;
      case "waiting-input":
        return this.stopped ? "Stopped" : "Waiting for input";
      case "running":
        return "Running";
      default:
        return "Ready";
    }
  }

  toggleBreakpoint(...addrs: number[]) {
    const all = addrs.every((a) => this.breakpoints.has(a));
    for (const a of addrs) all ? this.breakpoints.delete(a) : this.breakpoints.add(a);
    this.notify();
  }

  private announce() {
    const m = this.machine;
    if (this.announced || (m.state !== "halted" && m.state !== "faulted")) return;
    this.announced = true;
    if (m.state === "halted") this.out(m.exitCode === null ? "\r\n[ebreak]\r\n" : `\r\n[exit code ${m.exitCode}]\r\n`, "note");
    else this.out(`\r\n[fault: ${m.fault}]\r\n`, "error");
  }

  private diff(before: Uint32Array) {
    this.changed = new Set([...Array(32).keys()].filter((i) => before[i] !== this.machine.regs[i]));
  }

  /** Run `action`, then record which registers changed and announce a halt or fault. */
  private track(action: () => { addr: number; length: number } | undefined | void) {
    const before = this.machine.regs.slice();
    const write = action();
    if (write) this.lastWrite = write;
    this.diff(before);
    this.announce();
    this.notify();
  }

  step() {
    if (this.looping) return;
    this.stopped = false;
    this.track(() => this.machine.step().memWrite);
  }

  back() {
    if (this.looping) return;
    this.stopped = false;
    this.track(() => {
      if (this.machine.stepBack()) {
        this.announced = false;
        this.lastWrite = undefined;
      }
    });
  }

  reset() {
    this.generation++;
    this.looping = false;
    this.machine.reset();
    this.stopped = false;
    this.changed = new Set();
    this.lastWrite = undefined;
    this.announced = false;
    this.resumeOnInput = false;
    this.notify();
  }

  /** Run until a breakpoint, halt, fault, input request or stop(); yields to the browser between slices. */
  async run(): Promise<void> {
    const generation = ++this.generation;
    this.looping = true;
    this.stopped = false;
    this.resumeOnInput = false;
    this.regsBefore = this.machine.regs.slice();
    let first = true;
    let lastRedraw = performance.now();
    this.notify();
    const m = this.machine;
    try {
      for (;;) {
        const deadline = performance.now() + SLICE_MS;
        while (performance.now() < deadline) {
          if (m.state === "halted" || m.state === "faulted") return;
          if (!first && this.breakpoints.has(m.pc)) return; // a breakpoint under the PC is skipped once
          first = false;
          const result = m.step();
          if (result.memWrite) this.lastWrite = result.memWrite;
          if (m.state === "waiting-input") {
            this.resumeOnInput = true;
            return;
          }
        }
        if (performance.now() - lastRedraw > REDRAW_MS) {
          lastRedraw = performance.now();
          this.diff(this.regsBefore);
          this.notify();
        }
        await new Promise((resolve) => setTimeout(resolve));
        if (generation !== this.generation) return;
      }
    } finally {
      if (generation === this.generation) {
        this.looping = false;
        this.diff(this.regsBefore);
        this.announce();
        this.notify();
      }
    }
  }

  /** Stop a Continue, or give up waiting for input. */
  stop() {
    if (!this.looping && this.machine.state !== "waiting-input") return;
    this.generation++;
    this.resumeOnInput = false;
    if (this.looping) this.diff(this.regsBefore);
    this.looping = false;
    this.stopped = true;
    this.notify();
  }

  /** Typed input for a `read` system call; resumes the program if it was running. */
  input(text: string) {
    this.machine.provideInput(new TextEncoder().encode(text));
    if (this.resumeOnInput) void this.run();
    else this.notify();
  }
}
