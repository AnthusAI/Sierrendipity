import {
  DEFAULT_MAX_EVENTS,
  MAX_BONUSES,
  MAX_CARD_KINDS,
  MAX_CONCEPTS,
  MAX_LESSONS,
  emptyLesson,
  emptyProgress,
  type Attempt,
  type Box,
  type ConceptMastery,
  type LessonProgress,
  type ProgressChange,
  type ProgressData,
  type ProgressEvent,
  type ProgressStore,
} from "./types";
import { attemptProblem, eventProblem, lessonIdProblem, pickEvent, userIdProblem } from "./validate";

export interface StoreOptions {
  /** The clock; inject a fake in tests. Defaults to Date.now. */
  now?: () => number;
  /** Event log bound; the oldest events are dropped first. */
  maxEvents?: number;
}

const copy = <T>(v: T): T => structuredClone(v);

/** The pure in-memory store. Persistent stores extend it and override `loadUser` and `persist`. */
export class MemoryProgressStore implements ProgressStore {
  protected readonly now: () => number;
  protected readonly maxEvents: number;
  private readonly users = new Map<string, ProgressData>();
  private readonly listeners = new Set<(change: ProgressChange) => void>();

  constructor(opts: StoreOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEvents = Math.max(1, opts.maxEvents ?? DEFAULT_MAX_EVENTS);
  }

  /** Hook: produce the starting record for a user the first time it is needed. */
  protected loadUser(userId: string): ProgressData {
    return emptyProgress(userId);
  }
  /** Hook: called after every change. */
  protected persist(_data: ProgressData): void {}

  private data(userId: string): ProgressData {
    const bad = userIdProblem(userId);
    if (bad) throw new RangeError(bad);
    let d = this.users.get(userId);
    if (!d) {
      d = this.loadUser(userId);
      this.users.set(userId, d);
    }
    return d;
  }

  private time(): number {
    const t = this.now();
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) throw new RangeError(`the clock returned ${String(t)}; it must be a finite time in milliseconds`);
    return t;
  }

  private changed(d: ProgressData, change: ProgressChange): void {
    this.persist(d);
    for (const cb of [...this.listeners]) {
      try {
        cb(change);
      } catch {
        /* a broken subscriber must not break saving or the other subscribers */
      }
    }
  }

  getLesson(userId: string, lessonId: string): LessonProgress {
    const bad = lessonIdProblem(lessonId);
    if (bad) throw new RangeError(bad);
    return copy(this.data(userId).lessons[lessonId] ?? emptyLesson());
  }

  recordAttempt(userId: string, lessonId: string, attempt: Attempt): LessonProgress {
    const bad = lessonIdProblem(lessonId) ?? attemptProblem(attempt);
    if (bad) throw new RangeError(bad);
    const d = this.data(userId);
    const now = this.time();
    if (!(lessonId in d.lessons) && Object.keys(d.lessons).length >= MAX_LESSONS) throw new RangeError(`progress holds at most ${MAX_LESSONS} lessons`);
    for (const concept of attempt.concepts ?? []) this.room(d, concept);
    const lp = (d.lessons[lessonId] ??= emptyLesson());
    lp.attempts++;
    lp.lastAttemptAt = now;
    // Bonus stars count from any attempt (a different try can earn one); only a pass gates the path.
    for (const star of attempt.stars) if (star !== "pass" && !lp.bonuses.includes(star) && lp.bonuses.length < MAX_BONUSES) lp.bonuses.push(star);
    if (attempt.passed) {
      if (!lp.passed) {
        lp.passed = true;
        lp.firstPassedAt = now;
      }
      lp.bestCards = lp.bestCards === null ? attempt.cards : Math.min(lp.bestCards, attempt.cards);
      lp.bestSteps = lp.bestSteps === null ? attempt.steps : Math.min(lp.bestSteps, attempt.steps);
      for (const kind of attempt.cardsUsed ?? []) if (!d.cardsUsed.includes(kind) && d.cardsUsed.length < MAX_CARD_KINDS) d.cardsUsed.push(kind);
      for (const concept of attempt.concepts ?? []) {
        const m = d.mastery[concept];
        if (m) {
          m.lastSeen = now;
          if (m.box < 1) m.box = 1; // a pass puts a concept at box 1 at least, even after Show me
        } else d.mastery[concept] = { box: 1, lastSeen: now, introducedAt: now };
      }
    }
    this.changed(d, { userId, kind: "attempt", lessonId });
    return copy(lp);
  }

  recordEvent(userId: string, event: ProgressEvent): void {
    const bad = eventProblem(event);
    if (bad) throw new RangeError(bad);
    const d = this.data(userId);
    const now = this.time();
    const e = pickEvent(event);
    if ("lessonId" in e && e.lessonId && !(e.lessonId in d.lessons) && Object.keys(d.lessons).length >= MAX_LESSONS) throw new RangeError(`progress holds at most ${MAX_LESSONS} lessons`);
    const touched = e.type === "warmup" ? [e.concept] : "concepts" in e ? (e.concepts ?? []) : [];
    for (const c of touched) this.room(d, c);
    d.events.push({ ...e, at: now });
    if (d.events.length > this.maxEvents) d.events.splice(0, d.events.length - this.maxEvents);
    const lesson = () => (d.lessons[(e as { lessonId: string }).lessonId] ??= emptyLesson());
    switch (e.type) {
      case "hint":
        lesson().hintsUsed[e.rung - 1]!++;
        break;
      case "show-me":
        lesson().showMeUsed++;
        for (const c of e.concepts ?? []) this.move(d, c, -1, now);
        break;
      case "prediction": {
        const lp = lesson();
        lp.predictionsAsked++;
        if (e.correct) lp.predictionsCorrect++;
        for (const c of e.concepts ?? []) this.move(d, c, e.correct ? 1 : -1, now);
        break;
      }
      case "warmup":
        this.move(d, e.concept, e.correct ? 1 : -1, now);
        d.warmupCounts[e.concept] = (d.warmupCounts[e.concept] ?? 0) + 1;
        break;
      case "stuck":
        break;
    }
    this.changed(d, { userId, kind: "event", ...("lessonId" in e && e.lessonId ? { lessonId: e.lessonId } : {}) });
  }

  /** Refuse a new concept past the cap (the same cap that is applied when stored data is loaded). */
  private room(d: ProgressData, concept: string): void {
    if (!(concept in d.mastery) && Object.keys(d.mastery).length >= MAX_CONCEPTS) throw new RangeError(`progress holds at most ${MAX_CONCEPTS} concepts`);
  }

  /** Leitner move: one box up or down, within 0 to 3, stamping last-seen. A concept not seen before starts at 1 going up, 0 going down. */
  private move(d: ProgressData, concept: string, delta: 1 | -1, now: number): void {
    const m = d.mastery[concept];
    if (!m) {
      d.mastery[concept] = { box: delta > 0 ? 1 : 0, lastSeen: now, introducedAt: now };
      return;
    }
    m.box = Math.max(0, Math.min(3, m.box + delta)) as Box;
    m.lastSeen = now;
  }

  getMastery(userId: string): Record<string, ConceptMastery> {
    return copy(this.data(userId).mastery);
  }

  export(userId: string): ProgressData {
    return copy(this.data(userId));
  }

  subscribe(cb: (change: ProgressChange) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
}
