import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createProxyHandler, type ProxyResult } from "../../api/src/proxy";
import { signSession } from "../../api/src/token";

const KEY = "proxy-spec-key";
const NOW = 1_700_000_000_000;
const HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer"];

type Seen = { url: string; method: string; headers: Record<string, string>; body?: string };

let seen: Seen[];
let runnerDown: boolean;
let hopHeaders: boolean;
let streaming: { controller: ReadableStreamDefaultController<Uint8Array>; pending: string[] } | undefined;
let token: string | undefined;
let result: ProxyResult;
let reader: AsyncIterator<Uint8Array> | undefined;

Before({ tags: "@cloud" }, () => {
  seen = [];
  runnerDown = false;
  hopHeaders = false;
  streaming = undefined;
  token = undefined;
  reader = undefined;
});

const enc = new TextEncoder();

async function fakeFetch(url: string, init: { method: string; headers: Record<string, string>; body?: Uint8Array }) {
  seen.push({ url, method: init.method, headers: init.headers, body: init.body ? Buffer.from(init.body).toString() : undefined });
  if (runnerDown) throw new TypeError("fetch failed: ECONNREFUSED");
  if (streaming) {
    const s = streaming;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        s.controller = controller;
        controller.enqueue(enc.encode(s.pending.shift()!));
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (hopHeaders) Object.assign(headers, { connection: "keep-alive", "keep-alive": "timeout=5", "transfer-encoding": "chunked" });
  return new Response('{"ok":true}', { status: init.method === "POST" ? 202 : 200, headers });
}

const proxy = () => createProxyHandler({ key: KEY, now: () => NOW, fetch: fakeFetch as never, connectTimeoutMs: 1000 });

async function request(method: string, path: string, body?: string) {
  const [rawPath, rawQueryString] = path.split("?");
  result = await proxy()({
    rawPath,
    rawQueryString,
    headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : {},
    body,
    requestContext: { http: { method } },
  });
}

async function readAll(r: ProxyResult) {
  let text = "";
  for await (const chunk of r.body) text += Buffer.from(chunk).toString();
  return text;
}

Given("a proxy signing key", () => {});

Given("a runner task at {string} that answers on port 8080", (_ip: string) => {});

Given("a valid session token for {string} and {string}", (user: string, ip: string) => {
  token = signSession({ sub: `sub-${user}`, taskIp: ip, exp: NOW / 1000 + 600 }, KEY);
});

Given("the runner task is down", () => {
  runnerDown = true;
});

Given("the runner answers with hop-by-hop headers", () => {
  hopHeaders = true;
});

Given("the runner will stream the events {string}, {string} and {string}", (a: string, b: string, c: string) => {
  streaming = { controller: undefined as never, pending: [a, b, c] };
});

When(/^a client calls GET \/healthz with (no|a garbage|an expired|a tampered|a wrongly signed) token$/, async (kind: string) => {
  const good = { sub: "sub-user1", taskIp: "10.0.0.7", exp: NOW / 1000 + 600 };
  const tamperedClaims = Buffer.from(JSON.stringify({ ...good, taskIp: "10.9.9.9" })).toString("base64url");
  token = {
    no: undefined,
    "a garbage": "not-a-token",
    "an expired": signSession({ ...good, exp: NOW / 1000 - 1 }, KEY),
    "a tampered": `${tamperedClaims}.${signSession(good, KEY).split(".")[1]}`,
    "a wrongly signed": signSession(good, "some-other-key"),
  }[kind];
  await request("GET", "/healthz");
});

When(/^the client calls (\w+) (\S+)$/, async (method: string, path: string) => {
  await request(method, path);
});

When(/^the client posts '(.*)' to \/runs$/, async (body: string) => {
  await request("POST", "/runs", body);
});

Then("the proxy answers {int}", (status: number) => assert.equal(result.statusCode, status));

Then("the proxy answers {int} with content type {string}", (status: number, type: string) => {
  assert.equal(result.statusCode, status);
  assert.equal(result.headers["content-type"], type);
});

Then("the runner received no request", () => assert.deepEqual(seen, []));

Then(/^the runner received POST \/runs with body '(.*)'$/, (body: string) => {
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "http://10.0.0.7:8080/runs");
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].body, body);
});

Then("the runner did not receive the session token", () => {
  for (const s of seen) {
    assert.ok(!Object.keys(s.headers).some((h) => h.toLowerCase() === "authorization"));
    assert.ok(!Object.values(s.headers).some((v) => v.includes(token!)));
  }
});

async function nextChunk() {
  reader ??= result.body[Symbol.asyncIterator]();
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("chunk was not streamed")), 1000));
  const { value } = await Promise.race([reader.next(), timeout]);
  return Buffer.from(value).toString();
}

Then("{string} reaches the client before the runner emits {string}", async (got: string, next: string) => {
  assert.equal(await nextChunk(), got);
  streaming!.controller.enqueue(enc.encode(next));
});

Then("the response has no hop-by-hop headers", async () => {
  for (const h of HOP) assert.equal(result.headers[h], undefined, h);
  assert.equal(await readAll(result), '{"ok":true}');
});

Then("the response message mentions that the runner is unreachable", async () => {
  assert.match(JSON.parse(await readAll(result)).error, /unreachable/);
});
