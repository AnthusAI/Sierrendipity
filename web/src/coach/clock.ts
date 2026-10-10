/** Time as the coach sees it: injectable so idle, stuck and ghost timers can be driven by a fake clock in specs. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export interface TestClock extends Clock {
  /** Move time forward, running every timer that falls due, in order. */
  advance(ms: number): void;
}

/** A clock that only moves when `advance` is called. */
export function createTestClock(start = 1_700_000_000_000): TestClock {
  let time = start;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => time,
    setTimeout(fn, ms) {
      const id = next++;
      timers.set(id, { at: time + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | undefined;
        for (const entry of timers) if (entry[1].at <= end && (!due || entry[1].at < due[1].at || (entry[1].at === due[1].at && entry[0] < due[0]))) due = entry;
        if (!due) break;
        timers.delete(due[0]);
        time = Math.max(time, due[1].at);
        due[1].fn();
      }
      time = end;
    },
  };
}

declare global {
  interface Window {
    __testclock?: TestClock;
  }
}

/** The clock for the lab: a fake one, exposed as `window.__testclock`, when the URL has `?testclock`. */
export function labClock(search = window.location.search): Clock {
  if (!new URLSearchParams(search).has("testclock")) return realClock;
  window.__testclock ??= createTestClock();
  return window.__testclock;
}

const SESSION_KEY = "sierrendipity:coach:session";
const memory = new WeakMap<Clock, { start: number; shown: boolean }>();

/**
 * The coach session: when it began and whether the "good place to stop" suggestion was already made. Kept in
 * sessionStorage so it survives a lesson change and a reload, and once per session (falls back to memory).
 */
export function sessionInfo(clock: Clock): { start: number; shown: boolean } {
  const now = clock.now();
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as { start?: unknown; shown?: unknown } | null;
    if (stored && typeof stored.start === "number" && stored.start <= now) return { start: stored.start, shown: stored.shown === true };
    const fresh = { start: now, shown: false };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    let info = memory.get(clock);
    if (!info) memory.set(clock, (info = { start: now, shown: false }));
    return info;
  }
}

/** Remember that the suggestion was made, so no later lesson repeats it. */
export function markStopShown(clock: Clock): void {
  const info = { ...sessionInfo(clock), shown: true };
  memory.set(clock, info);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
  } catch {
    /* kept in memory */
  }
}
