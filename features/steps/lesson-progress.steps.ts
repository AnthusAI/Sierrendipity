import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  DAY_MS,
  LocalStorageProgressStore,
  MemoryProgressStore,
  courseState,
  pickWarmup,
  type CourseState,
  type LessonSummary,
  type PickedWarmup,
  type ProgressChange,
  type ProgressData,
  type ProgressStore,
  type StorageLike,
} from "@sierrendipity/lesson-core";
import { loadLesson } from "@sierrendipity/lesson-core/loader";
import { readLessonDir } from "@sierrendipity/lesson-core/node";
import { assembleOrThrow } from "./lesson-fixtures";

class FakeStorage implements StorageLike {
  readonly items = new Map<string, string>();
  constructor(
    public failWrites = false,
    public failReads = false,
  ) {}
  getItem(key: string): string | null {
    if (this.failReads) throw new Error("storage unavailable");
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

let clock = DAY_MS;
let store: ProgressStore;
let storage: FakeStorage;
let lessons: LessonSummary[] = [];
let heard: ProgressChange[];
let stopListening: (() => void) | undefined;
let refusal: string | undefined;
let picked: PickedWarmup | null;
let exported: ProgressData;
let state: CourseState;

const now = () => clock;
const day = (ms: number) => Math.floor(ms / DAY_MS);
const list = (text: string): string[] => (text.trim() === "" ? [] : text.split(/,\s*/));
const asLocal = (): LocalStorageProgressStore => {
  assert.ok(store instanceof LocalStorageProgressStore, "this scenario needs the localStorage store");
  return store;
};

Given("the clock is at day {float}", (d: number) => {
  clock = d * DAY_MS;
});
Given("a new in-memory progress store", () => {
  store = new MemoryProgressStore({ now });
  heard = [];
});
Given("a new in-memory progress store keeping at most {int} events", (n: number) => {
  store = new MemoryProgressStore({ now, maxEvents: n });
});
Given("a localStorage progress store over an empty storage", () => {
  storage = new FakeStorage();
  store = new LocalStorageProgressStore(storage, { now });
});
Given(/^a localStorage progress store over a storage where "(.*)" holds '(.*)'$/, (key: string, raw: string) => {
  storage = new FakeStorage();
  storage.items.set(key, raw);
  store = new LocalStorageProgressStore(storage, { now });
});
Given("a localStorage progress store over a storage that refuses writes", () => {
  storage = new FakeStorage(true);
  store = new LocalStorageProgressStore(storage, { now });
});
Given("a localStorage progress store over a storage that refuses reads", () => {
  storage = new FakeStorage(false, true);
  store = new LocalStorageProgressStore(storage, { now });
});
When("a new localStorage progress store opens the same storage", () => {
  store = new LocalStorageProgressStore(storage, { now });
});

// ---- recording

Given("{string} passed {string} teaching {string} on day {float}", (user: string, lesson: string, concepts: string, d: number) => {
  clock = d * DAY_MS;
  store.recordAttempt(user, lesson, { passed: true, stars: ["pass"], cards: 4, steps: 4, concepts: list(concepts) });
});
When("{string} passes {string} teaching {string} using {int} cards and {int} steps", (user: string, lesson: string, concepts: string, cards: number, steps: number) => {
  store.recordAttempt(user, lesson, { passed: true, stars: ["pass"], cards, steps, concepts: list(concepts) });
});
When("{string} attempts {string} and fails", (user: string, lesson: string) => {
  store.recordAttempt(user, lesson, { passed: false, stars: [], cards: 3, steps: 3 });
});
When("{string} attempts {string} and fails but earns the stars {string}", (user: string, lesson: string, stars: string) => {
  store.recordAttempt(user, lesson, { passed: false, stars: list(stars), cards: 1, steps: 2 });
});
When("{string} attempts {string} and passes with stars {string} using {int} cards and {int} steps", (user: string, lesson: string, stars: string, cards: number, steps: number) => {
  store.recordAttempt(user, lesson, { passed: true, stars: list(stars), cards, steps });
});
When("{string} uses hint rung {int} on {string}", (user: string, rung: number, lesson: string) => {
  store.recordEvent(user, { type: "hint", lessonId: lesson, rung: rung as 1 | 2 | 3 });
});
When("{string} uses hint rung {int} on {string} {int} times", (user: string, rung: number, lesson: string, times: number) => {
  for (let i = 0; i < times; i++) store.recordEvent(user, { type: "hint", lessonId: lesson, rung: rung as 1 | 2 | 3 });
});
When("{string} uses Show me on {string} teaching {string}", (user: string, lesson: string, concepts: string) => {
  store.recordEvent(user, { type: "show-me", lessonId: lesson, concepts: list(concepts) });
});
When(/^"([^"]*)" predicts (correctly|wrongly) on "([^"]*)" teaching "([^"]*)"$/, (user: string, how: string, lesson: string, concepts: string) => {
  store.recordEvent(user, { type: "prediction", lessonId: lesson, correct: how === "correctly", concepts: list(concepts) });
});

