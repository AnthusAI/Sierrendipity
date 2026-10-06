// Per-user settings. The appearance (color theme and light/dark/system mode) is the first setting.
// Settings live behind `SettingsStore` so a server-backed implementation can replace the
// localStorage one later (a documented follow-up; see docs/ui-design.md).
import { THEMES, type ThemeName } from "./theme/palette";

export const MODE_PREFERENCES = ["light", "dark", "system"] as const;
export type ModePreference = (typeof MODE_PREFERENCES)[number];

export interface Appearance {
  mode: ModePreference;
  theme: ThemeName;
}

export interface Settings {
  appearance: Appearance;
  version: 1;
}

export const DEFAULT_APPEARANCE: Appearance = { mode: "system", theme: "cool" };
export const DEFAULT_SETTINGS: Settings = { appearance: DEFAULT_APPEARANCE, version: 1 };

/** The last appearance used in this browser, read by the inline script in index.html before first paint. */
export const LAST_KEY = "sierrendipity:settings:last";
export const settingsKey = (userId: string) => `sierrendipity:settings:${userId}`;
/** The user id when nobody is signed in (the dev-backend bypass). */
export const LOCAL_USER = "local";

const isMode = (value: unknown): value is ModePreference => MODE_PREFERENCES.includes(value as ModePreference);
const isTheme = (value: unknown): value is ThemeName => THEMES.includes(value as ThemeName);

/** The appearance in `value` (an object), each unknown or missing value replaced by its default. */
export function parseAppearance(value: unknown): Appearance {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    mode: isMode(record.mode) ? record.mode : DEFAULT_APPEARANCE.mode,
    theme: isTheme(record.theme) ? record.theme : DEFAULT_APPEARANCE.theme,
  };
}

/**
 * Validate stored settings, never throwing. Version 1 and the unversioned shape that preceded it are
 * read; data from a newer version (or anything that is not an object) falls back to the defaults.
 */
export function parseSettings(raw: string | null): Settings {
  if (raw === null) return DEFAULT_SETTINGS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_SETTINGS;
  const { version, appearance } = value as { version?: unknown; appearance?: unknown };
  if (version !== undefined && version !== 1) return DEFAULT_SETTINGS;
  if (typeof appearance !== "object" || appearance === null) return DEFAULT_SETTINGS;
  return { appearance: parseAppearance(appearance), version: 1 };
}

export interface SettingsStore {
  get(userId: string): Settings;
  set(userId: string, settings: Settings): void;
  /** `listener` runs after this user's settings change (here or in another tab). Returns an unsubscribe. */
  subscribe(userId: string, listener: (settings: Settings) => void): () => void;
  /** The last appearance used in this browser, whoever the user was. */
  last(): Appearance;
}

/** The part of the Web Storage API the store needs (so specs can supply a fake). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createLocalStorageSettingsStore(storage?: StorageLike): SettingsStore {
  const listeners = new Map<string, Set<(settings: Settings) => void>>();
  const backing = (): StorageLike | undefined => {
    try {
      return storage ?? localStorage;
    } catch {
      return undefined;
    }
  };
  const read = (key: string): string | null => {
    try {
      return backing()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string) => {
    try {
      backing()?.setItem(key, value);
    } catch {
      /* private mode or a full disk: the settings still apply for this session */
    }
  };
  const notify = (userId: string, settings: Settings) => listeners.get(userId)?.forEach((listener) => listener(settings));
  const get = (userId: string): Settings => {
    const settings = parseSettings(read(settingsKey(userId)));
    write(LAST_KEY, JSON.stringify(settings.appearance));
    return settings;
  };

  // Another tab changed this user's settings.
  if (typeof window !== "undefined" && !storage) {
    window.addEventListener("storage", (event) => {
      if (!event.key?.startsWith("sierrendipity:settings:") || event.key === LAST_KEY) return;
      const userId = event.key.slice("sierrendipity:settings:".length);
      notify(userId, parseSettings(event.newValue));
    });
  }

  return {
    get,
    set(userId, settings) {
      const clean: Settings = { appearance: parseAppearance(settings.appearance), version: 1 };
      write(settingsKey(userId), JSON.stringify(clean));
      write(LAST_KEY, JSON.stringify(clean.appearance));
      notify(userId, clean);
    },
    subscribe(userId, listener) {
      const set = listeners.get(userId) ?? new Set();
      set.add(listener);
      listeners.set(userId, set);
      return () => void set.delete(listener);
    },
    last: () => parseAppearance(safeParse(read(LAST_KEY))),
  };
}

function safeParse(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}
