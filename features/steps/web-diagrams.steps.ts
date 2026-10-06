import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { composite, contrastRatio, parseColor, toHex } from "../../web/src/theme/contrast";
import { resolveTheme, type Mode, type ThemeName } from "../../web/src/theme/palette";
import type { WebWorld } from "../support/web-world";

// The component lab at /lab shows each diagram in a labelled group ("demo"); these steps drive them like a student.

const demo = (w: WebWorld, name: string) => w.page.getByRole("group", { name, exact: true });
const button = (w: WebWorld, name: string, label: string) => demo(w, name).getByRole("button", { name: label, exact: true });
const box = (w: WebWorld, name: string, reg: string) => demo(w, name).getByRole("group", { name: `Box ${reg}`, exact: true });
const rgb = (hex: string) => {
  const c = parseColor(hex);
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
};

/** Retry an assertion until it holds (React renders and the clock settle asynchronously). */
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

const text = async (locator: ReturnType<typeof demo>) => ((await locator.textContent()) ?? "").replace(/\s+/g, " ").trim();

// Opening the lab

Given("the component lab is open", async function (this: WebWorld) {
  await this.openLab();
});

Given("the component lab is open with the test clock", async function (this: WebWorld) {
  await this.openLab("?testclock");
});

Given(
  "the component lab is open with the test clock in the {string} theme and {word} mode",
  async function (this: WebWorld, theme: string, mode: string) {
    await this.page.addInitScript(
      `localStorage.setItem("sierrendipity:settings:last", JSON.stringify({ theme: "${theme}", mode: "${mode}" }))`,
    );
    await this.openLab("?testclock");
  },
);

When("the theme of the page changes to {string}", async function (this: WebWorld, theme: string) {
  await this.page.evaluate(`document.documentElement.setAttribute("data-theme", "${theme}")`);
});

// Controls

When("I press Step in the {string} demo", async function (this: WebWorld, name: string) {
  await button(this, name, "Step").click();
});

When("I press Step in the {string} demo {int} times", async function (this: WebWorld, name: string, times: number) {
  for (let i = 0; i < times; i++) await button(this, name, "Step").click();
});

When("I press Play in the {string} demo", async function (this: WebWorld, name: string) {
  await button(this, name, "Play").click();
});

When("I press Reset in the {string} demo", async function (this: WebWorld, name: string) {
  await button(this, name, "Reset").click();
});

When("I scrub the {string} demo to {int}", async function (this: WebWorld, name: string, position: number) {
  await demo(this, name).getByRole("slider", { name: "Position" }).fill(String(position));
});

When("I choose the speed {string} in the {string} demo", async function (this: WebWorld, speed: string, name: string) {
  await demo(this, name).getByRole("combobox", { name: "Speed" }).selectOption({ label: speed });
});

When("I set the test clock to {float}", async function (this: WebWorld, t: number) {
  await this.page.evaluate(`window.__diagramClock.set(${t})`);
});

When(
  "I focus the {word} {word} of the {string} demo and press {word}",
  async function (this: WebWorld, control: string, kind: string, name: string, key: string) {
    const target =
      kind === "button"
        ? button(this, name, control)
        : demo(this, name).getByRole("slider", { name: control });
    await target.focus();
    await this.page.keyboard.press(key);
  },
);

// What the boxes, cards and log show

