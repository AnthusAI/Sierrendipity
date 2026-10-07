import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { join } from "node:path";
import { assemble, fromWords, registerName, rowAt, Session } from "@sierrendipity/explorer";
import { DEFAULT_MAX_STEPS, earnedStars, liveRunOf, pressStep, runChecks, runProgram, startLive } from "@sierrendipity/lesson-core";
import { loadLesson } from "@sierrendipity/lesson-core/loader";
import { LESSONS_ROOT, readConcepts, readLessonDir } from "@sierrendipity/lesson-core/node";

let session: Session;
let image: ReturnType<typeof fromWords>;
let stepRefused: boolean;
let backRefused: boolean;

const register = (name: string): number => {
  for (let n = 0; n < 32; n++) if (registerName(n) === name) return n;
  throw new Error(`unknown register ${name}`);
};

function wordsOf(source: string): number[] {
  const result = assemble(source);
  assert.deepEqual(result.errors, [], "the program should assemble");
  return result.words;
}

Given("a session for the program", (source: string) => {
  session = new Session(fromWords(wordsOf(source)));
});
Given("a session with a hidden end for the program", (source: string) => {
  session = new Session(fromWords([...wordsOf(source), 0x00100073]), { hideEnd: true });
});

When("I step the session {int} times", (count: number) => {
  for (let i = 0; i < count; i++) assert.ok(session.stepForward(), `step ${i + 1} should run`);
});
When("I step the session back {int} times", (count: number) => {
  for (let i = 0; i < count; i++) assert.ok(session.stepBackward(), `back ${i + 1} should work`);
});
When("I step the session until it stops", () => {
  while (session.stepForward());
});
When("I reset the session", () => session.reset());

Then("the session is at position {int} with {int} steps", (position: number, steps: number) => {
  assert.equal(session.position, position);
  assert.equal(session.steps, steps);
});
Then("the session has {int} steps", (steps: number) => assert.equal(session.steps, steps));
Then("the session machine is {string}", (state: string) => assert.equal(session.machine.state, state));
Then("the session machine is {string} at pc {int}", (state: string, pc: number) => {
  assert.equal(session.machine.state, state);
  assert.equal(session.machine.pc, pc);
});
Then("the session register {word} is {int}", (name: string, value: number) => assert.equal(session.machine.regs[register(name)], value));
Then("the session register {word} is {int} and register {word} is {int}", (a: string, av: number, b: string, bv: number) => {
  assert.equal(session.machine.regs[register(a)], av);
  assert.equal(session.machine.regs[register(b)], bv);
});
Then("the session byte at {int} is {int}", (addr: number, value: number) => assert.equal(session.machine.readMem(addr, 1)[0], value));
Then("the session history has {int} steps", (count: number) => assert.equal(session.history().length, count));
Then("the session cannot step", () => assert.equal(session.canStep, false));
Then("stepping the session forward is refused", () => {
  stepRefused = session.stepForward() === null;
  assert.ok(stepRefused);
});
Then("stepping the session back is refused", () => {
  backRefused = !session.stepBackward();
  assert.ok(backRefused);
});

Then("the program image of the words {word} and {word} has {int} rows and {int} bytes", (a: string, b: string, rows: number, bytes: number) => {
  image = fromWords([Number(a), Number(b)]);
  assert.equal(image.rows.length, rows);
  assert.equal(image.image.length, bytes);
});
Then("the row at address {int} is the word {word}", (addr: number, word: string) => assert.equal(rowAt(image, addr)?.word, Number(word)));
Then("there is no row at address {int}", (addr: number) => assert.equal(rowAt(image, addr), undefined));

Then("the session agrees with the checker on every solution of {word}", (id: string) => {
  const loaded = loadLesson(readLessonDir(join(LESSONS_ROOT, id)), { dir: id, knownConcepts: readConcepts() });
  assert.ok(loaded.ok, loaded.ok ? "" : loaded.errors.join("\n"));
  const lesson = loaded.lesson;
  assert.ok(lesson.solutions.length > 0);
  for (const decl of lesson.solutions) {
    const cap = decl.maxSteps ?? DEFAULT_MAX_STEPS;
    const direct = runProgram(decl.words, { maxSteps: cap, predictions: decl.predictions, starter: lesson.starter.words, hideEnd: lesson.hideEnd });
    const live = startLive(decl.words, { hideEnd: lesson.hideEnd, maxSteps: cap + 1 });
    live.facts = { predictions: decl.predictions, starter: lesson.starter.words };
    for (let i = 0; i < cap && pressStep(live); i++);
    const through = liveRunOf(live);
    assert.equal(through.machine.state, direct.machine.state, `${decl.file}: state`);
    assert.equal(through.steps, direct.steps, `${decl.file}: steps`);
    assert.deepEqual(Array.from(through.machine.regs), Array.from(direct.machine.regs), `${decl.file}: registers`);
    assert.deepEqual(earnedStars(runChecks(lesson.checks, through)), earnedStars(runChecks(lesson.checks, { ...direct, hitStepCap: through.hitStepCap })), `${decl.file}: earned stars`);
    assert.deepEqual(earnedStars(runChecks(lesson.checks, through)).sort(), [...decl.earns].sort(), `${decl.file}: declared stars`);
  }
});
