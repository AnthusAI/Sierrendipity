import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { demangleRust, parseRustSymbol } from "../../runner/src/rust-demangle.ts";

let symbol = "";
let demangled = "";
let elapsed = 0;

When("the Rust symbol {string} is demangled", (given: string) => {
  symbol = given;
  demangled = demangleRust(given);
});

Then("the name is {string}", (name: string) => {
  assert.equal(demangled, name);
});

Then("the defining crate is {string}", (crate: string) => {
  assert.equal(parseRustSymbol(symbol)?.crate, crate);
});

Then("there is no defining crate", () => {
  assert.equal(parseRustSymbol(symbol), undefined);
});

// Level j is `Y <level j+1> <back-reference to level j+1>`: reading it naively doubles the work and the
// text at every level. The back-reference to offset p is "B" + (p - 1 in base 62) + "_" (offset 0 is "B_").
const base62 = (n: number) => {
  const digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  do {
    out = digits[n % 62] + out;
    n = Math.floor(n / 62);
  } while (n > 0);
  return out;
};
const backref = (offset: number) => "B" + (offset === 0 ? "" : base62(offset - 1)) + "_";

Given("a Rust symbol that doubles through {int} back-references", (levels: number) => {
  let body = "C4main";
  for (let j = levels - 1; j >= 0; j--) body = "Y" + body + backref(j + 1);
  symbol = "_R" + body;
});

When("the symbol is demangled within {int} second", (seconds: number) => {
  const started = Date.now();
  demangled = demangleRust(symbol);
  elapsed = Date.now() - started;
  assert.ok(elapsed < seconds * 1000, `${elapsed} ms`);
});

When("the Rust symbol of {int} characters is demangled", (length: number) => {
  symbol = "_RNvCs_" + "4main".repeat(Math.ceil(length / 5)).slice(0, length - 7);
  demangled = demangleRust(symbol);
});

Then("the name is the symbol itself, shortened to at most {int} characters", (max: number) => {
  assert.ok(symbol.startsWith(demangled.replace(/\.\.\.$/, "")));
  assert.ok(demangled.length <= max, `${demangled.length}`);
  assert.equal(parseRustSymbol(symbol), undefined);
});
