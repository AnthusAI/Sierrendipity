import { Given, When, Then } from "@cucumber/cucumber";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

let message = "";
let exitCode = 0;

Given("the commit message {string}", (m: string) => {
  message = m;
});

When("the commit message is linted", () => {
  const result = spawnSync("npx", ["--no", "commitlint"], {
    input: message,
    encoding: "utf8",
  });
  exitCode = result.status ?? 1;
});

Then("the commit message is accepted", () => {
  assert.equal(exitCode, 0);
});

Then("the commit message is rejected", () => {
  assert.notEqual(exitCode, 0);
});
