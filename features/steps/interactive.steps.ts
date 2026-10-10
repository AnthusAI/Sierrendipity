import { After, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { currentRequest } from "./runner.steps.ts";

interface StreamEvent {
  id?: number;
  type: string;
  data: any;
}

let baseUrl: string | undefined;
let runId: string | undefined;
let startStatus: number;
let secondStatus: number;
let events: StreamEvent[] = [];
let lastSeenId = 0;
let abort: AbortController | undefined;
let child: ChildProcess | undefined;
let childExit: Promise<number | null> | undefined;

const base = () => baseUrl ?? process.env.RUNNER_URL!;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(what: string, check: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}; events: ${JSON.stringify(events).slice(-600)}`);
    await sleep(20);
  }
}

function startRun() {
  return fetch(`${base()}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(currentRequest()),
  });
}

function parseEvent(block: string): StreamEvent | undefined {
  const event: StreamEvent = { type: "message", data: undefined };
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("id: ")) event.id = Number(line.slice(4));
    else if (line.startsWith("event: ")) event.type = line.slice(7);
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!data) return undefined;
  event.data = JSON.parse(data);
  return event;
}

async function openStream(headers: Record<string, string>, query = ""): Promise<void> {
  events = [];
  abort = new AbortController();
  const res = await fetch(`${base()}/runs/${runId}/events${query}`, { headers, signal: abort.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  void (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    try {
      for await (const chunk of res.body!) {
        pending += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = pending.indexOf("\n\n")) >= 0) {
          const event = parseEvent(pending.slice(0, end));
          pending = pending.slice(end + 2);
          if (event) events.push(event);
        }
      }
    } catch {
      // disconnected on purpose
    }
  })();
}

const shownOutput = () => events.filter((e) => e.type === "output").map((e) => e.data.data).join("");
const exitEvent = () => events.find((e) => e.type === "exit");

When("the project is started interactively", async () => {
  const res = await startRun();
  startStatus = res.status;
  const body = (await res.json()) as { runId?: string };
  assert.equal(startStatus, 202, JSON.stringify(body));
  runId = body.runId;
});

When("a second run is started", async () => {
  const res = await startRun();
  secondStatus = res.status;
  if (res.status === 202) runId = ((await res.json()) as { runId: string }).runId;
  else await res.arrayBuffer();
});

Then("the second start is refused with status {int}", (status: number) => {
  assert.equal(secondStatus, status);
});

Then("the second start is accepted", () => {
  assert.equal(secondStatus, 202);
});

When("the event stream is opened", () => openStream({}));

When("the stream is disconnected", () => {
  lastSeenId = Math.max(0, ...events.map((e) => e.id ?? 0));
  assert.ok(lastSeenId > 0, "no events were seen before disconnecting");
  abort!.abort();
});

When("the stream is reopened with the Last-Event-ID header", () => openStream({ "last-event-id": String(lastSeenId) }));

When("the stream is reopened with the after parameter", () => openStream({}, `?after=${lastSeenId}`));

When("the stream is reopened from the beginning", () => openStream({}));

Then("the stream shows {string}", async (text: string) => {
  await waitFor(`output "${text}"`, () => shownOutput().includes(text));
});

Then("the stream does not show {string}", async (text: string) => {
  await waitFor("the stream to end", () => exitEvent() !== undefined);
  assert.ok(!shownOutput().includes(text), `unexpected ${text}`);
});

Then("the stream has shown nothing for {int} ms", async (ms: number) => {
  await waitFor("the program to start", () => events.some((e) => e.type === "compile"));
  await new Promise((resolve) => setTimeout(resolve, ms));
  assert.equal(shownOutput(), "");
});

Then("the stream shows a failed compile mentioning {string}", async (text: string) => {
  await waitFor("a compile event", () => events.some((e) => e.type === "compile"));
  const compile = events.find((e) => e.type === "compile")!;
  assert.equal(compile.data.ok, false);
  assert.match(compile.data.output, new RegExp(text));
});

Then("the stream reports dropped events", async () => {
  await waitFor("a gap notice", () => events.some((e) => e.type === "gap"));
  assert.ok(events.find((e) => e.type === "gap")!.data.firstId > 1);
});

