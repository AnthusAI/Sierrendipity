// Everything the course pages need for one signed-in student: the catalog, the progress store (and a
// snapshot of it), the Gallery, the Learning settings and the session clock. Stores are injectable so the
// component lab can run the same pages on fake in-memory data.
import {
  backupKey,
  LocalStorageProgressStore,
  MemoryProgressStore,
  progressKey,
  type ProgressData,
  type ProgressStore,
  type StorageLike,
} from "@sierrendipity/lesson-core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadCatalog, type CatalogLesson, type CatalogState } from "./catalog";
import { LocalStorageGalleryStore, type GalleryItem, type GalleryStore } from "./gallery";
import { createLearningStore, type LearningStore } from "./learning";
import { createSessions, type Sessions } from "./session";

export interface ProgressHandle {
  store: ProgressStore & { export(userId: string): ProgressData };
  /** Forget everything stored for the user (the next store starts empty). */
  clear(): void;
}

export interface CourseServices {
  /** Replaces the fetch of /catalog.json. */
  catalog?: CatalogLesson[];
  progress?: (userId: string, now: () => number) => ProgressHandle;
  gallery?: GalleryStore;
  learning?: LearningStore;
  /** Where the session record lives; none keeps it in memory. */
  sessionStorage?: StorageLike;
  now?: () => number;
}

export interface CourseContextValue {
  userId: string;
  catalog: CatalogState;
  progress: ProgressStore;
  /** A copy of the student's progress that changes whenever the store does. */
  data: ProgressData;
  gallery: GalleryStore;
  galleryItems: GalleryItem[];
  unlockAll: boolean;
  setUnlockAll(on: boolean): void;
  sessions: Sessions;
  now(): number;
  /** Clear this student's progress and session (the Gallery stays). */
  resetProgress(): void;
}

const Context = createContext<CourseContextValue | null>(null);

/** Progress, Gallery and settings keys must be safe ids; anything else is mapped to underscores. */
export const safeUserId = (id: string): string => {
  const cleaned = id.replace(/[^A-Za-z0-9._@-]/g, "_").replace(/^[^A-Za-z0-9]/, "u").slice(0, 64);
  return cleaned || "local";
};

const browserStorage = (): StorageLike | undefined => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
};

const browserProgress = (userId: string, now: () => number): ProgressHandle => {
  const storage = browserStorage();
  return {
    store: storage ? new LocalStorageProgressStore(storage, { now }) : new MemoryProgressStore({ now }),
    clear() {
      try {
        storage?.removeItem(progressKey(userId));
        storage?.removeItem(backupKey(userId));
      } catch {
        /* nothing to clear */
      }
    },
  };
};

export function memoryProgress(_userId: string, now: () => number): ProgressHandle {
  return { store: new MemoryProgressStore({ now }), clear() {} };
}

export function CourseProvider({ userId: rawUser, services = {}, children }: { userId: string; services?: CourseServices; children: ReactNode }) {
  const userId = safeUserId(rawUser);
  const now = services.now ?? Date.now;
  const [catalog, setCatalog] = useState<CatalogState>(services.catalog ? { status: "ready", lessons: services.catalog } : { status: "loading" });
  useEffect(() => {
    if (services.catalog) return;
    let live = true;
    loadCatalog()
      .then((lessons) => live && setCatalog({ status: "ready", lessons }))
      .catch((error: unknown) => live && setCatalog({ status: "error", message: error instanceof Error ? error.message : String(error) }));
    return () => {
      live = false;
    };
  }, [services.catalog]);

  const make = services.progress ?? browserProgress;
  const [handle, setHandle] = useState<ProgressHandle>(() => make(userId, now));
  const handleUser = useRef(userId);
  if (handleUser.current !== userId) {
    handleUser.current = userId;
    setHandle(make(userId, now));
  }
  const [data, setData] = useState<ProgressData>(() => handle.store.export(userId));
  useEffect(() => {
    setData(handle.store.export(userId));
    return handle.store.subscribe((change) => change.userId === userId && setData(handle.store.export(userId)));
  }, [handle, userId]);

  const gallery = useMemo(() => services.gallery ?? new LocalStorageGalleryStore(browserStorage()), [services.gallery]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>(() => gallery.list(userId));
  useEffect(() => {
    setGalleryItems(gallery.list(userId));
    return gallery.subscribe((who) => who === userId && setGalleryItems(gallery.list(userId)));
  }, [gallery, userId]);

  const learning = useMemo(() => services.learning ?? createLearningStore(), [services.learning]);
  const [unlockAll, setUnlock] = useState(() => learning.get(userId).unlockAll);
  useEffect(() => setUnlock(learning.get(userId).unlockAll), [learning, userId]);
  const setUnlockAll = useCallback(
    (on: boolean) => {
      learning.set(userId, { unlockAll: on });
      setUnlock(on);
    },
    [learning, userId],
  );

  const sessions = useMemo(() => createSessions(services.sessionStorage ?? browserStorage(), userId, now), [services.sessionStorage, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetProgress = useCallback(() => {
    handle.clear();
    sessions.clear();
    setHandle(make(userId, now));
  }, [handle, sessions, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<CourseContextValue>(
    () => ({ userId, catalog, progress: handle.store, data, gallery, galleryItems, unlockAll, setUnlockAll, sessions, now, resetProgress }),
    [userId, catalog, handle, data, gallery, galleryItems, unlockAll, setUnlockAll, sessions, resetProgress], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCourse(): CourseContextValue {
  const value = useContext(Context);
  if (!value) throw new Error("useCourse must be used inside <CourseProvider>");
  return value;
}

/** The lessons once the catalog has loaded; an empty list before. */
export function useLessons(): CatalogLesson[] {
  const { catalog } = useCourse();
  return catalog.status === "ready" ? catalog.lessons : [];
}
