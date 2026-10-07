import { pickWarmup, type PathLesson, type PickedWarmup } from "@sierrendipity/lesson-core";
import { useState, type ReactNode } from "react";
import { ArrowRight, DoorClosed, DoorOpen, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CatalogLesson } from "./catalog";
import { useCourse, useLessons } from "./CourseProvider";
import { baseOf, buildPath, starLabel, starsOf, type PathModel } from "./model";
import { about, StarChips } from "./parts";
import { Link, useRouter } from "./router";
import { WarmupCard } from "./WarmupCard";

const lessonPath = (id: string) => `/learn/${id}`;

function Door({ title, open, to, hint }: { title: string; open: boolean; to: string; hint: string }) {
  const base = "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return open ? (
    <Link to={to} data-door={title} data-open="true" className={cn(base, "bg-card font-medium text-card-foreground hover:bg-accent")}>
      <DoorOpen aria-hidden className="size-4 shrink-0" />
      {title}
    </Link>
  ) : (
    <div data-door={title} data-open="false" className={cn(base, "border-dashed bg-muted text-left text-muted-foreground")}>
      <DoorClosed aria-hidden className="size-4 shrink-0" />
      <span>
        {title}
        <span className="block text-xs">{hint}</span>
      </span>
    </div>
  );
}

