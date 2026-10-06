import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CONTRAST_PAIRS,
  FIELD_TOKENS,
  MODES,
  THEMES,
  resolveTheme,
  themeStylesheet,
  type Mode,
  type ThemeName,
} from "../../web/src/theme/palette";
import { contrastRatio } from "../../web/src/theme/contrast";
import {
  createLocalStorageSettingsStore,
  DEFAULT_SETTINGS,
  LAST_KEY,
  settingsKey,
  type SettingsStore,
  type StorageLike,
} from "../../web/src/settings";

// Contrast of the declared color pairs (pure functions, no browser)

Then(
  "every declared color pair of the {string} theme in {word} mode meets WCAG AA",
  function (theme: string, mode: string) {
    const colors = resolveTheme(theme as ThemeName, mode as Mode);
    const failures: string[] = [];
    for (const pair of CONTRAST_PAIRS) {
      const ratio = contrastRatio(colors[pair.fg], colors[pair.bg], colors[pair.on ?? "background"]);
      if (ratio < pair.min) {
        failures.push(`${pair.label}: ${pair.fg} ${colors[pair.fg]} on ${pair.bg} ${colors[pair.bg]} is ${ratio.toFixed(2)}:1, needs ${pair.min}:1`);
      }
    }
    assert.deepEqual(failures, [], `below WCAG AA in ${theme} ${mode}:\n${failures.join("\n")}`);
  },
);

Then("each of the {int} themes defines the same tokens in light and dark mode", function (count: number) {
  assert.equal(THEMES.length, count);
  const reference = Object.keys(resolveTheme("cool", "light")).sort();
  assert.ok(reference.length > 30, "expected a full token table");
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const colors = resolveTheme(theme, mode);
      assert.deepEqual(Object.keys(colors).sort(), reference, `${theme} ${mode}`);
      for (const [token, value] of Object.entries(colors)) {
        assert.match(value, /^#[0-9a-f]{6}([0-9a-f]{2})?$/, `${theme} ${mode} ${token} is ${value}`);
      }
    }
  }
});

Then("the committed theme stylesheet matches the token table", function () {
  const file = path.resolve(__dirname, "../../web/src/theme/themes.generated.css");
  assert.equal(
    readFileSync(file, "utf8"),
    themeStylesheet(),
    "web/src/theme/themes.generated.css is stale: run `npm run theme:css -w web`",
  );
});

Then("the {int} bit-field colors differ from each other in every theme and mode", function (count: number) {
  assert.equal(FIELD_TOKENS.length, count);
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const colors = resolveTheme(theme, mode);
      const values = FIELD_TOKENS.map((t) => colors[t.bg]);
      assert.equal(new Set(values).size, count, `${theme} ${mode}: ${values.join(" ")}`);
    }
  }
});

// The settings store (an in-memory Storage stands in for localStorage)

interface StoreWorld {
  storage: Map<string, string>;
  failing: boolean;
  store: SettingsStore;
  heard: Map<string, number>;
}

function setup(world: StoreWorld, failing = false) {
  world.storage = new Map();
  world.failing = failing;
  world.heard = new Map();
  const storage: StorageLike = {
    getItem: (key) => {
      if (failing) throw new Error("storage is unavailable");
      return world.storage.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (failing) throw new Error("quota exceeded");
      world.storage.set(key, value);
    },
    removeItem: (key) => void world.storage.delete(key),
  };
  world.store = createLocalStorageSettingsStore(storage);
}

Given("an empty settings store", function (this: StoreWorld) {
  setup(this);
});

Given("a settings store whose storage always fails", function (this: StoreWorld) {
  setup(this, true);
});

Given("a settings store holding {} for {string}", function (this: StoreWorld, stored: string, user: string) {
  setup(this);
  this.storage.set(settingsKey(user), stored);
});

Given("I subscribe to the settings of {string}", function (this: StoreWorld, user: string) {
  this.store.subscribe(user, () => this.heard.set(user, (this.heard.get(user) ?? 0) + 1));
});

When(
  "I save the theme {string} and the mode {string} for {string}",
  function (this: StoreWorld, theme: string, mode: string, user: string) {
    this.store.set(user, { ...DEFAULT_SETTINGS, appearance: { theme: theme as ThemeName, mode: mode as Mode } });
  },
);

Then(
  "the settings of {string} are the theme {string} and the mode {string}",
  function (this: StoreWorld, user: string, theme: string, mode: string) {
    assert.deepEqual(this.store.get(user).appearance, { theme, mode });
  },
);

Then(
  "the browser storage holds {string} with version {int}",
  function (this: StoreWorld, key: string, version: number) {
    const raw = this.storage.get(key);
    assert.ok(raw, `nothing stored under ${key}`);
    assert.equal(JSON.parse(raw).version, version);
  },
);

Then(
  "the last used appearance is the theme {string} and the mode {string}",
  function (this: StoreWorld, theme: string, mode: string) {
    assert.deepEqual(JSON.parse(this.storage.get(LAST_KEY) ?? "null"), { theme, mode });
  },
);

Then("I was told about {int} change for {string}", function (this: StoreWorld, count: number, user: string) {
  assert.equal(this.heard.get(user) ?? 0, count);
});
