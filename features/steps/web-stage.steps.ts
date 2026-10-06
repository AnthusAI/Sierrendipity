import { After, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Locator } from "playwright";
import { composite, contrastRatio, parseColor, toHex, type Rgba } from "../../web/src/theme/contrast";
import type { WebWorld } from "../support/web-world.ts";

const root = path.resolve(__dirname, "../..");
const PROGRESS_KEY = "sierrendipity:progress:local";

const player = (w: WebWorld) => w.page.locator("[data-lesson-player]");
const stageRoot = (w: WebWorld) => w.page.locator("[data-stage-scene]");
const named = (w: WebWorld, name: string) => player(w).getByRole("button", { name, exact: true });
const coachId = (w: WebWorld, id: string) => player(w).locator(`[data-coach-id="${id}"]`);
const lamp = (w: WebWorld, bit: number) => coachId(w, `lamp:${bit}`).first().locator("button");
const settle = (w: WebWorld) => w.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const hex = (word: number) => `0x${(word >>> 0).toString(16).padStart(8, "0")}`;

// ---------------------------------------------------------------- opening a lesson at a scene

interface Opening {
  reduced?: boolean;
  theme?: [string, string];
  size?: [number, number];
}

/** What a student would do to get past the scene that is not the one the spec is about. */
const AUTO: Record<string, (w: WebWorld) => Promise<void>> = {
  place: async (w) => answer(w, "4"),
  "find-answer": async (w) => void (await coachId(w, "band:rd").click()),
  bands: async (w) => void (await coachId(w, "band:rd").click()),
  predict: async (w) => answer(w, "7"),
  "match-one": async (w) => void (await coachId(w, "card:2").click()),
  "match-two": async (w) => void (await coachId(w, "card:0").click()),
  "match-three": async (w) => void (await coachId(w, "card:1").click()),
  "make-five": async (w) => {
    await lamp(w, 2).click();
    await named(w, "Step").click();
  },
  "make-seven": async (w) => {
    await lamp(w, 1).click();
    await named(w, "Step").click();
  },
};

async function answer(w: WebWorld, text: string) {
  await w.page.locator("[data-coach-panel]").getByLabel("Your answer").fill(text);
  await named(w, "Answer").click();
}

const sceneId = (w: WebWorld) => stageRoot(w).getAttribute("data-stage-scene");

async function reachScene(w: WebWorld, scene: string) {
  for (let i = 0; i < 40; i++) {
    const id = await sceneId(w);
    if (id === scene) return;
    const auto = id ? AUTO[id] : undefined;
    const before = id;
    if (auto) await auto(w);
    else {
      const next = named(w, "Continue");
      if ((await next.count()) === 0) assert.fail(`stuck on the scene "${id}" on the way to "${scene}"`);
      await next.click();
    }
    await w.page.waitForFunction((was) => document.querySelector("[data-stage-scene]")?.getAttribute("data-stage-scene") !== was, before, { timeout: 5000 }).catch(() => undefined);
  }
  assert.fail(`never reached the scene "${scene}"`);
}

async function openAt(w: WebWorld, lesson: string, scene: string | null, o: Opening = {}) {
  if (o.size) await w.page.setViewportSize({ width: o.size[0], height: o.size[1] });
  if (o.reduced) await w.page.emulateMedia({ reducedMotion: "reduce" });
  if (o.theme) await w.page.addInitScript(([theme, mode]) => localStorage.setItem("sierrendipity:settings:last", JSON.stringify({ theme, mode })), o.theme);
  await w.openLab(`?lesson=${encodeURIComponent(lesson)}&testclock`);
  await w.page.locator("[data-coach-panel]").waitFor();
  await stageRoot(w).waitFor();
  if (scene) await reachScene(w, scene);
}

