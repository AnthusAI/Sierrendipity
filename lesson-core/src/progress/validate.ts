import {
  DEFAULT_MAX_EVENTS,
  MAX_CONCEPTS,
  MAX_BONUSES,
  MAX_CARD_KINDS,
  MAX_ID_LENGTH,
  MAX_LESSONS,
  bareRecord,
  PROGRESS_VERSION,
  emptyLesson,
  emptyProgress,
  type Attempt,
  type Box,
  type ConceptMastery,
  type LessonProgress,
  type ProgressData,
  type ProgressEvent,
  type StoredEvent,
} from "./types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Lesson, concept, star and scene ids: lowercase slugs that cannot be "__proto__" and never contain ":". */
const ID_PATTERN = /^[a-z0-9][a-z0-9/_-]*$/;
const USER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const isId = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_ID_LENGTH && ID_PATTERN.test(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1e9;
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Problems with a user id; null when fine. */
export function userIdProblem(userId: unknown): string | null {
  return typeof userId === "string" && userId.length <= 64 && USER_PATTERN.test(userId) ? null : "user id must be 1 to 64 letters, digits or . _ @ - (no colons)";
}
export function lessonIdProblem(id: unknown): string | null {
  return isId(id) ? null : `lesson id must be a lowercase slug like "c1/01-press-the-button" (up to ${MAX_ID_LENGTH} characters)`;
}

export function attemptProblem(a: unknown): string | null {
  if (!isObj(a)) return "an attempt must be an object";
  if (typeof a.passed !== "boolean") return "attempt.passed must be true or false";
  if (!Array.isArray(a.stars) || a.stars.length > 20 || !a.stars.every(isId)) return "attempt.stars must be a short list of star ids";
  if (!isCount(a.cards)) return "attempt.cards must be a whole number of 0 or more";
  if (!isCount(a.steps)) return "attempt.steps must be a whole number of 0 or more";
  if (a.concepts !== undefined && !(Array.isArray(a.concepts) && a.concepts.length <= 20 && a.concepts.every(isId))) return "attempt.concepts must be a short list of concept ids";
  if (a.cardsUsed !== undefined && !(Array.isArray(a.cardsUsed) && a.cardsUsed.length <= MAX_CARD_KINDS && a.cardsUsed.every(isId))) return "attempt.cardsUsed must be a short list of card kinds";
  return null;
}

/** Problems with an event; null when fine. */
export function eventProblem(e: unknown): string | null {
  if (!isObj(e)) return "an event must be an object";
  const concepts = e.concepts === undefined || (Array.isArray(e.concepts) && e.concepts.length <= 20 && e.concepts.every(isId));
  switch (e.type) {
    case "hint":
      if (!isId(e.lessonId)) return lessonIdProblem(e.lessonId);
      return e.rung === 1 || e.rung === 2 || e.rung === 3 ? null : "hint rung must be 1, 2 or 3";
    case "show-me":
      if (!isId(e.lessonId)) return lessonIdProblem(e.lessonId);
      return concepts ? null : "event.concepts must be a short list of concept ids";
    case "prediction":
      if (!isId(e.lessonId)) return lessonIdProblem(e.lessonId);
      if (typeof e.correct !== "boolean") return "event.correct must be true or false";
      return concepts ? null : "event.concepts must be a short list of concept ids";
    case "warmup":
      if (!isId(e.concept)) return "warm-up concept must be a concept id";
      if (typeof e.correct !== "boolean") return "event.correct must be true or false";
      return e.lessonId === undefined || isId(e.lessonId) ? null : lessonIdProblem(e.lessonId);
    case "stuck":
      if (!isId(e.lessonId)) return lessonIdProblem(e.lessonId);
      return e.sceneId === undefined || isId(e.sceneId) ? null : "event.sceneId must be a scene id";
    default:
      return `unknown event type ${JSON.stringify(e.type)}`;
  }
}

/** Copy only the known fields of a valid event, so stored events cannot carry extra data. */
export function pickEvent(e: ProgressEvent): ProgressEvent {
  switch (e.type) {
    case "hint":
      return { type: "hint", lessonId: e.lessonId, rung: e.rung };
    case "show-me":
      return { type: "show-me", lessonId: e.lessonId, ...(e.concepts ? { concepts: [...e.concepts] } : {}) };
    case "prediction":
      return { type: "prediction", lessonId: e.lessonId, correct: e.correct, ...(e.concepts ? { concepts: [...e.concepts] } : {}) };
    case "warmup":
      return { type: "warmup", concept: e.concept, correct: e.correct, ...(e.lessonId ? { lessonId: e.lessonId } : {}) };
    case "stuck":
      return { type: "stuck", lessonId: e.lessonId, ...(e.sceneId ? { sceneId: e.sceneId } : {}) };
  }
}

const clampBox =(n: number): Box => Math.max(0, Math.min(3, Math.round(n))) as Box;

function sanitizeLesson(raw: unknown): LessonProgress | null {
  if (!isObj(raw)) return null;
  const base = emptyLesson();
  const hints = Array.isArray(raw.hintsUsed) ? raw.hintsUsed : [];
  return {
    passed: raw.passed === true,
    bonuses: Array.isArray(raw.bonuses) ? [...new Set(raw.bonuses.filter(isId).filter((s) => s !== "pass"))].slice(0, MAX_BONUSES) : base.bonuses,
    bestCards: isCount(raw.bestCards) ? raw.bestCards : null,
    bestSteps: isCount(raw.bestSteps) ? raw.bestSteps : null,
    hintsUsed: [0, 1, 2].map((i) => (isCount(hints[i]) ? hints[i] : 0)) as [number, number, number],
    showMeUsed: isCount(raw.showMeUsed) ? raw.showMeUsed : 0,
    predictionsAsked: isCount(raw.predictionsAsked) ? raw.predictionsAsked : 0,
    predictionsCorrect: isCount(raw.predictionsCorrect) ? raw.predictionsCorrect : 0,
    attempts: isCount(raw.attempts) ? raw.attempts : 0,
    firstPassedAt: isTime(raw.firstPassedAt) ? raw.firstPassedAt : null,
    lastAttemptAt: isTime(raw.lastAttemptAt) ? raw.lastAttemptAt : null,
  };
}

function sanitizeMastery(raw: unknown): ConceptMastery | null {
  if (!isObj(raw) || typeof raw.box !== "number" || !Number.isFinite(raw.box)) return null;
  const lastSeen = isTime(raw.lastSeen) ? raw.lastSeen : 0;
  return { box: clampBox(raw.box), lastSeen, introducedAt: isTime(raw.introducedAt) ? raw.introducedAt : lastSeen };
}

export type LoadStatus = "empty" | "ok" | "migrated" | "corrupt" | "too-new" | "unavailable";

/**
 * Turn whatever was stored into valid progress. Version 0 (`{passed: [ids]}`) is migrated. Garbage or a
 * newer version yields `corrupt` / `too-new` and no data (the caller starts empty and keeps a backup).
 * Individual bad fields inside valid data are repaired or dropped.
 */
export function parseProgress(raw: string, userId: string, maxEvents: number = DEFAULT_MAX_EVENTS): { data?: ProgressData; status: LoadStatus } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }
  if (!isObj(value)) return { status: "corrupt" };

  if (value.version === undefined && Array.isArray(value.passed)) {
    const data = emptyProgress(userId);
    for (const id of value.passed.filter(isId).slice(0, MAX_LESSONS)) data.lessons[id] = { ...emptyLesson(), passed: true };
    return { data, status: "migrated" };
  }
  if (typeof value.version === "number" && value.version > PROGRESS_VERSION) return { status: "too-new" };
  if (value.version !== PROGRESS_VERSION || !isObj(value.lessons)) return { status: "corrupt" };
  if (value.mastery !== undefined && !isObj(value.mastery)) return { status: "corrupt" };
  if (value.events !== undefined && !Array.isArray(value.events)) return { status: "corrupt" };

  const data = emptyProgress(userId);
  if (isObj(value.warmupCounts)) {
    for (const [id, n] of Object.entries(value.warmupCounts).slice(0, MAX_CONCEPTS)) if (isId(id) && isCount(n)) data.warmupCounts[id] = n;
  }
  if (Array.isArray(value.cardsUsed)) data.cardsUsed = [...new Set(value.cardsUsed.filter(isId))].slice(0, MAX_CARD_KINDS);
  for (const [id, l] of Object.entries(value.lessons).slice(0, MAX_LESSONS)) {
    const lp = isId(id) ? sanitizeLesson(l) : null;
    if (lp) data.lessons[id] = lp;
  }
  for (const [id, m] of Object.entries(value.mastery ?? {}).slice(0, MAX_CONCEPTS)) {
    const cm = isId(id) ? sanitizeMastery(m) : null;
    if (cm) data.mastery[id] = cm;
  }
  const events = (value.events as unknown[] | undefined) ?? [];
  for (const e of events) {
    if (isObj(e) && isTime(e.at) && eventProblem(e) === null) data.events.push({ ...pickEvent(e as unknown as ProgressEvent), at: e.at });
  }
  data.events = data.events.slice(-maxEvents);
  return { data, status: "ok" };
}

export type { Attempt, ProgressEvent };
