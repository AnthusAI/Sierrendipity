import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { contrastRatio, parseColor } from "../../web/src/theme/contrast";
import { FIELD_TOKENS, resolveTheme, type Mode, type ThemeName } from "../../web/src/theme/palette";
import type { WebWorld } from "../support/web-world";

/** A function to run in the page. Built from a string because tsx-compiled closures reference helpers the page lacks. */
const inPage = <T>(args: string, body: string) => new Function(args, body) as (...values: never[]) => T;
const radio = (w: WebWorld, name: string) => w.page.getByRole("radio", { name, exact: true });

/** Retry an assertion until it holds (themes apply in React effects, Monaco themes asynchronously). */
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

/** "rgb(12, 34, 56)" for a #rrggbb color, the way the browser reports computed colors. */
const rgb = (hex: string) => {
  const c = parseColor(hex);
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
};

async function appearance(w: WebWorld): Promise<{ theme: ThemeName; mode: Mode }> {
  return w.page.evaluate(`(() => ({
    theme: document.documentElement.dataset.theme,
    mode: document.documentElement.classList.contains("dark") ? "dark" : "light",
  }))()`) as Promise<{ theme: ThemeName; mode: Mode }>;
}

// System preference and the page's palette

Given("the system prefers a {word} color scheme", async function (this: WebWorld, scheme: string) {
  await this.page.emulateMedia({ colorScheme: scheme as "light" | "dark" });
});

When("the system switches to a {word} color scheme", async function (this: WebWorld, scheme: string) {
  await this.page.emulateMedia({ colorScheme: scheme as "light" | "dark" });
});

Given("the system prefers reduced motion", async function (this: WebWorld) {
  await this.page.emulateMedia({ reducedMotion: "reduce" });
});

Then("the {word} palette is applied", async function (this: WebWorld, mode: string) {
  await eventually(async () => {
    const { theme } = await appearance(this);
    const colors = resolveTheme(theme, mode as Mode);
    const seen = (await this.page.evaluate(`(() => ({
      dark: document.documentElement.classList.contains("dark"),
      mode: document.documentElement.dataset.mode,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      background: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
    }))()`)) as { dark: boolean; mode: string; scheme: string; background: string; color: string };
    assert.equal(seen.dark, mode === "dark", "the dark class");
    assert.equal(seen.mode, mode, "data-mode");
    assert.equal(seen.scheme, mode, "color-scheme");
    assert.equal(seen.background, rgb(colors.background), "page background");
    assert.equal(seen.color, rgb(colors.foreground), "page text color");
  });
});

Then("the color theme is {string}", async function (this: WebWorld, theme: string) {
  await eventually(async () => assert.equal((await appearance(this)).theme, theme));
});

Given("I mark the page so a reload would be noticed", async function (this: WebWorld) {
  await this.page.evaluate(`window.__sameDocument = true`);
});

Then("the page was not reloaded", async function (this: WebWorld) {
  assert.equal(await this.page.evaluate(`window.__sameDocument === true`), true);
});

// Settings dialog

When("I open Settings", async function (this: WebWorld) {
  await this.page.getByRole("button", { name: "Settings", exact: true }).click();
  await this.page.getByRole("dialog", { name: "Settings" }).waitFor();
});

When("I close Settings", async function (this: WebWorld) {
  await this.page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Close", exact: true }).first().click();
  await this.page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "detached" });
});

When("I choose the color theme {string}", async function (this: WebWorld, name: string) {
  await radio(this, name).click();
});

When("I choose the mode {string}", async function (this: WebWorld, name: string) {
  await radio(this, name).click();
});

Then("the mode {string} is chosen", async function (this: WebWorld, name: string) {
  await radio(this, name).and(this.page.locator('[aria-checked="true"]')).waitFor();
});

Then("the color theme {string} is chosen", async function (this: WebWorld, name: string) {
  await radio(this, name).and(this.page.locator('[aria-checked="true"]')).waitFor();
});

Then("Settings offers the modes {string}, {string} and {string}", async function (this: WebWorld, a: string, b: string, c: string) {
  const group = this.page.getByRole("radiogroup", { name: "Mode" });
  for (const name of [a, b, c]) await group.getByRole("radio", { name, exact: true }).waitFor();
});

Then(
  "Settings offers the color themes {string}, {string} and {string}",
  async function (this: WebWorld, a: string, b: string, c: string) {
    const group = this.page.getByRole("radiogroup", { name: "Color theme" });
    for (const name of [a, b, c]) await group.getByRole("radio", { name, exact: true }).waitFor();
  },
);

