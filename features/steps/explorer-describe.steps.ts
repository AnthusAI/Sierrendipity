import { Given, Then, When } from "@cucumber/cucumber";
import type { DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { assemble, CARD_KINDS, cardsUsed, describe, type CardText, type CardKind } from "@sierrendipity/explorer";

let word: number;
let card: CardText;
let used: CardKind[];
let samples: CardText[];

function assembleOne(source: string): number {
  const result = assemble(source);
  assert.deepEqual(result.errors, [], "the line should assemble");
  assert.equal(result.words.length, 1);
  return result.words[0]! >>> 0;
}

When("I assemble {string} and describe its word", (source: string) => {
  word = assembleOne(source);
  card = describe(word);
});

When("I assemble {string} and describe its word at address {int}", (source: string, pc: number) => {
  word = assembleOne(source);
  card = describe(word, { pc });
});

When(
  "I assemble {string} and describe its word with the {string} vocabulary",
  (source: string, vocabulary: "boxes" | "registers") => {
    word = assembleOne(source);
    card = describe(word, { vocabulary });
  },
);

When("I describe the word {word}", (text: string) => {
  card = describe(Number(text));
});

Then("the word is {word}", (expected: string) => {
  assert.equal(word, Number(expected) >>> 0);
});

Then("the card kind is {string}", (kind: string) => {
  assert.equal(card.kind, kind);
});

Then("the card text is {string}", (text: string) => {
  assert.equal(card.text, text);
});

Then("the card is a fallback", () => {
  assert.equal(card.fallback, true);
});

Then("the card is not a fallback", () => {
  assert.equal(card.fallback, false);
});

/** Table cells wrapped in double quotes keep their spaces. */
const unquote = (cell: string): string => (cell.startsWith('"') && cell.endsWith('"') ? cell.slice(1, -1) : cell);

Then("the card parts are", (table: DataTable) => {
  const expected = table.hashes().map((row) => ({ role: row.role, text: unquote(row.text!) }));
  assert.deepEqual(card.parts, expected);
});

Then("the card parts have these roles in order", (table: DataTable) => {
  assert.deepEqual(
    card.parts.map((p) => p.role),
    table.raw()[0],
  );
});

Then("the parts join to the card text", () => {
  assert.equal(card.parts.map((p) => p.text).join(""), card.text);
});

const COURSE_1_SAMPLES = [
  "addi a0, zero, 5",
  "addi a1, a1, 7",
  "add a2, a0, a1",
  "sub a2, a0, a1",
  "sb t0, 1024(zero)",
  "sw t0, 1024(zero)",
  "lw t1, 1024(zero)",
  "bne t0, t1, -8",
  "blt t0, t1, 8",
  "ebreak",
];

Given("the Course 1 sample cards", () => {
  samples = COURSE_1_SAMPLES.map((line) => describe(assembleOne(line)));
});

Then("every card's parts join to its text", () => {
  for (const c of samples) assert.equal(c.parts.map((p) => p.text).join(""), c.text);
});

Then("the known card kinds include", (table: DataTable) => {
  for (const kind of table.raw().flat()) assert.ok((CARD_KINDS as readonly string[]).includes(kind), kind);
});

Then("the known card kinds have no duplicates", () => {
  assert.equal(new Set(CARD_KINDS).size, CARD_KINDS.length);
});

When("I list the cards used by", (source: string) => {
  const result = assemble(source);
  assert.deepEqual(result.errors, []);
  used = cardsUsed(result.words);
});

When("I list the cards used by the words {}", (list: string) => {
  used = cardsUsed(list.split(",").map((w) => Number(w.trim())));
});

When("I list the cards used by the words", () => {
  used = cardsUsed([]);
});

Then("the cards used are {string}", (expected: string) => {
  assert.equal(used.join(", "), expected);
});