Then(
  /^the "([^"]*)" demo shows box (\w+) as "([^"]*)"((?:, box \w+ as "[^"]*")*)(?: and box (\w+) as "([^"]*)")?$/,
  async function (this: WebWorld, name: string, reg: string, value: string, more: string, lastReg?: string, lastValue?: string) {
    const expected: [string, string][] = [[reg, value]];
    for (const m of more.matchAll(/box (\w+) as "([^"]*)"/g)) expected.push([m[1], m[2]]);
    if (lastReg) expected.push([lastReg, lastValue!]);
    for (const [r, v] of expected) {
      await eventually(async () => assert.equal(await text(box(this, name, r).locator("[data-value]")), v, `box ${r}`));
    }
  },
);

Then("the {string} log says {string}", async function (this: WebWorld, name: string, sentence: string) {
  await eventually(async () => {
    const log = await text(demo(this, name).locator("[data-log]"));
    assert.ok(log.includes(sentence), `expected "${sentence}" in the log: ${log}`);
  });
});

Then("the {string} demo lists the cards {string}", async function (this: WebWorld, name: string, cards: string) {
  const items = await demo(this, name).locator("[data-card]").allTextContents();
  const clean = items.map((t) => t.replace(/\s+/g, " ").trim());
  const wanted = cards.split(" | ");
  assert.equal(clean.length, wanted.length, clean.join(" / "));
  wanted.forEach((card, i) => assert.ok(clean[i].includes(card), `card ${i}: "${clean[i]}" should include "${card}"`));
});

Then("the {string} demo reports {string}", async function (this: WebWorld, name: string, readout: string) {
  await eventually(async () => assert.equal(await text(demo(this, name).locator("[data-readout]")), readout));
});

Then("the Step button of the {string} demo is disabled", async function (this: WebWorld, name: string) {
  assert.equal(await button(this, name, "Step").isDisabled(), true);
});

Then("the {string} demo has a scrubber from {int} to {int}", async function (this: WebWorld, name: string, min: number, max: number) {
  const slider = demo(this, name).getByRole("slider", { name: "Position" });
  assert.equal(await slider.getAttribute("min"), String(min));
  assert.equal(await slider.getAttribute("max"), String(max));
});

Then(/^the "([^"]*)" demo shows the end of the list marker as (not )?reached$/, async function (this: WebWorld, name: string, not?: string) {
  const marker = demo(this, name).locator("[data-end-marker]");
  await marker.waitFor();
  assert.match(await text(marker), /end of the list/i);
  await eventually(async () => assert.equal(await marker.getAttribute("data-reached"), String(!not)));
});

Then("the {string} demo shows no Stop card", async function (this: WebWorld, name: string) {
  assert.doesNotMatch(await text(demo(this, name)), /\bStop\b/);
});

Then("the {string} demo has a box {word}", async function (this: WebWorld, name: string, reg: string) {
  await box(this, name, reg).waitFor();
});

Then("the {string} demo has no box {word}", async function (this: WebWorld, name: string, reg: string) {
  await demo(this, name).locator("[data-box]").first().waitFor();
  assert.equal(await box(this, name, reg).count(), 0);
});

Then("the {string} demo has a {word} button", async function (this: WebWorld, name: string, label: string) {
  await button(this, name, label).waitFor();
});

Then("the {string} demo has these named controls {string}", async function (this: WebWorld, name: string, names: string) {
  const d = demo(this, name);
  for (const label of names.split(", ")) {
    const control = d.getByRole(/^(Speed|Position)$/.test(label) ? (label === "Speed" ? "combobox" : "slider") : "button", { name: label, exact: true });
    assert.equal(await control.count(), 1, `control ${label}`);
  }
});

// Tokens, highlight and motion

Then("the {string} demo shows a flying token holding {string}", async function (this: WebWorld, name: string, value: string) {
  const token = demo(this, name).locator("[data-token]");
  await token.waitFor();
  assert.equal(await text(token), value);
});

Then("the {string} demo shows no flying token", async function (this: WebWorld, name: string) {
  await eventually(async () => assert.equal(await demo(this, name).locator("[data-token]").count(), 0));
});

Then("no animation is running on any token", async function (this: WebWorld) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const running = await this.page.evaluate(
    `document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("[data-token]")).length`,
  );
  assert.equal(running, 0);
  assert.equal(await this.page.locator("[data-token]").count(), 0);
});

Then("box {word} of the {string} demo is highlighted as changed", async function (this: WebWorld, reg: string, name: string) {
  await eventually(async () => assert.equal(await box(this, name, reg).getAttribute("data-changed"), "true"));
});

// Pointing hand, heartbeat

Then("the {string} demo has no pointing hand", async function (this: WebWorld, name: string) {
  await demo(this, name).locator("[data-card]").first().waitFor();
  assert.equal(await demo(this, name).locator("[data-pointer-hand]").count(), 0);
});

Then("the {string} demo has a pointing hand at address {int}", async function (this: WebWorld, name: string, address: number) {
  await eventually(async () =>
    assert.equal(await demo(this, name).locator("[data-pointer-hand]").getAttribute("data-address"), String(address)),
  );
});

