import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { MemoryProgressStore, isPublishedLesson, publishLesson, type Lesson, type ProgressStore, type PublishedLesson } from "@sierrendipity/lesson-core";
import { loadLesson } from "@sierrendipity/lesson-core/loader";
import { LESSONS_ROOT, readConcepts, readLessonDir } from "@sierrendipity/lesson-core/node";
import { join } from "node:path";
import { createTestClock } from "../../web/src/coach/clock";
import { LessonEngine } from "../../web/src/coach/engine";

interface World {
  full?: Lesson;
  published?: PublishedLesson;
  engine?: LessonEngine;
  store?: ProgressStore;
  broken?: unknown;
}
const w: World = {};

function load(id: string): Lesson {
  const result = loadLesson(readLessonDir(join(LESSONS_ROOT, id)), { dir: id, knownConcepts: readConcepts() });
  assert.ok(result.ok, result.ok ? "" : result.errors.join("\n"));
  return result.lesson;
}

function fresh() {
  w.store = new MemoryProgressStore();
  w.engine = new LessonEngine(w.published!, { store: w.store, userId: "local", clock: createTestClock(), isVisible: () => true });
  w.engine.start();
  return w.engine;
}

Given("the engine plays {string}", (id: string) => {
  w.full = load(id);
  w.published = publishLesson(w.full);
  fresh();
});

type Stray = "step" | "back" | "reset" | "wrong" | "edit";
const STRAY: Stray[] = ["step", "back", "reset", "wrong", "edit"];

function stray(e: LessonEngine, what: Stray) {
  const st = e.getState();
  if (what === "step") e.step();
  else if (what === "back") e.back();
  else if (what === "reset") e.reset();
  else if (what === "wrong") e.answer(-7);
  else e.edit(0, ((st.view.cards[0] ?? 0) + (1 << 20)) >>> 0);
}

/** What an honest student does: follow the coach's instruction on each scene until the lesson ends. */
function solve(e: LessonEngine, stopAt?: string, limit = 80) {
  const solution = w.full!.solutions.find((s) => s.earns.includes("pass"))!.words;
  for (let i = 0; i < limit; i++) {
    const st = e.getState();
    if (st.phase === "done") return;
    if (st.phase === "quick-offer") e.chooseQuick(false);
    else if (stopAt && st.scene?.id === stopAt) return;
    else if (st.waiting === "continue") e.continue();
    else if (st.waiting === "ask") e.answer(st.ask!.kind === "number" || st.ask!.kind === "choice" ? st.ask.answer : 0);
    else {
      const needsEdit = st.scene!.until.some((p) => /edited/.test(p)) || solution.some((word, card) => word !== st.view.cards[card]);
      const diff = solution.findIndex((word, card) => word !== st.view.cards[card]);
      if (needsEdit && diff >= 0 && !st.locked.includes("edit")) e.edit(diff, solution[diff]!);
      else if (st.stranded) e.back();
      else if (st.view.canStep) e.step();
      else e.reset();
    }
  }
  assert.fail(`stuck at scene "${e.getState().scene?.id}" after ${limit} actions`);
}

Then("every sequence of up to {int} stray actions at every scene still leads to the pass", (max: number) => {
  const lesson = w.published!;
  const sequences: Stray[][] = [[]];
  for (let len = 1; len <= max; len++) for (const s of sequences.filter((q) => q.length === len - 1)) for (const a of STRAY) sequences.push([...s, a]);
  let runs = 0;
  for (const scene of lesson.scenes) {
    for (const seq of sequences) {
      const e = fresh();
      solve(e, scene.id);
      for (const a of seq) stray(e, a);
      solve(e);
      assert.equal(w.store!.getLesson("local", lesson.id).passed, true, `no pass after [${seq.join(", ")}] at scene "${scene.id}"`);
      runs++;
    }
  }
  assert.ok(runs > 50);
});

When("the student presses Step twice and then answers {int}", (n: number) => {
  const e = w.engine!;
  e.step(); // in "look", before the question is asked
  e.step();
  e.continue();
  e.answer(n);
});
When("the student presses Reset and Step twice", () => {
  const e = w.engine!;
  e.reset();
  e.step();
  e.step();
});
Then("the lesson is passed once, without {string}, and the concept {string} is in box {int}", (star: string, concept: string, box: number) => {
  const p = w.store!.getLesson("local", w.published!.id);
  assert.equal(p.passed, true);
  assert.equal(p.attempts, 1, "attempts");
  assert.ok(!p.bonuses.includes(star), `${star} was awarded`);
  assert.equal(w.store!.getMastery("local")[concept]?.box, box);
  assert.equal(p.predictionsAsked, 0, "a prediction after the reveal is not recorded");
});

Given("the published lesson {string}", (id: string) => {
  w.broken = JSON.parse(JSON.stringify(publishLesson(load(id))));
});
Then("it is accepted as a published lesson", () => {
  assert.equal(isPublishedLesson(w.broken), null);
});
When("I remove {string} from it", (key: string) => {
  delete (w.broken as Record<string, unknown>)[key];
});
When("I change its format to {int}", (n: number) => {
  (w.broken as Record<string, unknown>).format = n;
});
Then("it is not accepted as a published lesson", () => {
  assert.equal(typeof isPublishedLesson(w.broken), "string");
});

Given("the engine plays {string} with the step scene waiting for {string}", (id: string, phrase: string) => {
  w.full = load(id);
  const copy = JSON.parse(JSON.stringify(publishLesson(w.full))) as PublishedLesson;
  copy.scenes.find((s) => s.id === "press-step")!.until = [phrase];
  w.published = copy;
  fresh();
});
When("the student continues to the Run scene and runs", () => {
  for (let i = 0; i < 3; i++) w.engine!.continue();
  w.engine!.step();
});
Then("the coach tells the student to press Back and spotlights {string}", (target: string) => {
  const st = w.engine!.getState();
  assert.equal(st.stranded, true);
  assert.equal(st.spotlight, target);
});
When("the player presses Back", () => {
  w.engine!.back();
});
Then("the coach no longer tells the student to press Back", () => {
  assert.equal(w.engine!.getState().stranded, false);
});
