import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startMockBackend } from "../support/mock-backend.ts";
import type { WebWorld } from "../support/web-world.ts";

const terminal = (w: WebWorld) => w.page.getByRole("region", { name: "Terminal" });
const button = (w: WebWorld, name: string) => w.page.getByRole("button", { name, exact: true });
const treeItem = (w: WebWorld, file: string) => w.page.getByRole("treeitem", { name: file, exact: true });
const languages = "RISC-V assembly|Machine code|Python|C\\+\\+|C";

// Playwright's prompt()/confirm() dialogs: answer the next one, then click.
async function answering(w: WebWorld, answer: string | null, click: () => Promise<unknown>) {
  w.page.once("dialog", (dialog) => (answer === null ? dialog.accept() : dialog.accept(answer)));
  await click();
}

// Backend and sign-in

Given("a mock backend that needs {int} ms to start", async function (this: WebWorld, ms: number) {
  this.mock = await startMockBackend({ startDelayMs: ms });
});

Given("the IDE is opened in dev mode", async function (this: WebWorld) {
  await this.open({ devBackend: this.mock.url });
  await button(this, "Run").waitFor();
});

Given("Cognito is the hosted UI at {string}", async function (this: WebWorld, domain: string) {
  this.cognitoDomain = domain;
  await this.page.route(`${domain}/oauth2/authorize*`, (route) => {
    this.authorizeUrl = new URL(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<h1>Hosted UI</h1>" });
  });
  await this.page.route(`${domain}/oauth2/token`, (route) => {
    this.tokenBody = new URLSearchParams(route.request().postData() ?? "");
    return route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: { id_token: this.idToken, refresh_token: "refresh-1", expires_in: 3600 },
    });
  });
  await this.page.route(`${domain}/logout*`, (route) =>
    route.fulfill({ status: 302, headers: { location: new URL(route.request().url()).searchParams.get("logout_uri")! } }),
  );
});

Given("the config names the Cognito domain without a scheme", function (this: WebWorld) {
  this.bareCognitoDomain = true;
});

