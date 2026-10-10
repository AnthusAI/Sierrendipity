import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { join } from "node:path";
import { assemble, fromWords, Machine, registerName, rowAt, Session } from "@sierrendipity/explorer";
import { DEFAULT_FUNCTION_INPUT, DEFAULT_MAX_STEPS, earnedStars, LIVE_MAX_STEPS, liveRunOf, pressBack, pressStep, registerNumber, runChecks, runProgram, startLive } from "@sierrendipity/lesson-core";
import { loadLesson } from "@sierrendipity/lesson-core/loader";
import { LESSONS_ROOT, listLessonIds, readConcepts, readLessonDir } from "@sierrendipity/lesson-core/node";

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
Given("a session limited to {int} steps for the program", (maxSteps: number, source: string) => {
  session = new Session(fromWords(wordsOf(source)), { maxSteps });
});
Given("a session with a hidden end for the program", (source: string) => {
  session = new Session(fromWords([...wordsOf(source), 0x00100073]), { hideEnd: true });
});

Given("a session with register a0 starting at {int} for the program", (value: number, source: string) => {
  session = new Session(fromWords(wordsOf(source)), { startRegs: { 10: value } });
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
When("I record the whole session ahead", () => session.recordAll());
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
Then("the session is at position {int}", (position: number) => assert.equal(session.position, position));
Then("the session hit the step limit", () => assert.equal(session.hitStepLimit, true));
Then("the session can step", () => assert.equal(session.canStep, true));
Then("the session recorded {int} steps", (count: number) => assert.equal(session.timeline.length, count));
Then("a live machine on a program that never ends stops after 2000 steps and reports the cap", () => {
  const live = startLive(wordsOf("loop: jal zero, loop"), { hideEnd: true });
  for (let i = 0; i < LIVE_MAX_STEPS; i++) assert.ok(pressStep(live), `step ${i + 1} should run`);
  assert.equal(pressStep(live), null);
  assert.equal(live.session.canStep, false);
  const run = liveRunOf(live);
  assert.equal(run.hitStepCap, true);
  assert.equal(run.steps, LIVE_MAX_STEPS);
  assert.ok(pressBack(live));
  assert.equal(live.session.canStep, true);
});
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

const memoryOf = (view: { memorySize: number; readMem(addr: number, length: number): Uint8Array }) => Array.from(view.readMem(0, view.memorySize));

Then("the session agrees with the checker on every solution of every Course 1 and x1 lesson", () => {
  const ids = listLessonIds().filter((id) => id.startsWith("c1/") || id.startsWith("x1/"));
  assert.ok(ids.length >= 12, `expected the c1 and x1 lessons, found ${ids.length}`);
  for (const id of ids) {
    const loaded = loadLesson(readLessonDir(join(LESSONS_ROOT, id)), { dir: id, knownConcepts: readConcepts() });
    assert.ok(loaded.ok, loaded.ok ? "" : loaded.errors.join("\n"));
    const lesson = loaded.lesson;
    for (const decl of lesson.solutions) {
      const where = `${id} ${decl.file}`;
      const cap = decl.maxSteps ?? DEFAULT_MAX_STEPS;
      const fn = lesson.function;
      const startRegs = fn ? { [fn.inputs[0]!]: DEFAULT_FUNCTION_INPUT } : undefined;
      const functionBoxes = fn ? { name: fn.name, input: fn.inputs[0]!, output: fn.output } : undefined;
      const events = lesson.scenes.flatMap((sc) => (sc.ask?.kind === "table" ? [{ type: "table" as const, inputs: sc.ask.inputs }] : []));
      const direct = runProgram(decl.words, { maxSteps: cap, predictions: decl.predictions, starter: lesson.starter.words, hideEnd: lesson.hideEnd, events, tail: decl.tail ?? [], usedCards: decl.usedCards ?? [], ...(startRegs ? { startRegs, functionBoxes } : {}) });
      const live = startLive(decl.words, { hideEnd: lesson.hideEnd, tail: decl.tail ?? [], ...(startRegs ? { startRegs } : {}) });
      live.facts = { usedCards: decl.usedCards ?? [], predictions: decl.predictions, starter: lesson.starter.words, events, ...(functionBoxes ? { functionBoxes } : {}) };
      const startState = live.machine.state;
      while (pressStep(live));
      const through = liveRunOf(live);
      if (decl.capped) {
        assert.equal(through.hitStepCap, true, `${where}: capped solution reaches the live limit`);
        assert.equal(through.steps, LIVE_MAX_STEPS, `${where}: steps at the live limit`);
        continue;
      }
      assert.equal(through.hitStepCap, direct.hitStepCap, `${where}: hitStepCap`);
      assert.equal(through.machine.state, direct.machine.state, `${where}: state`);
      assert.equal(through.machine.pc, direct.machine.pc, `${where}: pc`);
      assert.equal(through.machine.exitCode, direct.machine.exitCode, `${where}: exit code`);
      assert.equal(through.machine.fault, direct.machine.fault, `${where}: fault`);
      assert.equal(through.steps, direct.steps, `${where}: steps`);
      assert.deepEqual(Array.from(through.machine.regs), Array.from(direct.machine.regs), `${where}: registers`);
      assert.deepEqual(memoryOf(through.machine), memoryOf(direct.machine), `${where}: memory`);
      assert.deepEqual(earnedStars(runChecks(lesson.checks, through)), earnedStars(runChecks(lesson.checks, direct)), `${where}: earned stars`);
      assert.deepEqual(earnedStars(runChecks(lesson.checks, through)).sort(), [...decl.earns].sort(), `${where}: declared stars`);

      const reference = new Machine({ memorySize: 65536 });
      reference.load(fromWords(live.words).image, 0, 0);
      if (fn) reference.setStartRegs({ [registerNumber(fn.inputs[0]!)!]: DEFAULT_FUNCTION_INPUT });
      const history = live.session.history();
      for (const [i, step] of history.entries()) {
        const expected = reference.step();
        assert.equal(step.pc, expected.pc, `${where}: step ${i + 1} pc`);
        assert.equal(step.word, expected.word, `${where}: step ${i + 1} word`);
        assert.equal(step.state, expected.state, `${where}: step ${i + 1} state`);
        assert.deepEqual(step.changedRegs, expected.changedRegs, `${where}: step ${i + 1} registers changed`);
      }

      while (pressBack(live));
      assert.equal(live.session.steps, 0, `${where}: Back reaches the start`);
      assert.equal(live.machine.state, startState, `${where}: state at the start`);
      while (pressStep(live));
      assert.deepEqual(Array.from(live.machine.regs), Array.from(direct.machine.regs), `${where}: registers after Back and replay`);
      assert.deepEqual(memoryOf(live.machine), memoryOf(direct.machine), `${where}: memory after Back and replay`);
    }
  }
});
