// Lesson metadata for the path, from `/catalog.json`. The file is written at build time by
// `scripts/build-catalog.ts` (also run by `npm run lessons:build`) from the lesson files, and holds only
// what the path, warm-ups and recap need: no scenes, checks or solutions. The web app never parses YAML.
import type { LessonSummary, SideRoom, Warmup } from "@sierrendipity/lesson-core";

export interface CatalogLesson extends LessonSummary {
  minutes: number;
  nowYouCan: string[];
  /** Set on a lesson that is an alternate to another (the base lesson's id): the path then offers a choice. */
  alternateOf?: string;
}

export interface Catalog {
  version: 1;
  lessons: CatalogLesson[];
}

export type CatalogState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; lessons: CatalogLesson[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function lessonOf(raw: unknown): CatalogLesson | null {
  if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  const concepts = isObj(raw.concepts) ? raw.concepts : {};
  return {
    id: raw.id,
    title: raw.title,
    minutes: typeof raw.minutes === "number" && raw.minutes > 0 ? Math.round(raw.minutes) : 5,
    concepts: { introduces: strings(concepts.introduces), requires: strings(concepts.requires) },
    nowYouCan: strings(raw.nowYouCan),
    warmups: Array.isArray(raw.warmups) ? (raw.warmups.filter((w) => isObj(w) && typeof w.id === "string" && typeof w.concept === "string" && typeof w.question === "string" && typeof w.expected === "number" && isObj(w.program) && Array.isArray(w.program.words)) as unknown as Warmup[]) : [],
    sideRooms: Array.isArray(raw.sideRooms) ? (raw.sideRooms.filter((r) => isObj(r) && typeof r.id === "string" && typeof r.title === "string" && typeof r.opensWith === "string") as unknown as SideRoom[]) : [],
    ...(typeof raw.alternateOf === "string" ? { alternateOf: raw.alternateOf } : {}),
  };
}

/** The lessons in a catalog document; anything malformed is dropped (an empty list is an error for the caller). */
export function parseCatalog(value: unknown): CatalogLesson[] {
  if (!isObj(value) || value.version !== 1 || !Array.isArray(value.lessons)) return [];
  return value.lessons.map(lessonOf).filter((l): l is CatalogLesson => l !== null);
}

export async function loadCatalog(url = "/catalog.json"): Promise<CatalogLesson[]> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`the course catalog is missing (HTTP ${response.status})`);
  const lessons = parseCatalog(await response.json());
  if (lessons.length === 0) throw new Error("the course catalog is empty");
  return lessons;
}
