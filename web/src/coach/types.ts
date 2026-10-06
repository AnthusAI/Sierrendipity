import type { PublishedLesson } from "@sierrendipity/lesson-core";
import type { ReactNode } from "react";

/** The controls a scene may lock (`lock:` in lesson.yaml). A locked control is aria-disabled and says "Not yet". */
export type StageControl = "edit" | "step" | "back" | "run" | "reset" | "drag" | "toggle";

/** The machine the student is working with, as plain data. During Show me it is the ghost's copy. */
export interface LiveView {
  /** The student's cards (words), without the hidden end marker. */
  cards: number[];
  /** The boxes the lesson shows, in order, with their current values (signed 32-bit). */
  boxes: { name: string; value: number }[];
  /** Index of the card the arrow points at; null when the lesson has no pointer or the list has ended. */
  pointer: number | null;
  /** Steps the student has taken (the hidden Stop is not a step). */
  steps: number;
  /** True once every card has run. */
  atEnd: boolean;
  canStep: boolean;
  canBack: boolean;
  /** The Stop card is hidden: show the end of the list as "the end of the list". */
  hideEnd: boolean;
  /** True while the ghost is demonstrating on a copy: controls are inert. */
  demo: boolean;
}

/** The scene being played, as far as the stage cares. */
export interface StageScene {
  id: string;
  show: string[];
  /** Target to spotlight, such as "button:step" or "box:a2"; the player draws the dimming itself. */
  spotlight: string | null;
  locked: StageControl[];
}

export interface StageControls {
  step(): void;
  back(): void;
  reset(): void;
  /** True when the scene has locked this control; render it aria-disabled with the explanation "Not yet". */
  isLocked(control: StageControl): boolean;
}

/**
 * What a stage receives. The stage draws the machine; the player draws the coach, the spotlight and the
 * ghost pointer on top. Every element a scene may point at must carry `data-coach-id` (see `coachId`).
 */
export interface StageProps {
  lesson: PublishedLesson;
  live: LiveView;
  scene: StageScene;
  /** Replace the word of card `card` (0-based). The machine restarts from the first card. */
  onEditStarter(card: number, word: number): void;
  controls: StageControls;
}

export type Stage = (props: StageProps) => ReactNode;
