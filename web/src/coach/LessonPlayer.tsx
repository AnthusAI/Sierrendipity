import type { ProgressStore, PublishedLesson } from "@sierrendipity/lesson-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LessonInfo } from "../lessons";
import { realClock, type Clock } from "./clock";
import { CoachPanel } from "./CoachPanel";
import { DefaultStage } from "./DefaultStage";
import { GhostPointer, Spotlight } from "./overlays";
import type { Stage, StageControl, StageProps } from "./types";
import { useLessonPlayer } from "./useLessonPlayer";

export interface LessonPlayerProps {
  lesson: PublishedLesson;
  /** Where progress is recorded. Omit to play without recording. */
  store?: ProgressStore | null;
  /** The signed-in student's id (the Cognito sub), or "local". */
  userId?: string;
  clock?: Clock;
  /** Draws the machine. Defaults to a simple accessible stage. */
  stage?: Stage;
  /** The lesson that follows, for the end card's [Next lesson]. */
  next?: LessonInfo | null;
  onNext?: (lessonId: string) => void;
  onStop?: () => void;
  /** Move focus to the primary action when the lesson opens. Off by default: the page decides where focus starts. */
  focusOnStart?: boolean;
}

const defaultStage: Stage = (props: StageProps) => <DefaultStage {...props} />;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * The coach and lesson player: a stage (the machine) beside the coach panel, with the spotlight and the
 * ghost pointer drawn on top. The tool is the tutor.
 */
export function LessonPlayer({ lesson, store = null, userId = "local", clock = realClock, stage = defaultStage, next = null, onNext, onStop, focusOnStart = false }: LessonPlayerProps) {
  const { state, engine } = useLessonPlayer(lesson, { store, userId, clock });
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLElement>(null);

  // Any input restarts the idle rule; Escape asks before it ends the tour (or stops a demo).
  useEffect(() => {
    const input = () => engine.noteInput();
    const key = (e: KeyboardEvent) => {
      engine.noteInput();
      if (e.key !== "Escape") return;
      if (engine.getState().phase === "ghost") engine.cancelGhost();
      else engine.askSkipTour();
    };
    const visible = () => document.visibilityState === "visible" && engine.noteInput();
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", input, true);
    document.addEventListener("input", input, true);
    document.addEventListener("visibilitychange", visible);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", input, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [engine]);

  // A click-target prediction: whatever the student clicks with a coach id is their answer.
  useEffect(() => {
    if (state.ask?.kind !== "click-target") return;
    const root = stageRef.current;
    const click = (e: MouseEvent) => {
      const hit = (e.target as Element | null)?.closest("[data-coach-id]");
      const id = hit?.getAttribute("data-coach-id");
      if (id) engine.answerTarget(id);
    };
    root?.addEventListener("click", click);
    return () => root?.removeEventListener("click", click);
  }, [engine, state.ask]);

  // Focus goes to the primary action when the scene changes, unless the student is typing in the stage.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!focusOnStart) return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active && TYPING.has(active.tagName) && stageRef.current?.contains(active)) return;
    const primary = document.querySelector<HTMLElement>("[data-coach-panel] [data-coach-primary]");
    const target = primary ?? (state.spotlight ? document.querySelector<HTMLElement>(`[data-coach-id="${state.spotlight}"]`) : null) ?? (state.waiting === "until" ? document.querySelector<HTMLElement>('[data-coach-id="button:step"]') : null);
    if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT")) target.focus({ preventScroll: true });
    // Only when the scene or phase changes (or the ghost hands control back), never on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sceneKey, state.phase, state.yourTurn]);

  const controls = useMemo(
    () => ({
      step: () => engine.step(),
      back: () => engine.back(),
      reset: () => engine.reset(),
      isLocked: (c: StageControl) => engine.getState().locked.includes(c),
    }),
    [engine],
  );
  const onEditStarter = useCallback((card: number, word: number) => engine.edit(card, word), [engine]);

  const stageScene = { id: state.scene?.id ?? "", show: state.scene?.show ?? [], spotlight: state.spotlight, locked: state.locked };
  const fallback = () => {
    const r = stageRef.current?.getBoundingClientRect();
    return r ? { x: r.x + 24, y: r.y + 24, width: 0, height: 0 } : null;
  };

  return (
    <div data-lesson-player data-lesson={lesson.id} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
      <section ref={stageRef} aria-label={`${lesson.title}: the machine`} className="min-w-0 rounded-lg border bg-background p-4">
        {stage({ lesson, live: state.view, scene: stageScene, onEditStarter, controls })}
      </section>
      <CoachPanel state={state} engine={engine} next={next} onNext={onNext} onStop={onStop} />
      {state.spotlight && state.phase === "scene" && <Spotlight target={state.spotlight} reduced={reduced} />}
      {state.phase === "ghost" && <GhostPointer target={state.ghost?.pointer ?? null} fallback={fallback} reduced={reduced} />}
    </div>
  );
}
