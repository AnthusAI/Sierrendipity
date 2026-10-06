import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  earnedStars,
  parseStep,
  runChecks,
  runProgram,
  type CheckReport,
  type LessonEvent,
  type ParsedStep,
  type RunOptions,
} from "@sierrendipity/lesson-core";
import { assembleOrThrow, world } from "./lesson-fixtures";

let words: number[];
let options: RunOptions;
let events: LessonEvent[];
let predictions: Record<string, number[]>;
let lastCheck: { ok: boolean; message: string };
let lastParse: ParsedStep;
let report: CheckReport;

Before(() => {
  words = [];
  options = {};
  events = [];
  predictions = {};
});

Given("the lesson program {string}", (source: string) => {
  words = assembleOrThrow(source);
  options = {};
  events = [];
  predictions = {};
});
Given("the starter program {string}", (source: string) => {
  options.starter = assembleOrThrow(source);
});
Given("the student predicted {string} as {int}", (target: string, value: number) => {
  (predictions[target] ??= []).push(value);
});
Given("the student edited card {int} to {word}", (card: number, to: string) => {
  events.push({ type: "edit", card, to: Number(to) >>> 0 });
});
Given("the student toggled bit {int} of card {int}", (bit: number, card: number) => {
  events.push({ type: "toggle", card, bit });
});
Given("the student rewound", () => {
  events.push({ type: "rewind" });
});
Given("the student looked at step {int}", (step: number) => {
  events.push({ type: "look", step });
});
Given("the starting boxes a0 = {int} and a1 = {int}", (a0: number, a1: number) => {
  options.startRegs = { a0, a1 };
});
Given("the starting memory at {int} is {int}", (addr: number, value: number) => {
  options.startMem = { [addr]: [value, 0, 0, 0] };
});
Given("the program has run", () => {
  world.run = runProgram(words, { ...options, events, predictions });
});
Given("the program has run with a cap of {int} steps", (cap: number) => {
  world.run = runProgram(words, { ...options, events, predictions, maxSteps: cap });
});

Then("the run was stopped by the step cap", () => {
  assert.equal(world.run!.hitStepCap, true);
});

When(/^I check the phrase: (.*)$/, (phrase: string) => {
  const parsed = parseStep(phrase);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  lastCheck = parsed.fn(world.run!);
});
Then(/^the phrase (passes|fails)$/, (verdict: string) => {
  assert.equal(lastCheck.ok, verdict === "passes", lastCheck.message);
});
Then(/^the phrase "(.*)" (passes|fails)$/, (phrase: string, verdict: string) => {
  const parsed = parseStep(phrase.replace(/\\"/g, '"'));
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  const result = parsed.fn(world.run!);
  assert.equal(result.ok, verdict === "passes", `${phrase}: ${result.message}`);
});

When(/^I parse the phrase:\s*(.*)$/, (phrase: string) => {
  lastParse = parseStep(phrase);
});
Then("the parse error mentions {string}", (text: string) => {
  assert.equal(lastParse.ok, false, "the phrase should not parse");
  if (!lastParse.ok) assert.ok(lastParse.error.includes(text), lastParse.error);
});
Then("the parse error suggests {string}", (phrase: string) => {
  assert.equal(lastParse.ok, false);
  if (!lastParse.ok) assert.ok(lastParse.suggestions.includes(phrase), lastParse.suggestions.join(" | "));
});

When("I run the checks:", (feature: string) => {
  report = runChecks(feature, world.run!);
});
Then("the scenario {string} passed", (name: string) => {
  const s = report.scenarios.find((x) => x.name === name);
  assert.ok(s, `no scenario ${name}`);
  assert.equal(s.passed, true, JSON.stringify(s.failures));
});
Then("the scenario {string} failed with {string}", (name: string, text: string) => {
  const s = report.scenarios.find((x) => x.name === name);
  assert.ok(s, `no scenario ${name}`);
  assert.equal(s.passed, false);
  assert.ok(s.failures.some((f) => f.includes(text)), JSON.stringify(s.failures));
});
Then("the earned stars are {string}", (stars: string) => {
  assert.deepEqual(earnedStars(report), stars === "" ? [] : stars.split(","));
});
