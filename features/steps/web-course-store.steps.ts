import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { LocalStorageProgressStore, progressKey, type StorageLike } from "../../lesson-core/src";
import {
  galleryBackupKey,
  galleryKey,
  LocalStorageGalleryStore,
  MAX_GALLERY_ITEMS,
  PIXEL_COUNT,
  type GalleryItem,
  type GalleryStore,
  type NewGalleryItem,
} from "../../web/src/course/gallery";
import { createLearningStore, learningKey, type LearningStore } from "../../web/src/course/learning";

interface World {
  storage: Map<string, string>;
  failing: boolean;
  progress: LocalStorageProgressStore;
  gallery: GalleryStore;
  heardGallery: number;
  learning: LearningStore;
}

function fakeStorage(w: World): StorageLike {
  return {
    getItem: (key) => {
      if (w.failing) throw new Error("storage is unavailable");
      return w.storage.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (w.failing) throw new Error("quota exceeded");
      w.storage.set(key, value);
    },
    removeItem: (key) => void w.storage.delete(key),
  };
}

const list = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);
const pixels = (fill = 1) => Array.from({ length: PIXEL_COUNT }, () => fill);

function freshGallery(w: World, failing = false) {
  w.storage ??= new Map();
  w.failing = failing;
  w.gallery = new LocalStorageGalleryStore(fakeStorage(w));
}

// The Instruction Deck (cardsUsed in the progress store)

Given("an empty progress store for {string}", function (this: World, _user: string) {
  this.storage = new Map();
  this.failing = false;
  this.progress = new LocalStorageProgressStore(fakeStorage(this));
});

When("{string} passes {string} using the card kinds {string}", function (this: World, user: string, lesson: string, kinds: string) {
  this.progress.recordAttempt(user, lesson, { passed: true, stars: ["pass"], cards: 1, steps: 1, cardsUsed: list(kinds) });
});

When(
  "{string} tries {string} and does not pass, using the card kinds {string}",
  function (this: World, user: string, lesson: string, kinds: string) {
    this.progress.recordAttempt(user, lesson, { passed: false, stars: [], cards: 1, steps: 1, cardsUsed: list(kinds) });
  },
);

Given("stored progress for {string} from before the Instruction Deck", function (this: World, user: string) {
  this.storage = new Map();
  this.failing = false;
  const lesson = { passed: true, bonuses: [], bestCards: 1, bestSteps: 1, hintsUsed: [0, 0, 0], showMeUsed: 0, predictionsAsked: 0, predictionsCorrect: 0, attempts: 1, firstPassedAt: 1, lastAttemptAt: 1 };
  this.storage.set(progressKey(user), JSON.stringify({ version: 1, userId: user, lessons: { "c1/01-press-the-button": lesson }, mastery: {}, warmupCounts: {}, events: [] }));
  this.progress = new LocalStorageProgressStore(fakeStorage(this));
});

Given("stored progress for {string} whose card kinds are damaged", function (this: World, user: string) {
  this.storage = new Map();
  this.failing = false;
  this.storage.set(progressKey(user), JSON.stringify({ version: 1, userId: user, lessons: {}, mastery: {}, cardsUsed: ["put", "Not A Kind!", 7, "put"], events: [] }));
  this.progress = new LocalStorageProgressStore(fakeStorage(this));
});

Then("the Instruction Deck of {string} holds {string}", function (this: World, user: string, kinds: string) {
  assert.deepEqual(this.progress.export(user).cardsUsed, list(kinds));
});

Then("the Instruction Deck of {string} holds nothing", function (this: World, user: string) {
  assert.deepEqual(this.progress.export(user).cardsUsed, []);
});

Then("{string} has passed {string}", function (this: World, user: string, lesson: string) {
  assert.equal(this.progress.getLesson(user, lesson).passed, true);
});

Then("recording an attempt with the card kinds {string} is refused", function (this: World, kinds: string) {
  assert.throws(() => this.progress.recordAttempt("ada", "c1/01-press-the-button", { passed: true, stars: ["pass"], cards: 1, steps: 1, cardsUsed: list(kinds) }), RangeError);
});

// The Gallery

Given("an empty Gallery store", function (this: World) {
  this.storage = new Map();
  this.heardGallery = 0;
  freshGallery(this);
});

Given("a Gallery store whose storage always fails", function (this: World) {
  this.storage = new Map();
  freshGallery(this, true);
});

Given("a Gallery store whose storage holds {} for {string}", function (this: World, stored: string, user: string) {
  this.storage = new Map([[galleryKey(user), stored]]);
  freshGallery(this);
});

Given("a Gallery store with one good and one damaged item stored for {string}", function (this: World, user: string) {
  const good = { id: "a", lessonId: "c1/01-press-the-button", title: "Heart", createdAt: 1, kind: "pixels", data: { pixels: pixels() } };
  const bad = { id: "b", lessonId: "c1/01-press-the-button", title: "Broken", createdAt: 2, kind: "pixels", data: { pixels: [1, 2] } };
  this.storage = new Map([[galleryKey(user), JSON.stringify({ version: 1, items: [good, bad, "junk"] })]]);
  freshGallery(this);
});

