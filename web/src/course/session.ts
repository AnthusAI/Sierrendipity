// A session is the first visit of the day, or any visit after 30 minutes without activity. It decides
// whether the warm-up has already been offered: at most one per session. Kept per user in localStorage.
import type { StorageLike } from "@sierrendipity/lesson-core";

export const IDLE_MS = 30 * 60_000;
export const sessionKey = (userId: string): string => `sierrendipity:session:${userId}`;

export interface SessionRecord {
  startedAt: number;
  lastActive: number;
  warmupOffered: boolean;
}

const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString();

function read(storage: StorageLike | undefined, userId: string): SessionRecord | null {
  try {
    const value = JSON.parse(storage?.getItem(sessionKey(userId)) ?? "null") as Partial<SessionRecord> | null;
    if (value && typeof value.startedAt === "number" && typeof value.lastActive === "number") return { startedAt: value.startedAt, lastActive: value.lastActive, warmupOffered: value.warmupOffered === true };
  } catch {
    /* damaged or unavailable: a new session starts */
  }
  return null;
}

function write(storage: StorageLike | undefined, userId: string, record: SessionRecord): void {
  try {
    storage?.setItem(sessionKey(userId), JSON.stringify(record));
  } catch {
    /* the session still holds in memory for this page */
  }
}

export interface Sessions {
  /** Note activity now; starts a new session when this is the first visit of the day or after 30 idle minutes. */
  touch(): SessionRecord;
  /** The warm-up was shown in this session. */
  markWarmupOffered(): void;
  /** Forget the session (progress was reset). */
  clear(): void;
}

export function createSessions(storage: StorageLike | undefined, userId: string, now: () => number): Sessions {
  let memory: SessionRecord | null = null;
  const current = (): SessionRecord | null => read(storage, userId) ?? memory;
  return {
    touch() {
      const t = now();
      const last = current();
      const fresh = !last || t - last.lastActive > IDLE_MS || !sameDay(last.lastActive, t) || t < last.lastActive - IDLE_MS;
      memory = fresh ? { startedAt: t, lastActive: t, warmupOffered: false } : { ...last, lastActive: Math.max(t, last.lastActive) };
      write(storage, userId, memory);
      return memory;
    },
    markWarmupOffered() {
      const record = current() ?? this.touch();
      memory = { ...record, warmupOffered: true };
      write(storage, userId, memory);
    },
    clear() {
      memory = null;
      try {
        storage?.removeItem(sessionKey(userId));
      } catch {
        /* nothing to clear */
      }
    },
  };
}
