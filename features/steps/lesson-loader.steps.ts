import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { join } from "node:path";
import { earnedStars, parseStep, runChecks, runProgram, type Lesson, type PublishedLesson } from "@sierrendipity/lesson-core";
import { checkLesson, type LessonReport } from "@sierrendipity/lesson-core/check";
import { crossCheckGherkin, readConcepts, readLessonDir } from "@sierrendipity/lesson-core/node";
import { countSentences, loadLesson, publishLesson, type LoadResult } from "@sierrendipity/lesson-core/loader";
import { assembleOrThrow, validTestLesson, world } from "./lesson-fixtures";

let files: Record<string, string>;
let concepts: string[] | undefined;
let result: LoadResult;
let published: PublishedLesson;
let dir = "c1/99-test";

Given("a valid test lesson", () => {
  files = validTestLesson();
  dir = "c1/99-test";
  concepts = undefined;
});
Given("the known concepts are {string}", (list: string) => {
  concepts = list.split(/,\s*/);
});
When(/^I replace "(.*?)" with "(.*)" in "([^"]*)"$/, (find: string, replace: string, file: string) => {
  const text = files[file];
  assert.ok(text !== undefined, `no file ${file}`);
  assert.ok(text.includes(find), `${file} does not contain ${find}`);
  files[file] = text.replace(find, () => replace);
});
When("I replace the starter with the assembly {string}", (source: string) => {
  const indented = source.split(";").map((l) => `    ${l.trim()}`).join("\n");
  files["lesson.yaml"] = files["lesson.yaml"]!.replace(/starter:\n  hex: .*\n/, `starter:\n  asm: |\n${indented}\n`);
});
When("I remove the file {string}", (file: string) => {
  assert.ok(file in files, `no file ${file}`);
  delete files[file];
});
When("I load the lesson", () => {
  result = loadLesson(files, { dir, ...(concepts ? { knownConcepts: concepts } : {}) });
});

const lesson = (): Lesson => {
  assert.ok(result.ok, result.ok ? "" : result.errors.join("\n"));
  return result.lesson;
};
Then("the lesson loads", () => {
  lesson();
});
Then("the lesson id is {string}", (id: string) => assert.equal(lesson().id, id));
Then("the lesson has {int} scenes", (n: number) => assert.equal(lesson().scenes.length, n));
Then("the starter has {int} cards", (n: number) => assert.equal(lesson().starter.words.length, n));
Then("the lesson has a ghost {string} with {int} events", (id: string, n: number) => {
  assert.equal(lesson().ghosts[id]?.events.length, n);
});
Then("the lesson declares the solution {string} earning {string}", (file: string, earns: string) => {
  const s = lesson().solutions.find((x) => x.file === file);
  assert.ok(s, `no solution ${file}`);
  assert.deepEqual(s.earns, earns.split(/,\s*/));
});
Then("the checks have {int} scenarios", (n: number) => assert.equal(lesson().checks.scenarios.length, n));
Then(/^loading fails with "(.*)"$/, (message: string) => {
  assert.equal(result.ok, false, "the lesson should not load");
  if (!result.ok) assert.ok(result.errors.some((e) => e.includes(message)), `expected "${message}" in:\n${result.errors.join("\n")}`);
});

When("I publish the lesson", () => {
  published = publishLesson(lesson());
});
Then("the published lesson survives a JSON round trip", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(published)), published);
});
Then("the published lesson has no solutions", () => {
  assert.equal("solutions" in published, false);
});
Then("the published checks run without parsing Gherkin", () => {
  assert.equal(typeof published.checks, "object");
  const run = runProgram(assembleOrThrow("addi a0, zero, 5; ebreak"), { predictions: { a0: [5] } });
  assert.deepEqual(earnedStars(runChecks(published.checks, run)), ["pass", "called-it"]);
});

// ---- lessons authored on disk

