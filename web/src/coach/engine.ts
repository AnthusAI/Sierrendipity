import {
  earnedStars,
  liveRunOf,
  parseStep,
  pressBack,
  pressStep,
  registerNumber,
  runChecks,
  startLive,
  type Ask,
  type GhostEvent,
  type Live,
  type LessonRun,
  type ProgressStore,
  type PublishedLesson,
  type Scene,
} from "@sierrendipity/lesson-core";
import { cardsUsed, describe } from "@sierrendipity/explorer";
import { numberSpec, wordToCard } from "../cards/model";
import { plainBoxes } from "./plain";
import { markStopShown, sessionInfo, type Clock } from "./clock";
import { STUCK, StuckDetector, type StuckReason } from "./stuck";
import type { EditVia, LiveView, StageControl } from "./types";

/** Plain-English names for the bonus stars the end card lists. */
const STAR_NAMES: Record<string, string> = {
  "called-it": "right on the first guess",
  "another-way": "another way to do it",
  "below-zero": "a box below zero",
};
export const DEFAULT_WRONG = "Watch what happens.";
/** The most cards the builder may hand back (the same ceiling as the cards model). */
const MAX_REPLACED_CARDS = 200;
/** After the last ghost event, hold the picture this long so the student can read it. */
export const GHOST_HOLD_MS = 2500;

export interface EngineOptions {
  store?: ProgressStore | null;
  userId?: string;
  clock: Clock;
  /** True while the tab is visible; the idle rule only counts visible time. */
  isVisible?: () => boolean;
}

export type Waiting = "continue" | "until" | "ask";

export interface PlayerState {
  phase: "quick-offer" | "scene" | "ghost" | "done";
  sceneKey: number;
  scene: Scene | null;
  waiting: Waiting;
  say: string;
  /** What the stage shows: the real machine, or the ghost's copy during Show me. */
  view: LiveView;
  locked: StageControl[];
  /** The target the spotlight dims everything else for, or null. */
  spotlight: string | null;
  /** The ghost's pointer target and what it is doing, during Show me. */
  ghost: { narration: string; pointer: string | null } | null;
  yourTurn: boolean;
  /** The scene's authored `doneSay`, shown until the student acts or the next scene completes. */
  doneLine: string | null;
  /** A short polite announcement for screen readers when a scene completes without a doneSay. */
  announce: string | null;
  /** The machine cannot reach the goal by stepping: the coach points at Back, or at Reset when the lesson hides Back. */
  stranded: boolean;
  /** A scene that follows a completed goal has just begun: the coach panel marks it as the next goal. */
  nextGoal: boolean;
  /** The words on the button the coach points at when stranded (Back, or the lesson's name for Reset). */
  strandedButton: string;
  reply: string | null;
  /** The scene's `ifMissed` text, while the machine has finished without meeting the goal. */
  missed: string | null;
  hint: { rung: 1 | 2 | 3; text: string } | null;
  canHint: boolean;
  canShowMe: boolean;
  canSkip: boolean;
  nudgeOffer: boolean;
  stopSuggested: boolean;
  skipTourAsk: boolean;
  ask: Ask | null;
  end: { verb: "ran" | "made"; made: string[]; values: string[]; stars: string[]; nowYouCan: string[] } | null;
  stopped: boolean;
}

/** A prediction is made before the reveal: while it is asked, the machine does not move. */
const ASK_LOCKED: StageControl[] = ["step", "back", "reset", "edit"];

const finished = (live: Live): boolean => !live.session.canStep;

/** One lesson being played: scenes, the live machine, help, stuck rules and progress. No DOM, no React. */
export class LessonEngine {
  private readonly lesson: PublishedLesson;
  private readonly clock: Clock;
  private readonly store: ProgressStore | null;
  private readonly userId: string;
  private readonly isVisible: () => boolean;
  private readonly detector: StuckDetector;
  private readonly listeners = new Set<() => void>();

