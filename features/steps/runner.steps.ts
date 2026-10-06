import { Given, When, Then, Before, After } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

type RunResult = {
  compile?: { ok: boolean; output: string; timedOut: boolean };
  run?: {
    exitCode: number | null;
    stdout: string;
    signal: string | null;
    outputTruncated: boolean;
  };
  status: string;
};

type Req = { language: string; entry?: string; files: { path: string; content: string }[]; stdin?: string; limits: Record<string, number> };
let request: Req;
let response: { status: number; body: RunResult };

Before(() => {
  request = { language: "", files: [], limits: {} };
});

/** The project under construction, shared with the other step files. */
export function currentRequest(): Req {
  return request;
}

const CLOUD_ENV = {
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/credentials/x",
  RUNNER_SECRET: "hunter2",
  ECS_CONTAINER_METADATA_URI_V4: "http://169.254.170.2/v4/x",
};

Given("the runner has secrets in its environment", () => {
  Object.assign(process.env, CLOUD_ENV);
});

After(() => {
  for (const name of Object.keys(CLOUD_ENV)) delete process.env[name];
});

const languages: Record<string, string> = { "C++": "cpp", C: "c", Python: "python" };

Given(/^an? (C\+\+|C|Python) project$/, (name: string) => {
  request.language = languages[name];
});

Given("the file {string} containing:", (path: string, content: string) => {
  request.files.push({ path, content });
});

Given("the entry {string}", (entry: string) => {
  request.entry = entry;
});

Given("a file {string} of {int} bytes", (path: string, size: number) => {
  request.files.push({ path, content: "#".repeat(size) });
});

Given("the request field {string} set to the number {int}", (field: string, value: number) => {
  (request as unknown as Record<string, unknown>)[field] = value;
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
  assert.equal(response.body.run?.stdout, output.replace(/\\n/g, "\n"));
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

Then("the request is rejected with status {int}", (status: number) => {
  assert.equal(response.status, status);
});

Then("the program was killed by signal {string}", (signal: string) => {
  assert.equal(response.body.run?.signal, signal);
});

Given("a maximum output of {int} bytes", (bytes: number) => {
  request.limits.maxOutputBytes = bytes;
});

Then("the status is one of {string}", (statuses: string) => {
  assert.ok(statuses.split(", ").includes(response.body.status), response.body.status);
});

Then("the compiler did not time out", () => {
  assert.equal(response.body.compile?.timedOut, false);
});

Then("the runner still answers health checks", async () => {
  const res = await fetch(`${process.env.RUNNER_URL}/healthz`);
  assert.equal(res.status, 200);
});

let concurrent: { status: number; body: RunResult }[];

When("{int} projects are run at once", async (count: number) => {
  const body = JSON.stringify(request);
  concurrent = await Promise.all(
    Array.from({ length: count }, async () => {
      const res = await fetch(`${process.env.RUNNER_URL}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      return { status: res.status, body: (await res.json()) as RunResult };
    }),
  );
});

Then("{int} of them finish with status {string}", (count: number, status: string) => {
  assert.equal(concurrent.filter((r) => r.status === 200 && r.body.status === status).length, count);
});

Then("{int} of them are refused with status {int}", (count: number, status: number) => {
  assert.equal(concurrent.filter((r) => r.status === status).length, count);
});

Given("a different project", () => {
  request = { language: "", files: [], limits: {} };
});

let sequence: { status: number; body: RunResult; ms: number }[];

When("the project is run {int} times in a row", async (count: number) => {
  sequence = [];
  for (let i = 0; i < count; i++) {
    const started = Date.now();
    const res = await fetch(`${process.env.RUNNER_URL}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    sequence.push({ status: res.status, body: (await res.json()) as RunResult, ms: Date.now() - started });
  }
});

Then("every run finished with status {string} in under {int} seconds", (status: string, seconds: number) => {
  for (const run of sequence) {
    assert.equal(run.status, 200);
    assert.equal(run.body.status, status);
    assert.ok(run.ms < seconds * 1000, `took ${run.ms} ms`);
  }
});

Then("no sleep process is left running", () => {
  const names = readdirSync("/proc")
    .filter((d) => /^\d+$/.test(d))
    .map((d) => {
      try {
        return readFileSync(`/proc/${d}/comm`, "utf8").trim();
      } catch {
        return "";
      }
    });
  assert.ok(!names.includes("sleep"), "a sleep process survived");
});

Then("no files owned by sandbox users remain", () => {
  const found = execFileSync("find", ["/tmp", "/var/tmp", "/dev/shm", "-xdev", "-uid", "+19999"]).toString();
  assert.equal(found.trim(), "");
});
