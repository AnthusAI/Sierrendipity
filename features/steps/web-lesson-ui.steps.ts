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
  await cardInput(this, n).locator("xpath=..").getByRole("button", { name: "Plus", exact: true }).click();
});
When("I select the plus button on card {int} {int} times", async function (this: WebWorld, n: number, times: number) {
  for (let i = 0; i < times; i++) await cardInput(this, n).locator("xpath=..").getByRole("button", { name: "Plus", exact: true }).click();
});
When("I select the minus button on card {int}", async function (this: WebWorld, n: number) {
  await cardInput(this, n).locator("xpath=..").getByRole("button", { name: "Minus", exact: true }).click();
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

Then("the lesson shows no goal-met line", async function (this: WebWorld) {
  await settleFrames(this);
  assert.equal(await this.page.locator("[data-coach-done]").count(), 0);
});
Then("the boxes are named to a screen reader as {string}", async function (this: WebWorld, name: string) {
  await settleFrames(this);
  assert.equal(await player(this).getByRole("group", { name, exact: true }).count(), 1);
  assert.equal(await player(this).getByRole("group", { name: "Box a0", exact: true }).count(), 0);
});
Then("the knocked-out number is hidden from screen readers", async function (this: WebWorld) {
  assert.equal(await player(this).locator("[data-knocked-out]").first().getAttribute("aria-hidden"), "true");
});
Then("the token starts with the number {int} at the number on card {int}", async function (this: WebWorld, value: number, card: number) {
  const token = player(this).locator("[data-token]", { hasText: new RegExp(`^${value}$`) });
  await token.waitFor();
  assert.ok(Number(await token.getAttribute("data-t")) < 0.1, "the diagram clock is not near the start");
  const from = await cardInput(this, card).boundingBox();
  const at = await token.boundingBox();
  assert.ok(from && at, "the token or the number is not on the screen");
  const gap = Math.hypot(from.x + from.width / 2 - (at.x + at.width / 2), from.y + from.height / 2 - (at.y + at.height / 2));
  assert.ok(gap < 30, `the token starts ${gap.toFixed(0)} pixels from the number on card ${card}`);
});

const glassLine = (w: WebWorld, card: number) => player(w).locator(`[data-glass][data-coach-id="glass:${card - 1}"]`);

Then("the glass line under card {int} says {string}", async function (this: WebWorld, card: number, text: string) {
  await settleFrames(this);
  const line = glassLine(this, card);
  await line.waitFor();
  assert.equal((await line.innerText()).replace(/\s+/g, " ").trim().replace(/^The RISC-V machine writes this card as:\s*/, ""), text);
});
Then("the lesson shows no glass line", async function (this: WebWorld) {
  await settleFrames(this);
  assert.equal(await player(this).locator("[data-glass]").count(), 0);
});
Then("the glass line under card {int} is on one line", async function (this: WebWorld, card: number) {
  const box = await glassLine(this, card).boundingBox();
  assert.ok(box && box.height < 24, `the glass line is ${box?.height}px tall`);
});
Then("the glass line under card {int} is read to a screen reader as {string}", async function (this: WebWorld, card: number, text: string) {
  const spoken = await glassLine(this, card).evaluate((el) => el.textContent ?? "");
  assert.ok(spoken.replace(/\s+/g, " ").includes(text), spoken);
});
Then("the registers panel is named {string} and holds {int} boxes", async function (this: WebWorld, name: string, count: number) {
  const panel = player(this).getByRole("group", { name, exact: true });
  assert.equal(await panel.count(), 1);
  assert.equal(await panel.locator("[data-box]").count(), count);
});
Then("the glass line has no animation", async function (this: WebWorld) {
  const motion = await glassLine(this, 1).evaluate((el) => {
    const style = getComputedStyle(el);
    return `${style.transitionDuration}|${style.animationName}`;
  });
  assert.ok(/^(0s|1e-06s)\|none$/.test(motion), motion);
});