function act(user: string, concept: string, action: string): void {
  const m = /^(?:(a|\d+) )?(correct|missed) (warm-up|prediction)s?$/.exec(action) ?? (action === "Show me" ? ["", "", "show", "me"] : null);
  assert.ok(m, `cannot understand the action "${action}"`);
  if (action === "Show me") return store.recordEvent(user, { type: "show-me", lessonId: "c1/01-press-the-button", concepts: [concept] });
  const times = m[1] === undefined || m[1] === "a" ? 1 : Number(m[1]);
  for (let i = 0; i < times; i++) {
    if (m[3] === "warm-up") store.recordEvent(user, { type: "warmup", concept, correct: m[2] === "correct" });
    else store.recordEvent(user, { type: "prediction", lessonId: "c1/01-press-the-button", correct: m[2] === "correct", concepts: [concept] });
  }
}
Given(/^"([^"]*)" does the following about "([^"]*)": (.*)$/, (user: string, concept: string, actions: string) => {
  for (const a of actions.split(/,\s*/)) act(user, concept, a);
});

When(/^I record (.*) for "ana"$/, (what: string) => {
  refusal = undefined;
  try {
    if (what === "a hint of rung 4") store.recordEvent("ana", { type: "hint", lessonId: "c1/01-press-the-button", rung: 4 as 1 });
    else if (what === "an attempt with -3 cards") store.recordAttempt("ana", "c1/01-press-the-button", { passed: true, stars: ["pass"], cards: -3, steps: 1 });
    else if (what === 'an attempt for ""') store.recordAttempt("ana", "", { passed: true, stars: ["pass"], cards: 1, steps: 1 });
    else if (what === 'an attempt for "__proto__"') store.recordAttempt("ana", "__proto__", { passed: true, stars: ["pass"], cards: 1, steps: 1 });
    else if (what === 'an attempt for "Constructor"') store.recordAttempt("ana", "Constructor", { passed: true, stars: ["pass"], cards: 1, steps: 1 });
    else if (what === 'an attempt for "a:b"') store.recordAttempt("ana", "a:b", { passed: true, stars: ["pass"], cards: 1, steps: 1 });
    else if (what === 'a warm-up for the concept "__proto__"') store.recordEvent("ana", { type: "warmup", concept: "__proto__", correct: true });
    else assert.fail(`unknown input: ${what}`);
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    refusal = (e as Error).message;
  }
});
Then("recording is refused with {string}", (message: string) => {
  assert.ok(refusal?.includes(message), `refusal was: ${refusal}`);
});

// ---- reading

const lessonOf = (user: string, id: string) => store.getLesson(user, id);
Then("lesson {string} for {string} is not passed with {int} attempts", (id: string, user: string, n: number) => {
  const l = lessonOf(user, id);
  assert.equal(l.passed, false);
  assert.equal(l.attempts, n);
});
Then("lesson {string} for {string} is passed with {int} attempts", (id: string, user: string, n: number) => {
  const l = lessonOf(user, id);
  assert.equal(l.passed, true);
  assert.equal(l.attempts, n);
});
Then("lesson {string} for {string} has bonuses {string}", (id: string, user: string, bonuses: string) => {
  assert.deepEqual(lessonOf(user, id).bonuses, list(bonuses));
});
Then("lesson {string} for {string} has best {int} cards and {int} steps", (id: string, user: string, cards: number, steps: number) => {
  const l = lessonOf(user, id);
  assert.deepEqual([l.bestCards, l.bestSteps], [cards, steps]);
});
Then("lesson {string} for {string} has no best counts", (id: string, user: string) => {
  const l = lessonOf(user, id);
  assert.deepEqual([l.bestCards, l.bestSteps], [null, null]);
});
Then("lesson {string} for {string} first passed on day {int}", (id: string, user: string, d: number) => {
  assert.equal(day(lessonOf(user, id).firstPassedAt!), d);
});
Then("lesson {string} for {string} used hints {string}", (id: string, user: string, hints: string) => {
  assert.deepEqual(lessonOf(user, id).hintsUsed, list(hints).map(Number));
});
Then("lesson {string} for {string} used Show me {int} times", (id: string, user: string, n: number) => {
  assert.equal(lessonOf(user, id).showMeUsed, n);
});
Then("lesson {string} for {string} predicted {int} of {int} correctly", (id: string, user: string, ok: number, asked: number) => {
  const l = lessonOf(user, id);
  assert.deepEqual([l.predictionsCorrect, l.predictionsAsked], [ok, asked]);
});
Then("{string} has no concept mastery", (user: string) => assert.deepEqual(store.getMastery(user), {}));
Then("{string} has no concept mastery for {string}", (user: string, concept: string) => assert.equal(store.getMastery(user)[concept], undefined));
Then("the mastery of {string} for {string} is box {int}", (concept: string, user: string, box: number) => {
  assert.equal(store.getMastery(user)[concept]?.box, box);
});
Then("the mastery of {string} for {string} is box {int}, last seen on day {int}", (concept: string, user: string, box: number, d: number) => {
  const m = store.getMastery(user)[concept];
  assert.ok(m, `no mastery for ${concept}`);
  assert.deepEqual([m.box, day(m.lastSeen)], [box, d]);
});
Then(/^"([^"]*)" has (\d+) stored events?$/, (user: string, n: string) => assert.equal(store.export(user).events.length, Number(n)));

