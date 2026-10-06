import type { GalleryStore } from "./gallery";
import type { ProgressStore } from "@sierrendipity/lesson-core";
import type { CatalogLesson } from "./catalog";
import { Button } from "@/components/ui/button";
import { Link } from "./router";
import { about } from "./parts";

/**
 * THE SEAM FOR THE LESSON PLAYER. `/learn/<lessonId>` renders `<LessonRoute .../>`. The coach PR replaces the
 * body of this component (or the file) with the real player; everything it needs is passed in:
 *  - `lesson`: catalog metadata (id, title, minutes, concepts, nowYouCan, sideRooms);
 *  - `userId`, `progress`: record attempts and events (`progress.recordAttempt(userId, lesson.id, { passed, stars,
 *    cards, steps, concepts, cardsUsed })`; the Instruction Deck fills from `cardsUsed`);
 *  - `gallery`: `gallery.add(userId, { lessonId, title, kind, data })` for things the student made;
 *  - `search`: the query string (`?room=<id>` opens a side room, `?replay=<galleryItemId>` replays a made item);
 *  - `onExit`: back to the path (`[Stop here]`); `onNext`: to the path's next Continue target.
 * Passing a lesson makes the next one current on the path; stars never block it.
 */
export interface LessonRouteProps {
  lesson: CatalogLesson;
  userId: string;
  progress: ProgressStore;
  gallery: GalleryStore;
  search: string;
  onExit: () => void;
  onNext: () => void;
}

export function LessonRoute(props: LessonRouteProps) {
  return <LessonPlaceholder {...props} />;
}

/** A plain page until the player exists: title, minutes and, only with `?dev=1`, a way to pass the lesson. */
export function LessonPlaceholder({ lesson, userId, progress, search, onExit }: LessonRouteProps) {
  const params = new URLSearchParams(search);
  const dev = params.get("dev") === "1";
  const room = lesson.sideRooms.find((r) => r.id === params.get("room"));
  return (
    <section className="grid gap-4">
      <Link to="/learn" className="w-fit text-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Back to the path
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{lesson.title}</h1>
      <p className="text-muted-foreground">{about(lesson.minutes)}</p>
      {room && <p className="rounded-lg border bg-card p-3 text-card-foreground">Side room: {room.title}</p>}
      <p>The lesson player is on its way. Your path is ready for it.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onExit}>
          Stop here
        </Button>
        {dev && (
          <Button
            variant="secondary"
            onClick={() => {
              progress.recordAttempt(userId, lesson.id, { passed: true, stars: ["pass"], cards: 1, steps: 1, concepts: lesson.concepts.introduces, cardsUsed: [] });
              onExit();
            }}
          >
            Mark as passed (dev)
          </Button>
        )}
      </div>
    </section>
  );
}
