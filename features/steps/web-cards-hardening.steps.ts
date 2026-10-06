import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { decode } from "../../explorer/src/decode";
import { buildProgram } from "../../web/src/cards/build";
import { makeCard, type Card, type CardKind } from "../../web/src/cards/model";
import { contrastRatio } from "../../web/src/theme/contrast";
import type { WebWorld } from "../support/web-world";

const programCard = (w: WebWorld, n: number) => w.page.getByTestId("program-card").nth(n - 1);
const button = (w: WebWorld, name: string) => w.page.getByRole("button", { name, exact: true });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function eventually(check: () => Promise<void>, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
}

async function loadJson(w: WebWorld, json: string) {
  await w.page.getByLabel("Program JSON").fill(json);
  await button(w, "Load JSON").click();
}

const file = (cards: unknown[], customCards: unknown[] = []) => JSON.stringify({ version: 1, cards, customCards });

// Loading hostile or careless programs

When("I load a saved program of {int} {string} cards", async function (this: WebWorld, count: number, kind: string) {
  await loadJson(this, file(Array.from({ length: count }, () => makeCard(kind as CardKind))));
});

When("I load a saved program whose custom card is named {string}", async function (this: WebWorld, name: string) {
  const body = [makeCard("put", { n: 5 }), makeCard("add-number", { n: 1 })];
  await loadJson(this, file([{ kind: "custom", word: 0, params: { name } }], [{ name, cards: body }]));
});

When("I load a saved program with a jump of 0 cards", async function (this: WebWorld) {
  await loadJson(this, file([{ kind: "jump-if-different", word: 0, params: { a: "a0", b: "a1", offset: 0 } }]));
});

When("I load a saved program that puts 5 in box {string}", async function (this: WebWorld, box: string) {
  await loadJson(this, file([{ kind: "put", word: 0, params: { box, n: 5 } }]));
});

Then("the tray is still shown", async function (this: WebWorld) {
  await this.page.getByTestId("tray").waitFor();
  assert.ok((await this.page.getByTestId("tray-card").count()) > 0);
});

// Numbers

Then("the number box of program card {int} shows {string}", async function (this: WebWorld, n: number, text: string) {
  assert.equal(await programCard(this, n).getByRole("spinbutton").inputValue(), text);
});

Then("program card {int} shows the number error {string}", async function (this: WebWorld, n: number, text: string) {
  await eventually(async () => assert.equal(await programCard(this, n).getByTestId("number-error").innerText(), text));
});

Then("program card {int} shows the jump warning {string}", async function (this: WebWorld, n: number, text: string) {
  await eventually(async () => assert.equal(await programCard(this, n).getByTestId("jump-warning").innerText(), text));
});

Then("program card {int} shows the shelf warning {string}", async function (this: WebWorld, n: number, text: string) {
  await eventually(async () => assert.equal(await programCard(this, n).getByTestId("shelf-warning").innerText(), text));
});

Then("program card {int} shows no shelf warning", async function (this: WebWorld, n: number) {
  assert.equal(await programCard(this, n).getByTestId("shelf-warning").count(), 0);
});

Then("picker {int} of program card {int} offers only boxes a0 to a7 and t0 to t6", async function (this: WebWorld, picker: number, n: number) {
  const options = await programCard(this, n).getByRole("combobox").nth(picker - 1).locator("option").allInnerTexts();
  const expected = [..."01234567"].map((i) => `a${i}`).concat([..."0123456"].map((i) => `t${i}`));
  assert.deepEqual(options, expected);
});

// Build errors

Then("the build error {string} is shown", async function (this: WebWorld, text: string) {
  await eventually(async () => assert.match(await this.page.getByTestId("build-errors").innerText(), new RegExp(escape(text))));
});

Then("the build error list is empty", async function (this: WebWorld) {
  await eventually(async () => assert.equal(await this.page.getByTestId("build-errors").count(), 0));
});