// ---- subscribers and export

Given("a subscriber is listening", () => {
  heard = [];
  stopListening = store.subscribe((c) => heard.push(c));
});
When("the subscriber stops listening", () => stopListening?.());
Then("the subscriber heard {int} changes for {string}", (n: number, user: string) => {
  assert.equal(heard.filter((c) => c.userId === user).length, n);
});
When("I export the progress of {string} and change the copy", (user: string) => {
  exported = store.export(user);
  exported.lessons["c1/01-press-the-button"]!.passed = false;
  exported.lessons["c1/01-press-the-button"]!.bonuses.push("tampered");
  exported.events.length = 0;
});
Then("the export is version {int} for {string} and survives a JSON round trip", (version: number, user: string) => {
  const fresh = store.export(user);
  assert.equal(fresh.version, version);
  assert.equal(fresh.userId, user);
  assert.deepEqual(JSON.parse(JSON.stringify(fresh)), fresh);
});

// ---- storage

Then("the storage holds the key {string} with version {int}", (key: string, version: number) => {
  const raw = storage.items.get(key);
  assert.ok(raw, `nothing stored under ${key}`);
  assert.equal(JSON.parse(raw).version, version);
});
Then(/^the storage keeps a backup of "(.*)" for "([^"]*)"$/, (raw: string, user: string) => {
  assert.equal(storage.items.get(`sierrendipity:progress:${user}:backup`), raw);
});
Then("the load status for {string} is {string}", (user: string, status: string) => assert.equal(asLocal().loadStatus(user), status));
Then("the last save failed", () => assert.ok(asLocal().lastSaveError));

// ---- warm-ups and the path

function summarize(id: string): LessonSummary {
  const loaded = loadLesson(readLessonDir(join(process.cwd(), "lessons", id)), { dir: id });
  assert.ok(loaded.ok, loaded.ok ? "" : loaded.errors.join("\n"));
  return loaded.lesson;
}
Given("the five authored lessons of Course 1", () => {
  lessons = ["01-press-the-button", "02-change-the-number", "03-last-one-wins", "04-two-boxes", "05-add"].map((slug) => summarize(`c1/${slug}`));
});
Given("a three-lesson course", () => {
  const warm = (id: string, expected: number) => ({
    id,
    concept: "m",
    question: `Q${id}`,
    program: { kind: "asm" as const, text: `addi a0, zero, ${expected}\nebreak`, words: assembleOrThrow(`addi a0, zero, ${expected}; ebreak`) },
    target: "a0",
    expected,
  });
  lessons = [
    { id: "x/01", title: "First", concepts: { introduces: ["m"], requires: [] }, warmups: [warm("w1", 1), warm("w2", 2)], sideRooms: [{ id: "hex-secrets", title: "Hex secrets", opensWith: "another-way" }] },
    { id: "x/02", title: "Second", concepts: { introduces: [], requires: ["m"] }, warmups: [], sideRooms: [] },
    { id: "x/03", title: "Third", concepts: { introduces: [], requires: [] }, warmups: [], sideRooms: [] },
  ];
});

const pick = (user: string) => {
  picked = pickWarmup(store.export(user), lessons, clock);
  return picked;
};
Then("there is no warm-up for {string}", (user: string) => assert.equal(pick(user), null));
Then("the warm-up for {string} is for the concept {string}", (user: string, concept: string) => assert.equal(pick(user)?.concept, concept));
Then("the warm-up for {string} has the id {string}", (user: string, id: string) => assert.equal(pick(user)?.warmup.id, id));
Then("the warm-up question mentions {string}", (text: string) => assert.ok(picked?.warmup.question.includes(text), picked?.warmup.question));
Then("the warm-up expects {int}", (n: number) => assert.equal(picked?.warmup.expected, n));
When("{string} answers the warm-up with {int}", (user: string, answer: number) => {
  const p = pick(user);
  assert.ok(p, "there should be a warm-up");
  store.recordEvent(user, { type: "warmup", concept: p.concept, correct: answer === p.warmup.expected, lessonId: p.lessonId });
});

