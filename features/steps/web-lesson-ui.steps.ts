import { Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { WebWorld } from "../support/web-world";

const player = (w: WebWorld) => w.page.locator("[data-lesson-player]");
const settleFrames = (w: WebWorld) => w.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

Then("the end of the list is not shown", async function (this: WebWorld) {
  await settleFrames(this);
  assert.equal(await player(this).locator("[data-end-marker]").count(), 0);
});

const cardInput = (w: WebWorld, n: number) => w.page.getByLabel(`Number on card ${n}`);
const named = (w: WebWorld, name: string) => player(w).getByRole("button", { name, exact: true });

Then("the lesson text never says {string}", async function (this: WebWorld, name: string) {
  await settleFrames(this);
  const text = await player(this).innerText();
  assert.equal(new RegExp(`\\b${name}\\b`).test(text), false, `the lesson shows "${name}":\n${text}`);
});
Then("the lesson text says {string}", async function (this: WebWorld, text: string) {
  await player(this).getByText(text).first().waitFor();
});

When("I select the plus button on card {int}", async function (this: WebWorld, n: number) {
  await cardInput(this, n).locator("xpath=..").getByRole("button", { name: "Make the number bigger", exact: true }).click();
});
When("I select the plus button on card {int} {int} times", async function (this: WebWorld, n: number, times: number) {
  for (let i = 0; i < times; i++) await cardInput(this, n).locator("xpath=..").getByRole("button", { name: "Make the number bigger", exact: true }).click();
});
When("I select the minus button on card {int}", async function (this: WebWorld, n: number) {
  await cardInput(this, n).locator("xpath=..").getByRole("button", { name: "Make the number smaller", exact: true }).click();
});

Then("the {string} button is disabled and explains {string}", async function (this: WebWorld, name: string, reason: string) {
  const button = named(this, name);
  assert.equal(await button.getAttribute("aria-disabled"), "true");
  await player(this).locator("[data-idle-note]", { hasText: reason }).waitFor();
});
Then("the {string} button is ready", async function (this: WebWorld, name: string) {
  assert.equal(await named(this, name).getAttribute("aria-disabled"), null);
});
Then("the lesson has no {string} button", async function (this: WebWorld, name: string) {
  await settleFrames(this);
  assert.equal(await named(this, name).count(), 0);
});

Then("the spotlight is a ring that does not dim the page", async function (this: WebWorld) {
  const shadow = await this.page.locator("[data-coach-spotlight]").evaluate((el) => getComputedStyle(el).boxShadow);
  assert.notEqual(shadow, "none");
  assert.doesNotMatch(shadow, /\d{3,}px/, `expected a ring without a huge spread, got ${shadow}`);
});

Then("the old number {int} is knocked out of the box", async function (this: WebWorld, value: number) {
  await player(this).locator("[data-knocked-out]", { hasText: new RegExp(`^${value}$`) }).waitFor();
});
Then("no number is knocked out", async function (this: WebWorld) {
  await settleFrames(this);
  assert.equal(await player(this).locator("[data-knocked-out]").count(), 0);
});
Then("the token starts with the number {int} from the card", async function (this: WebWorld, value: number) {
  await player(this).locator("[data-token]", { hasText: new RegExp(`^${value}$`) }).waitFor();
});

Then("the missed-goal help says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-missed]", { hasText: text }).waitFor();
});
Then("there is no missed-goal help", async function (this: WebWorld) {
  await settleFrames(this);
  assert.equal(await this.page.locator("[data-coach-missed]").count(), 0);
});
When("I select Try again", async function (this: WebWorld) {
  await this.page.locator("[data-coach-missed]").getByRole("button", { name: "Try again", exact: true }).click();
});
Then("the lesson shows the step count {int}", async function (this: WebWorld, steps: number) {
  await this.page.locator(`[data-stage-scene][data-live-steps="${steps}"]`).waitFor();
});
