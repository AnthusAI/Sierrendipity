import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { composite, contrastRatio, parseColor, toHex, type Rgba } from "../../web/src/theme/contrast";
import type { Locator } from "playwright";
import type { WebWorld } from "../support/web-world.ts";

const root = path.resolve(__dirname, "../..");
const panel = (w: WebWorld) => w.page.locator("[data-coach-panel]");
const box = (w: WebWorld, name: string) => w.page.locator(`[data-coach-id="box:${name}"] [data-value]`);
const cardInput = (w: WebWorld, n: number) => w.page.getByLabel(`Number on card ${n}`);
const PROGRESS_KEY = "sierrendipity:progress:local";

/** Let React finish rendering what a clock tick or a click started, before asserting that something is absent. */
const settle = (w: WebWorld) => w.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function readProgress(w: WebWorld, lessonId: string): Promise<Record<string, unknown> | undefined> {
  const raw = await w.page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
  if (!raw) return undefined;
  return (JSON.parse(raw) as { lessons: Record<string, Record<string, unknown>> }).lessons[lessonId];
}

/** Wait until `check` holds for the stored progress (the store writes synchronously, so this is brief). */
async function progressHolds(w: WebWorld, lessonId: string, what: string, check: (p: Record<string, any> | undefined) => boolean) {
  let last: Record<string, unknown> | undefined;
  for (let i = 0; i < 40; i++) {
    last = await readProgress(w, lessonId);
    if (check(last)) return;
    await w.page.waitForTimeout(50);
  }
  assert.fail(`expected ${lessonId} to have ${what}, stored: ${JSON.stringify(last)}`);
}

// Opening the lab

async function openLesson(w: WebWorld, lesson: string, opts: { reduced?: boolean; failingStorage?: boolean; seed?: boolean; theme?: [string, string]; size?: [number, number] } = {}) {
  if (opts.size) await w.page.setViewportSize({ width: opts.size[0], height: opts.size[1] });
  if (opts.reduced) await w.page.emulateMedia({ reducedMotion: "reduce" });
  if (opts.failingStorage) {
    await w.page.addInitScript(`(() => {
      const fail = () => { throw new DOMException("storage is broken", "QuotaExceededError"); };
      Storage.prototype.getItem = fail;
      Storage.prototype.setItem = fail;
      Storage.prototype.removeItem = fail;
    })()`);
  }
  if (opts.seed) {
    await w.page.addInitScript(
      ([key]) => {
        if (localStorage.getItem(key)) return;
        const clean = { passed: true, bonuses: [], bestCards: 1, bestSteps: 1, hintsUsed: [0, 0, 0], showMeUsed: 0, predictionsAsked: 0, predictionsCorrect: 0, attempts: 1, firstPassedAt: 1, lastAttemptAt: 1 };
        localStorage.setItem(key, JSON.stringify({ version: 1, userId: "local", lessons: { "c1/01-press-the-button": clean, "c1/03-last-one-wins": clean }, mastery: {}, warmupCounts: {}, events: [] }));
      },
      [PROGRESS_KEY],
    );
  }
  if (opts.theme) {
    await w.page.addInitScript(([theme, mode]) => localStorage.setItem("sierrendipity:settings:last", JSON.stringify({ theme, mode })), opts.theme);
  }
  await w.openLab(`?lesson=${encodeURIComponent(lesson)}&testclock`);
  await panel(w).waitFor();
}

Given("the coach lab shows lesson {string}", async function (this: WebWorld, lesson: string) {
  await openLesson(this, lesson);
});
Given("the coach lab shows lesson {string} with reduced motion", async function (this: WebWorld, lesson: string) {
  await openLesson(this, lesson, { reduced: true });
});
Given("the coach lab shows lesson {string} with storage that always fails", async function (this: WebWorld, lesson: string) {
  await openLesson(this, lesson, { failingStorage: true });
});
Given("the coach lab shows lesson {string} after two clean lessons", async function (this: WebWorld, lesson: string) {
  await openLesson(this, lesson, { seed: true });
});
Given("the coach lab shows lesson {string} in the {string} theme and {word} mode", async function (this: WebWorld, lesson: string, theme: string, mode: string) {
  await openLesson(this, lesson, { theme: [theme, mode] });
});
Given("the coach lab shows lesson {string} at {int} by {int}", async function (this: WebWorld, lesson: string, width: number, height: number) {
  await openLesson(this, lesson, { size: [width, height] });
});

