import { Machine, Timeline, decode, registerName, type Decoded } from "@sierrendipity/explorer";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, "instant"] as const;
export type Speed = (typeof SPEEDS)[number];

/** Milliseconds one step's animation lasts at speed 1x. */
export const STEP_MS = 800;
/** Most steps recorded by default: plenty for a lesson, and a runaway program is cut off quickly. */
export const DEFAULT_MAX_STEPS = 2000;
const EBREAK = 0x00100073;

/** True when the URL has `?testclock`: the clock is then fixed at 1 and tests move it with `window.__diagramClock`. */
export const TEST_CLOCK = typeof location !== "undefined" && new URLSearchParams(location.search).has("testclock");

type ClockListener = (t: number) => void;
const clockListeners = new Set<ClockListener>();
if (TEST_CLOCK) {
  (window as unknown as { __diagramClock: { set(t: number): void } }).__diagramClock = {
    set: (t) => clockListeners.forEach((listener) => listener(t)),
  };
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const query = matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The system's reduced-motion preference (live), or `override` when given (the lab's toggle). */
export function useReducedMotion(override?: boolean): boolean {
  const system = useSyncExternalStore(subscribeReduced, () => matchMedia(REDUCED_QUERY).matches, () => false);
  return override ?? system;
}

export interface MachineTimelineOptions {
  /** A trailing `ebreak` is not a student step: it runs automatically after the last card. */
  hideEnd?: boolean;
  /** The boxes (registers, by ABI name) the diagrams show. Default `["a0"]`. */
  boxes?: string[];
  /** Show the pointing hand (the program counter). Default false. */
  pointer?: boolean;
  memorySize?: number;
  /** Most steps recorded before the program is cut off as "keeps going" (default 2000). */
  maxSteps?: number;
  /** Force reduced motion on or off instead of following the system. */
  reducedMotion?: boolean;
}

/** One visible step: the card that ran and what it did. */
export interface StepInfo {
  /** Byte address of the card that ran. */
  pc: number;
  word: number;
  decoded: Decoded | null;
  /** The destination register of the card; null when it has none or the step faulted. */
  rd: number | null;
  /** The machine's state after the step, and the fault message when it faulted (the step then changed nothing). */
  state: string;
  fault: string | null;
  memWrite?: { addr: number; length: number };
  /** The program counter after the step. */
  nextPc: number;
  before: number[];
  after: number[];
}

export interface MachineTimeline {
  /** The cards the student sees (without the hidden end marker). */
  words: number[];
  boxes: string[];
  pointer: boolean;
  hideEnd: boolean;
  reducedMotion: boolean;
  position: number;
  /** Number of visible steps. With `hideEnd` this equals the number of cards the program ran. */
  length: number;
  snapshot: ReturnType<Timeline["snapshotAt"]>;
  /** Register and memory changes of the step that led to `position` (null at 0). */
  diff: ReturnType<Timeline["diff"]> | null;
  /** The step that led to `position` (null at 0). */
  lastStep: StepInfo | null;
  /** Registers written by some step up to `position`. */
  written: ReadonlySet<number>;
  /** The first visible step that wrote each register. */
  firstWrite: ReadonlyMap<number, number>;
  /** True when the program was cut off at `maxSteps` although it could go on. */
  hitStepLimit: boolean;
  maxSteps: number;
  /** True when the hidden end marker really ran (only with `hideEnd`, and only for a program that reached it). */
  endHidden: boolean;
  /** Something to announce after Back, e.g. "Went back to step 1." */
  announcement: string;
  stepAt(position: number): StepInfo | null;
  /** Bytes of memory at `position` (default: now). */
  readMem(addr: number, length: number, position?: number): Uint8Array;
  /** The most recent step up to `position` that wrote memory overlapping [addr, addr + length). */
  lastMemWrite(addr: number, length: number): { step: number; addr: number; length: number } | null;
  stepForward(): boolean;
  stepBackward(): boolean;
  seek(position: number): void;
  play(): void;
  pause(): void;
  playing: boolean;
  speed: Speed;
  setSpeed(speed: Speed): void;
  isAtEnd: boolean;
  reset(): void;
  /** The animation clock for the step just taken, 0 to 1 (1 when settled or when nothing is moving). */
  t: number;
  /** Position the last forward step came from, while it may still be animating. */
  from: number | null;
}