  private cards: number[];
  private live: Live;
  private demo: Live | null = null;
  /** Runs already recorded as attempts, keyed by scene and cards, so Back and Reset never add attempts. */
  private recorded = new Set<string>();
  private bonusSeen = new Set<string>();

  private phase: PlayerState["phase"] = "scene";
  private sceneIndex = 0;
  private sceneKey = 0;
  private mastery: boolean;
  private quick = false;

  private doneLine: string | null = null;
  private announce: string | null = null;
  private reply: string | null = null;
  private missed: string | null = null;
  private nextGoal = false;
  private completedGoal = false;
  private awaitingEdit = false;
  private hintRung = 0;
  private yourTurn = false;
  private nudgeOffer = false;
  private silencedUntil = 0;
  private stopSuggested = false;
  private skipTourAsk = false;
  private tourSkipped = false;
  private stopped = false;
  private ghost: PlayerState["ghost"] = null;

  private ghostTimers: number[] = [];
  private idleTimer: number | null = null;
  private sessionTimer: number | null = null;
  private started = false;
  private snapshot!: PlayerState;

  /** Say "the box" when the lesson does not show register names. */
  private plain(text: string): string {
    return this.lesson.ui?.boxNames === false ? plainBoxes(text) : text;
  }

  constructor(lesson: PublishedLesson, opts: EngineOptions) {
    this.lesson = lesson;
    this.clock = opts.clock;
    this.store = opts.store ?? null;
    this.userId = opts.userId ?? "local";
    this.isVisible = opts.isVisible ?? (() => typeof document === "undefined" || document.visibilityState !== "hidden");
    this.cards = [...lesson.starter.words];
    this.live = this.build(this.cards);
    this.live.facts = { starter: [...lesson.starter.words], predictions: {}, events: [] };
    this.detector = new StuckDetector(this.clock.now());
    this.mastery = this.hasMastery();
    if (this.mastery && lesson.scenes.some((s) => s.skippable)) this.phase = "quick-offer";
    this.refresh();
  }

  // Lifecycle (idempotent, so React StrictMode can mount twice)

  start(): void {
    if (this.started) return;
    this.started = true;
    const session = sessionInfo(this.clock);
    if (!session.shown) {
      const left = Math.max(0, session.start + STUCK.sessionMs - this.clock.now());
      this.sessionTimer = this.clock.setTimeout(() => {
        this.stopSuggested = true;
        markStopShown(this.clock);
        this.refresh();
      }, left);
    }
    this.armIdle();
  }

  dispose(): void {
    this.started = false;
    this.ghostTimers.forEach((t) => this.clock.clearTimeout(t));
    this.ghostTimers = [];
    if (this.idleTimer !== null) this.clock.clearTimeout(this.idleTimer);
    if (this.sessionTimer !== null) this.clock.clearTimeout(this.sessionTimer);
    this.idleTimer = this.sessionTimer = null;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };

  getState = (): PlayerState => this.snapshot;

  // Student actions

  /** Any input at all (keys, clicks, typing): the idle rule starts over. */
  noteInput(): void {
    this.detector.input(this.clock.now());
    this.armIdle();
  }

  continue(): void {
    if (this.phase !== "scene" || this.waiting() !== "continue") return;
    this.touch();
    this.doneLine = null;
    this.goNext();
  }

  /** Skip a goal the student has shown mastery of. */
  skip(): void {
    if (!this.snapshot.canSkip) return;
    this.touch();
    this.goNext();
  }

  chooseQuick(quick: boolean): void {
    if (this.phase !== "quick-offer") return;
    this.touch();
    this.quick = quick;
    this.phase = "scene";
    let i = 0;
    while (i < this.lesson.scenes.length && this.skipping(i)) i++;
    i < this.lesson.scenes.length ? this.enterScene(i) : this.finish();
  }

  step(): void {
    if (!this.canAct("step")) return;
    const r = pressStep(this.live);
    if (!r) return;
    this.touch();
    this.afterRun();
  }

  back(): void {
    if (!this.canAct("back")) return;
    if (!pressBack(this.live)) return;
    this.touch();
    (this.live.facts.events ??= []).push({ type: "rewind" });
    this.trigger(this.detector.undone(this.clock.now()));
    this.afterRun(false);
  }

