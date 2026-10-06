import { Given, Then, When, type DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { Locator } from "playwright";
import { assemble } from "../../explorer/src/asm";
import { contrastRatio } from "../../web/src/theme/contrast";
import { LAST_KEY } from "../../web/src/settings";
import type { WebWorld } from "../support/web-world";

const hex = (word: number) => `0x${(word >>> 0).toString(16).padStart(8, "0")}`;

const tray = (w: WebWorld) => w.page.getByTestId("tray");
const programCard = (w: WebWorld, n: number) => w.page.getByTestId("program-card").nth(n - 1);
const faceOf = (w: WebWorld, n: number) => programCard(w, n).getByTestId("card-face").first();
const button = (w: WebWorld, name: string) => w.page.getByRole("button", { name, exact: true });
const galleryItem = (w: WebWorld, text: string) =>
  w.page.getByTestId("gallery-item").filter({ has: w.page.locator(`[data-testid="card-face"][aria-label="${text}"]`) });

/** Retry an assertion until it holds (React state updates and the machine run settle asynchronously). */
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

/** Drag with real pointer events, in small steps so dnd-kit's sensors see a drag and not a click. */
async function dragTo(w: WebWorld, source: Locator, target: Locator) {
  // The pointer can only reach what is on screen: centre the builder (dnd-kit auto-scrolls near the edges).
  await w.page.getByRole("region", { name: "Card tray" }).evaluate((el) => el.scrollIntoView({ block: "center" }));
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

Given("I open the cards lab", async function (this: WebWorld) {
  await this.openLab();
  await this.page.getByTestId("tray").waitFor();
});

Given("the cards appearance is the {string} theme in {word} mode", async function (this: WebWorld, theme: string, mode: string) {
  await this.page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [LAST_KEY, JSON.stringify({ theme, mode })] as const,
  );
});

// The gallery

Then("the gallery shows the card {string} with the word of {string}", async function (this: WebWorld, text: string, source: string) {
  const expected = assemble(source);
  assert.deepEqual(expected.errors, []);
  const item = galleryItem(this, text);
  assert.equal(await item.count(), 1, `one gallery card reads "${text}"`);
  assert.equal(await item.getByTestId("gallery-word").innerText(), hex(expected.words[0]!));
});

Then("every gallery card turns back into itself from its word", async function (this: WebWorld) {
  const items = this.page.getByTestId("gallery-item");
  assert.ok((await items.count()) >= 15);
  const states = await items.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-roundtrip")));
  assert.deepEqual([...new Set(states)], ["ok"]);
});

// The builder: tray

When("I add the tray card {string}", async function (this: WebWorld, name: string) {
  const card = tray(this).getByRole("button", { name, exact: true });
  await card.focus();
  await card.press("Enter");
});

When("I drag the tray card {string} to the program", async function (this: WebWorld, name: string) {
  await dragTo(this, tray(this).getByRole("button", { name, exact: true }), this.page.getByTestId("drop-end"));
});

When("I drag the tray card {string} onto program card {int}", async function (this: WebWorld, name: string, n: number) {
  await dragTo(this, tray(this).getByRole("button", { name, exact: true }), programCard(this, n));
});

When("I drag program card {int} onto program card {int}", async function (this: WebWorld, from: number, to: number) {
  await dragTo(this, programCard(this, from).getByRole("button", { name: `Drag card ${from}` }), programCard(this, to));
});

When("I lift program card {int} with the keyboard, move it up and drop it", async function (this: WebWorld, n: number) {
  const handle = programCard(this, n).getByRole("button", { name: `Drag card ${n}` });
  await handle.focus();
  await this.page.keyboard.press("Space");
  await this.page.keyboard.press("ArrowUp");
  // dnd-kit announces where the card is now; drop only once it has moved.
  await eventually(async () => {
    const said = await this.page.locator("[role=status]").allInnerTexts();
    assert.ok(said.some((t) => t.includes("Over card")), JSON.stringify(said));
  });
  await this.page.keyboard.press("Space");
});

Then("the tray has no Stop card", async function (this: WebWorld) {
  assert.equal(await tray(this).getByRole("button", { name: "Stop", exact: true }).count(), 0);
});

Then(
  "the tray has a custom card {string} with the input slot {string}",
  async function (this: WebWorld, name: string, slot: string) {
    const card = tray(this).getByRole("button", { name: `${name}, ${slot}`, exact: true });
    await card.waitFor();
    assert.ok((await card.innerText()).includes(slot));
  },
);

// The builder: program

Then("the builder program has these cards:", async function (this: WebWorld, table: DataTable) {
  const expected = table.raw().map((row) => row[0]);
  await eventually(async () => {
    const seen = await this.page
      .getByTestId("program-card")
      .evaluateAll((nodes) => nodes.map((n) => n.querySelector('[data-testid="card-face"]')?.getAttribute("aria-label")));
    assert.deepEqual(seen, expected);
  });
});

Then("the builder program has {int} cards", async function (this: WebWorld, count: number) {
  await eventually(async () => assert.equal(await this.page.getByTestId("program-card").count(), count));
});

Then("program card {int} reads {string}", async function (this: WebWorld, n: number, text: string) {
  await eventually(async () => assert.equal(await faceOf(this, n).getAttribute("aria-label"), text));
});

When("I focus program card {int}", async function (this: WebWorld, n: number) {
  await faceOf(this, n).focus();
});

Then("the focused element is named {string}", async function (this: WebWorld, name: string) {
  await eventually(async () => assert.equal(await this.page.evaluate(`document.activeElement?.getAttribute("aria-label")`), name));
});

Then("program card {int} shows no assembly", async function (this: WebWorld, n: number) {
  assert.equal(await programCard(this, n).getByTestId("assembly").count(), 0);
});

Then("program card {int} shows the assembly {string}", async function (this: WebWorld, n: number, text: string) {
  await eventually(async () => assert.equal(await programCard(this, n).getByTestId("assembly").first().innerText(), text));
});

When("I tick the lab option {string}", async function (this: WebWorld, name: string) {
  await this.page.getByRole("checkbox", { name }).check();
});

When("I untick the lab option {string}", async function (this: WebWorld, name: string) {
  await this.page.getByRole("checkbox", { name }).uncheck();
});

Given("the maximum number of cards is {int}", async function (this: WebWorld, max: number) {
  await this.page.getByLabel("Maximum cards").fill(String(max));
});

When("I click the {string} button in the builder", async function (this: WebWorld, name: string) {
  await button(this, name).click();
});

When("I press the undo shortcut", async function (this: WebWorld) {
  await this.page.getByTestId("program-card").last().getByTestId("card-face").first().focus();
  await this.page.keyboard.press("ControlOrMeta+z");
});

When("I press the redo shortcut", async function (this: WebWorld) {
  await this.page.getByTestId("program-card").last().getByTestId("card-face").first().focus();
  await this.page.keyboard.press("ControlOrMeta+Shift+z");
});

When("I remove every card from the program", async function (this: WebWorld) {
  while ((await this.page.getByTestId("program-card").count()) > 0) {
    await button(this, "Remove card 1").click();
  }
});

// The end of the list, messages and warnings

Then("I see the end of the list marker", async function (this: WebWorld) {
  await this.page.getByTestId("end-marker").waitFor();
  assert.match(await this.page.getByTestId("end-marker").innerText(), /the end of the list/i);
});

Then("I see no end of the list marker", async function (this: WebWorld) {
  assert.equal(await this.page.getByTestId("end-marker").count(), 0);
});

Then("the end of the list marker is the last row", async function (this: WebWorld) {
  const rows = this.page.getByRole("list", { name: "Program", exact: true }).locator("> li");
  const last = rows.last();
  assert.equal(await last.getAttribute("data-testid"), "end-marker");
});

Then("the builder shows the message {string}", async function (this: WebWorld, text: string) {
  await eventually(async () => {
    const shown = await this.page.locator('[data-testid="builder-message"], [data-testid="lab-message"]').allInnerTexts();
    assert.ok(shown.some((t) => t.includes(text)), `expected "${text}" in ${JSON.stringify(shown)}`);
  });
});

Then("the builder shows the warning {string}", async function (this: WebWorld, text: string) {
  await eventually(async () => assert.match(await this.page.getByTestId("builder-warning").innerText(), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

Then("the builder shows no warning", async function (this: WebWorld) {
  await eventually(async () => assert.equal(await this.page.getByTestId("builder-warning").count(), 0));
});

// Spinners and pickers

const spinner = (w: WebWorld, n: number) => programCard(w, n).getByRole("spinbutton");

Then("the number of program card {int} is announced as {string}", async function (this: WebWorld, n: number, announced: string) {
  const spin = spinner(this, n);
  const name = await spin.getAttribute("aria-label");
  const value = await spin.getAttribute("aria-valuenow");
  assert.equal(`${name}, ${value}`, announced);
});

When("I type {string} into the number of program card {int}", async function (this: WebWorld, text: string, n: number) {
  await spinner(this, n).fill(text);
});

When("I press {word} in the number of program card {int}", async function (this: WebWorld, key: string, n: number) {
  await spinner(this, n).press(key);
});

When("I press {word} in the number of program card {int} {int} times", async function (this: WebWorld, key: string, n: number, times: number) {
  for (let i = 0; i < times; i++) await spinner(this, n).press(key);
});

When("I choose box {string} in picker {int} of program card {int}", async function (this: WebWorld, box: string, picker: number, n: number) {
  await programCard(this, n).getByRole("combobox").nth(picker - 1).selectOption(box);
});

When("I press Tab until the tray card {string} is focused", async function (this: WebWorld, name: string) {
  for (let i = 0; i < 80; i++) {
    const label = await this.page.evaluate(
      `document.activeElement?.hasAttribute("data-tray-index") ? document.activeElement.getAttribute("aria-label") : ""`,
    );
    if (label === name) return;
    await this.page.keyboard.press("Tab");
  }
  assert.fail(`never reached the tray card "${name}"`);
});

When("I press Enter on the focused card", async function (this: WebWorld) {
  await this.page.keyboard.press("Enter");
});

// The program the lab built and the Machine that ran it

Then("the builder words are the assembly of:", async function (this: WebWorld, source: string) {
  const expected = assemble(source);
  assert.deepEqual(expected.errors, []);
  await eventually(async () => {
    const seen = await this.page.getByTestId("words").getByRole("listitem").allInnerTexts();
    assert.deepEqual(seen, expected.words.map(hex));
  });
});

Then(/^the builder words include (0x\w+), (0x\w+) and (0x\w+)$/, async function (this: WebWorld, a: string, b: string, c: string) {
  const seen = await this.page.getByTestId("words").getByRole("listitem").allInnerTexts();
  const padded = (x: string) => hex(parseInt(x, 16));
  for (const word of [a, b, c]) assert.ok(seen.includes(padded(word)), `${word} is in ${seen.join(" ")}`);
});

Then("the builder machine leaves box {word} holding {int}", async function (this: WebWorld, box: string, value: number) {
  await eventually(async () => assert.equal(await this.page.locator(`[data-testid="boxes"] [data-box="${box}"]`).innerText(), String(value)));
});

Then("the builder machine has halted", async function (this: WebWorld) {
  await eventually(async () => assert.equal(await this.page.getByTestId("machine-state").innerText(), "halted"));
});

Then("the builder machine trace shows a {string} and a {string}", async function (this: WebWorld, a: string, b: string) {
  const lines = await this.page.getByTestId("trace").getByRole("listitem").allInnerTexts();
  for (const mnemonic of [a, b]) {
    assert.ok(lines.some((l) => new RegExp(`\\b${mnemonic}\\s`).test(l)), `trace has ${mnemonic}: ${lines.join(" | ")}`);
  }
});

Then("the builder machine trace shows box a0 becoming {int}, {int} and {int} in that order", async function (this: WebWorld, a: number, b: number, c: number) {
  const lines = await this.page.getByTestId("trace").getByRole("listitem").allInnerTexts();
  let from = 0;
  for (const value of [a, b, c]) {
    const at = lines.findIndex((l, i) => i >= from && new RegExp(`a0 = ${value}(?!\\d)`).test(l));
    assert.ok(at >= 0, `a0 = ${value} after line ${from}: ${lines.join(" | ")}`);
    from = at + 1;
  }
});

// Building programs for the custom card specs

Given("I build the program {string}, {string} and {string}", async function (this: WebWorld, _a: string, _b: string, _c: string) {
  await this.page.getByRole("button", { name: "Put 5 in box a0", exact: true }).focus();
  await this.page.keyboard.press("Enter");
  await spinner(this, 1).fill("7");
  await tray(this).getByRole("button", { name: "Multiply box a0 by box a0, put the answer in box a0", exact: true }).focus();
  await this.page.keyboard.press("Enter");
  await tray(this).getByRole("button", { name: "Add 1 to box a0", exact: true }).focus();
  await this.page.keyboard.press("Enter");
  await eventually(async () => assert.equal(await this.page.getByTestId("program-card").count(), 3));
});

// Custom cards

async function select(w: WebWorld, numbers: number[]) {
  const toggle = button(w, "Select");
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  for (const n of numbers) await w.page.getByRole("checkbox", { name: `Select card ${n}` }).click();
}

When("I select program cards {int} to {int}", async function (this: WebWorld, from: number, to: number) {
  await select(this, Array.from({ length: to - from + 1 }, (_, i) => from + i));
});

When("I select program cards {int} and {int}", async function (this: WebWorld, a: number, b: number) {
  await select(this, [a, b]);
});

async function name(w: WebWorld, text: string) {
  const dialog = w.page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("textbox").fill(text);
  await dialog.getByRole("button", { name: "Save card", exact: true }).click();
}

When("I name the custom card {string}", async function (this: WebWorld, text: string) {
  await name(this, text);
});

When("I save program cards {int} to {int} as a custom card named {string}", async function (this: WebWorld, from: number, to: number, text: string) {
  await select(this, Array.from({ length: to - from + 1 }, (_, i) => from + i));
  await button(this, "Save as card").click();
  await name(this, text);
  await this.page.getByRole("dialog").waitFor({ state: "detached" });
});

Given("I have saved {int} custom cards", async function (this: WebWorld, count: number) {
  for (let k = 1; k <= count; k++) {
    const at = (await this.page.getByTestId("program-card").count()) + 1;
    await tray(this).getByRole("button", { name: "Put 5 in box a0", exact: true }).focus();
    await this.page.keyboard.press("Enter");
    await tray(this).getByRole("button", { name: "Add 1 to box a0", exact: true }).focus();
    await this.page.keyboard.press("Enter");
    await select(this, [at, at + 1]);
    await button(this, "Save as card").click();
    await name(this, `Card ${k}`);
    await this.page.getByRole("dialog").waitFor({ state: "detached" });
  }
});

Then("no name dialog is open", async function (this: WebWorld) {
  assert.equal(await this.page.getByRole("dialog").count(), 0);
});

Then("the name dialog says {string}", async function (this: WebWorld, text: string) {
  const dialog = this.page.getByRole("dialog");
  await eventually(async () => assert.match(await dialog.getByRole("alert").innerText(), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

When("I peek inside program card {int}", async function (this: WebWorld, n: number) {
  await programCard(this, n).getByRole("button", { name: "Peek inside" }).click();
});

Then("the peeked cards are:", async function (this: WebWorld, table: DataTable) {
  const expected = table.raw().map((row) => row[0]);
  const seen = await this.page
    .getByTestId("peek")
    .locator('[data-testid="card-face"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
  assert.deepEqual(seen, expected);
});

// JSON

When("I note the program JSON", async function (this: WebWorld) {
  this.noted["json"] = await this.page.getByLabel("Program JSON").inputValue();
  assert.ok(this.noted["json"]!.includes("Square-and-add-one"));
});

When("I load the noted program JSON", async function (this: WebWorld) {
  await this.page.getByLabel("Program JSON").fill(this.noted["json"]!);
  await button(this, "Load JSON").click();
});

When("I load this program JSON: {string}", async function (this: WebWorld, text: string) {
  await this.page.getByLabel("Program JSON").fill(text);
  await button(this, "Load JSON").click();
});

// Theme tokens

const partColours = (w: WebWorld, text: string, selector: string) =>
  galleryItem(w, text)
    .locator('[data-testid="card-face"]')
    .first()
    .evaluate(
      (face, sel) =>
        [...face.querySelectorAll(sel)].map((el) => ({
          part: el.getAttribute("data-part") ?? "chip",
          colour: getComputedStyle(el).color,
          background: getComputedStyle(face).backgroundColor,
        })),
      selector,
    );

Then(
  "every coloured part of the gallery card {string} has contrast of at least {float} on its card",
  async function (this: WebWorld, text: string, min: number) {
    const parts = await partColours(this, text, "[data-part]");
    const roles = new Set(parts.map((p) => p.part));
    assert.ok(["verb", "box", "text"].every((r) => roles.has(r)), `parts seen: ${[...roles]}`);
    for (const p of parts) {
      const ratio = contrastRatio(p.colour, p.background);
      assert.ok(ratio >= min, `${p.part} ${p.colour} on ${p.background} is ${ratio.toFixed(2)}:1`);
    }
  },
);

Then(
  "the assembly chip of the gallery card {string} has contrast of at least {float} on its card",
  async function (this: WebWorld, text: string, min: number) {
    const parts = await partColours(this, text, '[data-testid="assembly"]');
    assert.equal(parts.length, 1);
    const ratio = contrastRatio(parts[0]!.colour, parts[0]!.background);
    assert.ok(ratio >= min, `assembly chip is ${ratio.toFixed(2)}:1`);
  },
);

const verbColour = async (w: WebWorld, text: string) =>
  (await partColours(w, text, '[data-part="verb"]'))[0]!.colour;

When("I note the colour of the verb part of the gallery card {string}", async function (this: WebWorld, text: string) {
  this.noted["verb"] = await verbColour(this, text);
});

Then("the colour of the verb part of the gallery card {string} has changed", async function (this: WebWorld, text: string) {
  assert.notEqual(await verbColour(this, text), this.noted["verb"]);
});