Given("I subscribe to the Gallery of {string}", function (this: World, user: string) {
  this.heardGallery = 0;
  this.gallery.subscribe((who) => {
    if (who === user) this.heardGallery++;
  });
});

const pictureNamed = (title: string, lessonId: string): NewGalleryItem => ({ title, lessonId, kind: "pixels", data: { pixels: pixels() } });

When("{string} adds a pixel picture {string} from {string}", function (this: World, user: string, title: string, lesson: string) {
  this.gallery.add(user, pictureNamed(title, lesson));
});

When("{string} adds a program {string} from {string}", function (this: World, user: string, title: string, lesson: string) {
  this.gallery.add(user, { title, lessonId: lesson, kind: "program", data: { words: [0x00500513, 0x00700593] } });
});

When("{string} adds {int} pixel pictures", function (this: World, user: string, count: number) {
  for (let i = 1; i <= count; i++) this.gallery.add(user, pictureNamed(`Picture ${i}`, "c1/01-press-the-button"));
});

When("{string} removes {string} from the Gallery", function (this: World, user: string, title: string) {
  const item = this.gallery.list(user).find((x: GalleryItem) => x.title === title);
  assert.ok(item, `no item titled ${title}`);
  this.gallery.remove(user, item.id);
});

const titles = (w: World, user: string) => w.gallery.list(user).map((x) => x.title);

Then("the Gallery of {string} holds {string}", function (this: World, user: string, expected: string) {
  assert.deepEqual(titles(this, user).includes(expected) ? [expected] : titles(this, user), [expected]);
});

Then("the Gallery of {string} holds nothing", function (this: World, user: string) {
  assert.deepEqual(titles(this, user), []);
});

Then("the Gallery of {string} holds {int} items", function (this: World, user: string, count: number) {
  assert.equal(titles(this, user).length, count);
  assert.equal(count, MAX_GALLERY_ITEMS);
});

Then("the Gallery of {string} no longer holds {string}", function (this: World, user: string, title: string) {
  assert.ok(!titles(this, user).includes(title));
});

Then("a fresh Gallery store over the same storage shows the Gallery of {string} holding {string}", function (this: World, user: string, title: string) {
  assert.deepEqual(titles({ ...this, gallery: new LocalStorageGalleryStore(fakeStorage(this)) }, user), [title]);
});

Then("the browser storage holds the Gallery of {string} under {string}", function (this: World, user: string, key: string) {
  assert.equal(galleryKey(user), key);
  assert.equal(JSON.parse(this.storage.get(key) ?? "null").version, 1);
});

Then("the damaged Gallery data of {string} is kept as a backup", function (this: World, user: string) {
  assert.equal(this.storage.get(galleryBackupKey(user)), this.storage.get(galleryKey(user)));
});

Then("I was told about {int} Gallery changes", function (this: World, count: number) {
  assert.equal(this.heardGallery, count);
});

Then("adding a Gallery item with {} is refused", function (this: World, problem: string) {
  const ok = pictureNamed("Heart", "c1/01-press-the-button");
  const bad: Record<string, NewGalleryItem> = {
    "a pixel picture of 10 pixels": { ...ok, data: { pixels: pixels().slice(0, 10) } } as NewGalleryItem,
    "a pixel color outside the palette": { ...ok, data: { pixels: pixels(9) } } as NewGalleryItem,
    "a program of 1000 words": { title: "P", lessonId: "c1/04-two-boxes", kind: "program", data: { words: Array.from({ length: 1000 }, () => 1) } },
    "a program word that is not 32 bits": { title: "P", lessonId: "c1/04-two-boxes", kind: "program", data: { words: [2 ** 33] } },
    "a title of 500 characters": { ...ok, title: "x".repeat(500) } as NewGalleryItem,
    "a lesson id that is not a lesson id": { ...ok, lessonId: "../Etc" } as NewGalleryItem,
  };
  const item = bad[problem];
  assert.ok(item, `unknown problem ${problem}`);
  assert.throws(() => this.gallery.add("ada", item), RangeError);
  assert.deepEqual(this.gallery.list("ada"), []);
});

// Learning settings

Given("an empty Learning settings store", function (this: World) {
  this.storage = new Map();
  this.failing = false;
  this.learning = createLearningStore(fakeStorage(this));
});

Given("a Learning settings store whose storage holds {string} for {string}", function (this: World, stored: string, user: string) {
  this.storage = new Map([[learningKey(user), stored]]);
  this.failing = false;
  this.learning = createLearningStore(fakeStorage(this));
});

When("I turn {string} on for {string}", function (this: World, _name: string, user: string) {
  this.learning.set(user, { unlockAll: true });
});

Then("{string} is off for {string}", function (this: World, _name: string, user: string) {
  assert.equal(this.learning.get(user).unlockAll, false);
});

Then("{string} is on for {string}", function (this: World, _name: string, user: string) {
  assert.equal(this.learning.get(user).unlockAll, true);
});

Then("the browser storage holds the Learning settings of {string} under {string}", function (this: World, user: string, key: string) {
  assert.equal(learningKey(user), key);
  assert.equal(JSON.parse(this.storage.get(key) ?? "null").unlockAll, true);
});
