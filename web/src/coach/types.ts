import type { Card, CustomCard, FlipSpec, LampSpec, PublishedLesson, SaveSpec } from "@sierrendipity/lesson-core";
import type { Session } from "@sierrendipity/explorer";
import type { ReactNode } from "react";

/** The controls a scene may lock (`lock:` in lesson.yaml). A locked control is aria-disabled and says "Not yet". */
export type StageControl = "edit" | "step" | "back" | "run" | "reset" | "drag" | "toggle";

/** The machine the student is working with, as plain data. During Show me it is the ghost's copy. */
export interface LiveView {
  /** The one session behind the player and the stage; stages draw it and never step it. */
  session: Session;
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
  /** The run is over and the scene's goal does not hold: with Back hidden, the way on is Reset (or Start again). */
  goalMissed: boolean;
  /** The program as cards, with the custom cards it can call, in a lesson that has custom cards. */
  program?: { cards: Card[]; customCards: CustomCard[] };
  /** The next goal begins with a finished machine: the note for the idle Step button ("Change the number on card 2 first"), or null. */
  editFirst: string | null;
  /** The Stop card is hidden: show the end of the list as "the end of the list". */
  hideEnd: boolean;
  /** True while the ghost is demonstrating on a copy: controls are inert. */
  demo: boolean;
  /** The x of the lesson's function, when the lesson has one. */
  functionInput?: number;
  /** The scene fixed x: the banner shows it and does not let the student change it. */
  functionInputLocked?: boolean;
}

/** The scene being played, as far as the stage cares. */
export interface StageScene {
  id: string;
  /** What the scene shows: tabs, diagrams `D1`..`D14`, `timeline`, `builder`. */
  show: string[];
  /** Target to spotlight, such as "button:step" or "box:a2"; the player draws the dimming itself. */
  spotlight: string | null;
  locked: StageControl[];
  /** D4 bit lamps, D8 field bands, D5 card flip, D7 carry ripple and the builder's tray (card words), when the scene asks for them. */
  lamps?: LampSpec;
  bands?: LampSpec;
  flip?: FlipSpec;
  carry?: { a: number; b: number };
  tray?: number[];
  /** The student selects and saves cards as one custom card. */
  save?: SaveSpec;
  /** The scene asks a question: the banner must not show values that would answer it. */
  asking?: boolean;
}

/** How a card was changed: a spinner (`edit`, the default) or a lamp (`toggle`). A scene may lock one and not the other. */
export type EditVia = "edit" | "toggle";

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
  /**
   * Replace the word of card `card` (0-based) with the FULL new 32-bit word. The machine restarts from the first
   * card. `via` says which lock applies: a spinner is an `edit` (the default), a lamp is a `toggle`.
   */
  onEditStarter(card: number, word: number, via?: EditVia): void;
  /** Replace the whole list of cards (the program builder: drag, reorder, remove). Locked by the scene's `drag`. */
  onReplaceCards(words: number[]): void;
  /** Replace the whole program as cards with the custom cards it can call (the builder in a lesson with custom cards). Locked by `drag`. */
  onReplaceProgram(cards: Card[], customCards: CustomCard[]): void;
  /** Set x for the lesson's function (the rule banner's input). Locked by the scene's `edit`. */
  onSetFunctionInput(x: number): void;
  controls: StageControls;
}

export type Stage = (props: StageProps) => ReactNode;
