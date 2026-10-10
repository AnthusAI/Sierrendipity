import type { ProgressStore, PublishedLesson } from "@sierrendipity/lesson-core";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { realClock, type Clock } from "./clock";
import { LessonEngine, type PlayerState } from "./engine";

export interface PlayerOptions {
  store?: ProgressStore | null;
  userId?: string;
  clock?: Clock;
}

/**
 * The scene engine as a hook: scenes in order with `goto`, `until` checked on the live machine after every
 * action, predictions, locks, hints, Show me, stuck rules and progress. All the logic lives in `LessonEngine`;
 * this only connects it to React.
 */
export function useLessonPlayer(lesson: PublishedLesson, opts: PlayerOptions = {}): { state: PlayerState; engine: LessonEngine } {
  const { store = null, userId = "local", clock = realClock } = opts;
  const engine = useMemo(() => new LessonEngine(lesson, { store, userId, clock }), [lesson, store, userId, clock]);
  useEffect(() => {
    engine.start();
    return () => engine.dispose();
  }, [engine]);
  const state = useSyncExternalStore(engine.subscribe, engine.getState);
  return { state, engine };
}
