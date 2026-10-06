// Applies the student's appearance (color theme + light/dark/system mode) to the page and shares it
// with components. "System" follows prefers-color-scheme live; there is deliberately no light/dark
// control anywhere except Settings.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { USER_KEY, createLocalStorageSettingsStore, type Appearance, type ModePreference, type SettingsStore } from "@/settings";
import type { Mode, ThemeName } from "./palette";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The one store the app uses. Swap it for a server-backed SettingsStore to sync settings across devices. */
export const settingsStore: SettingsStore = createLocalStorageSettingsStore();

export function resolveMode(preference: ModePreference, systemDark: boolean): Mode {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

/** Write the theme and mode onto <html>: `data-theme`, `data-mode` and the `dark` class (CSS handles color-scheme). */
export function applyAppearance(theme: ThemeName, mode: Mode, root: HTMLElement = document.documentElement) {
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-mode", mode);
  root.classList.toggle("dark", mode === "dark");
}

interface AppearanceContext {
  appearance: Appearance;
  /** The mode in effect: the chosen one, or the system's when the preference is "system". */
  mode: Mode;
  theme: ThemeName;
  setAppearance: (change: Partial<Appearance>) => void;
}

const Context = createContext<AppearanceContext | null>(null);

/**
 * `userId` is the Cognito `sub` (or "local" in dev mode). Before anyone is known (the sign-in screen)
 * the last used appearance applies and nothing is saved.
 */
export function AppearanceProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const read = useCallback((id?: string) => (id ? settingsStore.get(id).appearance : settingsStore.last()), []);
  const [appearance, setAppearanceState] = useState<Appearance>(() => read(userId));
  const [systemDark, setSystemDark] = useState(() => matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    if (userId) {
      try {
        sessionStorage.setItem(USER_KEY, userId);
      } catch {
        /* storage unavailable */
      }
    }
    setAppearanceState(read(userId));
    return userId ? settingsStore.subscribe(userId, (settings) => setAppearanceState(settings.appearance)) : undefined;
  }, [userId, read]);

  useEffect(() => {
    const query = matchMedia(DARK_QUERY);
    const update = () => setSystemDark(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);

  const mode = resolveMode(appearance.mode, systemDark);
  useLayoutEffect(() => applyAppearance(appearance.theme, mode), [appearance.theme, mode]);

  const setAppearance = useCallback(
    (change: Partial<Appearance>) => {
      const next = { ...appearance, ...change };
      setAppearanceState(next);
      if (userId) settingsStore.set(userId, { appearance: next, version: 1 });
    },
    [appearance, userId],
  );

  const value = useMemo(
    () => ({ appearance, mode, theme: appearance.theme, setAppearance }),
    [appearance, mode, setAppearance],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppearance(): AppearanceContext {
  const value = useContext(Context);
  if (!value) throw new Error("useAppearance must be used inside <AppearanceProvider>");
  return value;
}
