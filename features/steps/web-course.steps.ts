import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { contrastRatio } from "../../web/src/theme/contrast";
import { galleryKey } from "../../web/src/course/gallery";
import type { WebWorld } from "../support/web-world";

const DAY = 86_400_000;
const T0 = "2026-10-06T09:00:00";
const USER = "local";

/** A function to run in the page, built from a string (tsx-compiled closures reference helpers the page lacks). */
const inPage = <T>(args: string, body: string) => new Function(args, body) as (...values: never[]) => T;

// ---------------------------------------------------------------- the course fixture

interface Warmup {
  id: string;
  concept: string;
  question: string;
  program: { kind: "asm"; text: string; words: number[] };
  target: string;
  expected: number;
}
interface FixtureLesson {
  id: string;
  title: string;
  minutes: number;
  concepts: { introduces: string[]; requires: string[] };
  warmups: Warmup[];
  sideRooms: { id: string; title: string; opensWith: string }[];
  nowYouCan: string[];
  alternateOf?: string;
}

const addWarmup = (id: string, a: number, b: number): Warmup => ({
  id,
  concept: "add",
  question: `Box a0 holds ${a} and box a1 holds ${b}. After the add card, what does box a2 hold?`,
  program: {
    kind: "asm",
    text: `addi a0, zero, ${a}\naddi a1, zero, ${b}\nadd a2, a0, a1`,
    words: [0x00000513 | (a << 20), 0x00000593 | (b << 20), 0x00b50633],
  },
  target: "a2",
  expected: a + b,
});

const lesson = (n: number, slug: string, title: string, minutes: number, introduces: string, now: string, extra: Partial<FixtureLesson> = {}): FixtureLesson => ({
  id: `c1/0${n}-${slug}`,
  title,
  minutes,
  concepts: { introduces: [introduces], requires: [] },
  warmups: [],
  sideRooms: [],
  nowYouCan: [now],
  ...extra,
});

const baseCourse = (): FixtureLesson[] => [
  lesson(1, "press-the-button", "Press the Button", 3, "cards", "Step a program one card at a time."),
  lesson(2, "change-the-number", "Change the Number", 3, "numbers-on-cards", "Spin a number on a card.", {
    sideRooms: [{ id: "hex-secrets", title: "Hex secrets", opensWith: "another-way" }],
  }),
  lesson(3, "last-one-wins", "Last One Wins", 4, "last-wins", "See that the last card wins.", {
    sideRooms: [{ id: "red-door", title: "Red door", opensWith: "called-it" }],
  }),
  lesson(4, "two-boxes", "Two Boxes", 4, "two-boxes", "Keep two numbers in two boxes."),
  lesson(5, "add", "Add", 4, "add", "Add two boxes into a third.", { warmups: [addWarmup("add-three-four", 3, 4), addWarmup("add-two-six", 2, 6)] }),
];

interface Seed {
  passed: { id: string; bonuses: string[]; at: number }[];
  cardsUsed: string[] | null;
  rawProgress?: string;
}
interface Course {
  catalog: FixtureLesson[];
  seeds: Map<string, Seed>;
  gallery: Map<string, unknown[]>;
  rawGallery: string | null;
  clock: Date;
  opened: boolean;
}
type CW = WebWorld & { course: Course };

function course(w: WebWorld): Course {
  const c = w as CW;
  c.course ??= { catalog: baseCourse(), seeds: new Map(), gallery: new Map(), rawGallery: null, clock: new Date(T0), opened: false };
  return c.course;
}

const seedOf = (c: Course, user: string): Seed => c.seeds.get(user) ?? c.seeds.set(user, { passed: [], cardsUsed: null }).get(user)!;
const idOf = (c: Course, title: string): string => {
  const found = c.catalog.find((l) => l.title === title);
  assert.ok(found, `no lesson titled ${title}`);
  return found.id;
};

function progressJson(c: Course, user: string, seed: Seed): string {
  if (seed.rawProgress !== undefined) return seed.rawProgress;
  const lessons: Record<string, unknown> = {};
  const mastery: Record<string, unknown> = {};
  for (const p of seed.passed) {
    lessons[p.id] = {
      passed: true,
      bonuses: p.bonuses,
      bestCards: 2,
      bestSteps: 2,
      hintsUsed: [0, 0, 0],
      showMeUsed: 0,
      predictionsAsked: 0,
      predictionsCorrect: 0,
      attempts: 1,
      firstPassedAt: p.at,
      lastAttemptAt: p.at,
    };
    for (const concept of c.catalog.find((l) => l.id === p.id)?.concepts.introduces ?? []) mastery[concept] = { box: 1, lastSeen: p.at, introducedAt: p.at };
  }
  return JSON.stringify({ version: 1, userId: user, lessons, mastery, warmupCounts: {}, cardsUsed: seed.cardsUsed ?? [], events: [] });
}