Given("the lesson {string}", (id: string) => {
  files = readLessonDir(join(process.cwd(), "lessons", id));
  dir = id;
  concepts = readConcepts();
});
Then("the lesson loads from disk", () => {
  result = loadLesson(files, { dir, ...(concepts ? { knownConcepts: concepts } : {}) });
  lesson();
});
Then("every scene says at most {int} sentences", (n: number) => {
  for (const s of lesson().scenes) assert.ok(countSentences(s.say) <= n, `${s.id}: ${s.say}`);
});
Then("the starter is the four cards {string}", (hexWords: string) => {
  assert.deepEqual(lesson().starter.words, hexWords.split(" ").map(Number));
});
Then("the lesson introduces {string}", (list: string) => {
  assert.deepEqual(lesson().concepts.introduces, list.split(/,\s*/));
});
Then("the lesson has a ghost for every Show me", () => {
  const l = lesson();
  const wanted = l.scenes.flatMap((s) => (s.showMe ? [s.showMe] : []));
  assert.ok(wanted.length > 0, "at least one scene offers Show me");
  for (const id of wanted) assert.ok(id in l.ghosts, `no ghost ${id}`);
});
When("the starter program runs", () => {
  world.run = runProgram(lesson().starter.words);
});
Then("the scene {string} asks for the number {int} for {string}", (id: string, answer: number, target: string) => {
  const ask = lesson().scenes.find((s) => s.id === id)?.ask;
  assert.deepEqual(ask && { kind: ask.kind, answer: "answer" in ask ? ask.answer : undefined, target: "target" in ask ? ask.target : undefined }, { kind: "number", answer, target });
});
Then("the scene {string} answers a guess of {int} with a {string} reply that goes to {string}", (id: string, guess: number, word: string, target: string) => {
  const reply = lesson().scenes.find((s) => s.id === id)?.onWrong.find((o) => o.match === guess);
  assert.ok(reply, `no reply for ${guess}`);
  assert.ok(reply.say.toLowerCase().includes(word), reply.say);
  assert.equal(reply.goto, target);
});
Then("every scene condition holds at the end, except {string}", (except: string) => {
  const phrases = lesson().scenes.flatMap((s) => s.until).filter((p) => p !== except);
  assert.ok(phrases.length > 0);
  for (const p of phrases) {
    const parsed = parseStep(p);
    assert.ok(parsed.ok);
    assert.equal(parsed.fn(world.run!).ok, true, p);
  }
});

// ---- the checker

let checkProblems: string[];
let checkReport: LessonReport | undefined;

When("I check the lesson", () => {
  result = loadLesson(files, { dir, ...(concepts ? { knownConcepts: concepts } : {}) });
  if (!result.ok) {
    checkProblems = result.errors;
    checkReport = undefined;
    return;
  }
  checkReport = checkLesson(result.lesson);
  checkProblems = checkReport.problems;
});
Then("the check passes", () => assert.deepEqual(checkProblems, []));
Then(/^the check fails with "(.*)"$/, (message: string) => {
  assert.ok(checkProblems.length > 0, "the check should fail");
  assert.ok(checkProblems.some((p) => p.includes(message)), `expected "${message}" in:\n${checkProblems.join("\n")}`);
});
const solution = (file: string) => {
  const s = checkReport?.solutions.find((x) => x.file === file);
  assert.ok(s, `no solution report for ${file}`);
  return s;
};
Then("the solution {string} earned {string} in {int} steps with {int} cards", (file: string, stars: string, steps: number, cards: number) => {
  const s = solution(file);
  assert.deepEqual(s.earned, stars === "nothing" ? [] : stars.split(/,\s*/));
  assert.equal(s.steps, steps);
  assert.equal(s.cards, cards);
});
Then("the solution {string} was stopped by the step cap", (file: string) => assert.equal(solution(file).hitStepCap, true));
Then("the solution {string} ran {int} steps", (file: string, steps: number) => assert.equal(solution(file).steps, steps));
Then("the official Gherkin parser agrees with ours about the checks", () => {
  assert.deepEqual(crossCheckGherkin(files["checks.feature"]!), []);
});
