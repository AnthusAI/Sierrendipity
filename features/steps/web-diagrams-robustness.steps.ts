import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { contrastRatio } from "../../web/src/theme/contrast";
import { resolveTheme, type Mode, type ThemeName } from "../../web/src/theme/palette";
import { PIXEL_PALETTE } from "../../web/src/diagrams/palette";
import type { WebWorld } from "../support/web-world";

const demo = (w: WebWorld, name: string) => w.page.getByRole("group", { name, exact: true });
const button = (w: WebWorld, name: string, label: string) => demo(w, name).getByRole("button", { name: label, exact: true });
const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

async function eventually(check: () => Promise<void>, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

// Custom programs on the lab: ?program=<assembly with ; between lines>&boxes=a0,a1&hideEnd=0&limit=300

async function openProgram(w: WebWorld, program: string, boxes: string, extra = "") {
  const query = `?testclock&program=${encodeURIComponent(program)}&boxes=${encodeURIComponent(boxes.replace(/\s/g, ""))}${extra}`;
  await w.openLab(query);
}

Given("the lab runs the program {string} with the boxes {string}", async function (this: WebWorld, program: string, boxes: string) {
  await openProgram(this, program, boxes);
});

Given(
  "the lab runs the program {string} with the boxes {string} and no hidden end",
  async function (this: WebWorld, program: string, boxes: string) {
    await openProgram(this, program, boxes, "&hideEnd=0");
  },
);

Given(
  "the lab runs the program {string} with the boxes {string} and a limit of {int} steps",
  async function (this: WebWorld, program: string, boxes: string, limit: number) {
    await openProgram(this, program, boxes, `&limit=${limit}`);
  },
);

Given("the window is {int} px wide", async function (this: WebWorld, width: number) {
  await this.page.setViewportSize({ width, height: 900 });
});

// Logs, notices and controls

Then("the {string} log does not say {string}", async function (this: WebWorld, name: string, sentence: string) {
  await demo(this, name).locator("[data-log]").waitFor();
  const log = clean(await demo(this, name).locator("[data-log]").textContent());
  assert.ok(!log.includes(sentence), `did not expect "${sentence}" in the log: ${log}`);
});

Then("the {string} log has at most {int} entries", async function (this: WebWorld, name: string, max: number) {
  const count = await demo(this, name).locator("[data-log] li").count();
  assert.ok(count <= max && count > 0, `${count} log entries`);
});

Then("the {string} demo shows the stop notice in {int} places", async function (this: WebWorld, name: string, places: number) {
  await eventually(async () => assert.equal(await demo(this, name).locator("[data-notice]").count(), places));
  for (const text of await demo(this, name).locator("[data-notice]").allTextContents()) assert.match(text, /The machine stopped/);
});

Then("the {word} button of the {string} demo is enabled", async function (this: WebWorld, label: string, name: string) {
  assert.equal(await button(this, name, label).isEnabled(), true);
});

When("I press Back in the {string} demo", async function (this: WebWorld, name: string) {
  await button(this, name, "Back").click();
});

Then("the page has no errors", async function (this: WebWorld) {
  assert.deepEqual(this.pageErrors, []);
});

Then("the {string} demo announces {string}", async function (this: WebWorld, name: string, text: string) {
  await eventually(async () => assert.equal(clean(await demo(this, name).locator("[data-announce]").textContent()), text));
});

// Keyboard

When("I press Enter {int} times on the focused control", async function (this: WebWorld, times: number) {
  for (let i = 0; i < times; i++) await this.page.keyboard.press("Enter");
});

When("I press Enter on the focused control", async function (this: WebWorld) {
  await this.page.keyboard.press("Enter");
});

When("I press Shift+Tab", async function (this: WebWorld) {
  await this.page.keyboard.press("Shift+Tab");
});

Then("the focused control is the {string} button of the {string} demo", async function (this: WebWorld, label: string, name: string) {
  const focused = await button(this, name, label).evaluate((el) => el === document.activeElement);
  assert.equal(focused, true, `focus is on ${await this.page.evaluate("document.activeElement && document.activeElement.tagName")}`);
});

// Accessible text

Then("box {word} of the {string} demo is announced as empty", async function (this: WebWorld, reg: string, name: string) {
  const box = demo(this, name).getByRole("group", { name: `Box ${reg}`, exact: true });
  assert.match(clean(await box.textContent()), /empty/);
});

Then("the Position scrubber of the {string} demo says {string}", async function (this: WebWorld, name: string, text: string) {
  assert.equal(await demo(this, name).getByRole("slider", { name: "Position" }).getAttribute("aria-valuetext"), text);
});

Then("box {word} of the {string} demo is the current change", async function (this: WebWorld, reg: string, name: string) {
  const box = demo(this, name).getByRole("group", { name: `Box ${reg}`, exact: true });
  assert.equal(await box.getAttribute("aria-current"), "true");
});

Then("card {int} of the {string} demo is the current card", async function (this: WebWorld, n: number, name: string) {
  assert.equal(await demo(this, name).locator(`[data-card-index="${n - 1}"]`).getAttribute("aria-current"), "true");
});

Then("the most recent pixel of the {string} demo is the current change", async function (this: WebWorld, name: string) {
  assert.equal(await demo(this, name).locator('[data-pixel][data-latest="true"]').getAttribute("aria-current"), "true");
});

// Pixels

Then("the {string} demo has {int} most recent pixels", async function (this: WebWorld, name: string, count: number) {
  await eventually(async () => assert.equal(await demo(this, name).locator('[data-pixel][data-latest="true"]').count(), count));
});

Then("the legend of the {string} demo explains the {string} color", async function (this: WebWorld, name: string, label: string) {
  const entry = demo(this, name).locator('[data-legend] [data-color="other"]');
  assert.equal(await entry.count(), 1);
  assert.match(clean(await entry.textContent()), new RegExp(`${label}.*(16|255)`));
});

// Layout

Then("the page does not scroll sideways", async function (this: WebWorld) {
  const { scroll, width } = (await this.page.evaluate(
    `({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth })`,
  )) as { scroll: number; width: number };
  const wide = (await this.page.evaluate(
    `[...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6).map((el) => el.tagName + "." + String(el.className).slice(0, 60) + " right=" + Math.round(el.getBoundingClientRect().right))`,
  )) as string[];
  assert.ok(scroll <= width, `the page is ${scroll}px wide in a ${width}px window; too wide: ${wide.join(" | ")}`);
});

Then("no card text of the {string} demo spills out of its card", async function (this: WebWorld, name: string) {
  const spills = await demo(this, name)
    .locator("[data-card]")
    .evaluateAll((cards) =>
      cards.flatMap((card) => {
        const box = card.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(card);
        const text = range.getBoundingClientRect();
        const bad = text.left < box.left - 1 || text.right > box.right + 1 || text.top < box.top - 1 || text.bottom > box.bottom + 1;
        return bad ? [`${card.textContent}: text ${Math.round(text.left)}-${Math.round(text.right)} x ${Math.round(text.top)}-${Math.round(text.bottom)} in card ${Math.round(box.left)}-${Math.round(box.right)} x ${Math.round(box.top)}-${Math.round(box.bottom)}`] : [];
      }),
    );
  assert.deepEqual(spills, []);
});

Then("the pixel screen of the {string} demo fits its window", async function (this: WebWorld, name: string) {
  const screen = demo(this, name).getByRole("group", { name: "Pixel screen", exact: true });
  const rect = (await screen.boundingBox())!;
  const width = (await this.page.viewportSize())!.width;
  assert.ok(rect.x >= 0 && rect.x + rect.width <= width, `the screen spans ${rect.x}-${rect.x + rect.width} in ${width}px`);
  assert.ok(Math.abs(rect.width - rect.height) <= 2, `the screen is ${rect.width} x ${rect.height}, not square`);
});

// The palette (pure)

const lab = (hex: string) => {
  const lin = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = lin;
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

/** [hue 0-360, saturation 0-100, lightness 0-100] */
const hsl = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
};

const between = (h: number, lo: number, hi: number) => h >= lo && h <= hi;
/** What each label must look like, as a test on [hue, saturation, lightness]. */
const LOOKS: Record<string, (h: number, s: number, l: number) => boolean> = {
  blank: (_h, s, l) => s < 25 && (l > 80 || l < 25),
  blue: (h, s) => between(h, 198, 216) && s > 60,
  orange: (h, s) => between(h, 10, 40) && s > 80,
  green: (h, s) => between(h, 125, 170) && s > 30,
  purple: (h) => between(h, 255, 295),
  red: (h, s) => (h >= 345 || h <= 8) && s > 55,
  cyan: (h, _s, l) => between(h, 183, 200) && l < 62,
  yellow: (h, s, l) => between(h, 45, 66) && s > 80 && l > 45,
  pink: (h) => between(h, 305, 340),
  lime: (h, s, l) => between(h, 70, 100) && s > 50 && l > 50,
  teal: (h, s) => between(h, 160, 185) && s > 50,
  brown: (h, s, l) => between(h, 15, 45) && s < 55 && l < 60,
  indigo: (h) => between(h, 218, 245),
  grey: (_h, s, l) => s < 10 && l > 25 && l < 70,
  black: (_h, _s, l) => l < 10,
  sky: (h, _s, l) => between(h, 183, 205) && l > 65,
};

Then("the 16 pixel colors of {string} {word} are all clearly different", function (theme: string, mode: string) {
  const colors = resolveTheme(theme as ThemeName, mode as Mode);
  const fills = PIXEL_PALETTE.map((c) => colors[`pixel-${c.value}`]);
  assert.equal(fills.length, 16);
  const close: string[] = [];
  for (let i = 0; i < 16; i++) {
    assert.ok(fills[i], `no token pixel-${i}`);
    for (let j = i + 1; j < 16; j++) {
      const distance = Math.hypot(...lab(fills[i]).map((v, k) => v - lab(fills[j])[k]));
      if (distance < 15) close.push(`${PIXEL_PALETTE[i].label} and ${PIXEL_PALETTE[j].label} are only ${distance.toFixed(1)} apart`);
    }
  }
  assert.deepEqual(close, []);
});

Then("each of the 16 pixel colors of {string} {word} looks like its label", function (theme: string, mode: string) {
  const colors = resolveTheme(theme as ThemeName, mode as Mode);
  const wrong = PIXEL_PALETTE.flatMap((c) => {
    const fill = colors[`pixel-${c.value}`];
    const [h, s, l] = hsl(fill);
    return LOOKS[c.label]?.(h, s, l) ? [] : [`${c.label} is ${fill} (hue ${Math.round(h)}, saturation ${Math.round(s)}, lightness ${Math.round(l)})`];
  });
  assert.deepEqual(wrong, []);
});

Then("the number printed on each pixel color of {string} {word} is readable", function (theme: string, mode: string) {
  const colors = resolveTheme(theme as ThemeName, mode as Mode);
  const poor = PIXEL_PALETTE.flatMap((c) => {
    const ratio = contrastRatio(colors[`pixel-${c.value}-fg`], colors[`pixel-${c.value}`]);
    return ratio >= 4.5 ? [] : [`${c.label}: ${ratio.toFixed(2)}:1`];
  });
  assert.deepEqual(poor, []);
});
