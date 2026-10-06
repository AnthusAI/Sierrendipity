import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { Locator } from "playwright";
import { contrastRatio } from "../../web/src/theme/contrast";
import { resolveTheme, type Mode, type ThemeName } from "../../web/src/theme/palette";
import type { WebWorld } from "../support/web-world";

/** A function to run in the page, built from a string (tsx-compiled closures reference helpers the page lacks). */
const inPage = <T>(args: string, body: string) => new Function(args, body) as (...values: never[]) => T;

/** Retry an assertion until it holds. */
async function eventually(check: () => Promise<void>, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

const group = (w: WebWorld, name: string) => w.page.getByRole("group", { name, exact: true });
const lamp = (w: WebWorld, name: string, bit: number) =>
  group(w, name).getByRole("switch", { name: new RegExp(`^bit ${bit},`) });
const band = (w: WebWorld, name: string, label: string) => group(w, name).locator(`[data-band][data-label="${label}"]`).first();
const rWord = (w: WebWorld, format: string) => group(w, `Field bands for ${format} word`);
const num = (text: string) => Number(text.replace(/\D/g, ""));
const words = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

Given("the lamp lab is open", async function (this: WebWorld) {
  await this.openLab();
});

// Lamps

/** Click lamps until exactly the bits of `value` are lit. */
async function lightExactly(w: WebWorld, name: string, value: number) {
  const lamps = group(w, name).getByRole("switch");
  const count = await lamps.count();
  for (let bit = 0; bit < count; bit++) {
    const wanted = Math.floor(value / 2 ** bit) % 2 === 1;
    const target = lamp(w, name, bit);
    const lit = (await target.getAttribute("aria-checked")) === "true";
    if (lit !== wanted) await target.click();
  }
}

When("I light exactly the lamps for {int} in {string}", async function (this: WebWorld, value: number, name: string) {
  await lightExactly(this, name, value);
});

Then("{string} says the lit lamps add up to {int}", async function (this: WebWorld, name: string, value: number) {
  await group(this, name).getByText(`Lit lamps add up to ${value}`, { exact: true }).waitFor({ timeout: 5000 });
});

Then("{string} reads as the signed number {int}", async function (this: WebWorld, name: string, value: number) {
  await group(this, name).getByText(`Read as a signed number: ${value}`, { exact: true }).waitFor({ timeout: 5000 });
});

Then("{string} has {int} lamps", async function (this: WebWorld, name: string, count: number) {
  assert.equal(await group(this, name).getByRole("switch").count(), count);
});

Then("{string} has {int} groups of lamps", async function (this: WebWorld, name: string, count: number) {
  assert.equal(await group(this, name).locator("[data-lamp-group]").count(), count);
});

Then("lamp {int} of {string} is named {string}", async function (this: WebWorld, bit: number, name: string, accessible: string) {
  assert.equal(await lamp(this, name, bit).getAttribute("aria-label"), accessible);
});

Then("lamp {int} of {string} is the rightmost lamp", async function (this: WebWorld, bit: number, name: string) {
  const boxes = await group(this, name).getByRole("switch").evaluateAll(inPage("els", "return els.map((e) => e.getBoundingClientRect().right);"));
  const mine = (await lamp(this, name, bit).boundingBox())!;
  assert.equal(Math.max(...(boxes as number[])), mine.x + mine.width);
});

Then("lamp {int} of {string} is the leftmost lamp", async function (this: WebWorld, bit: number, name: string) {
  const boxes = await group(this, name).getByRole("switch").evaluateAll(inPage("els", "return els.map((e) => e.getBoundingClientRect().left);"));
  const mine = (await lamp(this, name, bit).boundingBox())!;
  assert.equal(Math.min(...(boxes as number[])), mine.x);
});

Then("{string} shows the place value {string} under lamp {int}", async function (this: WebWorld, name: string, place: string, bit: number) {
  const cell = group(this, name).locator(`[data-bit="${bit}"] [data-place]`);
  assert.equal(await cell.getAttribute("data-place"), place);
  assert.ok(await cell.isVisible(), "the place value is visible");
});

When("I focus lamp {int} of {string}", async function (this: WebWorld, bit: number, name: string) {
  await lamp(this, name, bit).focus();
});

When("I hit the {string} key", async function (this: WebWorld, key: string) {
  await this.page.keyboard.press(key === "Space" ? " " : key);
});

Then("lamp {int} of {string} has the focus", async function (this: WebWorld, bit: number, name: string) {
  await eventually(async () => assert.ok(await lamp(this, name, bit).evaluate(inPage("e", "return e === document.activeElement;")) as boolean));
});

When("I click lamp {int} of {string}", async function (this: WebWorld, bit: number, name: string) {
  await lamp(this, name, bit).click();
});

Then("lamp {int} of {string} is lit", async function (this: WebWorld, bit: number, name: string) {
  assert.equal(await lamp(this, name, bit).getAttribute("aria-checked"), "true");
});

Then("lamp {int} of {string} is announced as read-only", async function (this: WebWorld, bit: number, name: string) {
  assert.equal(await lamp(this, name, bit).getAttribute("aria-readonly"), "true");
});

Then("lamp {int} of {string} can be switched", async function (this: WebWorld, bit: number, name: string) {
  assert.notEqual(await lamp(this, name, bit).getAttribute("aria-disabled"), "true");
});

Then("lamp {int} of {string} is announced as disabled", async function (this: WebWorld, bit: number, name: string) {
  assert.equal(await lamp(this, name, bit).getAttribute("aria-disabled"), "true");
});

Then("lamp {int} of {string} is visibly marked as locked", async function (this: WebWorld, bit: number, name: string) {
  const style = async (l: Locator) =>
    (await l.evaluate(inPage("e", "const s = getComputedStyle(e); return [s.borderStyle, s.backgroundColor, s.cursor].join('|');"))) as string;
  const locked = await style(lamp(this, name, bit));
  const open = await style(lamp(this, name, 30));
  assert.notEqual(locked, open, "a locked lamp looks the same as one that can be flipped");
  assert.equal(await lamp(this, name, bit).getAttribute("data-locked"), "true");
});

// Counter

const countersTotal = async (w: WebWorld, name: string) =>
  num(await group(w, name).getByText(/^Lit lamps add up to \d+$/).innerText());

Then("{string} keeps counting up by itself", async function (this: WebWorld, name: string) {
  const first = await countersTotal(this, name);
  await eventually(async () => assert.notEqual(await countersTotal(this, name), first), 8000);
});

When("I pause {string}", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: "Pause" }).click();
});