Then("the {string} demo labels the cards with the addresses {string}", async function (this: WebWorld, name: string, addresses: string) {
  const labels = await demo(this, name).locator("[data-card] [data-address-label]").allTextContents();
  assert.equal(labels.map((l) => l.trim()).join(", "), addresses);
});

const stationStates = (w: WebWorld, name: string) =>
  demo(w, name)
    .locator("[data-station]")
    .evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute("data-station"), e.getAttribute("data-state")])));

Then(
  "the {string} demo has the station {string} lit and the stations {string} waiting",
  async function (this: WebWorld, name: string, lit: string, waiting: string) {
    await eventually(async () => {
      const states = await stationStates(this, name);
      assert.equal(states[lit], "lit", JSON.stringify(states));
      for (const s of waiting.split(", ")) assert.equal(states[s], "waiting", JSON.stringify(states));
    });
  },
);

Then("the {string} demo has the station {string} lit", async function (this: WebWorld, name: string, lit: string) {
  await eventually(async () => {
    const states = await stationStates(this, name);
    assert.deepEqual(
      Object.entries(states).filter(([, s]) => s === "lit").map(([n]) => n),
      [lit],
      JSON.stringify(states),
    );
  });
});

Then("the {string} demo has all stations done", async function (this: WebWorld, name: string) {
  await eventually(async () => {
    const states = await stationStates(this, name);
    assert.deepEqual(Object.values(states), ["done", "done", "done"], JSON.stringify(states));
  });
});

Then("the {string} demo shows the card {string}", async function (this: WebWorld, name: string, card: string) {
  assert.equal(await text(demo(this, name).locator("[data-heartbeat-card]")), card);
});

Then("the {string} demo says the arrow points at address {int}", async function (this: WebWorld, name: string, address: number) {
  assert.match(await text(demo(this, name).locator("[data-arrow]")), new RegExp(`points at address ${address}\\b`));
});

// Pixel display

const pixel = (w: WebWorld, name: string, row: number, col: number) =>
  demo(w, name).locator(`[data-pixel][data-row="${row}"][data-col="${col}"]`);

Then("the {string} demo shows pixel \\({int}, {int}) as color {int}", async function (this: WebWorld, name: string, row: number, col: number, color: number) {
  await eventually(async () => {
    assert.equal(await pixel(this, name, row, col).getAttribute("data-color"), String(color));
    assert.match((await pixel(this, name, row, col).getAttribute("aria-label")) ?? "", new RegExp(`^pixel \\(${row}, ${col}\\) = color ${color}\\b`));
  });
});

Then(
  "the {string} demo shows pixel \\({int}, {int}) as color {int} named {string}",
  async function (this: WebWorld, name: string, row: number, col: number, color: number, label: string) {
    await eventually(async () =>
      assert.equal(await pixel(this, name, row, col).getAttribute("aria-label"), `pixel (${row}, ${col}) = color ${color} (${label})`),
    );
  },
);

Then("the most recent pixel of the {string} demo is \\({int}, {int})", async function (this: WebWorld, name: string, row: number, col: number) {
  await eventually(async () => {
    const latest = demo(this, name).locator('[data-pixel][data-latest="true"]');
    assert.equal(await latest.count(), 1);
    assert.equal(await latest.getAttribute("data-row"), String(row));
    assert.equal(await latest.getAttribute("data-col"), String(col));
  });
});

Then("the {string} demo has no most recent pixel", async function (this: WebWorld, name: string) {
  await eventually(async () => assert.equal(await demo(this, name).locator('[data-pixel][data-latest="true"]').count(), 0));
});

Then("the {string} demo has pixels from \\({int}, {int}) to \\({int}, {int})", async function (this: WebWorld, name: string, r0: number, c0: number, r1: number, c1: number) {
  assert.equal(await pixel(this, name, r0, c0).count(), 1);
  assert.equal(await pixel(this, name, r1, c1).count(), 1);
  assert.equal(await demo(this, name).locator("[data-pixel]").count(), (r1 - r0 + 1) * (c1 - c0 + 1));
});

Then("the {string} demo has no pixel \\({int}, {int})", async function (this: WebWorld, name: string, row: number, col: number) {
  assert.equal(await pixel(this, name, row, col).count(), 0);
});

