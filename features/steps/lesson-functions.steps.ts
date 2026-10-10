import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { parseRule, ruleStatus, parseStep, ruleSubstitution, ruleText, ruleValue, runProgram, tableExpected, type FunctionBoxes, type LessonEvent, type ParsedRule } from "@sierrendipity/lesson-core";
import { assembleOrThrow, world } from "./lesson-fixtures";

let cards: number[] = [];
let boxes: FunctionBoxes | undefined;
let events: LessonEvent[] = [];
let startedWith: number | undefined;
let rule: ParsedRule;
let ruleError: string | undefined;
let phraseResult: { ok: boolean; message: string };

function rerun(): void {
  world.run = runProgram(cards, { events, ...(boxes ? { functionBoxes: boxes } : {}), ...(startedWith !== undefined ? { functionInput: startedWith } : {}) });
}

Given("the function program {string} named {word} from box {word} to box {word}", (source: string, name: string, input: string, output: string) => {
  cards = assembleOrThrow(source);
  boxes = { name, input, output };
  events = [];
  startedWith = undefined;
  rerun();
});
Given("the function program {string} named {word} from box {word} to box {word} started with x = {int}", (source: string, name: string, input: string, output: string, x: number) => {
  cards = assembleOrThrow(source);
  boxes = { name, input, output };
  events = [];
  startedWith = x;
  rerun();
});
Given("the program {string} with no function", (source: string) => {
  cards = assembleOrThrow(source);
  boxes = undefined;
  events = [];
  startedWith = undefined;
  rerun();
});
Given("the student filled the table for {string} on the function program", (list: string) => {
  events.push({ type: "table", inputs: list.split(/,\s*/).map(Number) });
  rerun();
});
When(/^I check the function phrase: (.*)$/, (phrase: string) => {
  const parsed = parseStep(phrase);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  phraseResult = parsed.fn(world.run!);
});
Then(/^the function phrase (passes|fails)$/, (verdict: string) => {
  assert.equal(phraseResult.ok, verdict === "passes", phraseResult.message);
});
Then("the function phrase says {string}", (text: string) => {
  assert.ok(phraseResult.message.includes(text), phraseResult.message);
});
Then("the table for the inputs {string} expects {string}", (inputs: string, expected: string) => {
  const have = tableExpected({ function: { name: boxes!.name, inputs: [boxes!.input], output: boxes!.output, rule: "" }, starter: { words: cards }, hideEnd: false }, inputs.split(/,\s*/).map(Number));
  assert.deepEqual(have, expected.split(/,\s*/).map(Number));
});

When("I read the rule {string} for the function {word}", (text: string, name: string) => {
  const parsed = parseRule(text, name);
  ruleError = parsed.ok ? undefined : parsed.error;
  if (parsed.ok) rule = parsed.rule;
});
Then("the rule reads {string}", (text: string) => {
  assert.equal(ruleError, undefined);
  assert.equal(ruleText(rule), text);
});
Then("the rule with x = {int} reads {string}", (x: number, text: string) => {
  assert.equal(ruleError, undefined);
  assert.equal(ruleSubstitution(rule, x), text);
});
Then("the rule gives {int} for x = {int}", (value: number, x: number) => {
  assert.equal(ruleValue(rule, x), value);
});
Then("the rule is refused saying {string}", (message: string) => {
  assert.ok(ruleError !== undefined, "the rule should be refused");
  assert.ok(ruleError.includes(message), ruleError);
});

Then("the rule status for box {word} is {string} when finished is {word}, the box holds {int} and the rule gives {int}", (output: string, text: string, finished: string, held: number, expected: number) => {
  assert.equal(ruleStatus(output, finished === "true", held, expected), text);
});
Then("the rule status for box {word} after a {word} with the box at {int} is {string}", (output: string, trouble: string, held: number, text: string) => {
  assert.equal(ruleStatus(output, false, held, 0, trouble as "fault" | "limit" | "too-big"), text);
});
