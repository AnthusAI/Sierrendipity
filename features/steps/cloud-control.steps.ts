import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  CapacityError,
  ThrottledError,
  createControlHandler,
  type Capacity,
  type HttpResult,
  type TaskInfo,
  type TaskPort,
} from "../../api/src/control";
import { verifySession } from "../../api/src/token";

const KEY = "control-spec-key";
const T0 = 1_700_000_000_000;
let clock = T0;

class FakeTasks implements TaskPort {
  tasks: TaskInfo[] = [];
  runs: { sub: string; capacity: Capacity; secret: string }[] = [];
  stopped: string[] = [];
  spotFull = false;
  failure: Error | undefined;
  raceFor: string | undefined;
  async list() {
    return this.tasks.filter((t) => !this.stopped.includes(t.taskArn));
  }
  async run(sub: string, capacity: Capacity, secret: string) {
    if (this.failure) throw this.failure;
    if (capacity === "SPOT" && this.spotFull) throw new CapacityError("no spot capacity");
    this.runs.push({ sub, capacity, secret });
    if (this.raceFor === sub) {
      // A concurrent request got there first with an older task.
      this.tasks.push({ taskArn: "arn:task/older", sub, status: "PENDING", createdAt: clock - 1000, secret: "older-secret" });
    }
    const task = { taskArn: `arn:task/${this.tasks.length + 1}`, sub, status: "PENDING", createdAt: clock, secret };
    this.tasks.push(task);
    return task;
  }
  async stop(taskArn: string) {
    this.stopped.push(taskArn);
  }
}

// Fake Cognito verification: "token-<name>" is the token of the user whose sub is "sub-<name>".
const verifyToken = async (token: string) => {
  const m = /^token-(.+)$/.exec(token);
  if (!m) throw new Error("invalid token");
  return { sub: `sub-${m[1]}`, email: `${m[1]}@example.test` };
};

let allowlist: string | undefined;
let secretCounter = 0;

let fake: FakeTasks;
let call: (method: string, token?: string) => Promise<HttpResult>;
let response: HttpResult;

Before({ tags: "@cloud" }, () => {
  fake = new FakeTasks();
  clock = T0;
  allowlist = undefined;
});

Given("a control API with a task cap of 3", () => {
  const handler = createControlHandler({
    tasks: fake,
    verifyToken,
    getAllowlist: async () => allowlist,
    newSecret: () => `task-secret-${++secretCounter}-`.padEnd(40, "x"),
    signingKey: KEY,
    now: () => clock,
  });
  call = (method, token) =>
    handler({
      rawPath: "/session",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      requestContext: { http: { method } },
    });
});

Given("the signed-in users {string}, {string}, {string} and {string}", (_a: string, _b: string, _c: string, _d: string) => {
  // Users are identified by their fake token, nothing to prepare.
});

const as = (user: string) => `token-${user}`;
const taskOf = (user: string) => fake.tasks.find((t) => t.sub === `sub-${user}`)!;
const body = () => JSON.parse(response.body);

When(/^an anonymous client calls POST \/session$/, async () => {
  response = await call("POST");
});

When(/^a client with a bad token calls POST \/session$/, async () => {
  response = await call("POST", "forged");
});

When(/^"([^"]+)" calls (\w+) \/session$/, async (user: string, method: string) => {
  response = await call(method, as(user));
});

Given(/^"([^"]+)" has called POST \/session$/, async (user: string) => {
  await call("POST", as(user));
});

Given(/^"([^"]+)", "([^"]+)" and "([^"]+)" have called POST \/session$/, async (a: string, b: string, c: string) => {
  for (const user of [a, b, c]) await call("POST", as(user));
});

Given(
  "the control allowlist admits {string}, {string}, {string} and {string}",
  (a: string, b: string, c: string, d: string) => {
    allowlist = [a, b, c, d].map((u) => `${u}@example.test`).join(",");
  },
);

Given("the control allowlist is not configured", () => {
  allowlist = undefined;
});

Given("the control allowlist no longer admits {string}", (user: string) => {
  allowlist = allowlist!.replace(`${user}@example.test`, "someone-else@example.test");
});

When("{int} seconds pass", (seconds: number) => {
  clock += seconds * 1000;
});

Given("the task for {string} is stopping", (user: string) => {
  taskOf(user).status = "STOPPING";
});

Given("another request already started an older task for {string}", (user: string) => {
  fake.raceFor = `sub-${user}`;
});

Given("starting a task fails", () => {
  fake.failure = new Error("AccessDenied: something internal");
});

Given("ECS is throttling requests", () => {
  fake.failure = new ThrottledError("Rate exceeded");
});

Given("Fargate Spot has no capacity", () => {
  fake.spotFull = true;
});

When("the task for {string} is running at {string}", (user: string, ip: string) => {
  Object.assign(taskOf(user), { status: "RUNNING", ip });
});

Then("the control API answers {int}", (status: number) => assert.equal(response.statusCode, status));

Then("the control API answers {int} with state {string}", (status: number, state: string) => {
  assert.equal(response.statusCode, status);
  assert.equal(body().state, state);
});

Then("no task has been started", () => assert.equal(fake.runs.length, 0));

Then(/^exactly (\d+) tasks? ha(?:s|ve) been started$/, (n: string) => assert.equal(fake.runs.length, Number(n)));

Then("the started task is tagged with the sub of {string} and not an email", (user: string) => {
  assert.deepEqual(fake.runs.map((r) => r.sub), [`sub-${user}`]);
  assert.ok(!fake.runs[0].sub.includes("@"));
});

Then(
  "the response carries a session token for {string} and {string} valid for 15 minutes",
  (user: string, ip: string) => {
    const claims = verifySession(body().sessionToken, KEY, clock / 1000);
    assert.deepEqual(claims, { sub: `sub-${user}`, taskIp: ip, secret: claims?.secret, exp: clock / 1000 + 15 * 60 });
  },
);

Then("the task was started with a RUNNER_SECRET equal to the one in the session token", () => {
  const claims = verifySession(body().sessionToken, KEY, clock / 1000)!;
  assert.equal(fake.runs.length, 1);
  assert.ok(fake.runs[0].secret.length >= 32);
  assert.equal(claims.secret, fake.runs[0].secret);
});

Then("the control API answers {int} with a JSON error", (status: number) => {
  assert.equal(response.statusCode, status);
  assert.equal(typeof body().error, "string");
  assert.ok(!/AccessDenied|internal/.test(body().error), "internal details are not leaked");
});

Then("only the older task for {string} is left running", (user: string) => {
  const running = fake.tasks.filter((t) => t.sub === `sub-${user}` && !fake.stopped.includes(t.taskArn));
  assert.deepEqual(running.map((t) => t.taskArn), ["arn:task/older"]);
});

Then("the task for {string} has been stopped", (user: string) => {
  assert.deepEqual(fake.stopped, [taskOf(user).taskArn]);
});

Then("the task for {string} was started on on-demand capacity", (user: string) => {
  assert.deepEqual(fake.runs.map(({ sub, capacity }) => ({ sub, capacity })), [{ sub: `sub-${user}`, capacity: "ON_DEMAND" }]);
});