/** Everything written to localStorage before the page loads (only when nothing is stored yet), or right now when the page is open. */
function storageEntries(c: Course): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [user, seed] of c.seeds) out[`sierrendipity:progress:${user}`] = progressJson(c, user, seed);
  for (const [user, items] of c.gallery) out[galleryKey(user)] = JSON.stringify({ version: 1, items });
  if (c.rawGallery !== null) out[galleryKey(USER)] = c.rawGallery;
  return out;
}

async function applySeeds(w: WebWorld, overwrite: boolean) {
  const entries = storageEntries(course(w));
  if (overwrite) {
    await w.page.evaluate(inPage("entries", `for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);`) as never, entries as never);
  }
}

async function installSeeds(w: WebWorld) {
  const entries = storageEntries(course(w));
  await w.page.addInitScript(
    `(() => { const entries = ${JSON.stringify(entries)}; for (const k of Object.keys(entries)) if (localStorage.getItem(k) === null) localStorage.setItem(k, entries[k]); })();`,
  );
}

async function routeCatalog(w: WebWorld) {
  const body = { version: 1, lessons: course(w).catalog };
  await w.page.route("**/catalog.json", (route) => route.fulfill({ json: body }));
}

Before({ tags: "@course" }, async function (this: WebWorld) {
  const c = course(this);
  await this.page.clock.setFixedTime(c.clock);
});

Given("a course of five lessons", function (this: WebWorld) {
  course(this).catalog = baseCourse();
});

Given("the course also offers {string} as an alternate to {string}", function (this: WebWorld, title: string, base: string) {
  const c = course(this);
  const at = c.catalog.findIndex((l) => l.title === base);
  assert.ok(at >= 0, `no lesson titled ${base}`);
  c.catalog.splice(at + 1, 0, {
    id: "c1/04b-sticky-notes",
    title,
    minutes: 5,
    concepts: { introduces: ["sticky-notes"], requires: [] },
    warmups: [],
    sideRooms: [],
    nowYouCan: ["Leave a note on a shelf."],
    alternateOf: c.catalog[at]!.id,
  });
});

Given("the time is {string}", async function (this: WebWorld, when: string) {
  const c = course(this);
  c.clock = new Date(when);
  await this.page.clock.setFixedTime(c.clock);
});

Given("the viewport is {int} by {int}", async function (this: WebWorld, width: number, height: number) {
  await this.page.setViewportSize({ width, height });
});

// ---------------------------------------------------------------- seeding progress

function pass(w: WebWorld, title: string, bonuses: string[], at: number) {
  const c = course(w);
  const seed = seedOf(c, USER);
  seed.passed = seed.passed.filter((p) => p.id !== idOf(c, title));
  seed.passed.push({ id: idOf(c, title), bonuses, at });
}

Given("the student has passed nothing", function (this: WebWorld) {
  seedOf(course(this), USER).passed = [];
});

Given("the student has passed every lesson", function (this: WebWorld) {
  const c = course(this);
  for (const l of c.catalog.filter((x) => !x.alternateOf)) pass(this, l.title, [], c.clock.getTime() - 60_000);
});

Given(
  /^the student has passed "([^"]*)"(?: and "([^"]*)")?(?: earning the stars "([^"]*)")?$/,
  function (this: WebWorld, first: string, second: string | undefined, stars: string | undefined) {
    const c = course(this);
    const at = c.clock.getTime() - 60_000;
    const bonuses = (stars ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    pass(this, first, second ? [] : bonuses, at);
    if (second) pass(this, second, bonuses, at);
  },
);

Given("the student passed {string} {int} days ago", function (this: WebWorld, title: string, days: number) {
  const c = course(this);
  pass(this, title, [], c.clock.getTime() - days * DAY - (days === 0 ? 60_000 : 0));
});

const kinds = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);

Given("the student has used the card kinds {string} in passing programs", async function (this: WebWorld, list: string) {
  seedOf(course(this), USER).cardsUsed = kinds(list);
  if (course(this).opened) await applySeeds(this, true);
});

Given("the student {string} has used the card kinds {string} in passing programs", function (this: WebWorld, user: string, list: string) {
  seedOf(course(this), user).cardsUsed = kinds(list);
});