  reset(): void {
    if (!this.canAct("reset")) return;
    this.touch();
    const worked = this.snapshot.view.steps > 0;
    this.live = this.build(this.cards, this.live.facts);
    if (worked) this.trigger(this.detector.undone(this.clock.now()));
    this.refresh();
  }

  /** [Try again] after a missed goal: back to the start with the cards as they are (even when the Reset button is hidden). */
  tryAgain(): void {
    if (this.phase !== "scene" || !this.missed) return;
    this.touch();
    this.live = this.build(this.cards, this.live.facts);
    this.refresh();
  }

  /** Replace card `card` with the full new word. A spinner is an `edit`; a lamp is a `toggle` (each has its own lock). */
  edit(card: number, word: number, via: EditVia = "edit"): void {
    if (!this.canAct(via)) return;
    const to = word >>> 0;
    if (!Number.isInteger(card) || card < 0 || card >= this.cards.length || this.cards[card] === to) return;
    this.touch();
    this.awaitingEdit = false;
    const before = this.cards[card]!;
    this.cards = this.cards.map((w, i) => (i === card ? to : w));
    this.live = this.build(this.cards, this.live.facts);
    (this.live.facts.events ??= []).push({ type: "edit", card, to });
    this.trigger(this.detector.edited(`card:${card}`, before, to));
    this.afterRun(false);
  }