Given("the coach lab shows lesson {string} at the scene {string}", async function (this: WebWorld, lesson: string, scene: string) {
  await openAt(this, lesson, scene);
});
Given("the coach lab shows lesson {string} at the scene {string} with reduced motion", async function (this: WebWorld, lesson: string, scene: string) {
  await openAt(this, lesson, scene, { reduced: true });
});
Given("the coach lab shows lesson {string} in the {string} theme and {word} mode at the scene {string}", async function (this: WebWorld, lesson: string, theme: string, mode: string, scene: string) {
  await openAt(this, lesson, scene, { theme: [theme, mode] });
});
Given("the coach lab shows lesson {string} at {int} by {int} at the scene {string}", async function (this: WebWorld, lesson: string, width: number, height: number, scene: string) {
  await openAt(this, lesson, scene, { size: [width, height] });
});

// ---------------------------------------------------------------- the machine view and the player

Then("the stage is the real machine view", async function (this: WebWorld) {
  await coachId(this, "diagram:D1").waitFor();
  assert.equal(await this.page.locator("[data-lesson-player] [data-flip]").count(), 0);
  assert.ok((await this.page.locator("[data-lesson-player] [data-card-index]").count()) >= 1, "no cards drawn by the machine view");
});
Then("the stage shows {string}", async function (this: WebWorld, id: string) {
  await coachId(this, id).first().waitFor();
});
Then("the stage does not show {string}", async function (this: WebWorld, id: string) {
  await settle(this);
  assert.equal(await coachId(this, id).count(), 0);
});
Then("the end of the list is shown as {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-lesson-player] [data-end-marker]", { hasText: text }).waitFor();
});

/** The player's own numbers (data-live-*) against what the diagram draws. */
Then("the diagram agrees with the player", async function (this: WebWorld) {
  await settle(this);
  const seen = await this.page.evaluate(() => {
    const stage = document.querySelector("[data-stage-scene]")!;
    const boxes = [...stage.querySelectorAll<HTMLElement>("[data-box]")].map((b) => ({
      name: (b.getAttribute("data-coach-id") ?? "").replace("box:", ""),
      text: (b.querySelector("[data-value]")?.textContent ?? "").trim(),
    }));
    const hand = stage.querySelector("[data-pointer-hand]")?.getAttribute("data-address");
    return {
      steps: Number(stage.getAttribute("data-live-steps")),
      position: Number(stage.getAttribute("data-timeline-position")),
      live: (stage.getAttribute("data-live-boxes") ?? "").split(",").filter(Boolean),
      pc: Number(stage.getAttribute("data-live-pc")),
      boxes,
      hand: hand === null || hand === undefined ? null : Number(hand),
    };
  });
  assert.equal(seen.position, seen.steps, "the diagram is not at the player's step");
  for (const entry of seen.live) {
    const [name, value] = entry.split("=") as [string, string];
    const drawn = seen.boxes.find((b) => b.name === name);
    if (!drawn) continue;
    // A box nothing has been put in shows a dash; the player's number for it is 0.
    const shown = /^-?\d+$/.test(drawn.text) ? Number(drawn.text) : 0;
    assert.equal(shown, Number(value), `box ${name}: the diagram shows "${drawn.text}", the player holds ${value}`);
  }
  if (seen.hand !== null) assert.equal(seen.hand, seen.pc * 4, "the pointing hand is not where the player's program counter is");
});
Then("the timeline is at step {int}", async function (this: WebWorld, n: number) {
  await this.page.waitForFunction((want) => Number(document.querySelector("[data-stage-scene]")?.getAttribute("data-timeline-position")) === want, n);
});
Then("box {string} is empty", async function (this: WebWorld, name: string) {
  await this.page.locator(`[data-coach-id="box:${name}"] [data-value]`, { hasText: "–" }).waitFor();
});
Then("the player's cards are {string}", async function (this: WebWorld, words: string) {
  const want = words.replace(/\s+/g, "");
  await this.page.waitForFunction((w) => (document.querySelector("[data-stage-scene]")?.getAttribute("data-live-words") ?? "") === w, want, { timeout: 5000 }).catch(async () => {
    assert.equal(await stageRoot(this).getAttribute("data-live-words"), want);
  });
});
Then("the player has {int} cards", async function (this: WebWorld, n: number) {
  await this.page.waitForFunction((count) => (document.querySelector("[data-stage-scene]")?.getAttribute("data-live-words") ?? "").split(",").filter(Boolean).length === count, n);
});
Then("the coach is on the scene {string}", async function (this: WebWorld, id: string) {
  await this.page.locator(`[data-stage-scene="${id}"]`).waitFor();
});
Then("no coach reply is shown", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-coach-reply]").count(), 0);
});

