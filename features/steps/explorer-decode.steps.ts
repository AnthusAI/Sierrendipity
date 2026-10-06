import { Then, When } from "@cucumber/cucumber";
import type { DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { decode, registerName, type Decoded } from "@sierrendipity/explorer";

let decoded: Decoded | null;

When("I decode the word {word}", (word: string) => {
  decoded = decode(Number(word));
});

When("I decode the word {word} with aliases", (word: string) => {
  decoded = decode(Number(word), { aliases: true });
});

function present(): Decoded {
  assert.ok(decoded, "expected the word to decode");
  return decoded;
}

Then("the text is {string}", (text: string) => {
  assert.equal(present().text, text);
});

Then("there is no instruction", () => {
  assert.equal(decoded, null);
});

Then("the format is {word}", (format: string) => {
  assert.equal(present().format, format);
});

Then("the fields are", (table: DataTable) => {
  const actual = present().fields.map((f) => ({
    name: f.name,
    hi: String(f.hi),
    lo: String(f.lo),
    value: String(f.value),
    label: f.label,
  }));
  assert.deepEqual(actual, table.hashes());
});

Then("the fields cover bits 31 down to 0 exactly once", () => {
  let next = 31;
  for (const f of present().fields) {
    assert.equal(f.hi, next, `field ${f.name} should start at bit ${next}`);
    next = f.lo - 1;
  }
  assert.equal(next, -1);
});

Then("register {int} is named {string}", (n: number, name: string) => {
  assert.equal(registerName(n), name);
});