Then(
  "the legend of the {string} demo lists {int} colors with the text label {string} for color {int}",
  async function (this: WebWorld, name: string, count: number, label: string, color: number) {
    const items = demo(this, name).locator('[data-legend] [data-color]:not([data-color="other"])');
    assert.equal(await items.count(), count);
    const item = demo(this, name).locator(`[data-legend] [data-color="${color}"]`);
    assert.match(await text(item), new RegExp(`\\b${color}\\b.*\\b${label}\\b`));
  },
);

// Theme tokens and contrast

interface Sample {
  what: string;
  fg: string;
  stack: string[];
}

/** Computed text color and the stack of backgrounds behind each element matching `selector`, outermost first. */
const sampleScript = (scope: string, selector: string) => `(() => {
  const root = document.querySelector(${JSON.stringify(scope)});
  return [...root.querySelectorAll(${JSON.stringify(selector)})].map((el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") stack.unshift(bg);
      if (/^rgb\\(/.test(bg) || /, 1\\)$/.test(bg)) break;
    }
    return { what: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40), fg: getComputedStyle(el).color, stack };
  });
})()`;

async function demoSelector(w: WebWorld, name: string) {
  // A stable CSS handle for the group, so the sampler can run inside the page.
  await demo(w, name).evaluate((el, label) => el.setAttribute("data-demo", label), name);
  return `[data-demo="${name}"]`;
}

function checkContrast(samples: Sample[], min: number, label: string) {
  const failures: string[] = [];
  for (const s of samples) {
    const bg = s.stack.map(parseColor).reduce((under, top) => composite(top, under), parseColor("#ffffff"));
    const ratio = contrastRatio(s.fg, toHex(bg));
    if (ratio < min) failures.push(`${s.what}: ${s.fg} on ${toHex(bg)} is ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, [], `${label} below ${min}:1\n${failures.join("\n")}`);
}

Then("the diagram text and token colors of the {string} demo meet WCAG AA", async function (this: WebWorld, name: string) {
  const scope = await demoSelector(this, name);
  const samples = (await this.page.evaluate(
    sampleScript(scope, "[data-card], [data-box-label], [data-value], [data-log], [data-end-marker], [data-token], [data-readout]"),
  )) as Sample[];
  assert.ok(samples.length >= 8, `expected to sample the diagram, got ${samples.length}`);
  assert.ok(samples.some((s) => s.what === "5"), "the flying token was not sampled");
  checkContrast(samples, 4.5, "diagram text");
});

Then("the pixel legend of the {string} demo meets WCAG AA", async function (this: WebWorld, name: string) {
  const scope = await demoSelector(this, name);
  const samples = (await this.page.evaluate(sampleScript(scope, "[data-legend] [data-swatch], [data-legend] [data-color]"))) as Sample[];
  assert.ok(samples.length >= 34, `expected 16 swatches, 16 labels and the other entry, got ${samples.length}`);
  checkContrast(samples, 4.5, "pixel legend");
});

Then(
  "pixel \\({int}, {int}) of the {string} demo is painted with the token {string} of {string} {word}",
  async function (this: WebWorld, row: number, col: number, name: string, token: string, theme: string, mode: string) {
    const expected = rgb(resolveTheme(theme as ThemeName, mode as Mode)[token]);
    await eventually(async () => {
      const seen = await pixel(this, name, row, col).evaluate((el) => getComputedStyle(el).backgroundColor);
      assert.equal(seen, expected);
    });
  },
);

Then("the {int} palette colors of the {string} demo are all different", async function (this: WebWorld, count: number, name: string) {
  const colors = await demo(this, name).locator('[data-legend] [data-swatch]:not([data-swatch="other"])').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  assert.equal(colors.length, count);
  assert.equal(new Set(colors).size, count, colors.join(" "));
});

Then(
  "the {string} demo surface uses the token {string} of {string} {word}",
  async function (this: WebWorld, name: string, token: string, theme: string, mode: string) {
    const expected = rgb(resolveTheme(theme as ThemeName, mode as Mode)[token]);
    await eventually(async () => {
      const seen = await demo(this, name).locator("[data-diagram-surface]").first().evaluate((el) => getComputedStyle(el).backgroundColor);
      assert.equal(seen, expected);
    });
  },
);
