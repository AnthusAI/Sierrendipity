import { decode, Machine, registerName } from "@sierrendipity/explorer";

/** Something the student did in the UI, recorded as a fact for lesson conditions. */
export type LessonEvent =
  | { type: "edit"; card: number; to: number }
  | { type: "toggle"; card: number; bit: number }
  | { type: "rewind" }
  | { type: "look"; step: number };

/** A machine plus everything recorded about how it got where it is. Plain data: pure and no DOM. */
export interface LessonRun {
  machine: Machine;
  /** The program loaded at address 0: one word per card, plus the hidden end marker when `hideEnd` was used. */
  words: number[];
  /** How many cards the student sees: `words` without the hidden end marker. */
  cards: number;
  /** The lesson's starter program, when the check compares against it. */
  starter?: number[];
  /** Everything written to file descriptor 1. */
  output: string;
  /** What the student predicted, by target name ("a2"), in order. */
  predictions: Record<string, number[]>;
  events: LessonEvent[];
  /** Steps taken by the machine. */
  steps: number;
  /** Timeline position the student is looking at, when known. */
  position?: number;
  /** Mnemonics of the instructions that were actually executed. */
  executed: string[];
  /** Backward jumps and branches taken. */
  laps: number;
  /** True when the run was stopped by the step cap while still running. */
  hitStepCap: boolean;
}

export interface RunOptions {
  stdin?: string;
  /** Step cap; default 10_000. */
  maxSteps?: number;
  /** Starting registers by ABI or x-name. */
  startRegs?: Record<string, number>;
  /** Starting memory: address -> bytes. */
  startMem?: Record<number | string, number[]>;
  starter?: number[];
  predictions?: Record<string, number[]>;
  events?: LessonEvent[];
  position?: number;
  memorySize?: number;
  /** Append the end marker (Stop, ebreak) after the cards; the student sees it only as "the end of the list". */
  hideEnd?: boolean;
}

/** The Stop card (ebreak). */
export const STOP_WORD = 0x00100073;

export const DEFAULT_MAX_STEPS = 10_000;
export const PIXEL_BASE = 1024;
export const PIXEL_COUNT = 256;

const REGISTERS = new Map<string, number>();
for (let n = 0; n < 32; n++) {
  REGISTERS.set(registerName(n), n);
  REGISTERS.set(`x${n}`, n);
}
REGISTERS.set("fp", 8);

/** Register number for an ABI name or x-name, or undefined. */
export function registerNumber(name: string): number | undefined {
  return REGISTERS.get(name.toLowerCase());
}

const JUMPS = new Set(["beq", "bne", "blt", "bge", "bltu", "bgeu", "jal", "jalr"]);

/** Run a program from address 0 until it stops, faults, waits for input or hits the step cap. */
export function runProgram(cards: number[], opts: RunOptions = {}): LessonRun {
  const words = opts.hideEnd ? [...cards, STOP_WORD] : cards;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  let output = "";
  const decoder = new TextDecoder();
  const machine = new Machine({
    memorySize: opts.memorySize ?? 65536,
    io: {
      write: (fd, bytes) => {
        if (fd === 1) output += decoder.decode(bytes, { stream: true });
      },
      read: () => null,
    },
  });

  let size = words.length * 4;
  const mem = Object.entries(opts.startMem ?? {}).map(([addr, bytes]) => ({ addr: Number(addr), bytes }));
  for (const m of mem) size = Math.max(size, m.addr + m.bytes.length);
  const image = new Uint8Array(size);
  words.forEach((w, i) => new DataView(image.buffer).setUint32(i * 4, w >>> 0, true));
  for (const m of mem) image.set(m.bytes, m.addr);
  machine.load(image, 0, 0);

  for (const [name, value] of Object.entries(opts.startRegs ?? {})) {
    const n = registerNumber(name);
    if (n === undefined) throw new RangeError(`no box called '${name}'`);
    if (n !== 0) machine.regs[n] = value >>> 0;
  }
  if (opts.stdin !== undefined) {
    machine.provideInput(new TextEncoder().encode(opts.stdin));
    machine.provideInput(new Uint8Array(0));
  }

  const executed = new Set<string>();
  let laps = 0;
  let hitStepCap = false;
  while (machine.state === "ready" || machine.state === "running") {
    if (machine.steps >= maxSteps) {
      hitStepCap = true;
      break;
    }
    const before = machine.steps;
    const result = machine.step();
    if (machine.steps === before) break; // a fault or a wait for input
    const mnemonic = result.decoded?.mnemonic;
    if (mnemonic) {
      executed.add(mnemonic);
      if (JUMPS.has(mnemonic) && machine.state === "running" && machine.pc < result.pc) laps++;
    }
  }

  const looks = (opts.events ?? []).filter((e): e is Extract<LessonEvent, { type: "look" }> => e.type === "look");
  return {
    machine,
    words: [...words],
    cards: cards.length,
    ...(opts.starter ? { starter: [...opts.starter] } : {}),
    output,
    predictions: opts.predictions ?? {},
    events: opts.events ?? [],
    steps: machine.steps,
    position: opts.position ?? looks.at(-1)?.step,
    executed: [...executed].sort(),
    laps,
    hitStepCap,
  };
}

/** Wrap a live machine (for example the one in the browser) as a run, with facts supplied by the caller. */
export function liveRun(machine: Machine, facts: Partial<Omit<LessonRun, "machine" | "steps">> & { words: number[] }): LessonRun {
  return {
    cards: facts.words.length,
    output: "",
    predictions: {},
    events: [],
    executed: [],
    laps: 0,
    hitStepCap: false,
    ...facts,
    machine,
    steps: machine.steps,
  };
}

/** Static mnemonics of a program; words that are not valid cards are skipped. */
export function mnemonicsOf(words: number[]): string[] {
  const out = new Set<string>();
  for (const w of words) {
    const d = decode(w);
    if (d) out.add(d.mnemonic);
  }
  return [...out];
}