Then("the main screen has no light or dark control", async function (this: WebWorld) {
  await this.page.getByRole("button", { name: "Run", exact: true }).waitFor();
  const page = this.page;
  const names = /\b(light|dark|theme|mode|appearance|color)\b/i;
  assert.equal(await page.getByRole("button", { name: names }).count(), 0, "a button names light, dark or theme");
  for (const role of ["switch", "radio", "checkbox", "menuitem", "combobox"] as const) {
    assert.equal(await page.getByRole(role, { name: names }).count(), 0, `a ${role} names light, dark or theme`);
  }
  assert.equal(await page.getByRole("switch").count(), 0, "a switch on the main screen");
  assert.equal(await page.getByRole("radio").count(), 0, "a radio on the main screen");
});

Then("each color theme option shows a palette preview", async function (this: WebWorld) {
  const { mode } = await appearance(this);
  for (const [label, theme] of [["Cool", "cool"], ["Warm", "warm"], ["Neutral", "neutral"]] as const) {
    const swatches = radio(this, label).locator("[data-swatch]");
    await swatches.first().waitFor();
    assert.ok((await swatches.count()) >= 4, `${label} shows at least four swatches`);
    const colors = resolveTheme(theme, mode);
    const painted = (await swatches.evaluateAll(inPage("els", "return els.map((e) => getComputedStyle(e).backgroundColor);"))) as string[];
    assert.ok(painted.includes(rgb(colors.background)), `${label} previews its background`);
    assert.ok(painted.includes(rgb(colors.primary)), `${label} previews its primary color`);
  }
});

// Computed colors of the header, the editor and the terminal

async function surfaceColors(w: WebWorld) {
  await w.page.locator(".monaco-editor .monaco-editor-background").first().waitFor();
  await w.page.locator(".xterm-viewport").first().waitFor();
  return (await w.page.evaluate(`(() => {
    const bg = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      header: bg("header"),
      editor: bg(".monaco-editor .monaco-editor-background"),
      terminal: bg(".xterm-viewport"),
      terminalPane: bg(".terminal"),
    };
  })()`)) as Record<"header" | "editor" | "terminal" | "terminalPane", string>;
}

Given("I note the colors of the header, the editor and the terminal", async function (this: WebWorld) {
  this.noted = await surfaceColors(this);
});

Then("the header, the editor and the terminal differ from the noted colors", async function (this: WebWorld) {
  await eventually(async () => {
    const now = await surfaceColors(this);
    for (const surface of ["header", "editor", "terminal"] as const) {
      assert.notEqual(now[surface], this.noted[surface], `the ${surface} color did not change`);
    }
  });
});

Then(
  "the header, the editor and the terminal match the {string} theme in {word} mode",
  async function (this: WebWorld, theme: string, mode: string) {
    const colors = resolveTheme(theme as ThemeName, mode as Mode);
    await eventually(async () => {
      const now = await surfaceColors(this);
      assert.equal(now.header, rgb(colors.chrome), "header");
      assert.equal(now.editor, rgb(colors["editor-bg"]), "editor");
      assert.equal(now.terminal, rgb(colors["terminal-bg"]), "terminal");
      assert.equal(now.terminalPane, rgb(colors["terminal-bg"]), "terminal pane");
    });
  },
);

// First paint, persistence and damaged storage

Given("the page records the theme from its first moment", async function (this: WebWorld) {
  await this.context.addInitScript(`
    window.__themeLog = [];
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.target !== document.documentElement) continue;
        const root = document.getElementById("root");
        window.__themeLog.push({
          theme: document.documentElement.dataset.theme,
          dark: document.documentElement.classList.contains("dark"),
          rootChildren: root ? root.childElementCount : -1,
        });
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme", "class"] });
  `);
});

Then("the theme was {string} and {word} before the app started", async function (this: WebWorld, theme: string, mode: string) {
  const log = (await this.page.evaluate(`window.__themeLog`)) as { theme: string; dark: boolean; rootChildren: number }[];
  assert.ok(log.length > 0, "the theme was never applied before scripts ran");
  assert.ok(log[0].rootChildren <= 0, "the theme was applied only after the app rendered");
  for (const entry of log) {
    assert.equal(entry.theme, theme, `a different theme was visible: ${JSON.stringify(log)}`);
    assert.equal(entry.dark, mode === "dark", `a different mode was visible: ${JSON.stringify(log)}`);
  }
});

Then(
  "the saved settings for {string} are the theme {string} and the mode {string}",
  async function (this: WebWorld, user: string, theme: string, mode: string) {
    await eventually(async () => {
      const raw = (await this.page.evaluate(`localStorage.getItem(${JSON.stringify(`sierrendipity:settings:${user}`)})`)) as string | null;
      assert.ok(raw, `nothing saved for ${user}`);
      const saved = JSON.parse(raw);
      assert.equal(saved.version, 1);
      assert.deepEqual(saved.appearance, { theme, mode });
    });
  },
);

async function seedSettings(w: WebWorld, raw: string) {
  await w.context.addInitScript(
    `localStorage.setItem("sierrendipity:settings:local", ${JSON.stringify(raw)}); localStorage.setItem("sierrendipity:settings:last", ${JSON.stringify(raw)});`,
  );
}