When("I reload the lab", async function (this: WebWorld) {
  await this.page.reload();
  await panel(this).waitFor();
});

// Doing things

const named = (w: WebWorld, name: string) => w.page.locator("[data-lesson-player]").getByRole("button", { name, exact: true });
/** A control by its place, whatever a lesson calls it (Step may be Run; Reset may be Start again). */
const control = (w: WebWorld, id: "step" | "back" | "reset") => w.page.locator(`[data-lesson-player] [data-coach-id="button:${id}"]`);

/** A student waits for the celebration to finish; the lab's test clock only moves when told to, so move it. */
async function waitOutCelebration(w: WebWorld, wanted: Locator) {
  if ((await w.page.locator("[data-coach-celebrate]").count()) > 0 && (await wanted.count()) === 0) await advance(w, 1400);
}

When("I press Continue", async function (this: WebWorld) {
  await waitOutCelebration(this, named(this, "Continue"));
  await named(this, "Continue").click();
});
When("the celebration ends", async function (this: WebWorld) {
  await advance(this, 1400);
});
When("I select Start again", async function (this: WebWorld) {
  await named(this, "Start again").click();
});
When("I select Run", async function (this: WebWorld) {
  await named(this, "Run").click();
});
When("I press Continue {int} times", async function (this: WebWorld, times: number) {
  for (let i = 0; i < times; i++) {
    await waitOutCelebration(this, named(this, "Continue"));
    await named(this, "Continue").click();
  }
});
When("I press Step", async function (this: WebWorld) {
  await control(this, "step").click();
});
When("I press Back", async function (this: WebWorld) {
  // Back may be aria-disabled (nothing to undo); a student can still click it, so force past Playwright's check.
  await named(this, "Back").click({ force: true });
});
When("I press Reset", async function (this: WebWorld) {
  await control(this, "reset").click();
});
When("I press the Enter key", async function (this: WebWorld) {
  await this.page.keyboard.press("Enter");
});
When("I press the Escape key", async function (this: WebWorld) {
  await this.page.keyboard.press("Escape");
});
When("I set the number on card {int} to {int}", async function (this: WebWorld, card: number, value: number) {
  await cardInput(this, card).fill(String(value));
});
When("I try to set the number on card {int} to {int}", async function (this: WebWorld, card: number, value: number) {
  await cardInput(this, card).focus();
  await this.page.keyboard.press("Control+A");
  await this.page.keyboard.type(String(value));
});
When("I answer {int}", async function (this: WebWorld, value: number) {
  await panel(this).getByLabel("Your answer").fill(String(value));
  await named(this, "Answer").click();
});
When("I ask for a hint", async function (this: WebWorld) {
  await panel(this).locator("[data-coach-help]").getByRole("button", { name: "Hint", exact: true }).click();
});
When("I ask to be shown", async function (this: WebWorld) {
  await panel(this).locator("[data-coach-help]").getByRole("button", { name: "Show me", exact: true }).click();
});
When("I choose {string}", async function (this: WebWorld, name: string) {
  await waitOutCelebration(this, this.page.locator("[data-lesson-player]").getByRole("button", { name, exact: true }));
  const offer = panel(this).locator("[data-coach-nudge], [data-coach-question]").getByRole("button", { name, exact: true });
  if ((await offer.count()) > 0) await offer.click();
  else await this.page.locator("[data-lesson-player], [data-lesson-load-error]").getByRole("button", { name, exact: true }).click();
});
When("I tab until the focus is on {string}", async function (this: WebWorld, name: string) {
  for (let i = 0; i < 40; i++) {
    const label = await this.page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() : "";
    });
    if (label === name) return;
    await this.page.keyboard.press("Tab");
  }
  assert.fail(`never reached "${name}" with Tab`);
});

const advance = (w: WebWorld, ms: number) => w.page.evaluate((n) => (window as unknown as { __testclock: { advance(ms: number): void } }).__testclock.advance(n), ms);
When("the clock advances {int} seconds", async function (this: WebWorld, s: number) {
  await advance(this, s * 1000);
});
When("the clock advances {int} minutes", async function (this: WebWorld, m: number) {
  await advance(this, m * 60_000);
});

// What the coach shows