Given("the stored progress has the card kinds {string}", function (this: WebWorld, list: string) {
  seedOf(course(this), USER).cardsUsed = kinds(list);
});

const heart = () => Array.from({ length: 256 }, (_, i) => ((i % 16) + Math.floor(i / 16)) % 8);

Given(
  /^the Gallery(?: of "([^"]*)")? holds an? (pixel picture|program) "([^"]*)" from "([^"]*)"$/,
  function (this: WebWorld, user: string | undefined, kind: string, title: string, lessonTitle: string) {
    const c = course(this);
    const list = c.gallery.get(user ?? USER) ?? c.gallery.set(user ?? USER, []).get(user ?? USER)!;
    const base = { id: `item-${list.length + 1}`, lessonId: idOf(c, lessonTitle), title, createdAt: 1000 + list.length };
    list.push(kind === "program" ? { ...base, kind: "program", data: { words: [0x00500513, 0x00700593] } } : { ...base, kind: "pixels", data: { pixels: heart() } });
  },
);

Given("the stored Gallery is damaged", function (this: WebWorld) {
  course(this).rawGallery = "{nope";
});

// ---------------------------------------------------------------- opening and navigating

function devConfig(w: WebWorld) {
  return { devBackend: w.mock.url };
}

When("I open the app at {string}", async function (this: WebWorld, path: string) {
  const c = course(this);
  await routeCatalog(this);
  await this.page.route("**/config.json", (route) => route.fulfill({ json: devConfig(this) }));
  await installSeeds(this);
  c.opened = true;
  await this.page.goto(`${this.appUrl}${path}`);
});

When("I go to {string}", async function (this: WebWorld, path: string) {
  await this.page.goto(`${this.appUrl}${path}`);
});

When("I go back", async function (this: WebWorld) {
  await this.page.goBack();
});

When("I switch to the {string} area", async function (this: WebWorld, area: string) {
  await this.page.getByRole("navigation", { name: "Areas" }).getByRole("link", { name: area, exact: true }).click();
});

When("I follow the link {string}", async function (this: WebWorld, name: string) {
  await this.page.getByRole("link", { name, exact: true }).first().click();
});

When("Google sends me back to Learn as {string} whose subject is {string}", async function (this: WebWorld, email: string, sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  this.idToken = `${encode({ alg: "none" })}.${encode({ sub, email })}.signature`;
  this.mock.requireControlToken(this.idToken);
  const state = this.authorizeUrl!.searchParams.get("state");
  await routeCatalog(this);
  await installSeeds(this);
  await this.page.goto(`${this.appUrl}/callback?code=code-1&state=${state}`);
  await this.page.getByRole("heading", { name: "Course 1", exact: true }).waitFor();
});

Then("I am on {string}", async function (this: WebWorld, path: string) {
  await this.page.waitForURL((url) => url.pathname === path.split("?")[0]);
});

Then("I see the heading {string}", async function (this: WebWorld, name: string) {
  await this.page.getByRole("heading", { name, exact: true }).first().waitFor();
});

Then("I see {string}", async function (this: WebWorld, text: string) {
  await this.page.getByText(text).first().waitFor();
});

Then("the Run button is there", async function (this: WebWorld) {
  await this.page.getByRole("button", { name: "Run", exact: true }).waitFor();
});

Then("the header offers {string} and {string} and {string} is the current area", async function (this: WebWorld, a: string, b: string, current: string) {
  const nav = this.page.getByRole("navigation", { name: "Areas" });
  await nav.getByRole("link", { name: a, exact: true }).waitFor();
  await nav.getByRole("link", { name: b, exact: true }).waitFor();
  assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
  assert.equal((await nav.locator('[aria-current="page"]').innerText()).trim(), current);
});

// ---------------------------------------------------------------- the path

const lessonEl = (w: WebWorld, title: string) => w.page.locator(`[data-lesson-title="${title}"]`);
const primary = (w: WebWorld) => w.page.locator("[data-primary-action]");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

Then("there is exactly one primary button named {string}", async function (this: WebWorld, name: string) {
  await primary(this).first().waitFor();
  assert.equal(await primary(this).count(), 1, "expected exactly one primary action");
  assert.equal(squash(await primary(this).innerText()), name);
  assert.equal(await this.page.getByRole("button", { name: /^Continue/ }).count(), 1, "expected exactly one Continue button");
});

When("I press the primary button", async function (this: WebWorld) {
  await primary(this).click();
});

Then("the lesson {string} is the {string} lesson", async function (this: WebWorld, title: string, status: string) {
  await lessonEl(this, title).first().waitFor();
  assert.equal(await lessonEl(this, title).getAttribute("data-status"), status);
});

