import { isPublishedLesson, type PublishedLesson } from "@sierrendipity/lesson-core";
import { useEffect, useState } from "react";

// The browser consumes the PRECOMPILED lessons (`npm run lessons:build` writes lessons/dist/*.json,
// and the web prebuild hook runs it), so it never parses YAML or Gherkin.
const files = import.meta.glob<{ default: PublishedLesson }>("../../../lessons/dist/*.json");

/**
 * Draft lessons (`draft: true`) are built into `lessons/dist/drafts/` and are playable only in dev and test builds
 * (`vite dev`, or a build with `VITE_DEV_TOOLS=1`). In a production build this condition is a constant `false`, so
 * the drafts are not part of the bundle at all.
 */
export const DRAFTS_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "1";
const draftFiles: Record<string, () => Promise<{ default: PublishedLesson }>> = DRAFTS_ENABLED ? import.meta.glob<{ default: PublishedLesson }>("../../../lessons/dist/drafts/*.json") : {};

/** What the path and the player's "Next lesson" button need to know about a lesson. */
export interface LessonInfo {
  id: string;
  title: string;
  minutes: number;
}

const cache = new Map<string, Promise<PublishedLesson>>();

function load(file: string): Promise<PublishedLesson> {
  let loaded = cache.get(file);
  if (!loaded) {
    loaded = (files[file] ?? draftFiles[file]!)().then((m) => {
      const problem = isPublishedLesson(m.default);
      if (problem) throw new Error(`${file} is not a usable published lesson: ${problem}`);
      return m.default;
    });
    // A failed load must not be remembered: "Try again" has to fetch again.
    loaded.catch(() => cache.delete(file));
    cache.set(file, loaded);
  }
  return loaded;
}

const fileFor = (id: string) => [...Object.keys(files), ...Object.keys(draftFiles)].find((f) => f.endsWith(`/${id.replace("/", "-")}.json`));

/** Load one published lesson by id ("c1/01-press-the-button"); a draft too, in dev and test builds. */
export function loadLesson(id: string): Promise<PublishedLesson> {
  const file = fileFor(id);
  return file ? load(file) : Promise.reject(new Error(`There is no lesson called "${id}".`));
}

/** Every shipping lesson, in id order (course, then number). Drafts are never listed. */
export async function listLessons(): Promise<LessonInfo[]> {
  const all = await Promise.all(Object.keys(files).map(load));
  return all.map(({ id, title, minutes }) => ({ id, title, minutes })).sort((a, b) => a.id.localeCompare(b.id));
}

export type LessonState = { status: "loading" } | { status: "ready"; lesson: PublishedLesson } | { status: "error"; error: string };

/**
 * Load a lesson inside a component; never throws. `error` is a technical detail for the console: show
 * students `LessonLoadError`, never this text. `retry` loads again.
 */
export function useLesson(id: string): LessonState & { retry(): void } {
  const [state, setState] = useState<LessonState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadLesson(id).then(
      (lesson) => live && setState({ status: "ready", lesson }),
      (e: unknown) => {
        console.error(`Could not load lesson "${id}":`, e);
        if (live) setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [id, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** The lesson after `id` in course order, or null at the end. */
export async function nextLessonAfter(id: string): Promise<LessonInfo | null> {
  const all = await listLessons();
  const at = all.findIndex((l) => l.id === id);
  return at >= 0 ? (all[at + 1] ?? null) : null;
}