Then("the coach says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-say]", { hasText: text }).waitFor();
});
Then("the coach replies {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-reply]", { hasText: text }).waitFor();
});
Then("the coach announces {string}", async function (this: WebWorld, text: string) {
  await panel(this).locator("[aria-live='polite']", { hasText: text }).first().waitFor();
});
Then("the coach asks {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-question]", { hasText: text }).waitFor();
});
Then("the coach offers {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-nudge]", { hasText: text }).waitFor();
});
Then("no nudge is offered", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-coach-nudge]").count(), 0, "a nudge is on offer");
});
Then("the coach suggests stopping after this goal", async function (this: WebWorld) {
  await this.page.locator("[data-coach-stop-suggestion]", { hasText: "good place to stop" }).waitFor();
});
Then("the hint says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-hint]", { hasText: text }).waitFor();
});
Then("no more hints are offered", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await panel(this).locator("[data-coach-help]").getByRole("button", { name: "Hint", exact: true }).count(), 0);
});
Then("the coach has no {string} button", async function (this: WebWorld, name: string) {
  await settle(this);
  assert.equal(await named(this, name).count(), 0);
});
Then("the reply is not styled as an error", async function (this: WebWorld) {
  const reply = this.page.locator("[data-coach-reply]").first();
  const [seen, danger] = await Promise.all([
    reply.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor, border: s.borderTopColor };
    }),
    this.page.evaluate(() =>
      ["--danger-fg", "--danger-bg", "--destructive"].map((token) => {
        const el = document.createElement("span");
        el.style.color = `var(${token})`;
        document.body.append(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c;
      }),
    ),
  ]);
  for (const value of [seen.color, seen.background, seen.border]) assert.ok(!danger.includes(value), `the reply uses an error color: ${value}`);
});

// The machine

Then("box {string} shows {int}", async function (this: WebWorld, name: string, value: number) {
  await this.page.locator(`[data-coach-id="box:${name}"] [data-value]`, { hasText: new RegExp(`^${value}$`) }).waitFor();
});
Then("the number on card {int} is {int}", async function (this: WebWorld, card: number, value: number) {
  assert.equal(await cardInput(this, card).inputValue(), String(value));
});
Then("the number on card {int} is locked with the explanation {string}", async function (this: WebWorld, card: number, text: string) {
  const input = cardInput(this, card);
  assert.equal(await input.getAttribute("aria-disabled"), "true");
  const described = await input.evaluate((el) => (el.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
  assert.ok(described.includes(text), `description was "${described}"`);
  assert.ok(((await input.getAttribute("title")) ?? "").includes(text));
});

// The end card

Then("the Now you can card is shown", async function (this: WebWorld) {
  await this.page.locator("[data-coach-end]").waitFor();
});
Then("the Now you can card lists {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-end]", { hasText: text }).waitFor();
});
Then("the Now you can card shows what I made, {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-end] [data-coach-made]", { hasText: `You made: ${text}` }).waitFor();
});
Then("the Now you can card shows what I ran, {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-end] [data-coach-made]", { hasText: `You ran: ${text}` }).waitFor();
});
Then("the Now you can card shows the stars {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-end] [data-coach-stars]", { hasText: text }).waitFor();
});
Then("the Now you can card offers {string} and {string}", async function (this: WebWorld, a: string, b: string) {
  await this.page.locator("[data-coach-end]").getByRole("button", { name: a, exact: true }).waitFor();
  await this.page.locator("[data-coach-end]").getByRole("button", { name: b, exact: true }).waitFor();
});

// Focus

Then("the focus is on {string}", async function (this: WebWorld, name: string) {
  await this.page.waitForFunction((expected) => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() === expected;
  }, name);
});

// Spotlight and ghost

const rectOf = (w: WebWorld, selector: string) =>
  w.page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