When("I reset {string}", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: "Reset" }).click();
});

When("I step {string} {int} times", async function (this: WebWorld, name: string, times: number) {
  for (let i = 0; i < times; i++) await group(this, name).getByRole("button", { name: "Step" }).click();
});

Then("{string} asks for the number {int}", async function (this: WebWorld, name: string, value: number) {
  await group(this, name).getByText(`Make the lamps add up to ${value}`, { exact: true }).waitFor({ timeout: 5000 });
});

Then("{string} is done", async function (this: WebWorld, name: string) {
  await group(this, name).getByText(/^Done! /).waitFor({ timeout: 5000 });
});

Then("{string} is not done", async function (this: WebWorld, name: string) {
  assert.equal(await group(this, name).getByText(/^Done! /).count(), 0);
});

// Carry ripple

const trace = (w: WebWorld, name: string) => group(w, name).getByRole("list", { name: "Trace" }).getByRole("listitem");

When("I take the next step in {string}", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: "Next step" }).click();
});

When("I take the previous step in {string}", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: "Previous step" }).click();
});

When("I start {string} over", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: "Start over" }).click();
});

When("I press play in {string}", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: "Play" }).click();
});

When("I play {string} to the end", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: "Play" }).click();
  await group(this, name).getByRole("status", { name: "Answer" }).waitFor({ timeout: 15_000 });
});

Then("{string} shows no steps yet", async function (this: WebWorld, name: string) {
  assert.equal(await trace(this, name).count(), 0);
  await group(this, name).getByText("No steps yet").waitFor();
});

Then("{string} shows {int} step", async function (this: WebWorld, name: string, count: number) {
  assert.equal(await trace(this, name).count(), count);
});

Then("{string} shows all {int} steps at once", async function (this: WebWorld, name: string, count: number) {
  await eventually(async () => assert.equal(await trace(this, name).count(), count), 1500);
});

Then("the trace of {string} is:", async function (this: WebWorld, name: string, table) {
  const expected = (table.raw() as string[][]).map((row) => row[0]!);
  await eventually(async () => assert.deepEqual((await trace(this, name).allInnerTexts()).map(words), expected));
});

Then("{string} announces the answer {string}", async function (this: WebWorld, name: string, answer: string) {
  const status = group(this, name).getByRole("status", { name: "Answer" });
  await eventually(async () => assert.match(words(await status.innerText()), new RegExp(`^Answer: ${answer.replace(/[+]/g, "\\+")}`)));
});

// Field bands

const bandsOf = (w: WebWorld, format: string) => rWord(w, format).locator("[data-band]");

