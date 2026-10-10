import { Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { composite, contrastRatio, parseColor, toHex, type Rgba } from "../../web/src/theme/contrast";
import type { WebWorld } from "../support/web-world.ts";

const celebration = (w: WebWorld) => w.page.locator("[data-coach-celebrate]");
const player = (w: WebWorld) => w.page.locator("[data-lesson-player]");

function flatten(layers: string[]): string {
  let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers) background = composite(parseColor(layer), background);
  return toHex(background);
}

Then("the coach celebrates with a thick green outline, a check icon and the words {string}", async function (this: WebWorld, words: string) {
  const block = celebration(this).filter({ hasText: words });
  await block.waitFor();
  const style = await block.evaluate((el) => {
    const s = getComputedStyle(el);
    const probe = document.createElement("i");
    probe.style.color = "var(--success)";
    document.body.append(probe);
    const success = getComputedStyle(probe).color;
    probe.remove();
    return { width: parseFloat(s.borderTopWidth), color: s.borderTopColor, success };
  });
  assert.ok(style.width >= 4, `outline is ${style.width}px`);
  assert.equal(style.color, style.success);
  assert.ok((await block.locator("svg[aria-hidden]").count()) > 0, "an icon shows it is not colour alone");
});
Then("the coach celebrates the end of the lesson with the words {string}", async function (this: WebWorld, words: string) {
  const block = this.page.locator('[data-coach-celebrate="lesson"]', { hasText: words });
  await block.waitFor();
  assert.ok((await block.locator("[data-confetti] i").count()) > 7, "the lesson end has more confetti than a goal");
});
Then("the boxes flash green", async function (this: WebWorld) {
  await player(this).and(this.page.locator("[data-celebrate]")).waitFor();
  const box = player(this).locator("[data-box]").first();
  const [border, success] = await box.evaluate((el) => {
    const probe = document.createElement("i");
    probe.style.color = "var(--success)";
    document.body.append(probe);
    const success = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(el).borderTopColor, success];
  });
  assert.equal(border, success);
});
Then("the confetti is shown", async function (this: WebWorld) {
  assert.ok((await celebration(this).locator("[data-confetti] i").count()) > 0);
  assert.notEqual(await celebration(this).locator("[data-confetti]").evaluate((el) => getComputedStyle(el).display), "none");
});
Then("the confetti is not shown", async function (this: WebWorld) {
  assert.equal(await celebration(this).locator("[data-confetti]").evaluate((el) => getComputedStyle(el).display), "none");
});
Then("the celebration does not move", async function (this: WebWorld) {
  assert.equal(await celebration(this).evaluate((el) => getComputedStyle(el).animationName), "none");
});
Then("the coach offers no Continue button", async function (this: WebWorld) {
  assert.equal(await player(this).getByRole("button", { name: "Continue", exact: true }).count(), 0);
});
Then("the coach offers a Continue button", async function (this: WebWorld) {
  await player(this).getByRole("button", { name: "Continue", exact: true }).waitFor();
});
Then("the Now you can card offers no {string} button", async function (this: WebWorld, name: string) {
  await this.page.locator("[data-coach-end]").waitFor();
  assert.equal(await this.page.locator("[data-coach-end]").getByRole("button", { name, exact: true }).count(), 0);
});
Then("the celebration is a polite status named by {string}", async function (this: WebWorld, words: string) {
  const status = this.page.locator("[data-coach-panel]").getByRole("status").filter({ hasText: words });
  await status.waitFor();
  assert.ok((await this.page.locator('[data-coach-panel] [aria-live="polite"] [data-coach-celebrate]').count()) > 0);
});
Then("the check icon and the confetti are hidden from screen readers", async function (this: WebWorld) {
  assert.equal(await celebration(this).locator("svg:not([aria-hidden])").count(), 0);
  assert.equal(await celebration(this).locator("[data-confetti]").getAttribute("aria-hidden"), "true");
});
Then("there is no celebration", async function (this: WebWorld) {
  await this.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  assert.equal(await celebration(this).count(), 0);
  assert.equal(await this.page.locator("[data-lesson-player][data-celebrate]").count(), 0);
});
Then("the celebration outline meets {int}:1 contrast on the panel", async function (this: WebWorld, min: number) {
  await celebration(this).waitFor();
  const { outline, layers } = await celebration(this).evaluate((el) => {
    const layers: string[] = [];
    for (let n: Element | null = el.parentElement; n; n = n.parentElement) layers.unshift(getComputedStyle(n).backgroundColor);
    return { outline: getComputedStyle(el).borderTopColor, layers };
  });
  const ratio = contrastRatio(outline, flatten(layers));
  assert.ok(ratio >= min, `outline is ${ratio.toFixed(2)}:1`);
});
Then("the celebration text meets {float}:1 contrast", async function (this: WebWorld, min: number) {
  const items = await celebration(this).locator("p, svg").evaluateAll((els) =>
    els.map((el) => {
      const layers: string[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) layers.unshift(getComputedStyle(n).backgroundColor);
      return { color: el instanceof SVGElement ? getComputedStyle(el).color : getComputedStyle(el).color, layers };
    }),
  );
  for (const { color, layers } of items) {
    const ratio = contrastRatio(color, flatten(layers));
    assert.ok(ratio >= Math.min(min, 3), `celebration part is ${ratio.toFixed(2)}:1`);
  }
  const text = items[0]!;
  assert.ok(contrastRatio(text.color, flatten(text.layers)) >= min);
});
