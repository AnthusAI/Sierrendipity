import type { Feature } from "./gherkin/parse";
import type { Ghost } from "./ghost";
import type { LessonFunction } from "./function";
import type { CustomCard } from "./cards/model";

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
  | { kind: "machine-query"; question: string; query: string }
  /** The student fills f(x) for each input; the expected values come from running the starter on each input. */
  | { kind: "table"; question: string; inputs: number[]; target: string };

export interface OnWrong {
  /** The wrong answer to react to (a number, or text for choices). */
  match: number | string;
  say: string;
  goto?: string;
}

/** Bit lamps (D4) or field bands (D8) on one card of the list. */
export interface LampSpec {
  /** The card (0-based) whose word the lamps show and edit. */
  card: number;
  /** `word` (default): all 32 lamps of the card. `number`: only the number of a put or add-a-number card, as place values 1, 2, 4. */
  of?: "word" | "number";
  /** Lamps shown with `of: number`, 1 to 11 (default 8). */
  width?: number;
  /** When given, only these lamps can be switched (bit numbers as shown). */
  allowedBits?: number[];
  /** Lamps that cannot be switched. */
  lockedBits?: number[];
  /** A number the student is asked to make; the stage shows it beside the lamps. */
  target?: number;
  /** What to hide: the worth under each lamp, or the line with the total. The student reads the lamps instead. */
  hide?: ("worth" | "total")[];
}

/** The card flip (D5): one card seen through its lenses. */
export interface FlipSpec {
  card: number;
  lenses?: string[];
}

/** The student selects `min` to `max` cards of the list and saves them as one named card (needs the `builder`). */
export interface SaveSpec {
  min: number;
  max: number;
  /** The name the card must have; when absent the student chooses. */
  name?: string;
}

