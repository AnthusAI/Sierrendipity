/** The thresholds of the stuck rules (docs/course-1-design.md). */
export const STUCK = {
  failedChecks: 2,
  idleMs: 75_000,
  resetBursts: 3,
  resetWindowMs: 120_000,
  toggles: 3,
  silenceMs: 120_000,
  sessionMs: 12 * 60_000,
} as const;

export type StuckReason = "failed-checks" | "idle" | "resets" | "toggled";

/**
 * Pure bookkeeping for the four stuck rules. The idle rule needs a timer, so the engine drives it with
 * `idleDue`; the others report a reason from the call that completed them. Silencing ("I'm fine")
 * is the engine's job.
 */
export class StuckDetector {
  private failed = 0;
  private resets: number[] = [];
  private lastInput: number;
  private history = new Map<string, number[]>();
  private toggled = new Map<string, number>();

  constructor(now: number) {
    this.lastInput = now;
  }

  /** A new goal (or a goal reached): forget everything about the last one. */
  newGoal(now: number): void {
    this.failed = 0;
    this.resets = [];
    this.history.clear();
    this.toggled.clear();
    this.lastInput = now;
  }

  input(now: number): void {
    this.lastInput = now;
  }

  /** The student ran or answered, and the goal still does not hold. */
  failedCheck(): StuckReason | null {
    return ++this.failed >= STUCK.failedChecks ? this.fire("failed-checks") : null;
  }

  /** A Reset or Back that did something. */
  undone(now: number): StuckReason | null {
    this.resets = this.resets.filter((t) => now - t < STUCK.resetWindowMs);
    this.resets.push(now);
    return this.resets.length >= STUCK.resetBursts ? this.fire("resets") : null;
  }

  /** An edit of `key` (a card, or a card and bit) to `value`, from `before`. Back and forth three times is stuck. */
  edited(key: string, before: number, value: number): StuckReason | null {
    const seen = this.history.get(key) ?? [before];
    const backAndForth = seen.length >= 2 && value === seen[seen.length - 2];
    this.toggled.set(key, backAndForth ? (this.toggled.get(key) ?? 0) + 1 : 0);
    seen.push(value);
    this.history.set(key, seen.slice(-3));
    return (this.toggled.get(key) ?? 0) >= STUCK.toggles ? this.fire("toggled") : null;
  }

  /** Milliseconds until the idle rule fires if nothing happens. */
  idleIn(now: number): number {
    return Math.max(0, STUCK.idleMs - (now - this.lastInput));
  }

  idleDue(now: number): boolean {
    return now - this.lastInput >= STUCK.idleMs;
  }

  private fire(reason: StuckReason): StuckReason {
    this.failed = 0;
    this.resets = [];
    this.toggled.clear();
    return reason;
  }
}