When("I scroll the lesson by {int} pixels, the spotlight is still on {string} in the next frame", async function (this: WebWorld, pixels: number, target: string) {
  await this.page.setViewportSize({ width: 900, height: 300 });
  await this.page.locator(`[data-coach-spotlight][data-target="${target}"]`).waitFor();
  const result = await this.page.evaluate(
    ([px, id]) =>
      new Promise<{ moved: number; lag: number }>((resolve) => {
        const el = document.querySelector<HTMLElement>(`[data-coach-id="${id}"]`)!;
        let scroller: HTMLElement | null = el;
        while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
        const before = el.getBoundingClientRect().top;
        if (scroller) scroller.scrollTop += px as number;
        else window.scrollBy(0, px as number);
        // The scroll event runs before the next frame's callbacks, so one frame later the frame must already be in place.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const ring = document.querySelector("[data-coach-spotlight]")!.getBoundingClientRect();
            const now = el.getBoundingClientRect();
            resolve({ moved: Math.abs(now.top - before), lag: Math.abs(ring.top - (now.top - 6)) });
          }),
        );
      }),
    [pixels, target] as [number, string],
  );
  assert.ok(result.moved > 20, `the page did not scroll (target moved ${result.moved}px)`);
  assert.ok(result.lag <= 1, `the spotlight trails its target by ${result.lag}px`);
});
Then("the spotlight surrounds {string}", async function (this: WebWorld, target: string) {
  await this.page.locator(`[data-coach-spotlight][data-target="${target}"]`).waitFor();
  const slack = 16;
  const covers = async () => {
    const [spot, el] = await Promise.all([rectOf(this, "[data-coach-spotlight]"), rectOf(this, `[data-coach-id="${target}"]`)]);
    const covered = spot.x <= el.x + 0.5 && spot.y <= el.y + 0.5 && spot.x + spot.width >= el.x + el.width - 0.5 && spot.y + spot.height >= el.y + el.height - 0.5;
    const snug = spot.width <= el.width + 2 * slack && spot.height <= el.height + 2 * slack;
    return { ok: covered && snug, covered, spot, el };
  };
  let seen = await covers();
  for (let i = 0; i < 40 && !seen.ok; i++) {
    await this.page.waitForTimeout(50);
    seen = await covers();
  }
  assert.ok(seen.covered, `spotlight ${JSON.stringify(seen.spot)} does not cover ${JSON.stringify(seen.el)}`);
  assert.ok(seen.ok, "the spotlight is much bigger than its target");
});
Then("the spotlight dims the rest of the page", async function (this: WebWorld) {
  const shadow = await this.page.locator("[data-coach-spotlight]").evaluate((el) => getComputedStyle(el).boxShadow);
  assert.notEqual(shadow, "none");
  assert.match(shadow, /\d{3,}px/, `expected a huge spread, got ${shadow}`);
});
Then("the spotlight lets clicks through", async function (this: WebWorld) {
  assert.equal(await this.page.locator("[data-coach-spotlight]").evaluate((el) => getComputedStyle(el).pointerEvents), "none");
});
Then("there is no spotlight", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-coach-spotlight]").count(), 0);
});
Then("the spotlight is instant", async function (this: WebWorld) {
  await this.page.locator("[data-coach-spotlight][data-motion='reduced']").waitFor();
});
Then("the ghost pointer is visible", async function (this: WebWorld) {
  await this.page.locator("[data-ghost-pointer]").waitFor();
});
Then("the ghost pointer is hidden", async function (this: WebWorld) {
  await this.page.locator("[data-ghost-pointer]").waitFor({ state: "detached" });
});
Then("the ghost pointer is instant", async function (this: WebWorld) {
  await this.page.locator("[data-ghost-pointer][data-motion='reduced']").waitFor();
});

// Progress

Then("the stored progress of {string} has passed", async function (this: WebWorld, id: string) {
  await progressHolds(this, id, "passed", (p) => p?.passed === true);
});
Then("the stored progress of {string} has not passed", async function (this: WebWorld, id: string) {
  await progressHolds(this, id, "attempts but no pass", (p) => !!p && p.passed === false);
});
Then("the stored progress of {string} has {int} attempt", async function (this: WebWorld, id: string, n: number) {
  await progressHolds(this, id, `${n} attempt`, (p) => p?.attempts === n);
});
Then("the stored progress of {string} has passed with the bonus {string}", async function (this: WebWorld, id: string, star: string) {
  await progressHolds(this, id, `a pass and ${star}`, (p) => p?.passed === true && p.bonuses.includes(star));
});
Then("the stored progress of {string} has passed without the bonus {string}", async function (this: WebWorld, id: string, star: string) {
  await progressHolds(this, id, `a pass without ${star}`, (p) => p?.passed === true && !p.bonuses.includes(star));
});
Then("the stored progress of {string} asked {int} prediction and got {int} right", async function (this: WebWorld, id: string, asked: number, right: number) {
  await progressHolds(this, id, `${asked} asked ${right} right`, (p) => p?.predictionsAsked === asked && p.predictionsCorrect === right);
});
Then("the stored progress of {string} used the hints {int}, {int} and {int} and no Show me", async function (this: WebWorld, id: string, a: number, b: number, c: number) {
  await progressHolds(this, id, "those hints", (p) => JSON.stringify(p?.hintsUsed) === JSON.stringify([a, b, c]) && p?.showMeUsed === 0);
});
Then("the stored progress of {string} has passed and used Show me once", async function (this: WebWorld, id: string) {
  await progressHolds(this, id, "a pass and one Show me", (p) => p?.passed === true && p.showMeUsed === 1);
});
Then("the lab progress line says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-lab-progress]", { hasText: text }).waitFor();
});