function Chooser({ choice, picked, onPick }: { choice: CatalogLesson[]; picked: string; onPick: (id: string) => void }) {
  return (
    <div role="group" aria-label="Pick what's next" data-layout-item="chooser" className="grid gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pick what&apos;s next</h2>
      <div className="grid grid-cols-2 gap-3">
        {choice.map((l) => (
          <button
            key={l.id}
            type="button"
            data-choice={l.title}
            aria-pressed={picked === l.id}
            onClick={() => onPick(l.id)}
            className={cn(
              "grid gap-1 rounded-xl border-2 bg-card p-4 text-left text-card-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              picked === l.id ? "border-primary" : "border-border hover:bg-accent",
            )}
          >
            <span className="text-lg font-semibold">{l.title}</span>
            <span className="text-sm text-muted-foreground">{about(l.minutes)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PathView({
  model,
  unlockAll,
  roomsOf,
  onPick,
  picked,
  header,
}: {
  model: PathModel;
  unlockAll: boolean;
  roomsOf: (lessonId: string) => PathModelRooms;
  onPick: (baseId: string, lessonId: string) => void;
  picked: string | null;
  header?: ReactNode;
}) {
  const { navigate } = useRouter();
  const { state, target } = model;
  const catalog = new Map(model.lessons.map((l) => [l.id, l]));
  const entries = state.lessons;
  const current = entries.find((l) => l.status === "current");
  const next = entries.find((l) => l.status === "next");
  const done = entries.filter((l): l is Extract<PathLesson, { status: "done" }> => l.status === "done");
  const lastDone = done.at(-1);
  const fog = entries.filter((l) => l.status === "fog");
  const minutes = (id: string) => catalog.get(id)?.minutes ?? 5;

  const doors = state.sideRooms.filter((r) => {
    const status = entries.find((l) => l.id === r.lessonId)?.status;
    return status === "done" || status === "current" || status === "next";
  });

  const continueLabel = target ? `Continue: ${target.title}, ${about(target.minutes)}` : "Continue: open the Workspace";
  const goOn = () => navigate(target ? lessonPath(target.id) : "/workspace");
  const continueButton = (
    <Button data-primary-action size="default" className="h-auto min-h-12 whitespace-normal px-6 py-2 text-left text-base" onClick={goOn}>
      {continueLabel}
      <ArrowRight aria-hidden />
    </Button>
  );

  return (
    <div className="grid gap-6">
      {header}
      <div role="region" aria-label="Course path" className="grid gap-4">
        {model.choice && <Chooser choice={model.choice} picked={picked ?? model.choice[0]!.id} onPick={(id) => onPick(baseOf(model.choice![0]!), id)} />}
        {current ? (
          <article data-lesson-title={current.title} data-status="current" data-prominent="true" data-layout-item="current" className="grid gap-3 rounded-2xl border-2 border-primary bg-card p-6 text-card-foreground">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Up now</p>
            <h2 className="text-2xl font-semibold tracking-tight">{current.title}</h2>
            <p className="text-muted-foreground">{about(minutes(current.id))}</p>
            <div>{continueButton}</div>
          </article>
        ) : (
          <article data-layout-item="current" className="grid gap-3 rounded-2xl border-2 border-primary bg-card p-6 text-card-foreground">
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Sparkles aria-hidden className="size-5" /> You finished Course 1
            </h2>
            <p className="text-muted-foreground">Every lesson is passed. The Workspace is yours.</p>
            <div>{continueButton}</div>
          </article>
        )}
        {next && (
          <div data-lesson-title={next.title} data-status="next" data-prominent="true" data-layout-item="next" className="mx-4 grid gap-1 rounded-xl border bg-muted p-4 text-muted-foreground">
            <p className="text-xs font-semibold uppercase tracking-wide">Next</p>
            <p className="text-lg font-medium">
              {unlockAll ? (
                <Link to={lessonPath(next.id)} aria-label={`Open ${next.title}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {next.title}
                </Link>
              ) : (
                next.title
              )}
            </p>
            <p className="text-sm">{about(minutes(next.id))}</p>
          </div>
        )}
        {fog.length > 0 && (
          <ul aria-label="Later lessons" data-layout-item="fog" className="mx-10 grid gap-2">
            {fog.map((l) => (
              <li key={l.id} data-lesson-title={l.title} data-status="fog" className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-dashed bg-muted px-4 py-2 text-muted-foreground">
                {unlockAll ? (
                  <Link to={lessonPath(l.id)} aria-label={`Open ${l.title}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {l.title}
                  </Link>
                ) : (
                  <span>{l.title}</span>
                )}
                <span aria-hidden className="h-3 w-16 shrink-0 rounded-full bg-border" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {done.length > 0 && (
        <section aria-label="Stars so far" data-layout-item="stars" className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stars so far</h2>
          <ul className="grid gap-1.5">
            {done.map((l) => (
              <li
                key={l.id}
                data-lesson-title={l.title}
                data-status="done"
                data-prominent={l === lastDone ? "true" : "false"}
                className={cn("flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 text-card-foreground", l === lastDone ? "py-2.5" : "py-1.5 text-sm")}
              >
                <Star aria-hidden className="size-4 shrink-0 fill-current" />
                <Link to={lessonPath(l.id)} aria-label={`Open ${l.title} again`} className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {l.title}
                </Link>
                <StarChips stars={starsOf(l.bonuses)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {doors.length > 0 && (
        <section aria-label="Side rooms" data-layout-item="doors" className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Side rooms</h2>
          <ul className="flex flex-wrap gap-2">
            {doors.map((r) => {
              const info = roomsOf(r.id);
              return (
                <li key={r.id}>
                  <Door title={r.title} open={r.open} to={`${lessonPath(r.lessonId)}?room=${r.id}`} hint={r.open ? "" : info.hint} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section aria-label="What you can do now" data-layout-item="recap" className="grid gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">What you can do now</h2>
          <ul className="grid list-disc gap-1 pl-5">
            {done.flatMap((l) => catalog.get(l.id)?.nowYouCan ?? []).filter((text, i, all) => all.indexOf(text) === i).map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type PathModelRooms = { hint: string };

/** The connected path page: progress, warm-up, branch picks and the tutor override come from the course context. */
export function PathPage() {
  const { data, unlockAll, progress, userId, sessions, now } = useCourse();
  const lessons = useLessons();
  const { picks, setPick } = useCourse();
  const model = buildPath(data, lessons, picks);

  // The warm-up is decided once when the page opens: at most one per session, only when something is due.
  const [warmup, setWarmup] = useState<PickedWarmup | null>(() => {
    const session = sessions.touch();
    if (session.warmupOffered) return null;
    const picked = pickWarmup(data, lessons, now());
    if (picked) sessions.markWarmupOffered();
    return picked;
  });

  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const roomsOf = (roomId: string): PathModelRooms => {
    const room = model.state.sideRooms.find((r) => r.id === roomId)!;
    const lesson = lessonById.get(room.lessonId);
    const passed = data.lessons[room.lessonId]?.passed === true;
    const star = lesson?.sideRooms.find((r) => r.id === roomId)?.opensWith ?? "";
    return { hint: passed ? `Opens with the star ${starLabel(star)}` : `Opens after you pass ${lesson?.title ?? "its lesson"}` };
  };

  return (
    <PathView
      model={model}
      unlockAll={unlockAll}
      roomsOf={roomsOf}
      picked={model.choice ? (picks[baseOf(model.choice[0]!)] ?? model.choice[0]!.id) : null}
      onPick={setPick}
      header={
        warmup && (
          <WarmupCard
            picked={warmup}
            onAnswer={(correct) => progress.recordEvent(userId, { type: "warmup", concept: warmup.concept, correct, lessonId: warmup.lessonId })}
            onDone={() => setWarmup(null)}
          />
        )
      }
    />
  );
}