interface BandInfo {
  hi: number;
  lo: number;
  label: string;
  field: string;
  bits: string;
  background: string;
  name: string;
}

async function readBands(w: WebWorld, scope: Locator): Promise<BandInfo[]> {
  void w;
  return (await scope.locator("[data-band]").evaluateAll(
    inPage(
      "els",
      `return els.map((e) => ({
        hi: Number(e.dataset.hi), lo: Number(e.dataset.lo), label: e.dataset.label, field: e.dataset.field,
        bits: e.querySelector("[data-band-bits]")?.textContent ?? "", background: getComputedStyle(e).backgroundColor,
        name: e.getAttribute("aria-label") ?? "",
      }));`,
    ),
  )) as BandInfo[];
}

const PLAIN = new Set(["what kind of job", "answer goes in box", "first box", "second box", "exact job", "the number", "how many places"]);

Then("the field bands of the {word} word tile bits 31 to 0 without gaps", async function (this: WebWorld, format: string) {
  const bands = await readBands(this, rWord(this, format));
  assert.ok(bands.length >= 3, "expected bands");
  let next = 31;
  for (const b of bands) {
    assert.equal(b.hi, next, `a band starts at bit ${b.hi}, expected ${next}`);
    next = b.lo - 1;
  }
  assert.equal(next, -1, "the bands stop before bit 0");
});

Then("every band of the {word} word has a plain-English label and shows its bits", async function (this: WebWorld, format: string) {
  for (const b of await readBands(this, rWord(this, format))) {
    assert.ok(PLAIN.has(b.label), `unexpected label "${b.label}"`);
    assert.match(b.bits, new RegExp(`^[01]{${b.hi - b.lo + 1}}$`));
  }
});

Then("the bands of the {word} word are labelled {}", async function (this: WebWorld, format: string, labels: string) {
  const seen = (await readBands(this, rWord(this, format))).map((b) => b.label);
  assert.deepEqual(seen, labels.split(", "));
});

Then("the number in the {word} word is split into {int} or fewer pieces under one label", async function (this: WebWorld, format: string, max: number) {
  const pieces = (await readBands(this, rWord(this, format))).filter((b) => b.field === "imm");
  assert.ok(pieces.length >= 2 && pieces.length <= max, `${pieces.length} pieces`);
  assert.ok(pieces.every((p) => p.label === "the number"));
});

Then("every piece of the number in the {word} word has the same colour", async function (this: WebWorld, format: string) {
  const pieces = (await readBands(this, rWord(this, format))).filter((b) => b.field === "imm");
  assert.equal(new Set(pieces.map((p) => p.background)).size, 1);
});

Then("the pieces of the number in the {word} word name their bit ranges", async function (this: WebWorld, format: string) {
  const pieces = (await readBands(this, rWord(this, format))).filter((b) => b.field === "imm");
  for (const p of pieces) assert.match(p.name, /^the number \(imm\): .*, bits? \d+/, p.name);
});

Then("the band {string} of the {word} word shows the meaning {string}", async function (this: WebWorld, label: string, format: string, meaning: string) {
  assert.equal(words(await band(this, `Field bands for ${format} word`, label).locator("[data-band-meaning]").innerText()), meaning);
});

Then("the band {string} of the {word} word is named {string}", async function (this: WebWorld, label: string, format: string, name: string) {
  assert.equal(await band(this, `Field bands for ${format} word`, label).getAttribute("aria-label"), name);
});

Then("the band {string} of the {word} word has a name containing {string}", async function (this: WebWorld, label: string, format: string, part: string) {
  const name = await band(this, `Field bands for ${format} word`, label).getAttribute("aria-label");
  assert.ok(name?.includes(part), `"${name}" lacks "${part}"`);
});

When("I point at the band {string} in {string}", async function (this: WebWorld, label: string, name: string) {
  await band(this, name, label).hover();
});

When("I tab to the band {string} in {string}", async function (this: WebWorld, label: string, name: string) {
  await band(this, name, label).focus();
});

When("I move away from the bands in {string}", async function (this: WebWorld) {
  await this.page.mouse.move(0, 0);
});

Then("{string} reports pointing at {string}", async function (this: WebWorld, name: string, field: string) {
  await group(this, name).getByText(`Pointing at: ${field}`, { exact: true }).waitFor({ timeout: 5000 });
});

Then("{string} reports pointing at nothing", async function (this: WebWorld, name: string) {
  await group(this, name).getByText("Pointing at: nothing", { exact: true }).waitFor({ timeout: 5000 });
});

