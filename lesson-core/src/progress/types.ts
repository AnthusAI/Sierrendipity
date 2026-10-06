/** What a student has done, per lesson and per concept. Plain JSON-safe data. */
export const PROGRESS_VERSION = 1;
export const DAY_MS = 86_400_000;
export const DEFAULT_MAX_EVENTS = 200;
export const MAX_LESSONS = 500;
export const MAX_CONCEPTS = 500;
export const MAX_ID_LENGTH = 100;

/** One try at a lesson goal, as reported by the player after running the checks. */
export interface Attempt {
  passed: boolean;
  /** Stars earned: "pass" and bonus ids (bonuses count from any attempt; only a pass gates the path). */
  stars: string[];
  cards: number;
  steps: number;
  /** Concepts the lesson introduces; a pass puts them in Leitner box 1. */
  concepts?: string[];
}

export interface LessonProgress {
  passed: boolean;
  /** Bonus star ids earned (never includes "pass"). */
  bonuses: string[];
  bestCards: number | null;
  bestSteps: number | null;
  /** How many times each help rung was used: [nudge, narrower question, near-answer]. */
  hintsUsed: [number, number, number];
  showMeUsed: number;
  predictionsAsked: number;
  predictionsCorrect: number;
  attempts: number;
  firstPassedAt: number | null;
  lastAttemptAt: number | null;
}

/** Leitner box: 0 shaky, 1 new, 2 familiar, 3 solid. */
export type Box = 0 | 1 | 2 | 3;
export interface ConceptMastery {
  box: Box;
  lastSeen: number;
  introducedAt: number;
}

export type ProgressEvent =
  | { type: "hint"; lessonId: string; rung: 1 | 2 | 3 }
  | { type: "show-me"; lessonId: string; concepts?: string[] }
  | { type: "prediction"; lessonId: string; correct: boolean; concepts?: string[] }
  | { type: "warmup"; concept: string; correct: boolean; lessonId?: string }
  | { type: "stuck"; lessonId: string; sceneId?: string };
export type StoredEvent = ProgressEvent & { at: number };

export interface ProgressData {
  version: typeof PROGRESS_VERSION;
  userId: string;
  lessons: Record<string, LessonProgress>;
  mastery: Record<string, ConceptMastery>;
  /** Newest last; bounded. */
  events: StoredEvent[];
}

export interface ProgressChange {
  userId: string;
  kind: "attempt" | "event";
  lessonId?: string;
}

export interface ProgressStore {
  getLesson(userId: string, lessonId: string): LessonProgress;
  recordAttempt(userId: string, lessonId: string, attempt: Attempt): LessonProgress;
  recordEvent(userId: string, event: ProgressEvent): void;
  getMastery(userId: string): Record<string, ConceptMastery>;
  export(userId: string): ProgressData;
  /** Returns an unsubscribe function. */
  subscribe(cb: (change: ProgressChange) => void): () => void;
}

export const emptyLesson = (): LessonProgress => ({
  passed: false,
  bonuses: [],
  bestCards: null,
  bestSteps: null,
  hintsUsed: [0, 0, 0],
  showMeUsed: 0,
  predictionsAsked: 0,
  predictionsCorrect: 0,
  attempts: 0,
  firstPassedAt: null,
  lastAttemptAt: null,
});

export const emptyProgress = (userId: string): ProgressData => ({
  version: PROGRESS_VERSION,
  userId,
  lessons: {},
  mastery: {},
  events: [],
});