When("I play the lesson to the end answering {word}", async function (this: WebWorld, given: string) {
  for (let i = 0; i < 40; i++) {
    if ((await this.page.locator("[data-coach-end]").count()) > 0) return;
    const cont = named(this, "Continue");
    const field = this.page.locator("[data-coach-panel]").getByLabel("Your answer");
    if ((await cont.count()) > 0) await cont.click();
    else if ((await field.count()) > 0) {
      assert.notEqual(given, "-", "the lesson asked a question but no answer was given");
      await answer(this, given);
    } else {
      const step = named(this, "Step");
      if ((await step.getAttribute("aria-disabled")) === "true") assert.fail("the lesson is stuck: Step has nothing to do");
      await step.click();
    }
    await settle(this);
  }
  await this.page.locator("[data-coach-end]").waitFor();
});

// Token, clock and log

When("the diagram clock is frozen at {float}", async function (this: WebWorld, t: number) {
  await this.page.evaluate((value) => (window as unknown as { __diagramClock: { set(t: number): void } }).__diagramClock.set(value), t);
});
Then("a token carrying {int} is flying", async function (this: WebWorld, value: number) {
  await this.page.locator("[data-lesson-player] [data-token]", { hasText: new RegExp(`^${value}$`) }).waitFor();
});
Then("no token is flying", async function (this: WebWorld) {
  await settle(this);
  assert.equal(await this.page.locator("[data-lesson-player] [data-token]").count(), 0);
});
Then("the diagram says {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-lesson-player] [data-log]", { hasText: text }).waitFor();
});
Then("the pointing hand is at address {int}", async function (this: WebWorld, address: number) {
  await this.page.locator(`[data-lesson-player] [data-pointer-hand][data-address="${address}"]`).first().waitFor();
});
Then("the pixel screen has pixel {int} painted with color {int}", async function (this: WebWorld, pixel: number, color: number) {
  await this.page.locator(`[data-lesson-player] [aria-label^="pixel (${Math.floor(pixel / 16)}, ${pixel % 16}) = color ${color} "]`).waitFor();
});

// The timeline

Then("the timeline scrubber is shown", async function (this: WebWorld) {
  await player(this).getByRole("slider", { name: "Position" }).waitFor();
});
Then("the scrubber reads {string}", async function (this: WebWorld, text: string) {
  assert.equal(await player(this).getByRole("slider", { name: "Position" }).getAttribute("aria-valuetext"), text);
});
When("I move the scrubber to {int}", async function (this: WebWorld, n: number) {
  await player(this).getByRole("slider", { name: "Position" }).fill(String(n));
});
When("I press Run on the timeline", async function (this: WebWorld) {
  await named(this, "Run").click();
});
When("I press Pause on the timeline", async function (this: WebWorld) {
  await named(this, "Pause").click();
});
Then("the Run button is back", async function (this: WebWorld) {
  await named(this, "Run").waitFor();
});

// ---------------------------------------------------------------- lamps, flip, bands, builder

// A locked lamp is aria-disabled, which Playwright treats as "not clickable": a student can still try, so force it.
When("I switch lamp {int}", async function (this: WebWorld, bit: number) {
  await lamp(this, bit).click({ force: true });
});
When("I click lamp {int}", async function (this: WebWorld, bit: number) {
  await lamp(this, bit).click({ force: true });
});
const lampState = (w: WebWorld, bit: number) => lamp(w, bit).evaluate((el) => ({ on: el.getAttribute("aria-checked") === "true", locked: el.getAttribute("aria-disabled") === "true" }));
Then("lamp {int} is lit", async function (this: WebWorld, bit: number) {
  await lamp(this, bit).and(this.page.locator('[aria-checked="true"]')).waitFor();
});
Then("lamp {int} is dark", async function (this: WebWorld, bit: number) {
  await lamp(this, bit).and(this.page.locator('[aria-checked="false"]')).waitFor();
});
Then("lamp {int} is locked", async function (this: WebWorld, bit: number) {
  assert.equal((await lampState(this, bit)).locked, true);
});
Then("lamp {int} is not locked", async function (this: WebWorld, bit: number) {
  assert.equal((await lampState(this, bit)).locked, false);
});
Then("the lamps name the card {string}", async function (this: WebWorld, text: string) {
  await this.page.locator("[data-lesson-player] [data-lamps-card]", { hasText: text }).waitFor();
});
Then("the lamps add up to {int}", async function (this: WebWorld, n: number) {
  await this.page.locator("[data-lesson-player] [data-total]", { hasText: `add up to ${n}` }).waitFor();
});
Then("the lamps ask for a target of {int}", async function (this: WebWorld, n: number) {
  await this.page.locator("[data-lesson-player] [data-lamps-target]", { hasText: String(n) }).waitFor();
});

