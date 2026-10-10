import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { MemoryProgressStore, customCard, publishLesson, type PublishedLesson } from "@sierrendipity/lesson-core";
import { loadLesson } from "@sierrendipity/lesson-core/loader";
import { LESSONS_ROOT, readConcepts, readLessonDir } from "@sierrendipity/lesson-core/node";
import { join } from "node:path";
import { createTestClock } from "../../web/src/coach/clock";
import { LessonEngine } from "../../web/src/coach/engine";

interface Player {
  lesson: PublishedLesson;
  engine: LessonEngine;
  store: MemoryProgressStore;
  clock: ReturnType<typeof createTestClock>;
}
let player: Player;

const state = () => player.engine.getState();
const program = () => {
  const found = state().view.program;
  assert.ok(found, "the lesson has no card program");
  return found;
};

Given("the player starts the lesson {string}", (id: string) => {
  const loaded = loadLesson(readLessonDir(join(LESSONS_ROOT, id)), { dir: id, knownConcepts: readConcepts() });
  assert.ok(loaded.ok, loaded.ok ? "" : loaded.errors.join("\n"));
  const lesson = publishLesson(loaded.lesson);
  const store = new MemoryProgressStore();
  const clock = createTestClock();
  const engine = new LessonEngine(lesson, { store, userId: "local", clock, isVisible: () => true });
  engine.start();
  player = { lesson, engine, store, clock };
});

When("the player saves the cards {int} to {int} as the card {string}", (from: number, to: number, name: string) => {
  const current = program();
  const body = current.cards.slice(from - 1, to);
  player.engine.replaceProgram([...current.cards.slice(0, from - 1), customCard(name), ...current.cards.slice(to)], [...current.customCards, { name, cards: body }]);
});
When("the player adds the card {string} to the list", (name: string) => {
  const current = program();
  player.engine.replaceProgram([...current.cards, customCard(name)], current.customCards);
});
When("the player moves card {int} above card {int}", (from: number, above: number) => {
  const words = [...state().view.cards];
  words.splice(above - 1, 0, ...words.splice(from - 1, 1));
  player.engine.replaceCards(words);
});
When("the player types {int} for x", (x: number) => player.engine.setFunctionInput(x));
When("the player selects Step until the machine stops", () => {
  for (let i = 0; i < 40 && state().view.canStep; i++) player.engine.step();
  assert.equal(state().view.canStep, false, "the machine did not stop");
});
When("the player selects Start again", () => player.engine.reset());
When("the player selects Try again", () => player.engine.tryAgain());
When("the player answers {int}", (value: number) => player.engine.answer(value));
When("the player fills the table with {string}", (list: string) => player.engine.answerTable(list.split(",").map((v) => Number(v.trim()))));
When("the player skips the scene", () => player.engine.skip());

Then("the player is on the scene {string}", (id: string) => assert.equal(state().scene?.id, id));
Then("the lesson is finished", () => assert.equal(state().phase, "done"));
Then("the lesson is passed", () => assert.equal(player.store.getLesson("local", player.lesson.id).passed, true));
Then("the lesson is not passed", () => assert.equal(player.store.getLesson("local", player.lesson.id).passed, false));
Then("the player has the star {string}", (star: string) => assert.ok(player.store.getLesson("local", player.lesson.id).bonuses.includes(star), `no star ${star}`));
Then("the player has no star {string}", (star: string) => assert.ok(!player.store.getLesson("local", player.lesson.id).bonuses.includes(star), `star ${star} was awarded`));
Then("the box {string} holds {int}", (name: string, value: number) => assert.equal(state().view.boxes.find((b) => b.name === name)?.value, value));
Then("the coach text says {string}", (text: string) => assert.ok(state().say.includes(text), state().say));
Then("the coach reply says {string}", (text: string) => assert.ok((state().reply ?? "").includes(text), String(state().reply)));
Then("the coach shows no reply", () => assert.equal(state().reply, null));
Then("the coach help for a missed goal says {string}", (text: string) => assert.ok((state().missed ?? "").includes(text), String(state().missed)));
Then("the coach shows no help for a missed goal", () => assert.equal(state().missed, null));
Then("the coach confirmation says {string}", (text: string) => assert.ok((state().doneLine ?? "").includes(text), String(state().doneLine)));
Then("the list holds {int} cards", (n: number) => assert.equal(program().cards.length, n));
Then("the Step button is called {string}", (label: string) => assert.equal(player.lesson.ui?.stepLabel ?? "Step", label));
// The celebration of a reached goal holds the way on back for a moment: let it end first.
When("the player continues", () => {
  player.clock.advance(2000);
  player.engine.continue();
});
