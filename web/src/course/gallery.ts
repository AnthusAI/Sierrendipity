// The Gallery: things the student made. Stored per user behind `GalleryStore` (localStorage first,
// like the progress store), bounded, and never throwing on bad stored data.
import type { StorageLike } from "@sierrendipity/lesson-core";

export const GALLERY_VERSION = 1;
export const GALLERY_KEY_PREFIX = "sierrendipity:gallery:";
export const galleryKey = (userId: string): string => `${GALLERY_KEY_PREFIX}${userId}`;
export const galleryBackupKey = (userId: string): string => `sierrendipity:gallery-backup:${userId}`;

export const MAX_GALLERY_ITEMS = 48;
export const PIXEL_SIDE = 16;
export const PIXEL_COUNT = PIXEL_SIDE * PIXEL_SIDE;
/** Palette indexes 0 (empty) to 7 (the seven theme field colors). */
export const PIXEL_COLORS = 8;
export const MAX_PROGRAM_WORDS = 64;
export const MAX_TITLE_LENGTH = 60;

export interface PixelData {
  /** 256 palette indexes, row by row. */
  pixels: number[];
}
export interface ProgramData {
  /** The cards, one 32-bit word each. */
  words: number[];
}

export type GalleryItem = {
  id: string;
  lessonId: string;
  title: string;
  createdAt: number;
} & ({ kind: "pixels"; data: PixelData } | { kind: "program"; data: ProgramData });

/** What the lesson player gives `add`; the store fills `id` and `createdAt` when they are missing. */
export type NewGalleryItem = Omit<GalleryItem, "id" | "createdAt"> & { id?: string; createdAt?: number };

export interface GalleryStore {
  list(userId: string): GalleryItem[];
  /** Add an item (newest last). Throws RangeError when it is not valid. Past the bound the oldest is dropped. */
  add(userId: string, item: NewGalleryItem): GalleryItem;
  remove(userId: string, id: string): void;
  /** Returns an unsubscribe function. */
  subscribe(cb: (userId: string) => void): () => void;
}

const LESSON_ID = /^[a-z0-9][a-z0-9/_-]*$/;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isWord = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Why this is not a valid Gallery item; null when it is. */
export function itemProblem(item: unknown): string | null {
  if (!isObj(item)) return "a Gallery item must be an object";
  if (typeof item.title !== "string" || item.title.trim() === "" || item.title.length > MAX_TITLE_LENGTH) return `the title must be 1 to ${MAX_TITLE_LENGTH} characters`;
  if (typeof item.lessonId !== "string" || item.lessonId.length > 100 || !LESSON_ID.test(item.lessonId)) return "lessonId must be a lesson id";
  if (item.id !== undefined && (typeof item.id !== "string" || item.id.length > 64 || !ITEM_ID.test(item.id))) return "id must be a short slug";
  if (item.createdAt !== undefined && !(typeof item.createdAt === "number" && Number.isFinite(item.createdAt) && item.createdAt >= 0)) return "createdAt must be a time";
  if (!isObj(item.data)) return "data must be an object";
  if (item.kind === "pixels") {
    const px = item.data.pixels;
    if (!Array.isArray(px) || px.length !== PIXEL_COUNT) return `a pixel picture has exactly ${PIXEL_COUNT} pixels`;
    if (!px.every((p) => Number.isInteger(p) && p >= 0 && p < PIXEL_COLORS)) return `pixel colors are whole numbers from 0 to ${PIXEL_COLORS - 1}`;
    return null;
  }
  if (item.kind === "program") {
    const words = item.data.words;
    if (!Array.isArray(words) || words.length < 1 || words.length > MAX_PROGRAM_WORDS) return `a program has 1 to ${MAX_PROGRAM_WORDS} cards`;
    if (!words.every(isWord)) return "every card is a 32-bit word";
    return null;
  }
  return 'kind must be "pixels" or "program"';
}

function clean(item: GalleryItem): GalleryItem {
  const base = { id: item.id, lessonId: item.lessonId, title: item.title.trim(), createdAt: item.createdAt };
  return item.kind === "pixels"
    ? { ...base, kind: "pixels", data: { pixels: [...item.data.pixels] } }
    : { ...base, kind: "program", data: { words: [...item.data.words] } };
}

export type GalleryLoad = { items: GalleryItem[]; damaged: boolean };

/** Read stored text: damaged or newer data yields `damaged` and no items; single bad items are dropped. */
export function parseGallery(raw: string): GalleryLoad {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { items: [], damaged: true };
  }
  if (!isObj(value) || value.version !== GALLERY_VERSION || !Array.isArray(value.items)) return { items: [], damaged: true };
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  for (const candidate of value.items) {
    if (itemProblem(candidate) !== null || !isObj(candidate) || typeof candidate.id !== "string" || typeof candidate.createdAt !== "number" || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    items.push(clean(candidate as unknown as GalleryItem));
  }
  return { items: items.slice(-MAX_GALLERY_ITEMS), damaged: false };
}

/** Gallery in memory, optionally persisted to `storage` under `sierrendipity:gallery:<userId>`. */
export class LocalStorageGalleryStore implements GalleryStore {
  private readonly users = new Map<string, GalleryItem[]>();
  private readonly listeners = new Set<(userId: string) => void>();
  private counter = 0;

  constructor(
    private readonly storage?: StorageLike,
    private readonly now: () => number = Date.now,
  ) {}

  private load(userId: string): GalleryItem[] {
    let items = this.users.get(userId);
    if (items) return items;
    items = [];
    try {
      const raw = this.storage?.getItem(galleryKey(userId)) ?? null;
      if (raw !== null) {
        const loaded = parseGallery(raw);
        items = loaded.items;
        if (loaded.damaged) {
          try {
            this.storage?.setItem(galleryBackupKey(userId), raw);
          } catch {
            /* the backup is a courtesy */
          }
        }
      }
    } catch {
      /* storage unavailable: the Gallery lives in memory for this session */
    }
    this.users.set(userId, items);
    return items;
  }

  private save(userId: string, items: GalleryItem[]): void {
    this.users.set(userId, items);
    try {
      this.storage?.setItem(galleryKey(userId), JSON.stringify({ version: GALLERY_VERSION, items }));
    } catch {
      /* full or private mode: kept in memory */
    }
    for (const cb of [...this.listeners]) {
      try {
        cb(userId);
      } catch {
        /* a broken subscriber must not break saving */
      }
    }
  }

  list(userId: string): GalleryItem[] {
    return structuredClone(this.load(userId));
  }

  add(userId: string, item: NewGalleryItem): GalleryItem {
    const bad = itemProblem(item);
    if (bad) throw new RangeError(bad);
    const existing = this.load(userId);
    const createdAt = item.createdAt ?? this.now();
    let id = item.id ?? `${createdAt.toString(36)}-${(this.counter++).toString(36)}`;
    while (existing.some((x) => x.id === id)) id = `${id}-${(this.counter++).toString(36)}`;
    const made = clean({ ...item, id, createdAt } as GalleryItem);
    this.save(userId, [...existing, made].slice(-MAX_GALLERY_ITEMS));
    return structuredClone(made);
  }

  remove(userId: string, id: string): void {
    const items = this.load(userId);
    if (items.some((x) => x.id === id)) this.save(userId, items.filter((x) => x.id !== id));
  }

  subscribe(cb: (userId: string) => void): () => void {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }
}
