// A tiny path router (no dependency): the app has two areas and a handful of pages, so a context with
// `path`, `search` and `navigate` is all it takes. The lab swaps in a memory router that never leaves the page.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export interface RouterValue {
  path: string;
  search: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const Context = createContext<RouterValue | null>(null);

const split = (to: string): { path: string; search: string } => {
  const q = to.indexOf("?");
  return q < 0 ? { path: to, search: "" } : { path: to.slice(0, q), search: to.slice(q) };
};

/** The real router: follows the address bar and the back button. */
export function BrowserRouter({ children }: { children: ReactNode }) {
  const [at, setAt] = useState(() => ({ path: location.pathname, search: location.search }));
  useEffect(() => {
    const sync = () => setAt({ path: location.pathname, search: location.search });
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) history.replaceState(null, "", to);
    else history.pushState(null, "", to);
    const next = split(to);
    setAt(next);
    scrollTo(0, 0);
  }, []);
  const value = useMemo(() => ({ ...at, navigate }), [at, navigate]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** A router that stays in memory (component lab): `onNavigate` hears every request; `locked` keeps the page. */
export function MemoryRouter({ initial, locked = false, onNavigate, children }: { initial: string; locked?: boolean; onNavigate?: (to: string) => void; children: ReactNode }) {
  const [at, setAt] = useState(() => split(initial));
  const navigate = useCallback(
    (to: string) => {
      onNavigate?.(to);
      if (!locked) setAt(split(to));
    },
    [locked, onNavigate],
  );
  const value = useMemo(() => ({ ...at, navigate }), [at, navigate]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useRouter(): RouterValue {
  const value = useContext(Context);
  if (!value) throw new Error("useRouter must be used inside a router");
  return value;
}

export function Link({ to, onClick, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

export type Area = "learn" | "workspace";
export const areaOf = (path: string): Area | null => (path === "/workspace" || path.startsWith("/workspace/") ? "workspace" : path === "/learn" || path.startsWith("/learn/") ? "learn" : null);

export type LearnPage = { page: "path" } | { page: "gallery" } | { page: "deck" } | { page: "lesson"; lessonId: string };

/** `/learn`, `/learn/gallery`, `/learn/deck` or `/learn/<lessonId>` (lesson ids hold a slash: c1/01-name). */
export function learnPage(path: string): LearnPage {
  const rest = path.replace(/^\/learn\/?/, "").replace(/\/+$/, "");
  if (rest === "") return { page: "path" };
  if (rest === "gallery" || rest === "deck") return { page: rest };
  return { page: "lesson", lessonId: rest };
}

/** Set the tab title for a page: "Gallery · Sierrendipity". */
export function Title({ text }: { text: string }) {
  useEffect(() => {
    document.title = `${text} · Sierrendipity`;
  }, [text]);
  return null;
}
