import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { buildProgram, customCard, parseStep, programParts, runProgram, wordToCard, type CustomCard, type FunctionBoxes, type LessonRun } from "@sierrendipity/lesson-core";
import { assembleOrThrow } from "./lesson-fixtures";

let run: LessonRun;
let words: number[] = [];
let tail: number[] = [];
let usedCards: string[] = [];
let boxes: FunctionBoxes | undefined;
let phraseResult: { ok: boolean; message: string };

function cardOfLine(line: string) {
  const card = wordToCard(assembleOrThrow(line.trim())[0]!);
  assert.ok(card, `${line} is not a card`);
  return card;
}

function execute(): void {
  run = runProgram(words, { hideEnd: true, tail, usedCards, ...(boxes ? { functionBoxes: boxes } : {}) });
}

Given("the card program {string} where the custom card {string} is {string}", (program: string, name: string, body: string) => {
  const definition: CustomCard = { name, cards: [] };
  for (const line of body.split(";")) definition.cards.push(cardOfLine(line));
  const cards = program.split(";").map((line) => {
    const call = /^\s*call\s+(.+?)\s*$/.exec(line);
    return call ? customCard(call[1]!) : cardOfLine(line);
  });
  const built = buildProgram(cards, [definition]);
  assert.deepEqual(built.errors, []);
  const parts = programParts(built);
  words = parts.words;
  tail = parts.tail;
  usedCards = [...new Set(cards.filter((c) => c.kind === "custom").map((c) => c.params.name!))];
  boxes = undefined;
  execute();
});
Given("the program {string} with the tail {string}", (main: string, after: string) => {
  words = assembleOrThrow(main).slice(0, -1);
  tail = assembleOrThrow(after);
  usedCards = [];
  boxes = undefined;
  execute();
});
Given("the call program is the function {word} from box {word} to box {word}", (name: string, input: string, output: string) => {
  boxes = { name, input, output };
  execute();
});
When(/^I check the call phrase: (.*)$/, (phrase: string) => {
  const parsed = parseStep(phrase);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  phraseResult = parsed.fn(run);
});
Then(/^the call phrase (passes|fails)$/, (verdict: string) => {
  assert.equal(phraseResult.ok, verdict === "passes", phraseResult.message);
});
Then("the call phrase says {string}", (text: string) => {
  assert.ok(phraseResult.message.includes(text), phraseResult.message);
});
