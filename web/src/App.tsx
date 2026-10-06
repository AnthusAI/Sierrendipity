import { useCallback, useEffect, useState } from "react";
import { claims, getIdToken, handleCallback, isSignedIn, signOut, startLogin } from "./auth";
import { devBackend, loadConfig, type Config } from "./config";
import { Ide } from "./Ide";

type Boot = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready"; config: Config };

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

  if (boot.phase === "loading") return <p className="center">Loading…</p>;
  if (boot.phase === "error") return <p className="center">Could not start: {boot.message}</p>;

  if (!devBackend(boot.config) && !signedIn) {
    return (
      <div className="center">
        <h1>Sign in to Sierrendipity</h1>
        {authError && <p role="alert">{authError}</p>}
        <button onClick={() => void startLogin(boot.config)}>Sign in with Google</button>
      </div>
    );
  }

  return (
    <Ide
      config={boot.config}
      user={claims()?.email}
      getIdToken={idToken}
      onSignOut={() => signOut(boot.config)}
    />
  );
}
