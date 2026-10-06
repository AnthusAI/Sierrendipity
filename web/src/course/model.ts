// Pure helpers for the course pages: branch points, star labels, card kinds for the Deck.
import { assemble, CARD_KINDS, decode, describe, type CardKind } from "@sierrendipity/explorer";
import { courseState, type CourseState, type ProgressData } from "@sierrendipity/lesson-core";
import type { CatalogLesson } from "./catalog";

export interface PathModel {
  state: CourseState;
  /** The lessons the state was built from (alternates collapsed to one per branch point). */
  lessons: CatalogLesson[];
  /** Set while the student stands at an unresolved branch point: the alternates to pick from. */
  choice: CatalogLesson[] | null;
  /** The lesson Continue starts (the picked alternate at a branch point). */
  target: CatalogLesson | null;
}

const passed = (progress: ProgressData, id: string): boolean => progress.lessons[id]?.passed === true;

/**
 * Build the path. A lesson with `alternateOf` is an alternate at the branch point of that base lesson;
 * passing any one of them settles it. While unsettled, only the picked one (default: the first) is on the path.
 */
export function buildPath(progress: ProgressData, catalog: CatalogLesson[], picks: Record<string, string> = {}): PathModel {
  const byBase = new Map<string, CatalogLesson[]>();
  for (const l of catalog.filter((x) => x.alternateOf)) byBase.set(l.alternateOf!, [...(byBase.get(l.alternateOf!) ?? []), l]);
  const groups = new Map<string, CatalogLesson[]>();
  const lessons: CatalogLesson[] = [];
  for (const l of catalog.filter((x) => !x.alternateOf)) {
    const members = [l, ...(byBase.get(l.id) ?? [])];
    if (members.length === 1) {
      lessons.push(l);
      continue;
    }
    groups.set(l.id, members);
    const done = members.filter((m) => passed(progress, m.id));
    lessons.push(...(done.length > 0 ? done : [members.find((m) => m.id === picks[l.id]) ?? l]));
  }
  const state = courseState(progress, lessons);
  let choice: CatalogLesson[] | null = null;
  for (const members of groups.values()) {
    if (state.current && members.some((m) => m.id === state.current) && !members.some((m) => passed(progress, m.id))) choice = members;
  }
  return { state, lessons, choice, target: state.current ? (lessons.find((l) => l.id === state.current) ?? null) : null };
}

/** A pick key for the branch point a lesson belongs to. */
export const baseOf = (l: CatalogLesson): string => l.alternateOf ?? l.id;

const STAR_LABELS: Record<string, string> = {
  pass: "Passed",
  "called-it": "Called it",
  "another-way": "Another way",
  "fewer-cards": "Fewer cards",
  twist: "Twist",
};

/** A star id as the student reads it: "called-it" becomes "Called it". */
export function starLabel(id: string): string {
  const known = STAR_LABELS[id];
  if (known) return known;
  const text = id.replace(/[-_]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The pass star first, then the bonus stars. */
export const starsOf = (bonuses: string[]): string[] => ["pass", ...bonuses];

/** Can the student open this lesson now? Passed and current lessons, or any lesson with the tutor override. */
export function canOpen(model: PathModel, lessonId: string, unlockAll: boolean): boolean {
  if (unlockAll) return true;
  const entry = model.state.lessons.find((l) => l.id === lessonId);
  if (entry) return entry.status === "done" || entry.status === "current";
  return model.choice?.some((m) => m.id === lessonId) ?? false;
}

// ---- The Instruction Deck: one card per kind, shown through a representative word.

const SAMPLES: Record<string, string> = {
  put: "addi a0, zero, 5",
  "add-number": "addi a0, a0, 3",
  "add-boxes": "add a2, a0, a1",
  "subtract-boxes": "sub a2, a0, a1",
  "paint-pixel": "sb a0, 1024(zero)",
  save: "sw a0, 0(a1)",
  fetch: "lw a0, 0(a1)",
  "jump-if-different": "bne a0, a1, -4",
  "jump-if-smaller": "blt a0, a1, -4",
  stop: "ebreak",
  copy: "mv a0, a1",
  "do-nothing": "nop",
  "jump-if-same": "beq a0, a1, -4",
  "jump-if-not-smaller": "bge a0, a1, -4",
  jump: "jal zero, -4",
  "jump-to-box": "jalr zero, 0(ra)",
  compare: "slt a2, a0, a1",
  logic: "and a2, a0, a1",
  shift: "slli a0, a0, 2",
  multiply: "mul a2, a0, a1",
  divide: "div a2, a0, a1",
  "big-number": "lui a0, 5",
  "ask-system": "ecall",
  "memory-order": "fence",
};

export interface DeckKind {
  kind: CardKind;
  title: string;
  word: number;
  /** Plain English for the front. */
  front: string;
  /** The assembly name (mnemonic) for the back. */
  name: string;
  /** The 32 bits, most significant first. */
  bits: string;
}

export const kindTitle = (kind: string): string => {
  const text = kind.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

let kinds: DeckKind[] | undefined;
/** Every kind a student can meet (all but the honest "unknown" fallback), in the Deck's order. */
export function deckKinds(): DeckKind[] {
  kinds ??= CARD_KINDS.filter((k) => k !== "unknown").map((kind) => {
    const source = SAMPLES[kind];
    const word = source ? (assemble(source).words?.[0] ?? 0) : 0;
    return { kind, title: kindTitle(kind), word, front: describe(word).text, name: decode(word)?.mnemonic ?? "?", bits: (word >>> 0).toString(2).padStart(32, "0") };
  });
  return kinds;
}
