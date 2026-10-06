import type { PublishedLesson } from "@sierrendipity/lesson-core";
import { useEffect, useState } from "react";

// The browser consumes the PRECOMPILED lessons (`npm run lessons:build` writes lessons/dist/*.json,
// and the web prebuild hook runs it), so it never parses YAML or Gherkin.
const files = import.meta.glob<{ default: PublishedLesson }>("../../../lessons/dist/*.json");

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
    loaded = files[file]!().then((m) => {
      const lesson = m.default;
      if (lesson?.format !== 1) throw new Error(`${file} is not a published lesson (format 1)`);
      return lesson;
    });
    cache.set(file, loaded);
  }
  return loaded;
}

const fileFor = (id: string) => Object.keys(files).find((f) => f.endsWith(`/${id.replace("/", "-")}.json`));

/** Load one published lesson by id ("c1/01-press-the-button"). */
export function loadLesson(id: string): Promise<PublishedLesson> {
  const file = fileFor(id);
  return file ? load(file) : Promise.reject(new Error(`There is no lesson called "${id}".`));
}

/** Every published lesson, in id order (course, then number). */
export async function listLessons(): Promise<LessonInfo[]> {
  const all = await Promise.all(Object.keys(files).map(load));
  return all.map(({ id, title, minutes }) => ({ id, title, minutes })).sort((a, b) => a.id.localeCompare(b.id));
}

export type LessonState = { status: "loading" } | { status: "ready"; lesson: PublishedLesson } | { status: "error"; error: string };

/** Load a lesson inside a component; never throws. */
export function useLesson(id: string): LessonState {
  const [state, setState] = useState<LessonState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    loadLesson(id).then(
      (lesson) => live && setState({ status: "ready", lesson }),
      (e: unknown) => live && setState({ status: "error", error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return state;
}

/** The lesson after `id` in course order, or null at the end. */
export async function nextLessonAfter(id: string): Promise<LessonInfo | null> {
  const all = await listLessons();
  const at = all.findIndex((l) => l.id === id);
  return at >= 0 ? (all[at + 1] ?? null) : null;
}