// Contrast and layout

/** The color of an element and the opaque color painted behind it, as the browser computed them. */
async function paint(w: WebWorld, selector: string) {
  return w.page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const layers: string[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) layers.unshift(getComputedStyle(n).backgroundColor);
      return { color: getComputedStyle(el).color, layers, text: (el.textContent ?? "").trim().slice(0, 30) };
    }),
  );
}
function ratioOf(color: string, layers: string[]): number {
  let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers) background = composite(parseColor(layer), background);
  return contrastRatio(color, toHex(background));
}
Then("the coach text meets {float}:1 contrast on the panel", async function (this: WebWorld, min: number) {
  const items = await paint(this, "[data-coach-say], [data-coach-reply], [data-coach-reply] *, [data-coach-hint]");
  assert.ok(items.length >= 2, "expected coach text to check");
  for (const { color, layers, text } of items) {
    const ratio = ratioOf(color, layers);
    assert.ok(ratio >= min, `"${text}" is ${ratio.toFixed(2)}:1`);
  }
});
Then("the coach buttons meet {float}:1 contrast", async function (this: WebWorld, min: number) {
  const items = await paint(this, "[data-coach-panel] button");
  assert.ok(items.length >= 1);
  for (const { color, layers, text } of items) {
    const ratio = ratioOf(color, layers);
    assert.ok(ratio >= min, `button "${text}" is ${ratio.toFixed(2)}:1`);
  }
});
Then("the lab page does not scroll sideways", async function (this: WebWorld) {
  const [scroll, inner] = await this.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(scroll <= inner, `page is ${scroll}px wide in a ${inner}px window`);
});
Then("the coach panel is fully inside the window", async function (this: WebWorld) {
  await this.page.locator("[data-coach-panel]").scrollIntoViewIfNeeded();
  const r = await rectOf(this, "[data-coach-panel]");
  const [w, h] = await this.page.evaluate(() => [window.innerWidth, window.innerHeight]);
  assert.ok(r.x >= 0 && r.x + r.width <= w && r.y >= 0 && r.y < h, `panel at ${JSON.stringify(r)} in ${w}x${h}`);
  const primary = await this.page.locator("[data-coach-panel] button").first().boundingBox();
  assert.ok(primary && primary.y + primary.height <= h + 1, "the first coach button is below the fold");
});

// Added for the review fixes

When("I double-click Continue", async function (this: WebWorld) {
  await named(this, "Continue").dblclick();
});
Then("the coach confirms {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-done]", { hasText: text }).waitFor();
});
Then("the coach shows no confirmation", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-coach-done]").count(), 0);
});
When("I clear the number on card {int} with the keyboard", async function (this: WebWorld, card: number) {
  await cardInput(this, card).fill("");
});
When("I type {string} into the number on card {int}", async function (this: WebWorld, text: string, card: number) {
  await cardInput(this, card).fill(text);
});
When("I type {string} into the number on card {int} and leave it", async function (this: WebWorld, text: string, card: number) {
  await cardInput(this, card).fill(text);
  await this.page.keyboard.press("Tab");
});
Then("the card hint says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-card-hint]", { hasText: text }).waitFor();
});
for (const name of ["Step", "Back", "Reset"]) {
  Then(`the ${name} button is locked with the explanation {string}`, async function (this: WebWorld, text: string) {
    const b = control(this, name.toLowerCase() as "step" | "back" | "reset");
    assert.equal(await b.getAttribute("aria-disabled"), "true");
    const described = await b.evaluate((el) => (el.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
    assert.ok(described.includes(text), `description was "${described}"`);
  });
}
Then("the Now you can card is not shown yet", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-coach-end]").count(), 0);
});
Then("the stored mastery of {string} is box {int}", async function (this: WebWorld, concept: string, box: number) {
  const raw = await this.page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
  assert.equal(JSON.parse(raw ?? "{}").mastery?.[concept]?.box, box);
});
When("I type {string} as my answer and press Answer", async function (this: WebWorld, text: string) {
  await panel(this).getByLabel("Your answer").fill(text);
  await named(this, "Answer").click();
});
When("I start typing the answer {string}", async function (this: WebWorld, text: string) {
  await panel(this).getByLabel("Your answer").fill(text);
});
Then("the answer hint says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-coach-answer-hint]", { hasText: text }).waitFor();
});
Then("the coach does not suggest stopping", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-coach-stop-suggestion]").count(), 0);
});
Then("no hint is shown", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-coach-hint]").count(), 0);
});
Then("the stored progress of {string} has used no hints", async function (this: WebWorld, id: string) {
  await settle(this);
  const p = await readProgress(this, id);
  assert.ok(!p || JSON.stringify(p.hintsUsed) === "[0,0,0]", JSON.stringify(p));
});
Then("the coach question is inside the polite live region", async function (this: WebWorld) {
  assert.ok((await this.page.locator("[aria-live='polite'] [data-coach-nudge], [aria-live='polite'] [data-coach-skip-tour]").count()) >= 1);
});

