import type { GalleryStore } from "./gallery";
import type { ProgressStore } from "@sierrendipity/lesson-core";
import type { CatalogLesson } from "./catalog";
import { Button } from "@/components/ui/button";
import { LessonPlayer } from "../coach";
import { LessonLoadError } from "../lessons/LessonLoadError";
import { useLesson } from "../lessons";
import { Link } from "./router";
import { about } from "./parts";

/**
 * `/learn/<lessonId>` renders the real lesson player (`web/src/coach/`) on the published lesson JSON. The
 * player records attempts, hints, Show me and predictions straight into `progress` (attempts carry `cardsUsed`
 * for the Instruction Deck). What the route is given:
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
  /** The path's next Continue target, for the end card's [Next lesson]; null when there is none. */
  next?: { id: string; title: string; minutes: number } | null;
}

export function LessonRoute(props: LessonRouteProps) {
  const { lesson, userId, progress, onExit, onNext, next = null } = props;
  const params = new URLSearchParams(props.search);
  const room = lesson.sideRooms.find((r) => r.id === params.get("room"));
  const loaded = useLesson(lesson.id);
  return (
    <section className="grid gap-4">
      <Link to="/learn" className="w-fit text-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Back to the path
      </Link>
      <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">{lesson.title}</h1>
      <p className="text-muted-foreground">{about(lesson.minutes)}</p>
      {room && <p className="rounded-lg border bg-card p-3 text-card-foreground">Side room: {room.title}</p>}
      {loaded.status === "loading" && <p>Loading the lesson.</p>}
      {loaded.status === "error" && <LessonLoadError onRetry={() => location.reload()} onBack={onExit} />}
      {loaded.status === "ready" && <LessonPlayer key={loaded.lesson.id} lesson={loaded.lesson} store={progress} userId={userId} next={next} onNext={() => onNext()} onStop={onExit} />}
      <LessonDevTools {...props} />
    </section>
  );
}

/** Only with `?dev=1` in a dev or `VITE_DEV_TOOLS=1` build: a way to pass the lesson without playing it. */
function LessonDevTools({ lesson, userId, progress, search, onExit }: LessonRouteProps) {
  const dev = new URLSearchParams(search).get("dev") === "1" && (import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "1");
  if (!dev) return null;
  return (
    <div>
      <Button
        variant="secondary"
        onClick={() => {
          progress.recordAttempt(userId, lesson.id, { passed: true, stars: ["pass"], cards: 1, steps: 1, concepts: lesson.concepts.introduces, cardsUsed: [] });
          onExit();
        }}
      >
        Mark as passed (dev)
      </Button>
    </div>
  );
}