export interface Scene {
  id: string;
  say: string;
  /** Said when the scene's goal is met (same limits as `say`); without it the player only announces quietly. */
  doneSay?: string;
  /**
   * Said when the machine finishes and the goal is not met (same limits as `say`), with a [Try again] button.
   * It tells the student what the machine did and what to change, so a run that misses never ends in silence.
   */
  ifMissed?: string;
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
  /** From this scene on, a screen reader is told about the glass line (needs ui.glass). Until then it is hidden from assistive tools. */
  glassNamed?: boolean;
  /** D4 bit lamps on a card. */
  lamps?: LampSpec;
  /** D8 field bands on a card (the bands carry their lamps). */
  bands?: LampSpec;
  /** D5 card flip. */
  flip?: FlipSpec;
  /** D7 carry ripple: add a and b in binary. */
  carry?: { a: number; b: number };
  /** The builder's tray: the card words a student may drag into the list. */
  tray?: number[];
  /** The student saves selected cards as one custom card. */
  save?: SaveSpec;
  /** Function lessons: x is fixed to this number in this scene. The player sets it on entry and locks it; the checker judges the scene at it. */
  input?: number;
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
  /** Words after the end marker: the bodies of the custom cards the card program calls (words are then the main cards only). */
  tail?: number[];
  /** Names of the custom cards the program calls. */
  usedCards?: string[];
  /** Scenes whose `until` this solution is the way to meet, even though it does not pass the lesson (a step on the way). */
  scenes?: string[];
  note?: string;
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  concepts: { introduces: string[]; requires: string[] };
  /**
   * The machine starts small: only these boxes are shown (ABI names), in this order. More appear in
   * later lessons when they are needed.
   */
  boxes: string[];
  /** Show the arrow that points at the card being run (the program counter). Default false in early lessons. */
  pointer: boolean;
  /**
   * Hide the Stop card. Programs (starter, solutions, warm-ups) then list only the student's cards;
   * the player appends the end marker (`runProgram(cards, { hideEnd: true })`) and shows it only as
   * "the end of the list" until a later lesson introduces Stop.
   */
  hideEnd: boolean;
  /** The reply to any wrong answer not covered by a scene's onWrong; required when any scene asks. */
  onWrongDefault?: string;
  /** Where any other wrong answer goes: the scene that reveals the answer. Required unless the next scene waits on the machine. */
  onWrongDefaultGoto?: string;
  /** What the stage shows. Early lessons show only what the idea needs; every field defaults to the full machine. */
  ui?: LessonUi;
  /** The function this lesson's program computes: the rule banner, `f(3) is 10` phrases and the table ask use it. */
  function?: LessonFunction;
  /** Custom cards the lesson gives the student: they are in the builder's tray, and solutions may use them. */
  customCards?: CustomCard[];
  /** A draft is playable only with `?draft=1` in dev and test builds and is left out of the catalog and the path. */
  draft: boolean;
  /** False opts a hidden-end, pointer-less lesson out of the early-lesson caps. */
  earlyLesson: boolean;
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
/** Which parts of the machine a lesson shows. A part a lesson leaves out appears in a later lesson that needs it. */
export interface LessonUi {
  /** The buttons shown under the title. Default: step, back and reset. */
  controls?: ("step" | "back" | "reset")[];
  /** The text on the Step button, for a lesson that calls it something friendlier (for example "Run"). */
  stepLabel?: string;
  /** The text on the Reset button (for example "Start again"). */
  resetLabel?: string;
  /** The "What just happened" log. Default true. */
  log?: boolean;
  /** The "The desk" heading above the boxes. Default true. */
  deskTitle?: boolean;
  /** The "end of the list" row. Default true. */
  endMarker?: boolean;
  /** The small register name (a0) on each box. Default true. */
  boxNames?: boolean;
  /** The faint "glass" line under each card: its real assembly and machine word. Default false. */
  glass?: boolean;
  /** How a scene's spotlight points: a ring that does not dim the page, or the dimming spotlight. Default ring. */
  spotlight?: "ring" | "dim";
  /** Spotlights on goal and question scenes show only after the first hint. Default false. */
  spotlightAfterHint?: boolean;
}

export type PublishedLesson = Omit<Lesson, "solutions"> & { format: 1 };

export const TABS = ["cards", "lamps", "hex", "assembly", "boxes", "shelves", "screen", "output"] as const;
/** Diagrams D1 to D14 plus the `timeline` scrubber and the program `builder`. */
export const SHOWABLE = [...TABS, ...Array.from({ length: 14 }, (_, i) => `D${i + 1}`), "timeline", "builder"];
export const LENSES = ["card", "lamps", "number", "hex", "assembly"] as const;
/** The field bands a card can show (`band:<field>` targets). */
export const BAND_FIELDS = ["opcode", "rd", "rs1", "rs2", "funct3", "funct7", "imm", "shamt", "special"] as const;
export const LOCKS = ["edit", "step", "back", "run", "reset", "drag", "toggle"] as const;
export const ASK_KINDS = ["number", "choice", "click-target", "machine-query", "table"] as const;
export const MAX_TABLE_ROWS = 8;
export const MAX_WORDS_PER_SCENE = 30;
export const MAX_SENTENCES_PER_SCENE = 2;
export const MAX_STEPS_CAP = 1_000_000;

export function publishLesson(lesson: Lesson): PublishedLesson {
  const { solutions: _solutions, ...rest } = lesson;
  return { ...rest, format: 1 };
}

/** Early lessons (hidden end, no pointer) stay tiny unless the lesson says `earlyLesson: false`. */
export const EARLY_MAX_CARDS = 3;
export const EARLY_MAX_MINUTES = 5;
export const MAX_HINT_CHARS = 120;
export const MAX_QUESTION_CHARS = 200;
export const MAX_NOW_YOU_CAN_CHARS = 80;
export const UI_BUTTONS = ["step", "back", "run", "pause", "reset"] as const;

/** Is this a UI target the player really has, given the lesson's boxes, tabs and card count? */
export function knownTarget(target: string, ctx: { boxes: string[]; tabs: string[]; cards: number }): boolean {
  // `flip` and `tray` are whole widgets: they take no name.
  if (target === "flip" || target === "tray") return true;
  const [kind, name = ""] = target.split(":");
  switch (kind) {
    case "button":
      return (UI_BUTTONS as readonly string[]).includes(name);
    case "card":
      return /^\d+$/.test(name) && Number(name) < Math.max(ctx.cards, 1);
    case "glass":
      return /^\d+$/.test(name) && Number(name) < Math.max(ctx.cards, 1);
    case "box":
      return ctx.boxes.includes(name);
    case "tab":
      return ctx.tabs.includes(name);
    case "diagram":
      return /^D([1-9]|1[0-4])$/.test(name);
    case "band":
      return (BAND_FIELDS as readonly string[]).includes(name);
    case "lamp":
      return /^(\d|[12]\d|3[01])$/.test(name);
    case "banner":
      return name === "rule";
    default:
      return false;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Is this parsed JSON a lesson the player can run? Returns null when it is, or a short technical reason
 * (for the console, never for students). Checks the shape the player relies on, not every loader rule.
 */
export function isPublishedLesson(value: unknown): string | null {
  if (!isObject(value)) return "not an object";
  if (value.format !== 1) return `format is ${String(value.format)}, expected 1`;
  for (const key of ["id", "title"]) if (typeof value[key] !== "string") return `${key} must be text`;
  if (typeof value.minutes !== "number") return "minutes must be a number";
  if (!strings(value.boxes) || (value.boxes as string[]).length === 0) return "boxes must be a list of names";
  if (value.draft !== undefined && typeof value.draft !== "boolean") return "draft must be true or false";
  if (typeof value.hideEnd !== "boolean" || typeof value.pointer !== "boolean") return "hideEnd and pointer must be true or false";
  if (!isObject(value.starter) || !Array.isArray(value.starter.words) || !value.starter.words.every((w) => typeof w === "number")) return "starter.words must be a list of numbers";
  if (!isObject(value.concepts) || !strings(value.concepts.introduces)) return "concepts.introduces must be a list";
  if (!strings(value.nowYouCan)) return "nowYouCan must be a list of lines";
  if (!isObject(value.ghosts)) return "ghosts must be an object";
  if (!isObject(value.checks) || !Array.isArray(value.checks.scenarios)) return "checks.scenarios must be a list";
  if (!Array.isArray(value.scenes) || value.scenes.length === 0) return "scenes must be a non-empty list";
  for (const [i, scene] of (value.scenes as unknown[]).entries()) {
    if (!isObject(scene) || typeof scene.id !== "string" || typeof scene.say !== "string") return `scenes[${i}] needs an id and say`;
    if (!strings(scene.until) || !strings(scene.hints) || !strings(scene.lock) || !Array.isArray(scene.onWrong)) return `scenes[${i}] is missing until, hints, lock or onWrong`;
  }
  return null;
}