Then("the lesson {string} is in fog showing only its title", async function (this: WebWorld, title: string) {
  const el = lessonEl(this, title);
  await el.first().waitFor();
  assert.equal(await el.getAttribute("data-status"), "fog");
  assert.equal(squash(await el.innerText()), title, "fog shows the title and nothing else");
  assert.equal(await el.locator("a, button, [role=button], [role=link]").count(), 0, "fog is not interactive");
});

Then("the page shows no lock icon", async function (this: WebWorld) {
  await this.page.getByRole("main").waitFor();
  assert.equal(await this.page.locator('svg[class*="lucide-lock"], [aria-label*="lock" i], [title*="lock" i]').count(), 0);
  assert.equal(await this.page.getByText(/\block(ed)?\b/i).count(), 0);
});

Then("exactly these lessons are prominent: {string}, {string}, {string}", async function (this: WebWorld, a: string, b: string, c: string) {
  await this.page.locator("[data-lesson-title]").first().waitFor();
  const titles = await this.page.locator('[data-prominent="true"]').evaluateAll(inPage("els", `return els.map((e) => e.getAttribute("data-lesson-title"));`));
  assert.deepEqual([...(titles as string[])].sort(), [a, b, c].sort());
});

Then("the lesson {string} shows the stars {string}", async function (this: WebWorld, title: string, stars: string) {
  const el = lessonEl(this, title);
  await el.first().waitFor();
  const labels = (await el.locator("[data-star]").allInnerTexts()).map(squash);
  assert.deepEqual(labels, stars.split(",").map((s) => s.trim()));
});

Then("the door {string} is closed and says {string}", async function (this: WebWorld, title: string, says: string) {
  const door = this.page.locator(`[data-door="${title}"]`);
  await door.waitFor();
  assert.equal(await door.getAttribute("aria-disabled"), "true");
  assert.ok(squash(await door.innerText()).includes(says), `door says: ${await door.innerText()}`);
});

Then("the door {string} is open", async function (this: WebWorld, title: string) {
  const door = this.page.locator(`[data-door="${title}"]`);
  await door.waitFor();
  assert.notEqual(await door.getAttribute("aria-disabled"), "true");
  assert.equal(await door.getAttribute("data-open"), "true");
});

When("I press the door {string}", async function (this: WebWorld, title: string) {
  await this.page.locator(`[data-door="${title}"]`).click();
});

Then("there is no door {string}", async function (this: WebWorld, title: string) {
  await this.page.getByRole("heading", { name: "Course 1", exact: true }).waitFor();
  assert.equal(await this.page.locator(`[data-door="${title}"]`).count(), 0);
});

const chooser = (w: WebWorld) => w.page.getByRole("group", { name: "Pick what's next" });

Then("I am offered to pick what's next: {string} or {string}", async function (this: WebWorld, a: string, b: string) {
  const group = chooser(this);
  await group.waitFor();
  assert.deepEqual((await group.locator("[data-choice]").evaluateAll(inPage("els", `return els.map((e) => e.getAttribute("data-choice"));`))) as string[], [a, b]);
});

When("I pick {string}", async function (this: WebWorld, title: string) {
  await chooser(this).locator(`[data-choice="${title}"]`).click();
});

Then("I am not offered a choice", async function (this: WebWorld) {
  await this.page.getByRole("heading", { name: "Course 1", exact: true }).waitFor();
  assert.equal(await chooser(this).count(), 0);
});

Then("there is no lesson {string} on the path", async function (this: WebWorld, title: string) {
  assert.equal(await lessonEl(this, title).count(), 0);
});

Then("{string} lists {string} and {string}", async function (this: WebWorld, name: string, a: string, b: string) {
  const region = this.page.getByRole("region", { name });
  await region.waitFor();
  const items = (await region.getByRole("listitem").allInnerTexts()).map(squash);
  assert.deepEqual(items, [a, b]);
});

Then("there is no {string} list", async function (this: WebWorld, name: string) {
  await this.page.getByRole("heading", { name: "Course 1", exact: true }).waitFor();
  assert.equal(await this.page.getByRole("region", { name }).count(), 0);
});

// Tutor override and reset

Then("Settings has a {string} section with {string} off", async function (this: WebWorld, section: string, option: string) {
  const dialog = this.page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("heading", { name: section, exact: true }).waitFor();
  assert.equal(await dialog.getByRole("checkbox", { name: option, exact: true }).getAttribute("aria-checked"), "false");
});