Then("the highlighted words of the card in {string} are {string}", async function (this: WebWorld, name: string, expected: string) {
  const marks = group(this, name).getByRole("status", { name: "Card face" }).locator("[data-highlight]");
  await eventually(async () => assert.deepEqual((await marks.allInnerTexts()).map(words), expected.split(" and ")));
});

Then("the card in {string} has no highlighted words", async function (this: WebWorld, name: string) {
  const marks = group(this, name).getByRole("status", { name: "Card face" }).locator("[data-highlight]");
  await eventually(async () => assert.equal(await marks.count(), 0));
});

Then("{string} asks which band says which box gets the answer", async function (this: WebWorld, name: string) {
  await group(this, name).getByText("Click the band that says which box gets the answer").waitFor();
});

When("I click the band {string} in {string}", async function (this: WebWorld, label: string, name: string) {
  await band(this, name, label).click();
});

Then("{string} answers {string}", async function (this: WebWorld, name: string, answer: string) {
  await group(this, name).getByRole("status", { name: "Answer to the question" }).filter({ hasText: answer }).waitFor({ timeout: 5000 });
});

Then("{string} has no bands", async function (this: WebWorld, name: string) {
  assert.equal(await group(this, name).locator("[data-band]").count(), 0);
});

// Card flip

const lensButton = (w: WebWorld, name: string, view: string) => group(w, name).getByRole("button", { name: view, exact: true });
const face = (w: WebWorld, name: string) => group(w, name).locator("[data-lens-face]");

When("I flip {string} to {string}", async function (this: WebWorld, name: string, view: string) {
  await lensButton(this, name, view).click();
});

When("I press the flip button of {string}", async function (this: WebWorld, name: string) {
  await group(this, name).getByRole("button", { name: /^Flip to the next view/ }).click();
});

When("I press the flip button of {string} {int} times", async function (this: WebWorld, name: string, times: number) {
  for (let i = 0; i < times; i++) await group(this, name).getByRole("button", { name: /^Flip to the next view/ }).click();
});

When("I focus the {string} view button of {string}", async function (this: WebWorld, view: string, name: string) {
  await lensButton(this, name, view).focus();
});

Then("{string} shows the {string} view with the text {string}", async function (this: WebWorld, name: string, view: string, text: string) {
  await eventually(async () => {
    assert.equal(await face(this, name).getAttribute("data-lens-face"), view);
    assert.equal(words(await face(this, name).innerText()).includes(text), true, `view text: ${words(await face(this, name).innerText())}`);
  });
});

Then("{string} shows the {string} view with 32 lamps and labelled bands", async function (this: WebWorld, name: string, view: string) {
  await eventually(async () => assert.equal(await face(this, name).getAttribute("data-lens-face"), view));
  assert.equal(await face(this, name).getByRole("switch").count(), 32);
  const bands = await readBands(this, face(this, name));
  assert.ok(bands.length >= 3);
  assert.ok(bands.every((b) => PLAIN.has(b.label)));
});

Then("{string} explains hex as {string}", async function (this: WebWorld, name: string, caption: string) {
  await group(this, name).getByText(caption).waitFor();
});

Then("{string} offers exactly the views {string} and {string}", async function (this: WebWorld, name: string, a: string, b: string) {
  const buttons = group(this, name).locator("[data-lens-button]");
  assert.deepEqual((await buttons.allInnerTexts()).map(words), [a, b]);
});

Then("{string} reports the view {string} to the page", async function (this: WebWorld, name: string, view: string) {
  await this.page.getByText(`${name} view: ${view}`, { exact: true }).waitFor({ timeout: 5000 });
});

Then("{string} flips with an animation", async function (this: WebWorld, name: string) {
  assert.equal(await group(this, name).locator("[data-flip]").first().getAttribute("data-flip"), "animated");
  const animation = await face(this, name).evaluate(inPage("e", "return getComputedStyle(e).animationName;"));
  assert.notEqual(animation, "none");
});

Then("{string} flips instantly", async function (this: WebWorld, name: string) {
  assert.equal(await group(this, name).locator("[data-flip]").first().getAttribute("data-flip"), "instant");
  const animation = await face(this, name).evaluate(inPage("e", "return getComputedStyle(e).animationName;"));
  assert.equal(animation, "none");
});

// Word editor

const editor = (w: WebWorld, name: string) => group(w, name);

When("I switch bit {int} in {string}", async function (this: WebWorld, bit: number, name: string) {
  await lamp(this, name, bit).click();
});