/** Register index for an ABI name such as "a0". */
export function registerIndex(name: string): number {
  for (let i = 0; i < 32; i++) if (registerName(i) === name) return i;
  throw new RangeError(`Unknown box ${name}`);
}

function imageOf(words: number[]) {
  const image = new Uint8Array(words.length * 4);
  const view = new DataView(image.buffer);
  words.forEach((word, i) => view.setUint32(i * 4, word >>> 0, true));
  return image;
}

/** Builds a real Machine and Timeline from `words` and plays them with one animation clock. */
export function useMachineTimeline(words: number[], opts: MachineTimelineOptions = {}): MachineTimeline {
  const hideEnd = opts.hideEnd ?? false;
  const boxes = useMemo(() => opts.boxes ?? ["a0"], [(opts.boxes ?? ["a0"]).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const pointer = opts.pointer ?? false;
  const reducedMotion = useReducedMotion(opts.reducedMotion);
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const key = words.join(",");

  const { cards, timeline, endHidden } = useMemo(() => {
    const cards = hideEnd && words.length > 0 && words[words.length - 1] === EBREAK ? words.slice(0, -1) : words;
    const program = hideEnd ? [...cards, EBREAK] : cards;
    const machine = new Machine({ memorySize: opts.memorySize ?? 16384 });
    machine.load(imageOf(program), 0, 0);
    const timeline = new Timeline(machine, { maxSteps });
    timeline.runToEnd();
    const last = timeline.length > 0 ? timeline.snapshotAt(timeline.length) : undefined;
    // Only the ebreak appended here is the hidden end; a Stop card inside the program is a real card.
    const endHidden = hideEnd && last?.state === "halted" && last.lastStep?.pc === cards.length * 4;
    return { cards, timeline, endHidden };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hideEnd, opts.memorySize, maxSteps]);

  const length = endHidden ? timeline.length - 1 : timeline.length;
  /** The Timeline position behind a visible position: the hidden end marker runs with the last card. */
  const under = useCallback((p: number) => (endHidden && p === length ? timeline.length : p), [endHidden, length, timeline]);

  const [state, setState] = useState<{ position: number; from: number | null; run: number }>({ position: 0, from: null, run: 0 });
  const [t, setT] = useState(1);
  const [override, setOverride] = useState<number | null>(null);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const latest = useRef({ position: 0, length, speed, reducedMotion });
  latest.current = { position: state.position, length, speed, reducedMotion };

  // A different program starts over.
  useEffect(() => {
    setState({ position: 0, from: null, run: 0 });
    setPlaying(false);
    setAnnouncement("");
    setT(1);
  }, [timeline]);

  useEffect(() => {
    if (!TEST_CLOCK) return;
    clockListeners.add(setOverride);
    return () => void clockListeners.delete(setOverride);
  }, []);
  useEffect(() => setOverride(null), [state.position]);

  const animated = !TEST_CLOCK && !reducedMotion && speed !== "instant";
  useEffect(() => {
    if (state.from === null || !animated) return;
    const duration = STEP_MS / (speed as number);
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(1, (now - start) / duration);
      setT(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
    // The clock restarts for every forward step (`run`), not when the speed is changed mid-step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.run]);

  const goTo = useCallback((position: number, from: number | null, announce = "") => {
    setState((s) => ({ position, from, run: from === null ? s.run : s.run + 1 }));
    setAnnouncement(announce);
    setT(from === null || TEST_CLOCK || latest.current.reducedMotion || latest.current.speed === "instant" ? 1 : 0);
  }, []);

  const stepForward = useCallback(() => {
    const { position, length } = latest.current;
    if (position >= length) return false;
    goTo(position + 1, position);
    return true;
  }, [goTo]);
  const stepBackward = useCallback(() => {
    const { position } = latest.current;
    if (position <= 0) return false;
    goTo(position - 1, null, `Went back to step ${position - 1}.`);
    return true;
  }, [goTo]);
  const seek = useCallback(
    (position: number) => {
      const { length } = latest.current;
      if (!Number.isInteger(position) || position < 0 || position > length) throw new RangeError(`position ${position} outside 0..${length}`);
      goTo(position, null);
    },
    [goTo],
  );
  const reset = useCallback(() => {
    setPlaying(false);
    goTo(0, null);
  }, [goTo]);
  const pause = useCallback(() => setPlaying(false), []);
  const play = useCallback(() => {
    if (latest.current.length === 0) return;
    if (latest.current.position >= latest.current.length) goTo(0, null);
    setPlaying(true);
  }, [goTo]);

  useEffect(() => {
    if (!playing) return;
    if (state.position >= length) return void setPlaying(false);
    if (speed === "instant") {
      goTo(length, null);
      return void setPlaying(false);
    }
    const rest = animated ? STEP_MS + 300 : 300;
    const id = setTimeout(stepForward, rest / speed);
    return () => clearTimeout(id);
  }, [playing, state.position, length, speed, animated, goTo, stepForward]);

  const position = Math.min(state.position, length);

  // Every visible step, worked out once per program so rendering and the log stay cheap.
  const steps = useMemo(() => {
    const out: StepInfo[] = [];
    let before = timeline.snapshotAt(0).regs;
    for (let p = 1; p <= length; p++) {
      const at = timeline.snapshotAt(p);
      const step = at.lastStep!;
      const decoded = step.decoded ?? decode(step.word);
      const faulted = step.state === "faulted";
      const rd = faulted ? null : (decoded?.fields.find((field) => field.name === "rd")?.value ?? null);
      out.push({
        pc: step.pc,
        word: step.word,
        decoded,
        rd,
        state: step.state,
        fault: faulted ? at.fault : null,
        memWrite: step.memWrite,
        nextPc: at.pc,
        before,
        after: at.regs,
      });
      before = at.regs;
    }
    return out;
  }, [timeline, length]);
  const stepAt = useCallback((p: number): StepInfo | null => steps[p - 1] ?? null, [steps]);
  const firstWrite = useMemo(() => {
    const first = new Map<number, number>();
    steps.forEach((step, i) => {
      if (step.rd && !first.has(step.rd)) first.set(step.rd, i + 1);
    });
    return first;
  }, [steps]);

  const snapshot = useMemo(() => timeline.snapshotAt(under(position)), [timeline, under, position]);
  const diff = useMemo(() => (position > 0 ? timeline.diff(under(position - 1), under(position)) : null), [timeline, under, position]);
  const written = useMemo(() => new Set([...firstWrite].filter(([, p]) => p <= position).map(([reg]) => reg)), [firstWrite, position]);

  const readMem = useCallback(
    (addr: number, count: number, at: number = position) => timeline.readMem(addr, count, under(at)),
    [timeline, under, position],
  );
  const lastMemWrite = useCallback(
    (addr: number, count: number) => {
      for (let p = position; p >= 1; p--) {
        const write = steps[p - 1].memWrite;
        if (write && write.addr < addr + count && write.addr + write.length > addr) return { step: p, addr: write.addr, length: write.length };
      }
      return null;
    },
    [steps, position],
  );

  const settled = state.from === null ? 1 : TEST_CLOCK ? (override ?? 1) : t;
  return {
    words: cards,
    boxes,
    pointer,
    hideEnd,
    reducedMotion,
    position,
    length,
    snapshot,
    diff,
    lastStep: stepAt(position),
    written,
    firstWrite,
    hitStepLimit: timeline.hitStepLimit,
    maxSteps,
    endHidden,
    announcement,
    stepAt,
    readMem,
    lastMemWrite,
    stepForward,
    stepBackward,
    seek,
    play,
    pause,
    playing,
    speed,
    setSpeed,
    isAtEnd: position >= length,
    reset,
    t: settled,
    from: state.from,
  };
}