When("I turn on {string}", async function (this: WebWorld, option: string) {
  const box = this.page.getByRole("dialog", { name: "Settings" }).getByRole("checkbox", { name: option, exact: true });
  await box.click();
  assert.equal(await box.getAttribute("aria-checked"), "true");
});

Then("I can open the lesson {string} from the path", async function (this: WebWorld, title: string) {
  const el = lessonEl(this, title);
  await el.first().waitFor();
  await el.getByRole("link", { name: `Open ${title}`, exact: true }).waitFor();
});

Then("I am asked {string}", async function (this: WebWorld, title: string) {
  await this.page.getByRole("dialog", { name: title, exact: true }).waitFor();
});

When("I cancel the question", async function (this: WebWorld) {
  const dialogs = this.page.getByRole("dialog");
  await dialogs.last().getByRole("button", { name: "Cancel", exact: true }).click();
});

When("I confirm the question {string}", async function (this: WebWorld, confirm: string) {
  await this.page.getByRole("dialog").last().getByRole("button", { name: confirm, exact: true }).click();
});

Then("Settings is still open", async function (this: WebWorld) {
  await this.page.getByRole("dialog", { name: "Settings" }).waitFor();
});

// The lesson seam

Then("there is no {string} button", async function (this: WebWorld, name: string) {
  await this.page.getByRole("heading", { level: 1 }).first().waitFor();
  assert.equal(await this.page.getByRole("button", { name, exact: true }).count(), 0);
});

Then("the stored progress says {string} is passed", async function (this: WebWorld, title: string) {
  const id = idOf(course(this), title);
  const stored = (await this.page.evaluate(inPage("", `return localStorage.getItem("sierrendipity:progress:local");`) as never)) as string | null;
  assert.equal(JSON.parse(stored ?? "null").lessons[id].passed, true);
});

// ---------------------------------------------------------------- keyboard, focus, layout, contrast

async function tabUntil(w: WebWorld, target: ReturnType<WebWorld["page"]["locator"]>) {
  await target.first().waitFor();
  await w.page.evaluate(inPage("", `document.activeElement && document.activeElement.blur();`) as never);
  for (let i = 0; i < 60; i++) {
    await w.page.keyboard.press("Tab");
    if (await target.first().evaluate(inPage("el", `return el === document.activeElement;`) as never)) return;
  }
  assert.fail("focus never reached the element with Tab");
}

When("I press Tab until focus is on {string}", async function (this: WebWorld, name: string) {
  await tabUntil(this, this.page.getByRole("button", { name, exact: true }));
});

When("I press Tab until focus is on the link {string}", async function (this: WebWorld, name: string) {
  await tabUntil(this, this.page.getByRole("link", { name, exact: true }));
});

When("I press {string} with the keyboard", async function (this: WebWorld, name: string) {
  await tabUntil(this, this.page.getByRole("button", { name, exact: true }));
  await this.page.keyboard.press("Enter");
});

Then("the focused element has a visible focus ring", async function (this: WebWorld) {
  const ring = (await this.page.evaluate(
    inPage("", `const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };`) as never,
  )) as { style: string; width: number };
  assert.ok(ring.style !== "none" && ring.width >= 2, `focus ring is ${JSON.stringify(ring)}`);
});

Then("no two items on the path overlap and nothing is cut off at the sides", async function (this: WebWorld) {
  await this.page.locator("[data-layout-item]").first().waitFor();
  const info = (await this.page.evaluate(
    inPage(
      "",
      `
      const items = [...document.querySelectorAll("[data-layout-item]")].filter((e) => e.getBoundingClientRect().width > 0);
      return {
        rects: items.map((e) => { const r = e.getBoundingClientRect(); return { name: e.getAttribute("data-layout-item"), l: r.left, t: r.top, r: r.right, b: r.bottom }; }),
        scrollWidth: document.documentElement.scrollWidth,
        width: document.documentElement.clientWidth,
      };`,
    ) as never,
  )) as { rects: { name: string; l: number; t: number; r: number; b: number }[]; scrollWidth: number; width: number };
  assert.ok(info.scrollWidth <= info.width, `the page scrolls sideways (${info.scrollWidth} > ${info.width})`);
  for (const a of info.rects) assert.ok(a.l >= 0 && a.r <= info.width, `${a.name} is cut off at the sides`);
  for (const [i, a] of info.rects.entries()) {
    for (const b of info.rects.slice(i + 1)) {
      const overlap = a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      assert.ok(!overlap, `${a.name} overlaps ${b.name}`);
    }
  }
});

