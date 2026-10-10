import { Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { WebWorld } from "../support/web-world";

const player = (w: WebWorld) => w.page.locator("[data-lesson-player]");
const banner = (w: WebWorld) => player(w).locator('[data-coach-id="banner:rule"]');
const inputOfX = (w: WebWorld) => player(w).getByLabel("Number for x in f(x)");
const settle = (w: WebWorld) => w.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

Then("the rule banner reads {string}", async function (this: WebWorld, text: string) {
  await banner(this).locator("[data-rule-text]", { hasText: text }).waitFor();
});
Then("the rule banner shows {string}", async function (this: WebWorld, text: string) {
  await banner(this).locator("[data-rule-substitution]", { hasText: text }).waitFor();
});
Then("the rule banner says {string}", async function (this: WebWorld, text: string) {
  await banner(this).locator("[data-rule-status]", { hasText: text }).waitFor();
});
Then("the lesson shows no rule banner", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await banner(this).count(), 0);
});
Then("the rule banner is a region named {string}", async function (this: WebWorld, name: string) {
  await player(this).getByRole("region", { name, exact: true }).waitFor();
  assert.equal(await banner(this).getAttribute("aria-label"), name);
});
Then("the rule banner status is announced politely", async function (this: WebWorld) {
  assert.equal(await banner(this).locator("[data-rule-status]").getAttribute("aria-live"), "polite");
  assert.equal(await banner(this).locator("[data-rule-status]").getAttribute("role"), "status");
});
Then("the rule banner is above the boxes", async function (this: WebWorld) {
  const above = await this.page.evaluate(() => {
    const rule = document.querySelector('[data-lesson-player] [data-coach-id="banner:rule"]')!;
    const box = document.querySelector("[data-lesson-player] [data-box]")!;
    return !!(rule.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.ok(above, "the rule banner comes before the boxes");
});

async function typeKeys(w: WebWorld, text: string): Promise<void> {
  const box = inputOfX(w);
  await box.click();
  await box.press("ControlOrMeta+a");
  await w.page.keyboard.type(text);
}
When("I type {int} for x", async function (this: WebWorld, x: number) {
  await typeKeys(this, String(x));
  await this.page.keyboard.press("Enter");
});
When("I type {string} for x", async function (this: WebWorld, text: string) {
  await typeKeys(this, text);
  await this.page.keyboard.press("Enter");
});
When("I type {string} for x without confirming", async function (this: WebWorld, text: string) {
  await typeKeys(this, text);
});
When("I leave the box for x", async function (this: WebWorld) {
  await this.page.keyboard.press("Tab");
});
Then("the box for x says {string}", async function (this: WebWorld, text: string) {
  await player(this).locator("[data-rule-message]", { hasText: text }).waitFor();
});
Then("the box for x has no message", async function (this: WebWorld) {
  await settle(this);
  assert.equal((await player(this).locator("[data-rule-message]").innerText()).trim(), "");
});
Then("the rule banner shows no values", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await banner(this).locator("[data-rule-substitution], [data-rule-status]").count(), 0);
  assert.ok((await banner(this).locator("[data-rule-text]").innerText()).includes("x"));
});
Then("the box for x holds {string}", async function (this: WebWorld, text: string) {
  await this.page.waitForFunction(
    ([label, expected]) => (document.querySelector(`[data-lesson-player] [aria-label="${label}"]`) as HTMLInputElement | null)?.value === expected,
    ["Number for x in f(x)", text] as const,
  );
});
Then("the box for x cannot be changed", async function (this: WebWorld) {
  assert.equal(await inputOfX(this).getAttribute("aria-readonly"), "true");
  assert.equal(await inputOfX(this).evaluate((el) => (el as HTMLInputElement).readOnly), true);
});
Then("the box for x can be changed", async function (this: WebWorld) {
  assert.equal(await inputOfX(this).evaluate((el) => (el as HTMLInputElement).readOnly), false);
});

When("I fill the table with {string}", async function (this: WebWorld, list: string) {
  const values = list.split(/,\s*/);
  const cells = player(this).locator("[data-table-cell]");
  assert.equal(await cells.count(), values.length);
  for (const [i, v] of values.entries()) await cells.nth(i).fill(v);
});
When("I submit the table", async function (this: WebWorld) {
  await player(this).locator("[data-table-ask]").getByRole("button", { name: "Answer", exact: true }).click();
});
When("I type {string} in the focused table cell and press the Tab key", async function (this: WebWorld, text: string) {
  await this.page.keyboard.type(text);
  await this.page.keyboard.press("Tab");
});
Then("the table has the columns {string} and {string}", async function (this: WebWorld, a: string, b: string) {
  const headers = await player(this).locator("[data-table-ask] thead th[scope='col']").allInnerTexts();
  assert.deepEqual(headers.map((h) => h.trim()), [a, b]);
});
Then("the table has a row for each of {string}", async function (this: WebWorld, list: string) {
  const rows = await player(this).locator("[data-table-ask] tbody th[scope='row']").allInnerTexts();
  assert.deepEqual(rows.map((r) => r.trim()), list.split(/,\s*/));
});
Then("the table cells are named {string}", async function (this: WebWorld, list: string) {
  const names = await player(this).locator("[data-table-cell]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  assert.deepEqual(names, list.split(/,\s*/));
});
Then("the table is described by its question", async function (this: WebWorld) {
  const table = player(this).locator("[data-table-ask] table");
  assert.equal(await table.getAttribute("aria-describedby"), "coach-question");
  assert.ok((await table.locator("caption").innerText()).length > 0);
});
Then("the table says {string}", async function (this: WebWorld, text: string) {
  await player(this).locator("[data-table-ask] [data-coach-answer-hint]", { hasText: text }).waitFor();
});

async function fits(w: WebWorld, selector: string): Promise<void> {
  const width = await w.page.evaluate(() => window.innerWidth);
  const found = w.page.locator(`[data-lesson-player] ${selector}`);
  assert.ok((await found.count()) > 0, `${selector} is not on the page`);
  const box = await found.first().boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= width + 0.5, `${selector} at ${JSON.stringify(box)} in a ${width}px window`);
}
Then("the rule banner fits the window", async function (this: WebWorld) {
  await fits(this, '[data-coach-id="banner:rule"]');
});
Then("the table fits the window", async function (this: WebWorld) {
  await fits(this, "[data-table-ask]");
});
Then("the rule banner has no animation or transition longer than a millisecond", async function (this: WebWorld) {
  const moving = await banner(this).evaluate((root) =>
    [root, ...root.querySelectorAll("*")].filter((el) => {
      const s = getComputedStyle(el);
      return s.transitionDuration.split(",").some((d) => parseFloat(d) > 0.001) || (s.animationName !== "none" && s.animationDuration.split(",").some((d) => parseFloat(d) > 0.001));
    }).length,
  );
  assert.equal(moving, 0);
});
