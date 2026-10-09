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
Then("the missed-goal help has a thick red outline and the words {string}", async function (this: WebWorld, words: string) {
  const help = this.page.locator("[data-coach-missed]", { hasText: words });
  await help.waitFor();
  const style = await help.evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: parseFloat(s.borderTopWidth), color: s.borderTopColor, destructive: getComputedStyle(document.documentElement).getPropertyValue("--destructive").trim() };
  });
  assert.ok(style.width >= 4, `outline is ${style.width}px`);
  assert.notEqual(style.color, "rgb(0, 0, 0)");
  assert.ok(await help.locator("svg[aria-hidden]").count() > 0, "an icon shows it is not colour alone");
});
Then("the box has a red outline", async function (this: WebWorld) {
  await settleFrames(this);
  const box = this.page.locator("[data-lesson-player] [data-box]").first();
  const red = await box.evaluate((el) => getComputedStyle(el).borderTopColor);
  const expected = await this.page.evaluate(() => {
    const probe = document.createElement("i");
    probe.style.color = "var(--destructive)";
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  assert.equal(red, expected);
});
Then("the box has no red outline", async function (this: WebWorld) {
  await settleFrames(this);
  const box = this.page.locator("[data-lesson-player] [data-box]").first();
  const red = await box.evaluate((el) => getComputedStyle(el).borderTopColor);
  const expected = await this.page.evaluate(() => {
    const probe = document.createElement("i");
    probe.style.color = "var(--destructive)";
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  assert.notEqual(red, expected);
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
  const shown = await line.evaluate((el) => (el.querySelector("[aria-hidden]")?.textContent ?? "").replace(/\s+/g, " ").trim());
  assert.equal(shown, text);
});
Then("the lesson shows no glass line", async function (this: WebWorld) {
  await settleFrames(this);
  assert.equal(await player(this).locator("[data-glass]").count(), 0);
});
Then("the glass line under card {int} shows its whole text", async function (this: WebWorld, card: number) {
  await settleFrames(this);
  const line = glassLine(this, card);
  await line.scrollIntoViewIfNeeded();
  const fit = await line.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const word = el.querySelector("[data-glass-word]")!.getBoundingClientRect();
    const assembly = el.querySelector("[data-glass-assembly]")!.getBoundingClientRect();
    return { clipped: el.scrollWidth > el.clientWidth, windowWidth: window.innerWidth, box: { l: box.left, r: box.right }, word: { l: word.left, r: word.right, w: word.width }, assembly: { r: assembly.right, w: assembly.width } };
  });
  assert.ok(!fit.clipped, "the glass line is wider than its box");
  assert.ok(fit.word.w > 0 && fit.assembly.w > 0, "a part of the glass line has no width");
  assert.ok(fit.word.l >= fit.box.l - 1 && fit.word.r <= fit.box.r + 1 && fit.word.r <= fit.windowWidth, `the hex word is cut off: ${JSON.stringify(fit)}`);
});
const spokenOf = (w: WebWorld, card: number) => glassLine(w, card).evaluate((el) => [...el.children].filter((c) => c.getAttribute("aria-hidden") !== "true").map((c) => c.textContent ?? "").join(" ").replace(/\s+/g, " ").trim());
Then("the glass line under card {int} is hidden from a screen reader", async function (this: WebWorld, card: number) {
  await settleFrames(this);
  assert.equal(await spokenOf(this, card), "");
});
Then("the glass line under card {int} is read to a screen reader as {string}", async function (this: WebWorld, card: number, text: string) {
  await settleFrames(this);
  assert.equal(await spokenOf(this, card), text);
});
Then("the glass line never gives a screen reader the register name {string}", async function (this: WebWorld, name: string) {
  assert.equal(new RegExp(`\\b${name}\\b`).test(await spokenOf(this, 1)), false);
});
Then("the registers panel is named {string} and holds {int} boxes", async function (this: WebWorld, name: string, count: number) {
  const panel = player(this).getByRole("group", { name, exact: true });
  assert.equal(await panel.count(), 1);
  assert.equal(await panel.locator("[data-box]").count(), count);
});

Then("the coach marks the next goal with the words {string}", async function (this: WebWorld, words: string) {
  await this.page.locator("[data-coach-next-goal]", { hasText: words }).waitFor();
  assert.ok(await this.page.locator("[data-coach-next-goal] svg[aria-hidden]").count() > 0, "an icon and words, not colour alone");
});
Then("the coach shows no next-goal marker", async function (this: WebWorld) {
  await settleFrames(this);
  assert.equal(await this.page.locator("[data-coach-next-goal]").count(), 0);
});
