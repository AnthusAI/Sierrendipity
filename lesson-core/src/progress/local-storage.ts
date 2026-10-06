import { MemoryProgressStore, type StoreOptions } from "./store";
import { emptyProgress, type ProgressData } from "./types";
import { parseProgress, type LoadStatus } from "./validate";

/** The part of the browser Storage API the store needs; inject a fake in Node. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROGRESS_KEY_PREFIX = "sierrendipity:progress:";
export const progressKey = (userId: string): string => `${PROGRESS_KEY_PREFIX}${userId}`;

/**
 * Progress persisted in localStorage under `sierrendipity:progress:<userId>`, versioned and validated
 * on load. Unreadable data falls back to an empty record and is kept under `<key>:backup`.
 */
export class LocalStorageProgressStore extends MemoryProgressStore {
  private readonly statuses = new Map<string, LoadStatus>();
  /** The error from the most recent failed write, or null. The data stays in memory. */
  lastSaveError: Error | null = null;

  constructor(
    private readonly storage: StorageLike,
    opts: StoreOptions = {},
  ) {
    super(opts);
  }

  /** How the record for this user was loaded. */
  loadStatus(userId: string): LoadStatus {
    this.getMastery(userId); // make sure it is loaded
    return this.statuses.get(userId) ?? "empty";
  }

  protected override loadUser(userId: string): ProgressData {
    const key = progressKey(userId);
    let raw: string | null;
    try {
      raw = this.storage.getItem(key);
    } catch {
      this.statuses.set(userId, "unavailable");
      return emptyProgress(userId);
    }
    if (raw === null) {
      this.statuses.set(userId, "empty");
      return emptyProgress(userId);
    }
    const { data, status } = parseProgress(raw, userId, this.maxEvents);
    this.statuses.set(userId, status);
    if (!data) {
      try {
        this.storage.setItem(`${key}:backup`, raw);
      } catch {
        /* keep going: the backup is a courtesy */
      }
      return emptyProgress(userId);
    }
    if (status === "migrated") this.persist(data);
    return data;
  }

  protected override persist(data: ProgressData): void {
    const key = progressKey(data.userId);
    try {
      this.storage.setItem(key, JSON.stringify(data));
      this.lastSaveError = null;
      return;
    } catch (first) {
      // Probably out of space: retry once with half the event log.
      try {
        const slim = { ...data, events: data.events.slice(-Math.floor(this.maxEvents / 2)) };
        this.storage.setItem(key, JSON.stringify(slim));
        this.lastSaveError = null;
      } catch {
        this.lastSaveError = first instanceof Error ? first : new Error(String(first));
      }
    }
  }
}