Then("the Continue button is visible without scrolling", async function (this: WebWorld) {
  const box = await primary(this).boundingBox();
  const viewport = this.page.viewportSize()!;
  assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height, `the button is at ${JSON.stringify(box)}`);
});

/** Both helpers run in the page: the effective background of an element (translucent layers composited up the tree). */
const PAGE_COLORS = `
  const parse = (value) => {
    const m = value.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return { r: 255, g: 255, b: 255, a: 0 };
    const p = m[1].split(/[ ,/]+/).filter(Boolean);
    return { r: +p[0], g: +p[1], b: +p[2], a: p[3] === undefined ? 1 : p[3].endsWith("%") ? parseFloat(p[3]) / 100 : +p[3] };
  };
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const effectiveBg = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 0.999) break;
    }
    let acc = parse(getComputedStyle(document.documentElement).colorScheme.includes("dark") ? "rgb(0,0,0)" : "rgb(255,255,255)");
    acc.a = 1;
    for (const layer of layers.reverse()) acc = over(layer, acc);
    return "rgb(" + Math.round(acc.r) + ", " + Math.round(acc.g) + ", " + Math.round(acc.b) + ")";
  };
`;

Then("every piece of text on the page has enough contrast", async function (this: WebWorld) {
  await this.page.getByRole("main").first().waitFor();
  const texts = (await this.page.evaluate(
    inPage(
      "",
      `${PAGE_COLORS}
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.trim();
        const el = node.parentElement;
        if (!text || !el || el.closest("script, style, [hidden]")) continue;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0) continue;
        if (+style.opacity < 1) out.push({ text, color: "opacity " + style.opacity, bg: "", size: 0, bold: false, opacity: true });
        out.push({ text, color: style.color, bg: effectiveBg(el), size: parseFloat(style.fontSize), bold: +style.fontWeight >= 700 });
      }
      return out;`,
    ) as never,
  )) as { text: string; color: string; bg: string; size: number; bold: boolean; opacity?: boolean }[];
  assert.ok(texts.length > 5, "expected text on the page");
  const failures: string[] = [];
  for (const t of texts) {
    if (t.opacity) {
      failures.push(`"${t.text}" is faded with ${t.color}`);
      continue;
    }
    const large = t.size >= 24 || (t.size >= 18.66 && t.bold);
    const ratio = contrastRatio(t.color, t.bg);
    if (ratio < (large ? 3 : 4.5)) failures.push(`"${t.text.slice(0, 40)}" ${t.color} on ${t.bg} is ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, []);
});

Then("the focus ring of the Continue button has enough contrast", async function (this: WebWorld) {
  await tabUntil(this, primary(this));
  await this.page.waitForTimeout(400); // buttons fade their colors in
  const ring = (await primary(this).evaluate(
    inPage("el", `${PAGE_COLORS} return { ring: getComputedStyle(el).outlineColor, bg: effectiveBg(el.parentElement) };`) as never,
  )) as { ring: string; bg: string };
  const ratio = contrastRatio(ring.ring, ring.bg);
  assert.ok(ratio >= 3, `focus ring ${ring.ring} on ${ring.bg} is ${ratio.toFixed(2)}:1`);
});

// ---------------------------------------------------------------- the warm-up

const warmup = (w: WebWorld) => w.page.getByRole("region", { name: "Warm-up" });

Then("I see the warm-up {string}", async function (this: WebWorld, question: string) {
  await warmup(this).getByText(question, { exact: true }).waitFor();
});

Then("I see a warm-up", async function (this: WebWorld) {
  await warmup(this).waitFor();
});

Then("the warm-up offers {string} and {string}", async function (this: WebWorld, a: string, b: string) {
  await warmup(this).getByRole("button", { name: a, exact: true }).waitFor();
  await warmup(this).getByRole("button", { name: b, exact: true }).waitFor();
});

When("I answer the warm-up with {string}", async function (this: WebWorld, answer: string) {
  await warmup(this).getByRole("textbox", { name: "Your answer" }).fill(answer);
});

Then("the warm-up says {string}", async function (this: WebWorld, text: string) {
  await warmup(this).getByText(text).first().waitFor();
});

Then("the warm-up shows the answer {string} and the cards in plain English", async function (this: WebWorld, answer: string) {
  const text = squash(await warmup(this).innerText());
  assert.ok(text.includes(`Box a2 holds ${answer}`), text);
  for (const card of ["Put 3 in box a0", "Put 4 in box a1", "Add box a0 and box a1, put the answer in box a2"]) assert.ok(text.includes(card), `${card} missing from: ${text}`);
});

Then("the warm-up does not say {string} or {string}", async function (this: WebWorld, a: string, b: string) {
  const text = (await warmup(this).innerText()).toLowerCase();
  assert.ok(!text.includes(a) && !text.includes(b), text);
});

Then("there is no warm-up", async function (this: WebWorld) {
  await this.page.getByRole("heading", { name: "Course 1", exact: true }).waitFor();
  await this.page.waitForTimeout(250);
  assert.equal(await warmup(this).count(), 0);
});

Then("the warm-up asks for a number", async function (this: WebWorld) {
  await warmup(this).getByText("Type a number to check.").waitFor();
});

Then("the warm-up answer box has focus", async function (this: WebWorld) {
  const box = warmup(this).getByRole("textbox", { name: "Your answer" });
  await box.waitFor();
  assert.ok(await box.evaluate(inPage("el", `return el === document.activeElement;`) as never), "the answer box is not focused");
});

async function storedProgress(w: WebWorld) {
  const raw = (await w.page.evaluate(inPage("", `return localStorage.getItem("sierrendipity:progress:local");`) as never)) as string | null;
  return JSON.parse(raw ?? "null") as { mastery: Record<string, { box: number }>; events: { type: string; concept?: string; correct?: boolean }[] };
}

async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const value = await read();
    if (ok(value) || Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
}

Then("the concept {string} is in box {int}", async function (this: WebWorld, concept: string, box: number) {
  const progress = await eventually(() => storedProgress(this), (p) => p?.mastery?.[concept]?.box === box);
  assert.equal(progress.mastery[concept]?.box, box);
});

Then("the progress log holds a correct warm-up for {string}", async function (this: WebWorld, concept: string) {
  const progress = await eventually(() => storedProgress(this), (p) => (p?.events ?? []).some((e) => e.type === "warmup"));
  assert.ok(progress.events.some((e) => e.type === "warmup" && e.concept === concept && e.correct === true));
});

Then("the progress log holds no warm-up", async function (this: WebWorld) {
  const progress = await storedProgress(this);
  assert.ok(!(progress?.events ?? []).some((e) => e.type === "warmup"));
});

// ---------------------------------------------------------------- the Gallery

const galleryItem = (w: WebWorld, title: string) => w.page.locator(`[data-gallery-item="${title}"]`);

Then("the Gallery says {string}", async function (this: WebWorld, text: string) {
  await this.page.getByRole("region", { name: "Gallery" }).getByText(text, { exact: true }).waitFor();
});

Then(
  "the Gallery shows {string} as a pixel picture with {int} pixels labelled {string}",
  async function (this: WebWorld, title: string, count: number, label: string) {
    const item = galleryItem(this, title);
    await item.waitFor();
    assert.equal(await item.locator("[data-pixel]").count(), count);
    await item.getByRole("img", { name: label, exact: true }).waitFor();
  },
);

Then("the Gallery shows {string} as a list of {int} cards", async function (this: WebWorld, title: string, count: number) {
  const item = galleryItem(this, title);
  await item.waitFor();
  assert.equal(await item.getByRole("listitem").count(), count);
});

Then("the program {string} reads {string} and {string}", async function (this: WebWorld, title: string, a: string, b: string) {
  assert.deepEqual((await galleryItem(this, title).getByRole("listitem").allInnerTexts()).map(squash), [a, b]);
});

Then(/^the Gallery lists "([^"]*)"(?: and "([^"]*)")?$/, async function (this: WebWorld, a: string, b: string | undefined) {
  const expected = [a, b].filter((x): x is string => !!x);
  const read = async () => (await this.page.locator("[data-gallery-item]").evaluateAll(inPage("els", `return els.map((e) => e.getAttribute("data-gallery-item"));`))) as string[];
  const titles = await eventually(read, (t) => t.length === expected.length);
  assert.deepEqual([...titles].sort(), [...expected].sort());
});

// ---------------------------------------------------------------- the Deck

const deckCard = (w: WebWorld, title: string) => w.page.locator(`[data-deck-card="${title}"]`);

Then("the Deck says {string}", async function (this: WebWorld, text: string) {
  await this.page.getByRole("region", { name: "Instruction Deck" }).getByText(text, { exact: true }).waitFor();
});

Then("every card of the Deck is face down", async function (this: WebWorld) {
  await deckCard(this, "Put").waitFor();
  assert.equal(await this.page.locator('[data-deck-card][data-state="face-down"]').count(), 24);
  assert.equal(await this.page.locator('[data-deck-card][data-state="face-up"]').count(), 0);
});

Then(/^the Deck card "([^"]*)" is face (up|down)$/, async function (this: WebWorld, title: string, side: string) {
  await deckCard(this, title).waitFor();
  assert.equal(await deckCard(this, title).getAttribute("data-state"), `face-${side}`);
});

Then("the Deck card {string} is face down and says {string}", async function (this: WebWorld, title: string, text: string) {
  await deckCard(this, title).waitFor();
  assert.equal(await deckCard(this, title).getAttribute("data-state"), "face-down");
  assert.ok(squash(await deckCard(this, title).innerText()).includes(text));
  assert.ok(!/answer in box|Add box a0/.test(await deckCard(this, title).innerText()), "a face-down card must not give the card away");
});

Then("the Deck card {string} cannot be flipped", async function (this: WebWorld, title: string) {
  assert.equal(await deckCard(this, title).getByRole("button").isDisabled(), true);
});

Then("the front of the Deck card {string} reads {string}", async function (this: WebWorld, title: string, text: string) {
  const front = deckCard(this, title).locator('[data-face="front"]');
  await front.waitFor();
  assert.equal(squash(await front.innerText()), text);
  assert.equal(await deckCard(this, title).getAttribute("data-flipped"), "false");
});

When("I flip the Deck card {string}", async function (this: WebWorld, title: string) {
  await deckCard(this, title).getByRole("button", { name: `Flip ${title}`, exact: true }).click();
});

Then("the back of the Deck card {string} shows the assembly name {string} and the bits {string}", async function (this: WebWorld, title: string, name: string, bits: string) {
  const back = deckCard(this, title).locator('[data-face="back"]');
  await back.getByText(name, { exact: true }).waitFor();
  assert.equal(await back.locator("[data-bits]").getAttribute("data-bits"), bits);
  assert.equal(await deckCard(this, title).getAttribute("data-flipped"), "true");
});

Then("the back of the Deck card {string} has a lamp strip of {int} lamps with {int} lit", async function (this: WebWorld, title: string, lamps: number, lit: number) {
  const back = deckCard(this, title).locator('[data-face="back"]');
  assert.equal(await back.locator("[data-lamp]").count(), lamps);
  assert.equal(await back.locator('[data-lamp][data-lit="true"]').count(), lit);
});

// ---------------------------------------------------------------- the lab

const labSection = (w: WebWorld, title: string) => w.page.locator(`[data-lab-section][aria-label="${title}"]`);

When("I open the component lab", async function (this: WebWorld) {
  await (this as WebWorld & { openLab(): Promise<void> }).openLab();
});

Then("the lab has a section {string}", async function (this: WebWorld, title: string) {
  await labSection(this, title).waitFor();
});

Then(
  "the lab section {string} shows the path, a warm-up card, a Now-you-can card, a Gallery and a Deck",
  async function (this: WebWorld, title: string) {
    const section = labSection(this, title);
    for (const name of ["Course path", "Warm-up", "Now you can", "Gallery", "Instruction Deck"]) await section.getByRole("region", { name, exact: true }).first().waitFor();
  },
);

When("I press {string} in the lab section {string}", async function (this: WebWorld, name: string, title: string) {
  await labSection(this, title).getByRole("button", { name, exact: true }).click();
});

Then("the lab path offers {string}", async function (this: WebWorld, name: string) {
  const button = labSection(this, "Course path and progress").locator("[data-primary-action]");
  await button.filter({ hasText: name }).waitFor();
});

const nowYouCan = (w: WebWorld) => labSection(w, "Course path and progress").getByRole("region", { name: "Now you can", exact: true });

Then("the Now-you-can card in the lab says {string}", async function (this: WebWorld, text: string) {
  await nowYouCan(this).getByText(text, { exact: true }).waitFor();
});

Then("the Now-you-can card in the lab shows the stars {string}", async function (this: WebWorld, stars: string) {
  assert.deepEqual((await nowYouCan(this).locator("[data-star]").allInnerTexts()).map(squash), stars.split(",").map((s) => s.trim()));
});

Then("the Now-you-can card in the lab offers {string} and {string}", async function (this: WebWorld, a: string, b: string) {
  await nowYouCan(this).getByRole("button", { name: a, exact: true }).waitFor();
  await nowYouCan(this).getByRole("button", { name: b, exact: true }).waitFor();
});

Then("the Now-you-can card in the lab holds the thing the student made", async function (this: WebWorld) {
  await nowYouCan(this).locator("[data-made]").waitFor();
});

Then("the lab reports {string}", async function (this: WebWorld, text: string) {
  await labSection(this, "Course path and progress").locator("[data-lab-report]").getByText(text, { exact: true }).waitFor();
});
