import { Given, When, Then, Before } from "@cucumber/cucumber";
import assert from "node:assert/strict";

type RunResult = {
  compile?: { ok: boolean; output: string; timedOut: boolean };
  run?: {
    exitCode: number | null;
    stdout: string;
    outputTruncated: boolean;
  };
  status: string;
};

let request: { language: string; files: { path: string; content: string }[]; stdin?: string; limits: Record<string, number> };
let response: { status: number; body: RunResult };

Before(() => {
  request = { language: "", files: [], limits: {} };
});

const languages: Record<string, string> = { "C++": "cpp", C: "c", Python: "python" };

Given(/^an? (C\+\+|C|Python) project$/, (name: string) => {
  request.language = languages[name];
});

Given("the file {string} containing:", (path: string, content: string) => {
  request.files.push({ path, content });
});

Given("the stdin {string}", (input: string) => {
  request.stdin = input;
});

Given("a time limit of {int} ms", (ms: number) => {
  request.limits.timeLimitMs = ms;
});

Given("a memory limit of {int} MB", (mb: number) => {
  request.limits.memoryLimitMb = mb;
});

When("the project is run", async () => {
  const res = await fetch(`${process.env.RUNNER_URL}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  response = { status: res.status, body: (await res.json()) as RunResult };
});

Then("the status is {string}", (status: string) => {
  assert.equal(response.body.status, status, JSON.stringify(response.body).slice(0, 500));
});

Then("the exit code is {int}", (code: number) => {
  assert.equal(response.body.run?.exitCode, code);
});

Then("the program output is {string}", (output: string) => {
  assert.equal(response.body.run?.stdout, output);
});

Then("the compiler output mentions {string}", (text: string) => {
  assert.match(response.body.compile?.output ?? "", new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

Then("the program was not executed", () => {
  assert.equal(response.body.run, undefined);
});

Then("the output was truncated", () => {
  assert.equal(response.body.run?.outputTruncated, true);
});

Then("the request is rejected", () => {
  assert.equal(response.status, 400);
});