const path = (user: string): CourseState => (state = courseState(store.export(user), lessons));
const entry = (user: string, id: string) => {
  const e = path(user).lessons.find((l) => l.id === id);
  assert.ok(e, `no lesson ${id} on the path`);
  return e;
};
Then(/^the path for "([^"]*)" shows "([^"]*)" as (current|next|done|fog)$/, (user: string, id: string, status: string) => {
  assert.equal(entry(user, id).status, status);
});
Then(/^the path for "([^"]*)" shows "([^"]*)" as fog with only its title$/, (user: string, id: string) => {
  const e = entry(user, id);
  assert.equal(e.status, "fog");
  assert.deepEqual(Object.keys(e).sort(), ["id", "status", "title"]);
});
Then("the path for {string} shows no current lesson", (user: string) => {
  assert.equal(path(user).current, null);
  assert.equal(state.lessons.some((l) => l.status === "current"), false);
});
Then("the continue target for {string} is the lesson {string}", (user: string, id: string) => {
  assert.deepEqual(path(user).continueTarget, { kind: "lesson", lessonId: id });
});
Then("the continue target for {string} is the end of the course", (user: string) => {
  assert.deepEqual(path(user).continueTarget, { kind: "complete" });
});
Then("{string} has exactly one continue target", (user: string) => {
  const s = path(user);
  const targets = s.lessons.filter((l) => l.status === "current").length + (s.continueTarget.kind === "complete" ? 1 : 0);
  assert.equal(targets, 1);
});
Then(/^the side room "([^"]*)" is (open|closed) for "([^"]*)"$/, (id: string, how: string, user: string) => {
  const room = path(user).sideRooms.find((r) => r.id === id);
  assert.ok(room, `no side room ${id}`);
  assert.equal(room.open, how === "open");
});

// ---- review fixes

Then("Object.prototype is clean", () => {
  assert.equal(({} as Record<string, unknown>).passed, undefined);
  assert.equal(({} as Record<string, unknown>).box, undefined);
  assert.deepEqual(Object.keys(Object.prototype), []);
});
Then("the store refuses the student id {string}", (id: string) => {
  assert.throws(() => store.getMastery(id), RangeError);
});
Then("the backup of {string} is not under any progress key", (user: string) => {
  const keys = [...storage.items.keys()];
  const backups = keys.filter((k) => storage.items.get(k) === "{not json");
  assert.equal(backups.length, 1);
  assert.ok(!backups[0]!.startsWith(`sierrendipity:progress:`), backups[0]);
  assert.ok(!backups.some((k) => k === `sierrendipity:progress:${user}:backup`));
});
Given("a subscriber that throws is listening", () => {
  store.subscribe(() => {
    throw new Error("boom");
  });
});
Given("a store whose clock returns NaN", () => {
  store = new MemoryProgressStore({ now: () => Number.NaN });
});
Then("recording an attempt is refused with {string}", (message: string) => {
  try {
    store.recordAttempt("ana", "c1/01-press-the-button", { passed: false, stars: [], cards: 1, steps: 1 });
    assert.fail("should be refused");
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    assert.ok((e as Error).message.includes(message), (e as Error).message);
  }
});
When("{string} attempts {int} different lessons", (user: string, n: number) => {
  for (let i = 0; i < n; i++) store.recordAttempt(user, `l${i}`, { passed: false, stars: [], cards: 1, steps: 1 });
});
Then("recording an attempt for a 501st lesson is refused with {string}", (message: string) => {
  assert.throws(() => store.recordAttempt("ana", "l500", { passed: false, stars: [], cards: 1, steps: 1 }), (e: Error) => e.message.includes(message));
});
Then("{string} can still record another attempt for an existing lesson", (user: string) => {
  store.recordAttempt(user, "l0", { passed: false, stars: [], cards: 1, steps: 1 });
});
When("{string} answers {int} warm-ups for the concept {string}", (user: string, n: number, concept: string) => {
  for (let i = 0; i < n; i++) store.recordEvent(user, { type: "warmup", concept, correct: true });
});
Then("the warm-up counter for {string} of {string} is {int}", (concept: string, user: string, n: number) => {
  assert.equal(store.export(user).warmupCounts[concept], n);
});
