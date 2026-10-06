import { Given, Then } from "@cucumber/cucumber";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

let result: { wrapped: string[]; warning: string | null };

function load(value: string | undefined) {
  const env = { ...process.env };
  delete env.RUNNER_SANDBOX;
  if (value !== undefined) env.RUNNER_SANDBOX = value;
  const script =
    'import("./runner/src/sandbox.ts").then((s) => console.log(JSON.stringify({' +
    'wrapped: s.studentCommand(["prog"], 64, 1000, 20001), warning: s.sandboxWarning() ?? null})))';
  const out = execFileSync("node", ["--import", "tsx", "-e", script], { env, encoding: "utf8" });
  result = JSON.parse(out.trim().split("\n").pop()!);
}

Given("the runner module is loaded with RUNNER_SANDBOX {string}", (value: string) => load(value));
Given("the runner module is loaded with RUNNER_SANDBOX unset", () => load(undefined));

Then("a student command is left unwrapped", () => assert.deepEqual(result.wrapped, ["prog"]));
Then("a student command is wrapped by the launcher", () => {
  assert.ok(result.wrapped.length > 1);
  assert.ok(result.wrapped.includes("prog"));
});
Then("the sandbox is reported as disabled only on Linux", () =>
  assert.equal(result.warning !== null, process.platform === "linux"));
Then("no sandbox warning is given", () => assert.equal(result.warning, null));
Then("the sandbox warning mentions that student code is unconfined", () =>
  assert.match(result.warning ?? "", /unconfined/));