Then("the card of {string} says {string}", async function (this: WebWorld, name: string, text: string) {
  const card = editor(this, name).getByRole("status", { name: "Card face" });
  await eventually(async () => assert.equal(words(await card.innerText()), text));
});

Then("the card of {string} starts with {string}", async function (this: WebWorld, name: string, text: string) {
  const card = editor(this, name).getByRole("status", { name: "Card face" });
  await eventually(async () => assert.ok(words(await card.innerText()).startsWith(text), words(await card.innerText())));
});

Then("the word of {string} is {word}", async function (this: WebWorld, name: string, hex: string) {
  await eventually(async () => assert.equal(words(await editor(this, name).locator("[data-word]").innerText()), hex));
});

Then("the assembly of {string} is {string}", async function (this: WebWorld, name: string, text: string) {
  await eventually(async () => assert.equal(words(await editor(this, name).locator("[data-assembly]").innerText()), text));
});

Then("the band {string} of {string} shows the meaning {string}", async function (this: WebWorld, label: string, name: string, meaning: string) {
  const target = band(this, name, label).locator("[data-band-meaning]");
  await eventually(async () => assert.equal(words(await target.innerText()), meaning));
});

// Themes and contrast

When("the lamp lab switches to the {string} theme in {word} mode", async function (this: WebWorld, theme: string, mode: string) {
  await this.page.evaluate(
    `(() => {
      const root = document.documentElement;
      root.setAttribute("data-theme", ${JSON.stringify(theme)});
      root.setAttribute("data-mode", ${JSON.stringify(mode)});
      root.classList.toggle("dark", ${JSON.stringify(mode)} === "dark");
    })()`,
  );
});

Then("every band of the R word is painted with a field token of {string} in {word} mode", async function (this: WebWorld, theme: string, mode: string) {
  const colors = resolveTheme(theme as ThemeName, mode as Mode);
  const tokens = [1, 2, 3, 4, 5, 6, 7].map((i) => colors[`field-${i}`]!);
  const toRgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  const allowed = new Set(tokens.map(toRgb));
  await eventually(async () => {
    for (const b of await readBands(this, rWord(this, "R"))) assert.ok(allowed.has(b.background), `${b.label} is ${b.background}`);
  });
});

Then("the bands of the R word have different colours for different labels", async function (this: WebWorld) {
  const byLabel = new Map<string, Set<string>>();
  for (const b of await readBands(this, rWord(this, "R"))) byLabel.set(b.label, (byLabel.get(b.label) ?? new Set()).add(b.background));
  for (const [label, colours] of byLabel) assert.equal(colours.size, 1, `${label} has several colours`);
  assert.equal(new Set([...byLabel.values()].map((c) => [...c][0])).size, byLabel.size, "two labels share a colour");
});

When("I note the colour of the band {string} in the {string} word", async function (this: WebWorld, label: string, format: string) {
  this.noted.band = (await readBands(this, rWord(this, format))).find((b) => b.label === label)!.background;
});

Then("the band {string} in the {string} word has a different colour from the one noted", async function (this: WebWorld, label: string, format: string) {
  await eventually(async () => {
    const now = (await readBands(this, rWord(this, format))).find((b) => b.label === label)!.background;
    assert.notEqual(now, this.noted.band);
  });
});

interface TextSample {
  text: string;
  color: string;
  background: string;
  size: number;
  weight: number;
}

Then("every piece of text in the lamps section meets WCAG AA", async function (this: WebWorld) {
  const samples = (await this.page.evaluate(`(() => {
    const section = document.querySelector('[data-lab-section*="lamps"]');
    const out = [];
    const rgba = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
    const background = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) layers.push(rgba(getComputedStyle(n).backgroundColor));
      let base = { r: 255, g: 255, b: 255 };
      for (const l of layers.reverse()) base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) };
      return "rgb(" + Math.round(base.r) + ", " + Math.round(base.g) + ", " + Math.round(base.b) + ")";
    };
    for (const el of section.querySelectorAll("*")) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
      if (!own) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const s = getComputedStyle(el);
      out.push({ text: own, color: s.color, background: background(el), size: parseFloat(s.fontSize), weight: Number(s.fontWeight) });
    }
    return out;
  })()`)) as TextSample[];
  assert.ok(samples.length > 50, `only ${samples.length} pieces of text found`);
  const failures: string[] = [];
  for (const s of samples) {
    const large = s.size >= 24 || (s.size >= 18.66 && s.weight >= 700);
    const ratio = contrastRatio(s.color, s.background);
    if (ratio < (large ? 3 : 4.5)) failures.push(`"${s.text.slice(0, 40)}" ${s.color} on ${s.background} is ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, []);
});