When("I choose the view {string}", async function (this: WebWorld, name: string) {
  await coachId(this, "flip").getByRole("button", { name, exact: true }).click();
});
Then("the flipped card shows the lamps", async function (this: WebWorld) {
  await coachId(this, "flip").locator('[data-lens-face="lamps"] [data-bit]').first().waitFor();
});
Then("the flipped card shows {string}", async function (this: WebWorld, text: string) {
  await coachId(this, "flip").locator("[data-lens-face]", { hasText: text }).waitFor();
});
Then("the card flip is instant", async function (this: WebWorld) {
  await coachId(this, "flip").locator('[data-flip="instant"]').waitFor();
});

When("I click the band {string}", async function (this: WebWorld, field: string) {
  await coachId(this, `band:${field}`).click();
});
When("I focus the band {string} and press Enter", async function (this: WebWorld, field: string) {
  await coachId(this, `band:${field}`).focus();
  await this.page.keyboard.press("Enter");
});
When("I click the Step button", async function (this: WebWorld) {
  await named(this, "Step").click({ force: true });
});
When("I click the card {int}", async function (this: WebWorld, n: number) {
  await coachId(this, `card:${n - 1}`).click();
});

/** Drag with real pointer events, in small steps so dnd-kit's sensors see a drag and not a click. */
async function dragTo(w: WebWorld, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  assert.ok(from && to, "drag source and target must be visible");
  const { mouse } = w.page;
  await mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await mouse.down();
  await mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 4 });
  await mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 12), { steps: 14 });
  await mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 12) + 1, { steps: 2 });
  await mouse.up();
}
When("I drag the tray card {string} into the lesson's program", async function (this: WebWorld, name: string) {
  await dragTo(this, coachId(this, "tray").getByRole("button", { name, exact: true }), player(this).getByTestId("drop-end"));
});

// ---------------------------------------------------------------- the ghost

Then("the ghost pointer is on {string}", async function (this: WebWorld, target: string) {
  await this.page.locator(`[data-ghost-pointer][data-target="${target}"]`).waitFor();
});

// ---------------------------------------------------------------- keyboard

When("I type {string} in the answer box and press the Enter key", async function (this: WebWorld, text: string) {
  await this.page.keyboard.type(text);
  await this.page.keyboard.press("Enter");
});
When("I press the ArrowRight key {int} times", async function (this: WebWorld, n: number) {
  for (let i = 0; i < n; i++) await this.page.keyboard.press("ArrowRight");
});
When("I press the Space key", async function (this: WebWorld) {
  await this.page.keyboard.press("Space");
});
When("I shift-tab until the focus is on {string}", async function (this: WebWorld, name: string) {
  for (let i = 0; i < 40; i++) {
    const label = await this.page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute("aria-label") ?? el.textContent ?? "").trim() : "";
    });
    if (label === name) return;
    await this.page.keyboard.press("Shift+Tab");
  }
  assert.fail(`never reached "${name}" with Shift+Tab`);
});

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

