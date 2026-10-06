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

const sessionStarts = new WeakMap<Clock, number>();
/** When this browser session with the coach began (the first lesson played on this clock). */
export function sessionStart(clock: Clock): number {
  let at = sessionStarts.get(clock);
  if (at === undefined) {
    at = clock.now();
    sessionStarts.set(clock, at);
  }
  return at;
}
