import type { SideRoom, Warmup } from "../lesson";
import { DAY_MS, type ProgressData } from "./types";

/** What the path and warm-ups need to know about a lesson; a PublishedLesson satisfies it. */
export interface LessonSummary {
  id: string;
  title: string;
  concepts: { introduces: string[]; requires: string[] };
  warmups: Warmup[];
  sideRooms: SideRoom[];
}

export interface PickedWarmup {
  concept: string;
  lessonId: string;
  warmup: Warmup;
}

/**
 * One predict-the-result warm-up for the weakest concept that was introduced at least a day ago and
 * has a warm-up: lowest Leitner box first, then longest since last seen, then concept id. Within a
 * concept the warm-ups rotate by how many have already been answered. Null when nothing qualifies.
 */
export function pickWarmup(progress: ProgressData, lessons: LessonSummary[], now: number): PickedWarmup | null {
  const bank = new Map<string, { lessonId: string; warmup: Warmup }[]>();
  for (const l of lessons) for (const w of l.warmups) (bank.get(w.concept) ?? bank.set(w.concept, []).get(w.concept)!).push({ lessonId: l.id, warmup: w });

  const candidates = Object.entries(progress.mastery)
    .filter(([concept, m]) => bank.has(concept) && m.introducedAt <= now - DAY_MS)
    .sort(([ca, a], [cb, b]) => a.box - b.box || a.lastSeen - b.lastSeen || (ca < cb ? -1 : ca > cb ? 1 : 0));
  const first = candidates[0];
  if (!first) return null;

  const concept = first[0];
  const options = bank.get(concept)!;
  const answered = progress.events.filter((e) => e.type === "warmup" && e.concept === concept).length;
  const pick = options[answered % options.length]!;
  return { concept, lessonId: pick.lessonId, warmup: pick.warmup };
}

export type PathStatus = "done" | "current" | "next" | "fog";
export type PathLesson =
  | { id: string; title: string; status: "done"; bonuses: string[] }
  | { id: string; title: string; status: "current" }
  | { id: string; title: string; status: "next"; dim: true }
  /** Fogged lessons show their title only. */
  | { id: string; title: string; status: "fog" };

export interface SideRoomState {
  id: string;
  title: string;
  lessonId: string;
  open: boolean;
}

export type ContinueTarget = { kind: "lesson"; lessonId: string } | { kind: "complete" };

export interface CourseState {
  lessons: PathLesson[];
  current: string | null;
  next: string | null;
  sideRooms: SideRoomState[];
  /** Exactly one primary action. */
  continueTarget: ContinueTarget;
}

/**
 * The path model for the UI. The first lesson not yet passed is current, the one after is next (dim),
 * the rest are fog (titles only). Passing gates the next lesson; stars never do. A bonus star only
 * opens its side room.
 */
export function courseState(progress: ProgressData, lessons: LessonSummary[]): CourseState {
  const passed = (id: string): boolean => progress.lessons[id]?.passed === true;
  const currentIndex = lessons.findIndex((l) => !passed(l.id));
  const nextIndex = currentIndex < 0 ? -1 : lessons.findIndex((l, i) => i > currentIndex && !passed(l.id));

  const path = lessons.map((l, i): PathLesson => {
    if (passed(l.id)) return { id: l.id, title: l.title, status: "done", bonuses: [...(progress.lessons[l.id]?.bonuses ?? [])] };
    if (i === currentIndex) return { id: l.id, title: l.title, status: "current" };
    if (i === nextIndex) return { id: l.id, title: l.title, status: "next", dim: true };
    return { id: l.id, title: l.title, status: "fog" };
  });

  const sideRooms = lessons.flatMap((l) =>
    l.sideRooms.map((r): SideRoomState => ({ id: r.id, title: r.title, lessonId: l.id, open: progress.lessons[l.id]?.bonuses.includes(r.opensWith) === true })),
  );

  const current = currentIndex < 0 ? null : lessons[currentIndex]!.id;
  return {
    lessons: path,
    current,
    next: nextIndex < 0 ? null : lessons[nextIndex]!.id,
    sideRooms,
    continueTarget: current ? { kind: "lesson", lessonId: current } : { kind: "complete" },
  };
}
