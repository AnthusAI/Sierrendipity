import { decode, fromWords, Machine, registerName, Session, type MachineView, type StepResult } from "@sierrendipity/explorer";
import type { FunctionBoxes } from "../function";

/** Something the student did in the UI, recorded as a fact for lesson conditions. */
export type LessonEvent =
  | { type: "edit"; card: number; to: number }
  | { type: "toggle"; card: number; bit: number }
  | { type: "rewind" }
  | { type: "look"; step: number }
  | { type: "table"; inputs: number[] };

/** A machine plus everything recorded about how it got where it is. Plain data: pure and no DOM. */
export interface LessonRun {
  machine: MachineView;
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
  /** The lesson's function and its boxes, for phrases such as `f(3) is 10`. */
  functionBoxes?: FunctionBoxes;
  /** The x the machine started with (the input box), for the phrase `x is 3`. */
  functionInput?: number;
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
  functionBoxes?: FunctionBoxes;
  functionInput?: number;
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

/** True once the hidden end marker (Stop) has run: it is the card after the student's last one. */
function markerRan(machine: Machine, cards: number, hideEnd: boolean): boolean {
  return hideEnd && machine.state === "halted" && machine.exitCode === null && machine.pc === cards * 4;
}

/**
 * With a hidden end, the marker is not a student step: when the last visible card has run, the machine
 * executes it by itself, so the number of Steps equals the number of cards.
 */
function autoStop(machine: Machine, cards: number, hideEnd: boolean): void {
  if (hideEnd && (machine.state === "ready" || machine.state === "running") && machine.pc === cards * 4) machine.step();
}

/** Student-visible steps: the machine's steps minus the hidden marker. */
function visibleSteps(machine: Machine, cards: number, hideEnd: boolean): number {
  return machine.steps - (markerRan(machine, cards, hideEnd) ? 1 : 0);
}

/**
 * Run a program from address 0 until it stops, faults, waits for input or hits the step cap. With
 * `hideEnd` the end marker is appended and run automatically; `steps` and `maxSteps` count only the
 * student's cards.
 */
export function runProgram(cards: number[], opts: RunOptions = {}): LessonRun {
  const hideEnd = opts.hideEnd === true;
  const words = hideEnd ? [...cards, STOP_WORD] : cards;
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
  autoStop(machine, cards.length, hideEnd);
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
      // A jump or branch that lands on itself or earlier is a lap (a jump to itself is a one-card loop).
      if (JUMPS.has(mnemonic) && machine.state === "running" && machine.pc <= result.pc) laps++;
    }
    autoStop(machine, cards.length, hideEnd);
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
    steps: visibleSteps(machine, cards.length, hideEnd),
    position: opts.position ?? looks.at(-1)?.step,
    executed: [...executed].sort(),
    laps,
    hitStepCap,
    ...(opts.functionBoxes ? { functionBoxes: opts.functionBoxes } : {}),
    ...(opts.functionInput !== undefined ? { functionInput: opts.functionInput } : {}),
  };
}

/**
 * Wrap a live machine (for example the one in the browser) as a run, with facts supplied by the caller.
 * With `hideEnd` the caller's `words` include the end marker; when the last visible card has run this
 * executes the hidden Stop itself, and `steps` counts only student-visible steps. Evaluate scene
 * `until` conditions on `liveRun` after every student action, and `@pass` on the finished run.
 */
export function liveRun(
  machine: Machine,
  facts: Partial<Omit<LessonRun, "machine" | "steps" | "cards">> & { words: number[]; hideEnd?: boolean },
): LessonRun {
  const { hideEnd = false, ...rest } = facts;
  const cards = hideEnd ? facts.words.length - 1 : facts.words.length;
  autoStop(machine, cards, hideEnd);
  return {
    output: "",
    predictions: {},
    events: [],
    executed: [],
    laps: 0,
    hitStepCap: false,
    ...rest,
    cards,
    machine,
    steps: visibleSteps(machine, cards, hideEnd),
  };
}

/** A machine the student is stepping through, for the player and for specs. */
export interface Live {
  /** The one session behind every view: the player, the checker and the stage all read it. */
  session: Session;
  /** The session's machine as it stands at the current position. */
  readonly machine: MachineView;
  cards: number;
  hideEnd: boolean;
  words: number[];
  /** Facts the player records: predictions, events, output. Mutate freely. */
  facts: Partial<Omit<LessonRun, "machine" | "steps" | "cards" | "words">>;
}

/** Most steps a live machine records: a runaway program is cut off quickly (the stage's long-standing limit). */
export const LIVE_MAX_STEPS = 2000;

export function startLive(cards: number[], opts: { hideEnd?: boolean; memorySize?: number; maxSteps?: number; startRegs?: Record<string, number> } = {}): Live {
  const hideEnd = opts.hideEnd === true;
  const words = hideEnd ? [...cards, STOP_WORD] : [...cards];
  const startRegs: Record<number, number> = {};
  for (const [name, value] of Object.entries(opts.startRegs ?? {})) {
    const n = registerNumber(name);
    if (n === undefined) throw new RangeError(`no box called '${name}'`);
    startRegs[n] = value;
  }
  const session = new Session(fromWords(words, { memorySize: opts.memorySize ?? 65536 }), { hideEnd, maxSteps: opts.maxSteps ?? LIVE_MAX_STEPS, startRegs });
  return {
    session,
    get machine() {
      return session.machine;
    },
    cards: cards.length,
    hideEnd,
    words,
    facts: {},
  };
}

/** One student Step: runs the next card, then the hidden Stop if that was the last card. Null when the machine cannot step. */
export function pressStep(live: Live): StepResult | null {
  return live.session.stepForward();
}

/** One student Back: undoes the last visible step (and the hidden Stop with it). False at the start. */
export function pressBack(live: Live): boolean {
  return live.session.stepBackward();
}

export function liveRunOf(live: Live): LessonRun {
  return {
    output: "",
    predictions: {},
    events: [],
    executed: [],
    laps: 0,
    ...live.facts,
    hitStepCap: live.facts.hitStepCap === true || live.session.hitStepLimit,
    words: live.words,
    cards: live.cards,
    machine: live.session.machine,
    steps: live.session.steps,
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
