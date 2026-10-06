import { LocalStorageProgressStore, MemoryProgressStore, type ProgressStore } from "@sierrendipity/lesson-core";

let shared: ProgressStore | undefined;

/**
 * The browser's progress store: localStorage under `sierrendipity:progress:<userId>`. When storage cannot even
 * be reached (some privacy modes throw on access) the student still plays, with progress kept in memory.
 */
export function defaultProgressStore(): ProgressStore {
  if (!shared) {
    try {
      shared = new LocalStorageProgressStore(window.localStorage);
    } catch {
      shared = new MemoryProgressStore();
    }
  }
  return shared;
}
