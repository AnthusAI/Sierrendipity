import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Config } from "../config";
import { devBackend } from "../config";
import { Ide } from "../Ide";
import { AreaNav } from "./AreaNav";
import { useCourse } from "./CourseProvider";
import { LearnApp } from "./LearnApp";
import { buildPath } from "./model";
import { areaOf, BrowserRouter, useRouter } from "./router";

interface Props {
  config: Config;
  /** The signed-in student's email (undefined with the dev backend). */
  user?: string;
  getIdToken: () => Promise<string | null>;
  onSignOut: () => void;
}

function Areas({ config, user, getIdToken, onSignOut }: Props) {
  const { path, navigate } = useRouter();
  const { catalog, data, sessions } = useCourse();
  const area = areaOf(path);
  // The IDE mounts the first time the Workspace is opened (it starts a cloud workspace) and then stays, hidden, so its work survives a visit to Learn.
  const [visited, setVisited] = useState(area === "workspace");
  useEffect(() => {
    if (area === "workspace") setVisited(true);
  }, [area]);
  useEffect(() => {
    sessions.touch();
  }, [path, sessions]);

  // `/` (or any unknown path) lands on Learn until Course 1 is finished, then on the Workspace.
  useEffect(() => {
    if (area !== null || catalog.status === "loading") return;
    const finished = catalog.status === "ready" && buildPath(data, catalog.lessons).state.continueTarget.kind === "complete";
    navigate(catalog.status === "error" || finished ? "/workspace" : "/learn", { replace: true });
  }, [area, catalog, data, navigate]);

  if (area === null)
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Loading…
        </p>
      </div>
    );
  return (
    <>
      {visited && (
        <div hidden={area !== "workspace"} className="h-full">
          <Ide config={config} user={user} getIdToken={getIdToken} onSignOut={onSignOut} nav={<AreaNav />} />
        </div>
      )}
      {area === "learn" && <LearnApp signedInAs={devBackend(config) ? undefined : user} onSignOut={onSignOut} />}
    </>
  );
}

/** The signed-in app: Learn (the course) and Workspace (the IDE), switched by path. */
export function Shell(props: Props) {
  return (
    <BrowserRouter>
      <Areas {...props} />
    </BrowserRouter>
  );
}
