import { Lightbulb, LogOut, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
import { LessonRoute } from "./LessonRoute";
import { buildPath, canOpen } from "./model";
import { PathPage } from "./PathPage";
import { Link, learnPage, useRouter } from "./router";

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

function Lesson({ lessonId }: { lessonId: string }) {
  const { catalog, data, unlockAll, progress, gallery, userId } = useCourse();
  const { navigate, search } = useRouter();
  const lessons = catalog.status === "ready" ? catalog.lessons : [];
  const lesson = lessons.find((l) => l.id === lessonId);
  const model = buildPath(data, lessons);
  const allowed = lesson !== undefined && canOpen(model, lessonId, unlockAll);
  useEffect(() => {
    if (catalog.status === "ready" && !allowed) navigate("/learn", { replace: true });
  }, [catalog.status, allowed, navigate]);
  if (!lesson || !allowed) return null;
  return <LessonRoute lesson={lesson} userId={userId} progress={progress} gallery={gallery} search={search} onExit={() => navigate("/learn")} onNext={() => navigate(model.target ? `/learn/${model.target.id}` : "/learn")} />;
}

/** The Learn area: its own header (same brand, areas, settings, sign-out) and the course pages. */
export function LearnApp({ signedInAs, onSignOut }: { signedInAs?: string; onSignOut: () => void }) {
  const { catalog } = useCourse();
  const { path } = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const route = learnPage(path);

  let body: ReactNode;
  if (catalog.status === "loading") body = <p className="text-muted-foreground">Loading the course…</p>;
  else if (catalog.status === "error")
    body = (
      <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-danger-fg">
        The course could not be loaded: {catalog.message}. <Link to="/workspace" className="underline">Open the Workspace</Link> meanwhile.
      </p>
    );
  else if (route.page === "lesson") body = <Lesson lessonId={route.lessonId} />;
  else
    body = (
      <div className="grid gap-5">
        <SubNav page={route.page} />
        {route.page === "path" ? (
          <div className="grid gap-5">
            <h1 className="text-3xl font-semibold tracking-tight">Course 1</h1>
            <PathPage />
          </div>
        ) : route.page === "gallery" ? (
          <GalleryPage />
        ) : (
          <DeckPage />
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
