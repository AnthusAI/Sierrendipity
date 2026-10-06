import { Lightbulb, LogOut, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "../SettingsDialog";
import { AreaNav } from "./AreaNav";
import { useCourse } from "./CourseProvider";
import { DeckPage } from "./DeckPage";
import { GalleryPage } from "./GalleryPage";
import { DRAFTS_ENABLED, useLesson } from "../lessons";
import { LessonRoute } from "./LessonRoute";
import { buildPath, canOpen } from "./model";
import { PathPage } from "./PathPage";
import { Link, learnPage, Title, useRouter } from "./router";

function SubNav({ page }: { page: string }) {
  const items = [
    { page: "path", to: "/learn", label: "Path" },
    { page: "gallery", to: "/learn/gallery", label: "Gallery" },
    { page: "deck", to: "/learn/deck", label: "Deck" },
  ];
  return (
    <nav aria-label="Learn sections" className="flex gap-1">
      {items.map((item) => (
        <Link
          key={item.page}
          to={item.to}
          aria-current={page === item.page ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            page === item.page ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function NotOpen({ title }: { title?: string }) {
  const { navigate } = useRouter();
  return (
    <section className="grid gap-4">
      <Title text="Not open yet" />
      <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">
        Not open yet
      </h1>
      {title ? (
        <>
          <p className="text-lg font-medium">{title}</p>
          <p className="text-muted-foreground">This one is waiting for you further along the path. Finish the lesson before it first.</p>
        </>
      ) : (
        <p className="text-muted-foreground">We could not find that lesson.</p>
      )}
      <div>
        <Button onClick={() => navigate("/learn")}>Back to the path</Button>
      </div>
    </section>
  );
}

/**
 * A draft lesson (`draft: true`): not in the catalog and not on the path. It plays only with `?draft=1` and only in a dev
 * or test build, so the authors can try a lesson before it ships. Its progress is recorded like any other.
 */
function DraftLesson({ lessonId }: { lessonId: string }) {
  const { gallery, userId, progress } = useCourse();
  const { navigate, search } = useRouter();
  const loaded = useLesson(lessonId);
  if (loaded.status === "loading") return <p className="text-muted-foreground">Loading the lesson.</p>;
  if (loaded.status === "error" || !loaded.lesson.draft) return <NotOpen />;
  const { id, title, minutes, concepts } = loaded.lesson;
  const lesson = { id, title, minutes, concepts, nowYouCan: loaded.lesson.nowYouCan, warmups: [], sideRooms: [] };
  return (
    <>
      <Title text={`${title} (draft)`} />
      <LessonRoute lesson={lesson} userId={userId} progress={progress} gallery={gallery} search={search} onExit={() => navigate("/learn")} onNext={() => navigate("/learn")} next={null} />
    </>
  );
}

function Lesson({ lessonId }: { lessonId: string }) {
  const { catalog, data, unlockAll, progress, gallery, galleryItems, userId, picks } = useCourse();
  const { navigate, search } = useRouter();
  const lessons = catalog.status === "ready" ? catalog.lessons : [];
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return DRAFTS_ENABLED && new URLSearchParams(search).get("draft") === "1" ? <DraftLesson lessonId={lessonId} /> : <NotOpen />;
  const model = buildPath(data, lessons, picks);
  const params = new URLSearchParams(search);
  // Replaying something made needs no open lesson; a side room only opens through its star.
  const replay = params.get("replay");
  const replayable = replay !== null && galleryItems.some((i) => i.id === replay && i.lessonId === lessonId);
  const room = params.get("room");
  const roomOpen = room === null || model.state.sideRooms.some((r) => r.id === room && r.lessonId === lessonId && r.open);
  if (!(canOpen(model, lessonId, unlockAll) || replayable) || !roomOpen) return <NotOpen title={lesson.title} />;
  const upcoming = model.target ? lessons.find((l) => l.id === model.target!.id) : undefined;
  const nextInfo = upcoming && upcoming.id !== lessonId ? { id: upcoming.id, title: upcoming.title, minutes: upcoming.minutes } : null;
  return (
    <>
      <Title text={lesson.title} />
      <LessonRoute lesson={lesson} userId={userId} progress={progress} gallery={gallery} search={search} onExit={() => navigate("/learn")} onNext={() => navigate(model.target ? `/learn/${model.target.id}` : "/learn")} next={nextInfo} />
    </>
  );
}

/** The Learn area: its own header (same brand, areas, settings, sign-out) and the course pages. */
export function LearnApp({ signedInAs, onSignOut }: { signedInAs?: string; onSignOut: () => void }) {
  const { catalog, retryCatalog } = useCourse();
  const { path } = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const route = learnPage(path);
  // A route change is announced by the new title and by moving focus to the page heading.
  const lastPath = useRef(path);
  useEffect(() => {
    if (lastPath.current === path || catalog.status !== "ready") return;
    lastPath.current = path;
    document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  }, [path, catalog.status]);

  let body: ReactNode;
  if (catalog.status === "loading") body = <p className="text-muted-foreground">Loading the course…</p>;
  else if (catalog.status === "error")
    body = (
      <div className="grid max-w-2xl gap-4">
        <Title text="Course 1" />
        <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">
          Course 1
        </h1>
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-danger-fg">
          {catalog.message}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={retryCatalog}>Try again</Button>
          <Link to="/workspace" className="text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
            Open the Workspace
          </Link>
        </div>
      </div>
    );
  else if (route.page === "lesson") body = <Lesson lessonId={route.lessonId} />;
  else
    body = (
      <div className="grid gap-5">
        <SubNav page={route.page} />
        {route.page === "path" ? (
          <div className="grid gap-5">
            <Title text="Course 1" />
            <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">
              Course 1
            </h1>
            <PathPage />
          </div>
        ) : route.page === "gallery" ? (
          <>
            <Title text="Gallery" />
            <GalleryPage />
          </>
        ) : (
          <>
            <Title text="Instruction Deck" />
            <DeckPage />
          </>
        )}
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-chrome px-4 py-2 text-chrome-foreground">
        <strong className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Lightbulb aria-hidden className="size-5 text-link" /> Sierrendipity
        </strong>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <AreaNav />
        <span className="flex-1" />
        {signedInAs === undefined ? <Badge>Dev backend</Badge> : <span className="max-w-64 truncate text-[13px] text-muted-foreground">Signed in as {signedInAs}</span>}
        {signedInAs !== undefined && (
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <LogOut />Sign out
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-background">
        <main className="mx-auto max-w-4xl p-6">{body}</main>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
