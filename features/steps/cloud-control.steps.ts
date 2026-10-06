import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import {
  CapacityError,
  createControlHandler,
  type Capacity,
  type HttpResult,
  type TaskInfo,
  type TaskPort,
} from "../../api/src/control";
import { verifySession } from "../../api/src/token";

const KEY = "control-spec-key";
const NOW = 1_700_000_000_000;

class FakeTasks implements TaskPort {
  tasks: TaskInfo[] = [];
  runs: { sub: string; capacity: Capacity }[] = [];
  stopped: string[] = [];
  spotFull = false;
  async list() {
    return this.tasks.filter((t) => !this.stopped.includes(t.taskArn));
  }
  async run(sub: string, capacity: Capacity) {
    if (capacity === "SPOT" && this.spotFull) throw new CapacityError("no spot capacity");
    this.runs.push({ sub, capacity });
    const task = { taskArn: `arn:task/${this.tasks.length + 1}`, sub, status: "PENDING" };
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
  return { sub: `sub-${m[1]}` };
};

let fake: FakeTasks;
let call: (method: string, token?: string) => Promise<HttpResult>;
let response: HttpResult;

Before({ tags: "@cloud" }, () => {
  fake = new FakeTasks();
});

Given("a control API with a task cap of 3", () => {
  const handler = createControlHandler({ tasks: fake, verifyToken, signingKey: KEY, now: () => NOW });
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
  "the response carries a session token for {string} and {string} valid for 30 minutes",
  (user: string, ip: string) => {
    const claims = verifySession(body().sessionToken, KEY, NOW / 1000);
    assert.deepEqual(claims, { sub: `sub-${user}`, taskIp: ip, exp: NOW / 1000 + 30 * 60 });
  },
);

Then("the task for {string} has been stopped", (user: string) => {
  assert.deepEqual(fake.stopped, [taskOf(user).taskArn]);
});

Then("the task for {string} was started on on-demand capacity", (user: string) => {
  assert.deepEqual(fake.runs, [{ sub: `sub-${user}`, capacity: "ON_DEMAND" }]);
});
