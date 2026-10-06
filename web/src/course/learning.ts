// Learning settings, per user, in their own record next to the appearance settings:
// `sierrendipity:learning:<userId>`. The tutor override ("Unlock all lessons") is off by default.
import type { StorageLike } from "@sierrendipity/lesson-core";

export interface LearningSettings {
  unlockAll: boolean;
  version: 1;
}

export const DEFAULT_LEARNING: LearningSettings = { unlockAll: false, version: 1 };
export const learningKey = (userId: string): string => `sierrendipity:learning:${userId}`;

export function parseLearning(raw: string | null): LearningSettings {
  if (raw === null) return DEFAULT_LEARNING;
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_LEARNING;
    const v = value as { version?: unknown; unlockAll?: unknown };
    if (v.version !== undefined && v.version !== 1) return DEFAULT_LEARNING;
    return { unlockAll: v.unlockAll === true, version: 1 };
  } catch {
    return DEFAULT_LEARNING;
  }
}

export interface LearningStore {
  get(userId: string): LearningSettings;
  set(userId: string, settings: Partial<LearningSettings>): LearningSettings;
}

export function createLearningStore(storage?: StorageLike): LearningStore {
  const backing = (): StorageLike | undefined => {
    try {
      return storage ?? localStorage;
    } catch {
      return undefined;
    }
  };
  const memory = new Map<string, LearningSettings>();
  const get = (userId: string): LearningSettings => {
    try {
      const raw = backing()?.getItem(learningKey(userId)) ?? null;
      return raw === null ? (memory.get(userId) ?? DEFAULT_LEARNING) : parseLearning(raw);
    } catch {
      return memory.get(userId) ?? DEFAULT_LEARNING;
    }
  };
  return {
    get,
    set(userId, change) {
      const next: LearningSettings = { unlockAll: (change.unlockAll ?? get(userId).unlockAll) === true, version: 1 };
      memory.set(userId, next);
      try {
        backing()?.setItem(learningKey(userId), JSON.stringify(next));
      } catch {
        /* the setting still applies for this session */
      }
      return next;
    },
  };
}