Then("the first thing the Tab key reaches in the lesson is in the coach panel", async function (this: WebWorld) {
  const first = await this.page.evaluate((selector) => {
    const el = document.querySelector("[data-lesson-player]")!.querySelector<HTMLElement>(selector);
    return el?.closest("[data-coach-panel]") !== null && el !== null;
  }, TABBABLE);
  assert.ok(first, "the first tabbable thing of the lesson is not in the coach panel");
});
Then("the tab order of the lesson is the coach panel, then Step, Back and Reset, then the cards", async function (this: WebWorld) {
  const order = await this.page.evaluate((selector) => {
    const kinds: string[] = [];
    for (const el of document.querySelector("[data-lesson-player]")!.querySelectorAll<HTMLElement>(selector)) {
      if (el.tabIndex < 0) continue;
      const id = el.getAttribute("data-coach-id") ?? "";
      const kind = el.closest("[data-coach-panel]") ? "coach" : /^button:(step|back|reset)$/.test(id) ? id.replace("button:", "") : el.closest('[data-coach-id^="card:"]') ? "cards" : "other";
      if (kinds.at(-1) !== kind) kinds.push(kind);
    }
    return kinds;
  }, TABBABLE);
  assert.deepEqual(order.slice(0, 5), ["coach", "step", "back", "reset", "cards"], `the order is ${order.join(", ")}`);
});
Then("the boxes come after the cards in the page", async function (this: WebWorld) {
  const after = await this.page.evaluate(() => {
    const card = document.querySelector('[data-lesson-player] [data-coach-id="card:0"]')!;
    const box = document.querySelector('[data-lesson-player] [data-coach-id="box:a0"]')!;
    return !!(card.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.ok(after, "box a0 comes before card 1 in the page");
});
Then("every button and spinner of the stage has an accessible name", async function (this: WebWorld) {
  const unnamed = await this.page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-lesson-player] section button, [data-lesson-player] section [role='spinbutton'], [data-lesson-player] section input")]
      .filter((el) => !(el.getAttribute("aria-label") ?? el.textContent ?? "").trim())
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  assert.deepEqual(unnamed, []);
});

// ---------------------------------------------------------------- contrast and layout

async function paint(w: WebWorld, selector: string) {
  return w.page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest(".sr-only") && !el.closest("[aria-disabled='true']");
      })
      .map((el) => {
        const layers: string[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) layers.unshift(getComputedStyle(n).backgroundColor);
        const s = getComputedStyle(el);
        return { color: s.color, border: s.borderTopColor, borderWidth: parseFloat(s.borderTopWidth), layers, text: (el.textContent ?? "").trim().slice(0, 30), size: parseFloat(s.fontSize), weight: Number(s.fontWeight) };
      }),
  );
}
function ratioOf(color: string, layers: string[]): number {
  let background: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers) background = composite(parseColor(layer), background);
  return contrastRatio(color, toHex(background));
}
/** The page behind the element: every layer except the element's own. */
const behind = (layers: string[]) => layers.slice(0, -1);

Then("the stage text meets {float}:1 contrast", async function (this: WebWorld, min: number) {
  // Elements of the stage that hold their own text.
  const items = await this.page.locator("[data-lesson-player] section *").evaluateAll((els) =>
    els
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !el.closest(".sr-only") && !el.closest("[aria-disabled='true']") && !el.closest("[role='tooltip']") && !el.hasAttribute("data-token");
      })
      .map((el) => {
        const layers: string[] = [];
        for (let n: Element | null = el; n; n = n.parentElement) layers.unshift(getComputedStyle(n).backgroundColor);
        return { color: getComputedStyle(el).color, layers, text: (el.textContent ?? "").trim().slice(0, 30) };
      }),
  );
  assert.ok(items.length >= 3, "expected stage text to check");
  const failures = items.filter((i) => ratioOf(i.color, i.layers) < min).map((i) => `"${i.text}" is ${ratioOf(i.color, i.layers).toFixed(2)}:1`);
  assert.deepEqual(failures, []);
});
Then("the stage controls meet {float}:1 contrast", async function (this: WebWorld, min: number) {
  const items = await paint(this, "[data-lesson-player] section button, [data-lesson-player] section input[role='spinbutton']");
  assert.ok(items.length >= 3);
  const failures = items.filter((i) => ratioOf(i.border, behind(i.layers)) < min && ratioOf(i.color, i.layers) < 4.5).map((i) => `"${i.text}"`);
  assert.deepEqual(failures, []);
});
Then("the lamps meet {float}:1 contrast", async function (this: WebWorld, min: number) {
  const items = await paint(this, "[data-lesson-player] [role='switch']");
  assert.ok(items.length >= 20, "expected lamps to check");
  const failures = items.filter((i) => i.borderWidth < 2 || ratioOf(i.border, behind(i.layers)) < min).map((i) => `${i.text}: ${i.border}`);
  assert.deepEqual(failures, []);
});
Then("the stage has nothing wider than the window", async function (this: WebWorld) {
  const wide = await this.page.evaluate(() => {
    const limit = window.innerWidth + 1;
    return [...document.querySelectorAll<HTMLElement>("[data-lesson-player] section *")]
      .filter((el) => !el.closest(".sr-only") && !el.closest("[role='tooltip']") && !el.closest("[role='log']"))
      .filter((el) => el.getBoundingClientRect().right > limit)
      .map((el) => `${el.tagName} ${el.getAttribute("data-coach-id") ?? el.className.toString().slice(0, 40)}`)
      .slice(0, 5);
  });
  assert.deepEqual(wide, []);
});

