import {
  DEFAULT_MAX_EVENTS,
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

  private changed(d: ProgressData, change: ProgressChange): void {
    this.persist(d);
    for (const cb of [...this.listeners]) cb(change);
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
    const now = this.now();
    const lp = (d.lessons[lessonId] ??= emptyLesson());
    lp.attempts++;
    lp.lastAttemptAt = now;
    // Bonus stars count from any attempt (a different try can earn one); only a pass gates the path.
    for (const star of attempt.stars) if (star !== "pass" && !lp.bonuses.includes(star)) lp.bonuses.push(star);
    if (attempt.passed) {
      if (!lp.passed) {
        lp.passed = true;
        lp.firstPassedAt = now;
      }
      lp.bestCards = lp.bestCards === null ? attempt.cards : Math.min(lp.bestCards, attempt.cards);
      lp.bestSteps = lp.bestSteps === null ? attempt.steps : Math.min(lp.bestSteps, attempt.steps);
      for (const concept of attempt.concepts ?? []) {
        const m = d.mastery[concept];
        if (m) m.lastSeen = now;
        else d.mastery[concept] = { box: 1, lastSeen: now, introducedAt: now };
      }
    }
    this.changed(d, { userId, kind: "attempt", lessonId });
    return copy(lp);
  }

  recordEvent(userId: string, event: ProgressEvent): void {
    const bad = eventProblem(event);
    if (bad) throw new RangeError(bad);
    const d = this.data(userId);
    const now = this.now();
    const e = pickEvent(event);
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
        break;
      case "stuck":
        break;
    }
    this.changed(d, { userId, kind: "event", ...("lessonId" in e && e.lessonId ? { lessonId: e.lessonId } : {}) });
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