Then("the run exits with status {string}", async (status: string) => {
  await waitFor("the exit event", () => exitEvent() !== undefined);
  assert.equal(exitEvent()!.data.status, status);
});

When("{string} is sent to stdin", async (text: string) => {
  const res = await fetch(`${base()}/runs/${runId}/stdin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: text.replace(/\\n/g, "\n") }),
  });
  assert.equal(res.status, 200);
});

When("the end of input is sent", async () => {
  const res = await fetch(`${base()}/runs/${runId}/stdin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eof: true }),
  });
  assert.equal(res.status, 200);
});

When("the run is stopped", async () => {
  const res = await fetch(`${base()}/runs/${runId}/stop`, { method: "POST" });
  assert.equal(res.status, 200);
});

Then("every event on the stream is newer than the last one seen before", () => {
  assert.ok(events.every((e) => e.id === undefined || e.id > lastSeenId));
});

async function startRunnerProcess(env: Record<string, string>): Promise<void> {
  child = spawn(process.execPath, ["--import", "tsx", "runner/src/main.ts"], {
    env: { ...process.env, PORT: "0", RUNNER_SECRET: "", ...env },
    stdio: ["ignore", "pipe", "inherit"],
  });
  childExit = new Promise((resolve) => child!.on("exit", (code) => resolve(code)));
  baseUrl = await new Promise<string>((resolve, reject) => {
    child!.stdout!.on("data", (chunk: Buffer) => {
      const match = /listening on (\d+)/.exec(chunk.toString());
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child!.on("exit", () => reject(new Error("runner exited before listening")));
  });
}

Given("a runner process with an idle timeout of {int} seconds", (seconds: number) =>
  startRunnerProcess({ IDLE_TIMEOUT_S: String(seconds) }),
);

Given("a runner process requiring the secret {string}", (secret: string) => startRunnerProcess({ RUNNER_SECRET: secret }));

Given("a runner process with an interactive wall limit of {int} seconds", (seconds: number) =>
  startRunnerProcess({ INTERACTIVE_MAX_WALL_S: String(seconds) }),
);

When("a large stdin is sent", async () => {
  const res = await fetch(`${base()}/runs/${runId}/stdin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: "a\n".repeat(150_000) }),
  });
  assert.equal(res.status, 200);
});

Given("a runner process with no secret", () => startRunnerProcess({}));

const hello = JSON.stringify({ language: "python", files: [{ path: "main.py", content: "print(1)" }] });

function post(path: string, secret?: string) {
  return fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret !== undefined && { "x-runner-secret": secret }) },
    body: hello,
  });
}

Then("a health check without the secret succeeds", async () => {
  assert.equal((await fetch(`${base()}/healthz`)).status, 200);
});

Then("a run request without the secret is answered with status {int}", async (status: number) => {
  assert.equal((await post("/run")).status, status);
});

Then("a run request with the secret {string} is answered with status {int}", async (secret: string, status: number) => {
  assert.equal((await post("/run", secret)).status, status);
});

Then("an interactive start without the secret is answered with status {int}", async (status: number) => {
  assert.equal((await post("/runs")).status, status);
});

Then("an explain request without the secret is answered with status {int}", async (status: number) => {
  assert.equal((await post("/explain")).status, status);
});

Then("the stream output is exactly {string}", (text: string) => {
  assert.equal(shownOutput(), text.replace(/\\r/g, "\r").replace(/\\n/g, "\n"));
});

Then("the runner process exits successfully within {int} seconds", async (seconds: number) => {
  const code = await Promise.race([childExit, sleep(seconds * 1000).then(() => "timeout")]);
  assert.equal(code, 0);
});

Then("the runner process is still running after {int} seconds", async (seconds: number) => {
  const code = await Promise.race([childExit, sleep(seconds * 1000).then(() => "still running")]);
  assert.equal(code, "still running");
});

After(async () => {
  abort?.abort();
  if (runId) await fetch(`${base()}/runs/${runId}/stop`, { method: "POST" }).catch(() => {});
  child?.kill("SIGKILL");
  if (childExit) await childExit;
  baseUrl = runId = abort = child = childExit = undefined;
  events = [];
  lastSeenId = 0;
});