Given("the saved settings are damaged", async function (this: WebWorld) {
  await seedSettings(this, "{definitely not json");
});

Given("the saved settings are the theme {string} and the mode {string}", async function (this: WebWorld, theme: string, mode: string) {
  const stored = JSON.stringify({ version: 1, appearance: { theme, mode } });
  await this.context.addInitScript(
    `localStorage.setItem("sierrendipity:settings:local", ${JSON.stringify(stored)}); localStorage.setItem("sierrendipity:settings:last", ${JSON.stringify(JSON.stringify({ theme, mode }))});`,
  );
});

Then("no page errors occurred", function (this: WebWorld) {
  assert.deepEqual(this.pageErrors, []);
});

// Signing in as different users

When(
  "Google sends me back with a valid code for {string} whose subject is {string}",
  async function (this: WebWorld, email: string, sub: string) {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    this.idToken = `${encode({ alg: "none" })}.${encode({ sub, email })}.signature`;
    this.mock.requireControlToken(this.idToken);
    const state = this.authorizeUrl!.searchParams.get("state");
    await this.page.goto(`${this.appUrl}/callback?code=code-1&state=${state}`);
    await this.page.getByRole("button", { name: "Run", exact: true }).waitFor();
  },
);

// Legibility of key elements and accessibility details

/** The effective text and background color of an element, as the browser computed them. */
async function paintOf(locator: ReturnType<WebWorld["page"]["locator"]>) {
  const read = inPage<{ color: string; background: string }>(
    "el",
    `
    const parse = (value) => {
      const m = value.match(/rgba?\\(([^)]+)\\)/);
      const parts = m[1].split(/[ ,/]+/).filter(Boolean);
      return { a: parts[3] === undefined ? 1 : +parts[3] };
    };
    let node = el;
    let background = "rgb(255, 255, 255)";
    while (node) {
      const style = getComputedStyle(node);
      if (parse(style.backgroundColor).a > 0.99) { background = style.backgroundColor; break; }
      node = node.parentElement;
    }
    return { color: getComputedStyle(el).color, background };
    `,
  );
  return (await locator.first().evaluate(read)) as { color: string; background: string };
}

Then("the {string} button, the header and the project selector are legible", async function (this: WebWorld, name: string) {
  const targets = {
    [`the ${name} button`]: this.page.getByRole("button", { name, exact: true }),
    "the header": this.page.locator("header"),
    "the project selector": this.page.getByLabel("Project"),
    "the backend status": this.page.getByRole("status", { name: "Backend status" }),
  };
  for (const [label, locator] of Object.entries(targets)) {
    const { color, background } = await paintOf(locator);
    const ratio = contrastRatio(color, background);
    assert.ok(ratio >= 4.5, `${label}: ${color} on ${background} is ${ratio.toFixed(2)}:1`);
  }
});

Then("buttons do not animate", async function (this: WebWorld) {
  const seconds = (await this.page
    .getByRole("button", { name: "Run", exact: true })
    .evaluate(inPage("el", "return getComputedStyle(el).transitionDuration;"))) as string;
  for (const part of seconds.split(",")) assert.ok(parseFloat(part) <= 0.001, `transition-duration is ${seconds}`);
});

When("I focus the {string} button with the keyboard", async function (this: WebWorld, name: string) {
  const button = this.page.getByRole("button", { name, exact: true });
  await button.focus();
  await this.page.keyboard.press("Shift+Tab");
  await this.page.keyboard.press("Tab");
  assert.equal(await button.evaluate(inPage("el", "return el === document.activeElement;")), true, "the button did not receive focus");
});

Then("the focused control has a visible focus ring", async function (this: WebWorld) {
  const ring = (await this.page.evaluate(`(() => {
    const s = getComputedStyle(document.activeElement);
    return { shadow: s.boxShadow, outline: s.outlineStyle, width: s.outlineWidth };
  })()`)) as { shadow: string; outline: string; width: string };
  const outlined = ring.outline !== "none" && parseFloat(ring.width) >= 2;
  assert.ok(outlined || (ring.shadow !== "none" && /\d+px/.test(ring.shadow)), `no visible focus ring: ${JSON.stringify(ring)}`);
});

Then("the bit segments use the theme palette", async function (this: WebWorld) {
  const { theme, mode } = await appearance(this);
  const colors = resolveTheme(theme, mode);
  const allowed = FIELD_TOKENS.map((t) => rgb(colors[t.bg]));
  const segments = this.page.locator("[data-segment]");
  await segments.first().waitFor();
  const painted = (await segments.evaluateAll(inPage("els", "return els.map((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]);"))) as string[][];
  assert.ok(painted.length > 0);
  for (const [background, color] of painted) {
    assert.ok(allowed.includes(background), `${background} is not a palette field color`);
    assert.equal(color, rgb(colors["field-foreground"]));
  }
});