function signInConfig(w: WebWorld): Record<string, unknown> {
  return {
    region: "us-east-1",
    cognitoDomain: w.bareCognitoDomain ? w.cognitoDomain?.replace(/^https:\/\//, "") : w.cognitoDomain,
    clientId: "client-1",
    controlUrl: w.mock.url,
    proxyUrl: w.mock.url,
    redirectUri: `${w.appUrl}/callback`,
  };
}

Given("the IDE is opened with sign-in required", async function (this: WebWorld) {
  await this.open(signInConfig(this));
});

Given("the IDE is opened with sign-in required but without {string}", async function (this: WebWorld, key: string) {
  const config = signInConfig(this);
  delete config[key];
  await this.open(config);
});

Given("a mock backend whose workspace fails to start", async function (this: WebWorld) {
  this.mock = await startMockBackend();
  this.mock.setSessionFailing(true);
});

When("the backend recovers", function (this: WebWorld) {
  this.mock.setSessionFailing(false);
});

Given("saved projects that are damaged", async function (this: WebWorld) {
  await this.context.addInitScript(
    `localStorage.setItem("sierrendipity.projects", ${JSON.stringify(JSON.stringify({ current: "x", projects: { x: { language: "python" } } }))})`,
  );
});

When(
  "Google sends me back with the error {string} and {string}",
  async function (this: WebWorld, error: string, description: string) {
    const state = this.authorizeUrl!.searchParams.get("state");
    const query = new URLSearchParams({ error, error_description: description, state: state! });
    await this.page.goto(`${this.appUrl}/callback?${query}`);
  },
);

Then("I see the error {string}", async function (this: WebWorld, text: string) {
  await this.page.getByRole("alert").filter({ hasText: text }).first().waitFor();
});

Then("the selected project is {string}", async function (this: WebWorld, name: string) {
  await this.page.waitForFunction(
    `document.querySelector('select[aria-label="Project"]').value === ${JSON.stringify(name)}`,
  );
});

When("I press the key {string} in the terminal", async function (this: WebWorld, key: string) {
  await terminal(this).click();
  await this.page.keyboard.press(key);
});

When("I try to create the file {string}", async function (this: WebWorld, file: string) {
  await answering(this, file, () => button(this, "New file").click());
});

When("I try to rename the file {string} to {string}", async function (this: WebWorld, from: string, to: string) {
  await answering(this, to, () => button(this, `Rename ${from}`).click());
});

Then("I see the sign-in screen", async function (this: WebWorld) {
  await this.page.getByRole("heading", { name: "Sign in to Sierrendipity" }).waitFor();
  await button(this, "Sign in with Google").waitFor();
});

When("I press {string}", async function (this: WebWorld, name: string) {
  const click = () => button(this, name).click();
  if (name === "Sign in with Google") {
    await click();
    await this.page.waitForURL(`${this.cognitoDomain}/oauth2/authorize*`);
  } else {
    await click();
  }
});

Then("I am sent to the hosted UI with PKCE and Google as the identity provider", function (this: WebWorld) {
  const url = this.authorizeUrl;
  assert.ok(url, "no navigation to the hosted UI");
  const get = (name: string) => url.searchParams.get(name);
  assert.equal(get("response_type"), "code");
  assert.equal(get("client_id"), "client-1");
  assert.equal(get("identity_provider"), "Google");
  assert.equal(get("code_challenge_method"), "S256");
  assert.match(get("code_challenge") ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.equal(get("redirect_uri"), `${this.appUrl}/callback`);
  assert.ok(get("state"));
});

When("Google sends me back with a valid code for {string}", async function (this: WebWorld, email: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  this.idToken = `${encode({ alg: "none" })}.${encode({ sub: "sub-1", email })}.signature`;
  this.mock.requireControlToken(this.idToken);
  const state = this.authorizeUrl!.searchParams.get("state");
  await this.page.goto(`${this.appUrl}/callback?code=code-1&state=${state}`);
});

Then("the IDE shows I am signed in as {string}", async function (this: WebWorld, email: string) {
  await this.page.getByText(`Signed in as ${email}`).waitFor();
});

Then("the token exchange used the PKCE verifier", function (this: WebWorld) {
  const body = this.tokenBody;
  assert.ok(body, "no token request was made");
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "code-1");
  const challenge = createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url");
  assert.equal(challenge, this.authorizeUrl!.searchParams.get("code_challenge"));
});

Then("the backend status is {string}", async function (this: WebWorld, status: string) {
  await this.page
    .getByRole("status", { name: "Backend status" })
    .filter({ hasText: new RegExp(`^${status}$`) })
    .waitFor();
});

Then("I see the message {string}", async function (this: WebWorld, text: string) {
  await this.page.getByText(text).first().waitFor();
});

// Projects and files

When(new RegExp(`^I create a project "([^"]*)" in (${languages})$`), async function (this: WebWorld, name: string, language: string) {
  await answering(this, name, () => button(this, "New project").click());
  await this.page.getByLabel("Language").selectOption({ label: language });
});

When("I create the file {string}", async function (this: WebWorld, file: string) {
  await answering(this, file, () => button(this, "New file").click());
  await treeItem(this, file).waitFor();
});

When("I rename the file {string} to {string}", async function (this: WebWorld, from: string, to: string) {
  await answering(this, to, () => button(this, `Rename ${from}`).click());
});

When("I delete the file {string}", async function (this: WebWorld, file: string) {
  await answering(this, null, () => button(this, `Delete ${file}`).click());
});

When("I open the file {string}", async function (this: WebWorld, file: string) {
  await button(this, `Open ${file}`).click();
});

When(new RegExp(`^I switch the language to (${languages})$`), async function (this: WebWorld, language: string) {
  await this.page.getByLabel("Language").selectOption({ label: language });
});

When("I replace the editor text with {string}", async function (this: WebWorld, text: string) {
  await this.page.locator(".monaco-editor").first().click();
  await this.page.keyboard.press("ControlOrMeta+a");
  await this.page.keyboard.press("Backspace");
  await this.page.keyboard.type(text);
});

When("I reload the page", async function (this: WebWorld) {
  await this.page.reload();
  await this.page.getByLabel("Project").waitFor();
});

Then("the file tree lists {string}", async function (this: WebWorld, file: string) {
  await treeItem(this, file).waitFor();
});

Then("the file tree does not list {string}", async function (this: WebWorld, file: string) {
  await treeItem(this, file).waitFor({ state: "detached" });
});

Then("the editor shows {string}", async function (this: WebWorld, text: string) {
  await this.page.locator(".monaco-editor .view-lines").filter({ hasText: text }).waitFor();
});

// Running

When("I press Run", async function (this: WebWorld) {
  await button(this, "Run").click();
});

When("I press Stop", async function (this: WebWorld) {
  await button(this, "Stop").click();
});

When("I type {string} into the terminal and press Enter", async function (this: WebWorld, text: string) {
  await terminal(this).click();
  await this.page.keyboard.type(text);
  await this.page.keyboard.press("Enter");
});

Then("the terminal shows {string}", async function (this: WebWorld, text: string) {
  await terminal(this).filter({ hasText: text }).waitFor();
});

Then("the compiler error is styled distinctly", async function (this: WebWorld) {
  // xterm's DOM renderer marks ANSI red text with the xterm-fg-1 class.
  await terminal(this).locator(".xterm-fg-1").filter({ hasText: "error: boom" }).first().waitFor();
});

Then("the program has finished", async function (this: WebWorld) {
  // A string expression: functions compiled by tsx reference helpers that do not exist in the page.
  await this.page.waitForFunction(`(() => {
    const disabled = (name) => [...document.querySelectorAll("button")].find((b) => b.textContent === name)?.disabled;
    return disabled("Stop") === true && disabled("Run") === false;
  })()`);
});