// Forced colors, the idle Step button, narrow screens

Given("the coach lab shows lesson {string} with forced colors", async function (this: WebWorld, lesson: string) {
  await this.page.emulateMedia({ forcedColors: "active" });
  await openLesson(this, lesson);
});
Then("the spotlight is outlined in a system color", async function (this: WebWorld) {
  const style = await this.page.locator("[data-coach-spotlight]").evaluate((el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle };
  });
  assert.equal(style.style, "solid");
  assert.equal(style.width, "3px");
});
Then("the spotlight still dims the rest of the page", async function (this: WebWorld) {
  const shadow = await this.page.locator("[data-coach-spotlight]").evaluate((el) => getComputedStyle(el).boxShadow);
  assert.match(shadow, /\d{3,}px/, `expected a huge spread, got ${shadow}`);
});
Then("the Step button explains {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-idle-note]", { hasText: text }).waitFor();
});
Then("the idle Step button meets {float}:1 contrast", async function (this: WebWorld, min: number) {
  await this.page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const items = await paint(this, '[data-coach-id="button:step"][aria-disabled="true"], [data-idle-note]');
  assert.ok(items.length >= 2);
  for (const { color, layers, text } of items) assert.ok(ratioOf(color, layers) >= min, `"${text}" is ${ratioOf(color, layers).toFixed(2)}:1`);
});
Then("the coach panel comes before the machine", async function (this: WebWorld) {
  const [panelRect, stage] = await Promise.all([rectOf(this, "[data-coach-panel]"), rectOf(this, "[data-lesson-player] > section")]);
  assert.ok(panelRect.y < stage.y, `the panel starts at ${panelRect.y}, the machine at ${stage.y}`);
});
Then("the number pad buttons are at least {int}px tall", async function (this: WebWorld, min: number) {
  const heights = await this.page.locator('[role="group"][aria-label="Number pad"] button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.equal(heights.length, 10);
  for (const h of heights) assert.ok(h >= min, `a pad button is ${h}px tall`);
});

// Loading problems

Given("the coach lab is asked for the lesson {string}", async function (this: WebWorld, lesson: string) {
  await this.openLab(`?lesson=${encodeURIComponent(lesson)}&testclock`);
  await this.page.locator("[data-lesson-load-error], [data-coach-panel]").first().waitFor();
});
Then("the lab says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-lesson-load-error]", { hasText: text }).waitFor();
});
Then("the lab shows no technical error text", async function (this: WebWorld) {
  const text = await this.page.locator("main").innerText();
  assert.ok(!/Cannot read|dynamically imported|published lesson|undefined|TypeError|format 1/i.test(text), text);
});
const lessonChunk = (id: string) => `**/assets/${id.replace("/", "-")}-*.js`;
Given("the lesson file of {string} is damaged", async function (this: WebWorld, id: string) {
  await this.page.route(lessonChunk(id), (route) => route.fulfill({ contentType: "text/javascript", body: "export default { format: 1 };" }));
});
Given("the lesson file of {string} cannot be fetched", async function (this: WebWorld, id: string) {
  await this.page.route(lessonChunk(id), (route) => route.abort());
});
When("the lesson file can be fetched again", async function (this: WebWorld) {
  await this.page.unroute("**/assets/*.js");
  await this.page.unrouteAll();
});
Then("the main bundle does not contain the coach", async function (this: WebWorld) {
  const html = await readFile(path.join(root, "web/dist/index.html"), "utf8");
  const src = html.match(/<script[^>]*src="([^"]+)"/)![1]!;
  const js = await readFile(path.join(root, "web/dist", src), "utf8");
  assert.ok(!js.includes("data-coach-panel"), "the coach is in the main bundle");
  assert.ok(!js.includes("Component lab"), "the lab is in the main bundle");
});
