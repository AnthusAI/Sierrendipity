import type { Feature } from "./gherkin/parse";
import type { Ghost } from "./ghost";

/** A program (cards are just words) plus the text it was authored as. */
export interface Program {
  kind: "asm" | "hex";
  text: string;
  words: number[];
}

export type Ask =
  | { kind: "number"; question: string; answer: number; target?: string }
  | { kind: "choice"; question: string; choices: string[]; answer: number }
  | { kind: "click-target"; question: string; target: string }
  | { kind: "machine-query"; question: string; query: string };

export interface OnWrong {
  /** The wrong answer to react to (a number, or text for choices). */
  match: number | string;
  say: string;
  goto?: string;
}

export interface Scene {
  id: string;
  say: string;
  show: string[];
  spotlight?: string;
  ask?: Ask;
  /** Step phrases that must all hold before the scene is done; empty means [Continue]. */
  until: string[];
  onWrong: OnWrong[];
  /** Exactly three, escalating: nudge, narrower question, near-answer. */
  hints: string[];
  showMe?: string;
  lock: string[];
  skippable: boolean;
}

/** A small predict-the-result question: run the program, ask what `target` holds. */
export interface Warmup {
  id: string;
  concept: string;
  question: string;
  program: Program;
  target: string;
  expected: number;
  startRegs?: Record<string, number>;
}

export interface SideRoom {
  id: string;
  title: string;
  /** The bonus star id that opens it. */
  opensWith: string;
}

/** What a reference solution must earn; the checker runs it and compares. */
export interface SolutionDecl {
  file: string;
  words: number[];
  /** Star ids it must earn exactly ("pass" and bonus ids); empty for a deliberately wrong solution. */
  earns: string[];
  predictions: Record<string, number[]>;
  stdin?: string;
  maxSteps?: number;
  /** True when it never stops by itself and must be cut off by the step cap. */
  capped: boolean;
  note?: string;
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  concepts: { introduces: string[]; requires: string[] };
  starter: Program;
  tabs: string[];
  scenes: Scene[];
  nowYouCan: string[];
  warmups: Warmup[];
  sideRooms: SideRoom[];
  ghosts: Record<string, Ghost>;
  checks: Feature;
  solutions: SolutionDecl[];
}

/** What the browser loads: the lesson with Gherkin precompiled to data and no solutions. */
export type PublishedLesson = Omit<Lesson, "solutions"> & { format: 1 };

export const TABS = ["cards", "lamps", "hex", "assembly", "boxes", "shelves", "screen", "output"] as const;
export const SHOWABLE = [...TABS, ...Array.from({ length: 14 }, (_, i) => `D${i + 1}`)];
export const LOCKS = ["edit", "step", "back", "run", "reset", "drag", "toggle"] as const;
export const ASK_KINDS = ["number", "choice", "click-target", "machine-query"] as const;
export const MAX_WORDS_PER_SCENE = 30;
export const MAX_SENTENCES_PER_SCENE = 2;
export const MAX_STEPS_CAP = 1_000_000;

export function publishLesson(lesson: Lesson): PublishedLesson {
  const { solutions: _solutions, ...rest } = lesson;
  return { ...rest, format: 1 };
}