// ---------------------------------------------------------------- progress

Then("the stored progress of {string} asked {int} predictions and got {int} right", async function (this: WebWorld, id: string, asked: number, right: number) {
  let last: unknown;
  for (let i = 0; i < 40; i++) {
    const raw = await this.page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
    last = raw ? (JSON.parse(raw) as { lessons: Record<string, Record<string, unknown>> }).lessons[id] : undefined;
    const p = last as { predictionsAsked?: number; predictionsCorrect?: number } | undefined;
    if (p?.predictionsAsked === asked && p.predictionsCorrect === right) return;
    await this.page.waitForTimeout(50);
  }
  assert.fail(`expected ${asked} asked, ${right} right, stored: ${JSON.stringify(last)}`);
});

// ---------------------------------------------------------------- drafts and the real course

let catalogIds: string[] = [];
When("I read the catalog of the real course", async function (this: WebWorld) {
  const response = await fetch(`${this.appUrl}/catalog.json`);
  assert.equal(response.ok, true);
  catalogIds = ((await response.json()) as { lessons: { id: string }[] }).lessons.map((l) => l.id);
});
Then("the catalog lists {string}", (id: string) => assert.ok(catalogIds.includes(id), catalogIds.join(", ")));
Then("the catalog does not list {string}", (id: string) => assert.ok(!catalogIds.includes(id), `${id} is in the catalog`));

When("I open the real course at {string}", async function (this: WebWorld, pathAndQuery: string) {
  await this.page.route("**/config.json", (route) => route.fulfill({ json: { devBackend: this.mock.url } }));
  await this.page.goto(`${this.appUrl}${pathAndQuery}`);
});
Then("I do not see {string}", async function (this: WebWorld, text: string) {
  await settle(this);
  assert.equal(await this.page.getByText(text).count(), 0, `"${text}" is on the page`);
});

let scratchBuild: string | undefined;
After(async () => {
  if (scratchBuild) await rm(scratchBuild, { recursive: true, force: true });
  scratchBuild = undefined;
});
When("I build the web app for production into a scratch folder", { timeout: 240_000 }, async function (this: WebWorld) {
  scratchBuild = await mkdtemp(path.join(tmpdir(), "sierr-prod-"));
  const env = { ...process.env };
  delete env.VITE_DEV_TOOLS;
  await new Promise<void>((resolve, reject) =>
    execFile("npx", ["vite", "build", "--outDir", scratchBuild!, "--emptyOutDir"], { cwd: path.join(root, "web"), env }, (error, _out, err) => (error ? reject(new Error(`production build failed:\n${err}`)) : resolve())),
  );
});
async function filesOf(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesOf(full)));
    else if (/\.(js|html|json|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const holds = async (text: string) => {
  for (const file of await filesOf(scratchBuild!)) if ((await readFile(file, "utf8")).includes(text)) return file;
  return null;
};
Then("no file of that build holds {string}", async (text: string) => {
  const file = await holds(text);
  assert.equal(file, null, `${text} is in ${file}`);
});
Then("a file of that build holds {string}", async (text: string) => {
  assert.ok(await holds(text), `${text} is in no file of the build`);
});
void hex;