  /** Replace the whole list of cards (the program builder). Locked when the scene locks `drag`. */
  replaceCards(words: number[]): void {
    if (!this.canAct("drag")) return;
    if (!Array.isArray(words) || words.length > MAX_REPLACED_CARDS || !words.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffffffff)) return;
    const next = words.map((w) => w >>> 0);
    if (next.length === this.cards.length && next.every((w, i) => w === this.cards[i])) return;
    this.touch();
    const before = this.cards;
    this.cards = next;
    this.live = this.build(this.cards, this.live.facts);
    const events = (this.live.facts.events ??= []);
    next.forEach((w, card) => {
      if (before[card] !== w) events.push({ type: "edit", card, to: w });
    });
    this.afterRun(false);
  }

  /** Answer a number or choice prediction (a choice answers with its index). */
  answer(value: number): void {
    const scene = this.scene();
    const ask = scene?.ask;
    if (!ask || this.phase !== "scene" || (ask.kind !== "number" && ask.kind !== "choice") || !Number.isFinite(value)) return;
    this.touch();
    const genuine = !finished(this.live);
    if (genuine && ask.kind === "number" && ask.target) {
      const facts = this.live.facts;
      facts.predictions = { ...(facts.predictions ?? {}), [ask.target]: [...(facts.predictions?.[ask.target] ?? []), value] };
    }
    const label = ask.kind === "choice" ? (ask.choices[value] ?? String(value)) : value;
    this.resolveAnswer(value === ask.answer, label, genuine);
  }

  /** Answer a click-target prediction: the student clicked the element with this data-coach-id. */
  answerTarget(id: string): void {
    const ask = this.scene()?.ask;
    if (!ask || ask.kind !== "click-target" || this.phase !== "scene") return;
    this.touch();
    this.resolveAnswer(id === ask.target, id, !finished(this.live));
  }

  /** Answer a machine-query prediction: does the live machine satisfy the question's phrase? */
  checkQuery(): void {
    const ask = this.scene()?.ask;
    if (!ask || ask.kind !== "machine-query" || this.phase !== "scene") return;
    this.touch();
    this.resolveAnswer(this.holds([ask.query], liveRunOf(this.live)), "no", !finished(this.live));
  }

  // Help

  hint(): void {
    const scene = this.scene();
    if (this.phase !== "scene" || !scene || scene.hints.length < 3 || this.hintRung >= 3) return;
    this.touch();
    this.nudgeOffer = false;
    this.hintRung++;
    this.safe(() => this.store?.recordEvent(this.userId, { type: "hint", lessonId: this.lesson.id, rung: this.hintRung as 1 | 2 | 3 }));
    this.refresh();
  }

  showMe(): void {
    const scene = this.scene();
    const ghost = scene?.showMe ? this.lesson.ghosts[scene.showMe] : undefined;
    if (this.phase !== "scene" || !ghost) return;
    this.touch();
    this.nudgeOffer = false;
    this.skipTourAsk = false;
    this.yourTurn = false;
    this.safe(() => this.store?.recordEvent(this.userId, { type: "show-me", lessonId: this.lesson.id, concepts: this.lesson.concepts.introduces }));
    // The ghost works on a copy; the student's own machine is never touched.
    this.demo = this.copyLive();
    this.phase = "ghost";
    this.ghost = { narration: "Show me: watch the ghost.", pointer: null };
    for (const e of ghost.events) {
      if (e.at <= 0) this.playGhost(e);
      else this.ghostTimers.push(this.clock.setTimeout(() => this.playGhost(e), e.at));
    }
    const end = (ghost.events.at(-1)?.at ?? 0) + GHOST_HOLD_MS;
    this.ghostTimers.push(this.clock.setTimeout(() => this.endGhost(), end));
    this.refresh();
  }

  /** Stop the demo early; control goes back to the student either way. */
  cancelGhost(): void {
    if (this.phase === "ghost") this.endGhost();
  }

  nudge(): void {
    this.hint();
    this.nudgeOffer = false;
    this.refresh();
  }

  imFine(): void {
    this.silencedUntil = this.clock.now() + STUCK.silenceMs;
    this.nudgeOffer = false;
    this.touch();
    this.refresh();
  }

  dismissStopSuggestion(): void {
    this.stopSuggested = false;
    this.refresh();
  }

  // The spotlight

  /** Escape: do not dismiss silently, ask first. */
  askSkipTour(): void {
    if (this.snapshot.spotlight && !this.skipTourAsk) {
      this.skipTourAsk = true;
      this.refresh();
    } else if (this.skipTourAsk) this.answerSkipTour(false);
  }

  answerSkipTour(skip: boolean): void {
    this.skipTourAsk = false;
    if (skip) this.tourSkipped = true;
    this.refresh();
  }

  stop(): void {
    this.stopped = true;
    this.refresh();
  }

  // Internals

  private scene(): Scene | null {
    return this.lesson.scenes[this.sceneIndex] ?? null;
  }

  private waiting(scene = this.scene()): Waiting {
    return scene?.ask ? "ask" : scene && scene.until.length > 0 ? "until" : "continue";
  }

  private canAct(control: StageControl): boolean {
    if (this.phase !== "scene") return false;
    if (this.waiting() === "ask" && ASK_LOCKED.includes(control)) return false;
    return !(this.scene()?.lock as string[] | undefined)?.includes(control);
  }

  private skipping(i: number): boolean {
    return this.quick && this.mastery && this.lesson.scenes[i]!.skippable;
  }

  /** Two other lessons passed with no Show me and no near-answer hint: the student has shown mastery. */
  private hasMastery(): boolean {
    try {
      const lessons = this.store?.export(this.userId).lessons ?? {};
      return Object.entries(lessons).filter(([id, p]) => id !== this.lesson.id && p.passed && p.showMeUsed === 0 && p.hintsUsed[2] === 0).length >= 2;
    } catch {
      return false;
    }
  }

  private build(cards: number[], facts?: Live["facts"]): Live {
    const live = startLive(cards, { hideEnd: this.lesson.hideEnd });
    if (facts) live.facts = facts;
    return live;
  }

  private copyLive(): Live {
    const copy = this.build(this.cards, structuredClone(this.live.facts));
    for (let i = 0; i < this.snapshot.view.steps; i++) pressStep(copy);
    return copy;
  }

  private safe(fn: () => unknown): void {
    try {
      fn();
    } catch {
      /* the player never blocks on storage */
    }
  }

  private touch(): void {
    this.detector.input(this.clock.now());
    this.yourTurn = false;
    this.doneLine = null;
    this.announce = null;
    this.armIdle();
  }

  private holds(phrases: string[], run: LessonRun): boolean {
    return phrases.every((p) => {
      const parsed = parseStep(p);
      return parsed.ok && parsed.fn(run).ok;
    });
  }

  /** The last scene with a goal on the machine: where an unfinished or wrong run counts as an attempt. */
  private goalScene(): number {
    for (let i = this.lesson.scenes.length - 1; i >= 0; i--) if (this.lesson.scenes[i]!.until.length > 0) return i;
    return -1;
  }

  /**
   * Record a finished run as an attempt, once per scene and cards: always in the goal scene, elsewhere only
   * when it earns a bonus not yet earned. Back and Reset never add attempts, and a pass counts only here.
   */
  private recordRun(run: LessonRun): void {
    const key = `${this.sceneIndex}|${this.cards.join(",")}`;
    if (this.recorded.has(key)) return;
    const stars = earnedStars(runChecks(this.lesson.checks, run));
    const newBonus = stars.some((s) => s !== "pass" && !this.bonusSeen.has(s));
    if (this.sceneIndex !== this.goalScene() && !newBonus) return;
    this.recorded.add(key);
    for (const s of stars) this.bonusSeen.add(s);
    this.safe(() => this.store?.recordAttempt(this.userId, this.lesson.id, { passed: stars.includes("pass"), stars, cards: run.cards, steps: run.steps, concepts: this.lesson.concepts.introduces, cardsUsed: stars.includes("pass") ? cardsUsed(this.cards) : [] }));
  }

  /** After a student action (or on entering a scene): record a finished run, then see whether the goal holds. */
  private afterRun(countFailure = true): void {
    const run = liveRunOf(this.live);
    const over = finished(this.live);
    if (over) this.recordRun(run);
    const scene = this.scene();
    this.missed = null;
    if (scene && this.phase === "scene" && this.waiting(scene) === "until") {
      if (this.holds(scene.until, run)) {
        this.complete(scene);
        return;
      }
      if (over && countFailure) {
        this.missed = scene.ifMissed ?? null;
        this.trigger(this.detector.failedCheck());
      }
    }
    this.refresh();
  }

  /** The scene's goal is met: say the authored doneSay (or announce quietly), then move on. */
  private complete(scene: Scene): void {
    this.completedGoal = true;
    this.doneLine = scene.doneSay ?? null;
    this.announce = scene.doneSay ? null : "Scene complete.";
    this.goNext();
  }

  /** `genuine`: the guess was made before the machine showed the answer. Anything later is not a prediction. */
  private resolveAnswer(correct: boolean, given: string | number, genuine: boolean): void {
    const scene = this.scene()!;
    if (genuine) this.safe(() => this.store?.recordEvent(this.userId, { type: "prediction", lessonId: this.lesson.id, correct, concepts: this.lesson.concepts.introduces }));
    if (correct) {
      if (genuine && (scene.ask?.kind === "number" || scene.ask?.kind === "choice")) this.complete({ ...scene, doneSay: ["You called it.", scene.doneSay].filter(Boolean).join(" ") });
      else this.complete(scene);
      return;
    }
    this.trigger(this.detector.failedCheck());
    const match = scene.onWrong.find((w) => w.match === given);
    const explanation = match?.say ?? this.lesson.onWrongDefault ?? DEFAULT_WRONG;
    const reply = scene.ask?.kind === "number" ? `You said ${given}. ${explanation}` : explanation;
    const gotoId = match ? match.goto : this.lesson.onWrongDefaultGoto;
    const target = gotoId ? this.lesson.scenes.findIndex((x) => x.id === gotoId) : this.sceneIndex + 1;
    if (target >= 0 && target < this.lesson.scenes.length && target !== this.sceneIndex) {
      this.enterScene(target);
      if (this.sceneIndex === target) this.reply = reply;
    } else this.reply = reply;
    this.refresh();
  }

  private goNext(): void {
    let i = this.sceneIndex + 1;
    while (i < this.lesson.scenes.length && this.skipping(i)) i++;
    if (i >= this.lesson.scenes.length) this.finish();
    else this.enterScene(i);
  }

  private enterScene(i: number): void {
    this.sceneIndex = i;
    this.sceneKey++;
    this.hintRung = 0;
    this.reply = null;
    this.missed = null;
    this.awaitingEdit = false;
    this.nudgeOffer = false;
    this.skipTourAsk = false;
    const scene0 = this.lesson.scenes[i]!;
    this.nextGoal = this.completedGoal && this.waiting(scene0) === "until";
    this.completedGoal = false;
    this.detector.newGoal(this.clock.now());
    this.armIdle();
    const scene = this.lesson.scenes[i]!;
    // A scene that locks editing promises the starter cards: put them back if the student changed them.
    if (scene.lock.includes("edit") && this.cards.some((w, k) => w !== this.lesson.starter.words[k])) {
      this.cards = [...this.lesson.starter.words];
      this.live = this.build(this.cards, this.live.facts);
    }
    this.awaitingEdit = this.nextGoal && finished(this.live) && !scene.lock.includes("edit") && !this.holds(scene.until, liveRunOf(this.live));
    // The goal may already hold (the student got there early): do not make them do it again.
    if (this.waiting(scene) === "until") this.afterRun(false);
    else this.refresh();
  }

  private finish(): void {
    this.phase = "done";
    this.sceneKey++;
    this.nudgeOffer = false;
    this.skipTourAsk = false;
    this.refresh();
  }

  private trigger(reason: StuckReason | null): void {
    if (!reason || this.phase !== "scene" || this.waiting() === "continue" || this.nudgeOffer || this.clock.now() < this.silencedUntil) return;
    this.nudgeOffer = true;
    this.safe(() => this.store?.recordEvent(this.userId, { type: "stuck", lessonId: this.lesson.id, sceneId: this.scene()?.id }));
  }

  private armIdle(): void {
    if (this.idleTimer !== null) this.clock.clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (!this.started) return;
    this.idleTimer = this.clock.setTimeout(() => {
      this.idleTimer = null;
      const now = this.clock.now();
      if (!this.isVisible()) this.detector.input(now);
      else if (this.detector.idleDue(now)) {
        if (this.phase === "scene" && this.waiting() !== "continue") this.trigger("idle");
        this.detector.input(now);
      }
      this.armIdle();
      this.refresh();
    }, this.detector.idleIn(this.clock.now()));
  }

  private playGhost(e: GhostEvent): void {
    const demo = this.demo;
    if (!demo || this.phase !== "ghost") return;
    const say = (narration: string, pointer: string | null = this.ghost?.pointer ?? null) => (this.ghost = { narration: `Show me: ${narration}`, pointer });
    switch (e.type) {
      case "point":
        say(`pointing at ${plainTarget(e.target, this.lesson.ui)}.`, e.target);
        break;
      case "press":
        say(`pressing ${buttonLabel(e.control, this.lesson.ui)}.`, `button:${e.control}`);
        if (e.control === "step") pressStep(demo);
        else if (e.control === "back") pressBack(demo);
        else if (e.control === "run") for (let i = 0; i < 1000 && pressStep(demo); i++);
        else if (e.control === "reset") this.demo = this.build(demoCards(demo), structuredClone(demo.facts));
        break;
      case "spin":
      case "toggle":
      case "drag": {
        const cards = demoCards(demo);
        let pointer = "tray";
        let narration = "";
        if (e.type === "spin") {
          cards[e.card] = e.to >>> 0;
          [pointer, narration] = [`card:${e.card}`, `changing card ${e.card + 1}.`];
        } else if (e.type === "toggle") {
          cards[e.card] = ((cards[e.card] ?? 0) ^ (1 << e.bit)) >>> 0;
          [pointer, narration] = [`lamp:${e.bit}`, `flipping a lamp on card ${e.card + 1}.`];
        } else if ("tray" in e) {
          const word = this.scene()?.tray?.[e.tray];
          if (word !== undefined) cards.splice(Math.min(e.to, cards.length), 0, word >>> 0);
          [pointer, narration] = ["tray", `dragging a card from the tray to position ${Math.min(e.to, cards.length - 1) + 1}.`];
        } else {
          cards.splice(e.to, 0, ...cards.splice(e.from, 1));
          [pointer, narration] = [`card:${e.to}`, `moving card ${e.from + 1}.`];
        }
        say(narration, pointer);
        this.demo = this.build(cards, structuredClone(demo.facts));
        break;
      }
      case "type": {
        // Typing goes into the number of the card the ghost last pointed at.
        const at = /^card:(\d+)$/.exec(this.ghost?.pointer ?? "");
        const cards = demoCards(demo);
        const index = at ? Number(at[1]) : -1;
        const card = index >= 0 && cards[index] !== undefined ? wordToCard(cards[index]!) : null;
        const spec = card ? numberSpec(card, { index, count: cards.length }) : null;
        const n = /^-?\d+$/.test(e.text.trim()) ? Number(e.text.trim()) : NaN;
        if (spec && Number.isInteger(n) && n >= spec.min && n <= spec.max && n % spec.step === 0) {
          cards[index] = spec.apply(n).word >>> 0;
          this.demo = this.build(cards, structuredClone(demo.facts));
        }
        say(`typing "${e.text}".`);
        break;
      }
    }
    this.refresh();
  }

  private endGhost(): void {
    this.ghostTimers.forEach((t) => this.clock.clearTimeout(t));
    this.ghostTimers = [];
    this.demo = null;
    this.ghost = null;
    this.phase = "scene";
    this.yourTurn = true;
    this.detector.input(this.clock.now());
    this.armIdle();
    this.refresh();
  }

  /** What the idle Step button says when the next goal begins with a finished machine and needs a changed card. */
  private editFirstNote(scene: Scene | null): string {
    const card = /^card:(\d+)$/.exec(scene?.spotlight ?? "");
    return card ? `Change the number on card ${Number(card[1]) + 1} first` : "Change a number first";
  }

  private viewOf(live: Live, demo: boolean): LiveView {
    const m = live.machine;
    const steps = liveRunOf(live).steps;
    const over = m.state === "halted" || m.pc >= live.cards * 4;
    const scene = this.phase === "scene" ? this.scene() : null;
    const goalMissed = !demo && !!scene && this.waiting(scene) === "until" && finished(live) && !this.holds(scene.until, liveRunOf(live));
    return {
      session: live.session,
      cards: live.words.slice(0, live.cards),
      boxes: this.lesson.boxes.map((name) => ({ name, value: m.regs[registerNumber(name) ?? 0]! | 0 })),
      pointer: this.lesson.pointer && !over ? m.pc / 4 : null,
      steps,
      atEnd: over,
      canStep: !demo && !finished(live),
      canBack: !demo && steps > 0,
      goalMissed,
      editFirst: this.awaitingEdit && !demo && finished(live) ? this.editFirstNote(scene) : null,
      hideEnd: this.lesson.hideEnd,
      demo,
    };
  }

  private refresh(): void {
    const scene = this.phase === "scene" || this.phase === "ghost" ? this.scene() : null;
    const showing = this.phase === "scene" && scene ? scene : null;
    const view = this.viewOf(this.demo ?? this.live, this.phase === "ghost");
    const locked = (this.phase === "scene" ? [...(scene?.lock ?? []), ...(this.waiting(scene) === "ask" ? ASK_LOCKED : [])] : ["edit", "step", "back", "run", "reset", "drag", "toggle"]) as StageControl[];
    const controlsShown = this.lesson.ui?.controls;
    const backShown = !controlsShown || controlsShown.includes("back");
    const resetShown = !controlsShown || controlsShown.includes("reset");
    const wayOut: "back" | "reset" | null = backShown ? "back" : resetShown ? "reset" : null;
    // Stranded: the run is over, the goal does not hold, and no edit can change that. Back (or Reset when Back is hidden) is the way out.
    const stranded = !!showing && wayOut !== null && this.waiting(showing) === "until" && !view.canStep && view.steps > 0 && locked.includes("edit") && !locked.includes(wayOut) && !this.holds(showing.until, liveRunOf(this.live));
    const strandedButton = wayOut === "reset" ? this.lesson.ui?.resetLabel ?? "Reset" : "Back";
    const fadesSpotlight = !!this.lesson.ui?.spotlightAfterHint && !!showing && !this.awaitingEdit && this.waiting(showing) !== "continue";
    const spotlight = stranded ? `button:${wayOut}` : showing?.spotlight && (!this.tourSkipped || this.hintRung >= 1) && (!fadesSpotlight || this.hintRung >= 1) ? showing.spotlight : null;
    const rung = this.hintRung;
    this.snapshot = {
      phase: this.phase,
      sceneKey: this.sceneKey,
      scene,
      waiting: this.waiting(scene),
      say: scene?.say ?? "",
      view,
      locked,
      spotlight,
      ghost: this.ghost,
      yourTurn: this.yourTurn && this.phase === "scene",
      doneLine: this.doneLine,
      announce: this.announce,
      stranded,
      nextGoal: this.nextGoal && this.phase === "scene",
      strandedButton,
      reply: this.reply,
      missed: this.phase === "scene" && finished(this.live) ? this.plain(this.missed ?? "") || null : null,
      hint: rung > 0 && showing ? { rung: rung as 1 | 2 | 3, text: showing.hints[rung - 1] ?? "" } : null,
      canHint: !!showing && showing.hints.length >= 3 && rung < 3,
      canShowMe: !!showing && !!showing.showMe && !!this.lesson.ghosts[showing.showMe],
      canSkip: !!showing && showing.skippable && this.mastery && this.waiting(showing) !== "continue",
      nudgeOffer: this.nudgeOffer && this.phase === "scene",
      stopSuggested: this.stopSuggested,
      skipTourAsk: this.skipTourAsk && !!spotlight,
      ask: showing?.ask ?? null,
      end: this.phase === "done" ? this.endCard() : null,
      stopped: this.stopped,
    };
    this.emit();
  }

  private endCard(): NonNullable<PlayerState["end"]> {
    const m = this.live.machine;
    return {
      verb: this.cards.every((w, k) => w === this.lesson.starter.words[k]) && this.cards.length === this.lesson.starter.words.length ? "ran" : "made",
      stars: [...this.bonusSeen].filter((s) => s !== "pass").map((s) => STAR_NAMES[s] ?? s.replace(/-/g, " ")),
      made: this.cards.map((w) => this.plain(describe(w).text)),
      values: this.lesson.boxes.map((name) => this.plain(`Box ${name} holds ${m.regs[registerNumber(name) ?? 0]! | 0}`)),
      nowYouCan: this.lesson.nowYouCan,
    };
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }
}

function demoCards(live: Live): number[] {
  return live.words.slice(0, live.cards);
}

/** The words on a button: the lesson's own name for Step and Reset, else the control's name. */
function buttonLabel(control: string, ui?: { stepLabel?: string; resetLabel?: string }): string {
  if (control === "step") return ui?.stepLabel ?? "Step";
  if (control === "reset") return ui?.resetLabel ?? "Reset";
  return control[0]!.toUpperCase() + control.slice(1);
}

/** "button:step" -> "the Step button" (or the lesson's name for it, such as "the Run button"). */
export function plainTarget(target: string, ui?: { stepLabel?: string; resetLabel?: string }): string {
  const [kind, name = ""] = target.split(":");
  switch (kind) {
    case "button":
      return `the ${buttonLabel(name, ui)} button`;
    case "card":
      return `card ${Number(name) + 1}`;
    case "box":
      return `box ${name}`;
    case "band":
      return `the ${name} band`;
    case "lamp":
      return `lamp ${name}`;
    case "flip":
      return "the card flip";
    case "tray":
      return "the card tray";
    default:
      return target;
  }
}
