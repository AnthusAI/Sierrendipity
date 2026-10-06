import { Then, When } from "@cucumber/cucumber";
import type { DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { assemble, decode, parseMachineCode, type AsmError, type AsmResult } from "@sierrendipity/explorer";

let source: string;
let result: AsmResult;
let parsed: { words: number[]; errors: AsmError[] };

const hex = (w: number): string => `0x${(w >>> 0).toString(16).padStart(8, "0")}`;
const hexList = (ws: number[]): string => ws.map(hex).join(" ");
const asNumber = (s: string): number => Number(s);

When("I assemble {string}", (text: string) => {
  source = text;
  result = assemble(source);
});

When("I assemble the program", (text: string) => {
  source = text;
  result = assemble(source);
});

When("I assemble the program at base {word}", (base: string, text: string) => {
  source = text;
  result = assemble(source, { base: asNumber(base) });
});

When("I assemble a branch to a label {int} instructions away", (count: number) => {
  source = ["beq a0, a1, far", ...Array(count - 1).fill("nop"), "far:"].join("\n");
  result = assemble(source);
});

Then("the words are {string}", (words: string) => {
  assert.deepEqual(result.errors, []);
  assert.equal(hexList(result.words), words);
});

Then("there are no words", () => {
  assert.deepEqual(result.words, []);
});

Then("decoding each word and assembling the text again gives the same words", () => {
  const text = result.words.map((w) => decode(w)?.text ?? assert.fail(`${hex(w)} did not decode`)).join("\n");
  assert.equal(hexList(assemble(text).words), hexList(result.words));
});

Then("the only error is at line {int} column {int}: {string}", (line: number, column: number, message: string) => {
  assert.deepEqual(result.errors, [{ line, column, message }]);
});

Then("the errors are", (table: DataTable) => {
  const actual = result.errors.map((e) => ({ line: String(e.line), column: String(e.column), message: e.message }));
  assert.deepEqual(actual, table.hashes());
});

Then("the listing is", (table: DataTable) => {
  const actual = result.listing.map((e) => ({ line: String(e.line), addr: `0x${e.addr.toString(16)}`, word: hex(e.word) }));
  assert.deepEqual(actual, table.hashes());
});

Then("label {word} is at {word}", (name: string, addr: string) => {
  assert.equal(result.labels[name], asNumber(addr));
});

When("I parse the machine code {string}", (text: string) => {
  parsed = parseMachineCode(text);
});

When("I parse the machine code", (text: string) => {
  parsed = parseMachineCode(text);
});

Then("the parsed words are {string}", (words: string) => {
  assert.deepEqual(parsed.errors, []);
  assert.equal(hexList(parsed.words), words);
});

Then("the only parse error is at line {int} column {int}: {string}", (line: number, column: number, message: string) => {
  assert.deepEqual(parsed.errors, [{ line, column, message }]);
});
