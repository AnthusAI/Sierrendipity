import { useEffect, useState } from "react";
import { claims } from "../../auth";
import { defaultProgressStore, labClock, LessonPlayer } from "../../coach";
import { nextLessonAfter, useLesson, type LessonInfo } from "../../lessons";

export const title = "Coach and lesson player";

const DEFAULT_LESSON = "c1/01-press-the-button";
const idFromUrl = () => new URLSearchParams(location.search).get("lesson") ?? DEFAULT_LESSON;
const clock = labClock();
const store = defaultProgressStore();
const userId = (() => {
  const sub = claims()?.sub;
  return sub && /^[A-Za-z0-9._@-]{1,64}$/.test(sub) ? sub : "local";
})();

/** What the store says about this lesson, as one line (a developer aid: it also proves persistence). */
function ProgressLine({ lessonId }: { lessonId: string }) {
  const [, tick] = useState(0);
  useEffect(() => store.subscribe(() => tick((n) => n + 1)), []);
  let text = "no progress yet";
  try {
    const p = store.getLesson(userId, lessonId);
    text = `${p.passed ? "passed" : "not passed"}, ${p.attempts} attempt(s), bonuses: ${p.bonuses.join(", ") || "none"}, hints ${p.hintsUsed.join("/")}, Show me ${p.showMeUsed}`;
  } catch {
    /* storage trouble never breaks the lab */
  }
  return (
    <p data-lab-progress className="mt-3 text-xs text-muted-foreground">
      Progress for {userId}: {text}
    </p>
  );
}

export default function CoachSection() {
  const [id, setId] = useState(idFromUrl);
  const state = useLesson(id);
  const [next, setNext] = useState<LessonInfo | null>(null);
  useEffect(() => {
    let live = true;
    nextLessonAfter(id).then(
      (n) => live && setNext(n),
      () => live && setNext(null),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const go = (lessonId: string) => {
    const query = new URLSearchParams(location.search);
    query.set("lesson", lessonId);
    history.pushState(null, "", `?${query}`);
    setId(lessonId);
  };

  if (state.status === "loading") return <p>Loading the lesson.</p>;
  if (state.status === "error") return <p role="alert">{state.error}</p>;
  return (
    <>
      <LessonPlayer key={state.lesson.id} lesson={state.lesson} store={store} userId={userId} clock={clock} next={next} onNext={go} />
      <ProgressLine lessonId={state.lesson.id} />
    </>
  );
}