Then("no accepted random program jumps out of range", function () {
  let seed = 12345;
  const random = (n: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) % n;
  };
  const kinds: CardKind[] = ["put", "add-number", "add-boxes", "subtract-boxes", "multiply", "jump-if-different", "jump-if-smaller", "stop"];
  let accepted = 0;
  let rejected = 0;
  for (let round = 0; round < 500; round++) {
    const cards: Card[] = Array.from({ length: 1 + random(8) }, () => {
      const kind = kinds[random(kinds.length)]!;
      const offset = (random(2) === 0 ? -1 : 1) * (1 + random(9));
      return makeCard(kind, kind.startsWith("jump") ? { offset } : {});
    });
    const built = buildProgram(cards);
    if (built.errors.length > 0) {
      rejected++;
      continue;
    }
    accepted++;
    cards.forEach((card, i) => {
      if (!card.kind.startsWith("jump")) return;
      const word = built.words[i]!;
      const text = decode(word)!.text;
      const offset = Number(text.split(",").pop());
      const target = (i * 4 + offset) / 4;
      assert.ok(target >= 0 && target <= cards.length, `card ${i + 1} of ${cards.length} jumps to ${target}`);
    });
  }
  assert.ok(accepted > 50 && rejected > 50, `accepted ${accepted}, rejected ${rejected}`);
});

// Buttons, focus and shortcuts

Then("the {string} button is disabled", async function (this: WebWorld, name: string) {
  await eventually(async () => assert.equal(await button(this, name).isDisabled(), true));
});

When("I press the {string} button {int} times", async function (this: WebWorld, name: string, times: number) {
  for (let i = 0; i < times; i++) await button(this, name).click();
});

Then("the tray has no custom card {string}", async function (this: WebWorld, name: string) {
  await eventually(async () => {
    const labels = await this.page.getByTestId("tray-card").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? ""));
    assert.ok(!labels.some((l) => l.startsWith(`${name}, `)), labels.join(" | "));
  });
});

Then("the focused element is a tray card", async function (this: WebWorld) {
  await eventually(async () =>
    assert.equal(await this.page.evaluate(`document.activeElement?.hasAttribute("data-tray-index") === true`), true),
  );
});

When("I focus the {string} button", async function (this: WebWorld, name: string) {
  await button(this, name).focus();
});

When("I put focus on nothing", async function (this: WebWorld) {
  await this.page.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
});

When("I press the undo shortcut without focusing a card", async function (this: WebWorld) {
  await this.page.keyboard.press("ControlOrMeta+z");
});

When("I press the undo shortcut in the number of program card {int}", async function (this: WebWorld, n: number) {
  await programCard(this, n).getByRole("spinbutton").press("ControlOrMeta+z");
});

// Layout and announcements

Given("the window is {int} pixels wide", async function (this: WebWorld, width: number) {
  await this.page.setViewportSize({ width, height: 900 });
});

Then("the buttons of program card {int} are inside the window", async function (this: WebWorld, n: number) {
  const width = this.page.viewportSize()!.width;
  const buttons = programCard(this, n).getByRole("button");
  const count = await buttons.count();
  assert.ok(count >= 4);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width, `button ${i} is at ${box?.x}+${box?.width} in a ${width}px window`);
  }
});

Then("the screen reader is told {string}", async function (this: WebWorld, text: string) {
  await eventually(async () => {
    const said = await this.page.locator("[role=status]").allInnerTexts();
    assert.ok(said.some((s) => s.includes(text)), JSON.stringify(said));
  });
});

// Contrast of the input slot

Then("the input slot of the custom gallery card has contrast of at least {float} on its card", async function (this: WebWorld, min: number) {
  const seen = await this.page.getByTestId("custom-gallery").getByTestId("input-slot").first().evaluate((el) => {
    const face = el.closest('[data-testid="card-face"]')!;
    return { colour: getComputedStyle(el).color, background: getComputedStyle(face).backgroundColor };
  });
  const ratio = contrastRatio(seen.colour, seen.background);
  assert.ok(ratio >= min, `input slot ${seen.colour} on ${seen.background} is ${ratio.toFixed(2)}:1`);
});
