// Lab section for the course components, running on fake in-memory stores (nothing is saved).
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { StorageLike } from "@sierrendipity/lesson-core";
import type { CatalogLesson } from "../../course/catalog";
import { CourseProvider, memoryProgress, useCourse } from "../../course/CourseProvider";
import { DeckView } from "../../course/DeckPage";
import { GalleryView, PixelPicture } from "../../course/GalleryPage";
import { LocalStorageGalleryStore } from "../../course/gallery";
import { createLearningStore } from "../../course/learning";
import { NowYouCanCard } from "../../course/NowYouCanCard";
import { PathPage } from "../../course/PathPage";
import { MemoryRouter } from "../../course/router";
import { WarmupCard } from "../../course/WarmupCard";

export const title = "Course path and progress";

const card = (a: number, b: number): CatalogLesson["warmups"][number] => ({
  id: `add-${a}-${b}`,
  concept: "add",
  question: `Box a0 holds ${a} and box a1 holds ${b}. After the add card, what does box a2 hold?`,
  program: { kind: "asm", text: "", words: [0x00000513 | (a << 20), 0x00000593 | (b << 20), 0x00b50633] },
  target: "a2",
  expected: a + b,
});

const lesson = (n: number, slug: string, name: string, minutes: number, concept: string, now: string, extra: Partial<CatalogLesson> = {}): CatalogLesson => ({
  id: `c1/0${n}-${slug}`,
  title: name,
  minutes,
  concepts: { introduces: [concept], requires: [] },
  warmups: [],
  sideRooms: [],
  nowYouCan: [now],
  ...extra,
});

const LESSONS: CatalogLesson[] = [
  lesson(1, "press-the-button", "Press the Button", 3, "cards", "Step a program one card at a time."),
  lesson(2, "change-the-number", "Change the Number", 3, "numbers-on-cards", "Spin a number on a card.", { sideRooms: [{ id: "hex-secrets", title: "Hex secrets", opensWith: "another-way" }] }),
  lesson(3, "last-one-wins", "Last One Wins", 4, "last-wins", "See that the last card wins."),
  lesson(4, "two-boxes", "Two Boxes", 4, "two-boxes", "Keep two numbers in two boxes."),
  lesson(5, "add", "Add", 4, "add", "Add two boxes into a third.", { warmups: [card(3, 4)] }),
];

const memoryStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};

const heart = Array.from({ length: 256 }, (_, i) => ((i % 16) + Math.floor(i / 16)) % 8);

function Controls() {
  const { progress, userId, resetProgress, gallery } = useCourse();
  const pass = (n: number, stars: string[] = ["pass"], cardsUsed: string[] = ["put"]) => {
    for (const l of LESSONS.slice(0, n)) progress.recordAttempt(userId, l.id, { passed: true, stars, cards: 2, steps: 2, concepts: l.concepts.introduces, cardsUsed });
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Fake progress">
      <Button variant="outline" size="sm" onClick={() => resetProgress()}>
        Set progress: nothing passed
      </Button>
      <Button variant="outline" size="sm" onClick={() => pass(2, ["pass", "another-way"])}>
        Set progress: two passed
      </Button>
      <Button variant="outline" size="sm" onClick={() => pass(5)}>
        Set progress: all passed
      </Button>
      <Button variant="outline" size="sm" onClick={() => gallery.add(userId, { lessonId: LESSONS[0]!.id, title: `Picture ${Date.now() % 1000}`, kind: "pixels", data: { pixels: heart } })}>
        Add a pixel picture
      </Button>
      <Button variant="outline" size="sm" onClick={() => gallery.add(userId, { lessonId: LESSONS[3]!.id, title: "Two boxes", kind: "program", data: { words: [0x00500513, 0x00700593] } })}>
        Add a program
      </Button>
    </div>
  );
}

function Parts() {
  const { galleryItems, gallery, userId, data } = useCourse();
  const [report, setReport] = useState("Nothing pressed yet");
  return (
    <div className="grid gap-8">
      <Controls />
      <p data-lab-report className="text-sm text-muted-foreground">
        {report}
      </p>
      <div className="max-w-2xl">
        <PathPage />
      </div>
      <div className="max-w-2xl">
        <WarmupCard autoFocus={false} picked={{ concept: "add", lessonId: LESSONS[4]!.id, warmup: card(3, 4) }} onAnswer={(ok) => setReport(ok ? "Warm-up answered right" : "Warm-up missed")} onDone={() => setReport("Warm-up closed")} />
      </div>
      <div className="max-w-2xl">
        <NowYouCanCard lesson={LESSONS[1]!} stats={{ stars: ["pass", "called-it"], nextMinutes: 4 }} onNext={() => setReport("Next lesson chosen")} onStop={() => setReport("Stopped here")}>
          <PixelPicture pixels={heart} label="The picture you made, a 16 by 16 pixel picture" />
        </NowYouCanCard>
      </div>
      <GalleryView items={galleryItems} onReplay={(item) => setReport(`Replay ${item.title}`)} onRemove={(item) => gallery.remove(userId, item.id)} />
      <DeckView cardsUsed={data.cardsUsed} />
    </div>
  );
}

export default function CourseSection() {
  const services = useMemo(
    () => ({ catalog: LESSONS, progress: memoryProgress, gallery: new LocalStorageGalleryStore(), learning: createLearningStore(memoryStorage()), sessionStorage: memoryStorage() }),
    [],
  );
  return (
    <CourseProvider userId="lab" services={services}>
      <MemoryRouter initial="/learn" locked>
        <Parts />
      </MemoryRouter>
    </CourseProvider>
  );
}
