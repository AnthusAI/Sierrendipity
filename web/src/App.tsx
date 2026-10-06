import { Lightbulb, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { claims, getIdToken, handleCallback, isSignedIn, signOut, startLogin } from "./auth";
import { devBackend, loadConfig, type Config } from "./config";
import { Ide } from "./Ide";
import { LOCAL_USER } from "./settings";
import { AppearanceProvider } from "./theme/appearance";

type Boot = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; config: Config };

/** A centered message screen (loading, startup failure, sign-in). */
function Screen({ children, role }: { children: ReactNode; role?: "alert" }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-6 text-center" role={role}>
      {children}
    </div>
  );
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ phase: "loading" });
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string>();

  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      if (!devBackend(config)) setAuthError(await handleCallback(config));
      setSignedIn(isSignedIn());
      setBoot({ phase: "ready", config });
    })().catch((error) => setBoot({ phase: "error", message: String(error.message ?? error) }));
  }, []);

  const config = boot.phase === "ready" ? boot.config : undefined;
  const idToken = useCallback(async () => {
    const token = await getIdToken(config!);
    if (!token) setSignedIn(false); // expired and not refreshable: back to the sign-in screen
    return token;
  }, [config]);

  // Settings belong to the Cognito `sub` (or "local" with the dev bypass); nobody is known before sign-in.
  const userId =
    boot.phase !== "ready" ? undefined : devBackend(boot.config) ? LOCAL_USER : signedIn ? (claims()?.sub ?? LOCAL_USER) : undefined;

  let screen: ReactNode;
  if (boot.phase === "loading") {
    screen = (
      <Screen>
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Loading…
        </p>
      </Screen>
    );
  } else if (boot.phase === "error") {
    screen = (
      <Screen>
        <p>Could not start: {boot.message}</p>
      </Screen>
    );
  } else if (!devBackend(boot.config) && !signedIn) {
    screen = (
      <Screen>
        <Lightbulb aria-hidden className="size-10 text-link" />
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to Sierrendipity</h1>
        <p className="max-w-sm text-muted-foreground">Write, run and explore code in your browser.</p>
        {authError && (
          <p role="alert" className="max-w-md rounded-md bg-danger-bg px-3 py-2 text-danger-fg">
            {authError}
          </p>
        )}
        <Button size="default" className="h-10 px-5" onClick={() => void startLogin(boot.config)}>
          Sign in with Google
        </Button>
      </Screen>
    );
  } else {
    screen = <Ide config={boot.config} user={claims()?.email} getIdToken={idToken} onSignOut={() => signOut(boot.config)} />;
  }

  return <AppearanceProvider userId={userId}>{screen}</AppearanceProvider>;
}
