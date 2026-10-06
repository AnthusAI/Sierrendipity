import { assemble, decode, describe, registerName } from "@sierrendipity/explorer";

/**
 * The card model: a plain-English card is one real RISC-V word. A card is `{ kind, word, params }`
 * and is plain JSON. The word is always derived from kind + params by assembling text with the explorer
 * `assemble` (never hand-encoded), and `wordToCard` turns a word back into a card with `decode`.
 */

export const CARD_KINDS = [
  "put",
  "add-number",
  "add-boxes",
  "subtract-boxes",
  "multiply",
  "save-byte",
  "save",
  "fetch",
  "jump-if-different",
  "jump-if-smaller",
  "stop",
  "custom",
] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export interface CardParams {
  /** The box a card works on (put, add a number, save, fetch). Register names such as "a0". */
  box?: string;
  /** Put, add a number: the number. */
  n?: number;
  /** Add, subtract, multiply, branches: the first and second box; `to` is where the answer goes. */
  a?: string;
  b?: string;
  to?: string;
  /** Save and fetch: the shelf address, counted from zero. */
  address?: number;
  /** Jumps: how many cards to move; negative goes back. */
  offset?: number;
  /** A custom card: the name of its definition. */
  name?: string;
}

export interface Card {
  kind: CardKind;
  /** The real 32-bit word (0 for a custom card, which compiles to a call; see buildProgram). */
  word: number;
  params: CardParams;
}

/** A function made from cards. Input and output convention: box a0 in, box a0 out. */
export interface CustomCard {
  name: string;
  cards: Card[];
}

export const CUSTOM_SLOT = "uses box a0, answer in box a0";
export const MAX_CUSTOM_CARDS = 6;
export const NAME_MAX = 24;
export const SCREEN_START = 1024;
export const SCREEN_SIZE = 256;

/** The boxes a student can pick from by default (the real names from the start). */
export const DEFAULT_BOXES = ["a0", "a1", "a2", "a3", "t0", "t1", "t2"];

export class CardError extends Error {}

const BOX = /^(zero|ra|sp|gp|tp|[ats](?:\d|1[01])|x(?:\d|[12]\d|3[01]))$/;
const checkBox = (value: unknown, what: string): string => {
  if (typeof value !== "string" || !BOX.test(value)) throw new CardError(`bad box for ${what}`);
  return value;
};
const checkInt = (value: unknown, what: string, min: number, max: number): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new CardError(`${what} must be a whole number from ${min} to ${max}`);
  }
  return value;
};

/** The assembly text of a card (not a custom card). Parameters are validated, so no text is injected. */
export function cardAssembly(kind: CardKind, p: CardParams): string {
  switch (kind) {
    case "put":
      return `addi ${checkBox(p.box, "box")}, zero, ${checkInt(p.n, "number", -2048, 2047)}`;
    case "add-number":
      return `addi ${checkBox(p.box, "box")}, ${p.box}, ${checkInt(p.n, "number", -2048, 2047)}`;
    case "add-boxes":
      return `add ${checkBox(p.to, "answer")}, ${checkBox(p.a, "first box")}, ${checkBox(p.b, "second box")}`;
    case "subtract-boxes":
      return `sub ${checkBox(p.to, "answer")}, ${checkBox(p.a, "first box")}, ${checkBox(p.b, "second box")}`;
    case "multiply":
      return `mul ${checkBox(p.to, "answer")}, ${checkBox(p.a, "first box")}, ${checkBox(p.b, "second box")}`;
    case "save-byte":
      return `sb ${checkBox(p.box, "box")}, ${checkInt(p.address, "address", 0, 2047)}(zero)`;
    case "save":
      return `sw ${checkBox(p.box, "box")}, ${checkInt(p.address, "address", 0, 2047)}(zero)`;
    case "fetch":
      return `lw ${checkBox(p.box, "box")}, ${checkInt(p.address, "address", 0, 2047)}(zero)`;
    case "jump-if-different":
      return `bne ${checkBox(p.a, "first box")}, ${checkBox(p.b, "second box")}, ${checkInt(p.offset, "offset", -1000, 1000) * 4}`;
    case "jump-if-smaller":
      return `blt ${checkBox(p.a, "first box")}, ${checkBox(p.b, "second box")}, ${checkInt(p.offset, "offset", -1000, 1000) * 4}`;
    case "stop":
      return "ebreak";
    case "custom":
      throw new CardError("a custom card is a call, not one word");
  }
}

/** Assemble one line into its single word. */
function assembleOne(text: string): number {
  const result = assemble(text);
  if (result.errors.length > 0 || result.words.length !== 1) {
    throw new CardError(result.errors[0]?.message ?? "that is not one instruction");
  }
  return result.words[0]!;
}

export const DEFAULT_PARAMS: Record<CardKind, CardParams> = {
  put: { box: "a0", n: 5 },
  "add-number": { box: "a0", n: 1 },
  "add-boxes": { a: "a0", b: "a1", to: "a0" },
  "subtract-boxes": { a: "a0", b: "a1", to: "a0" },
  multiply: { a: "a0", b: "a0", to: "a0" },
  "save-byte": { box: "a0", address: 100 },
  save: { box: "a0", address: 100 },
  fetch: { box: "a0", address: 100 },
  "jump-if-different": { a: "a0", b: "a1", offset: -2 },
  "jump-if-smaller": { a: "a0", b: "a1", offset: -2 },
  stop: {},
  custom: {},
};

/** A card of `kind`; missing parameters take the defaults. Throws CardError for a bad parameter. */
export function makeCard(kind: CardKind, params: CardParams = {}): Card {
  if (!CARD_KINDS.includes(kind)) throw new CardError(`unknown card kind ${String(kind)}`);
  const merged = { ...DEFAULT_PARAMS[kind], ...params };
  if (kind === "custom") {
    if (typeof params.name !== "string" || params.name === "") throw new CardError("a custom card needs a name");
    return { kind, word: 0, params: { name: params.name } };
  }
  const word = assembleOne(cardAssembly(kind, merged));
  // Keep only the parameters the kind uses.
  const keys = Object.keys(DEFAULT_PARAMS[kind]) as (keyof CardParams)[];
  const kept: CardParams = {};
  for (const key of keys) (kept as Record<string, unknown>)[key] = merged[key];
  return { kind, word, params: kept };
}

export const customCard = (name: string): Card => makeCard("custom", { name });

/** The real word of a card; throws for a custom card (use buildProgram). */
export function cardToWord(card: Card): number {
  if (card.kind === "custom") throw new CardError("a custom card is a call, not one word");
  return makeCard(card.kind, card.params).word;
}

/** A copy of the card with some parameters changed (the word is rewritten through the model). */
export function withParams(card: Card, patch: CardParams): Card {
  return makeCard(card.kind, { ...card.params, ...patch });
}

const sext = (value: number, bits: number) => (value << (32 - bits)) >> (32 - bits);

/** The card a word is, or null when the word is not one of the Course 1 cards. Uses `decode`. */
export function wordToCard(word: number): Card | null {
  const decoded = decode(word);
  if (!decoded) return null;
  const w = word >>> 0;
  const rd = registerName((w >>> 7) & 31);
  const rs1N = (w >>> 15) & 31;
  const rs1 = registerName(rs1N);
  const rs2 = registerName((w >>> 20) & 31);
  const immI = sext(w >>> 20, 12);
  const immS = sext(((w >>> 25) << 5) | ((w >>> 7) & 31), 12);
  const branch = sext(((w >>> 31) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1), 13);
  let made: () => Card;
  switch (decoded.mnemonic) {
    case "addi":
      if (rs1N === 0) made = () => makeCard("put", { box: rd, n: immI });
      else if (rs1 === rd) made = () => makeCard("add-number", { box: rd, n: immI });
      else return null;
      break;
    case "add":
      made = () => makeCard("add-boxes", { a: rs1, b: rs2, to: rd });
      break;
    case "sub":
      made = () => makeCard("subtract-boxes", { a: rs1, b: rs2, to: rd });
      break;
    case "mul":
      made = () => makeCard("multiply", { a: rs1, b: rs2, to: rd });
      break;
    case "sb":
    case "sw":
      if (rs1N !== 0) return null;
      made = () => makeCard(decoded.mnemonic === "sb" ? "save-byte" : "save", { box: rs2, address: immS });
      break;
    case "lw":
      if (rs1N !== 0) return null;
      made = () => makeCard("fetch", { box: rd, address: immI });
      break;
    case "bne":
    case "blt":
      if (branch % 4 !== 0 || branch === 0) return null;
      made = () => makeCard(decoded.mnemonic === "bne" ? "jump-if-different" : "jump-if-smaller", { a: rs1, b: rs2, offset: branch / 4 });
      break;
    case "ebreak":
      made = () => makeCard("stop");
      break;
    default:
      return null;
  }
  try {
    const card = made();
    return card.word === w ? card : null;
  } catch {
    return null;
  }
}

// What the face needs to know about a card

/** The english of a card: `describe` for words, the name and input slot for custom cards. */
export interface CardText {
  text: string;
  parts: { role: "verb" | "box" | "number" | "shelf" | "label" | "text"; text: string }[];
}

export function cardText(card: Card, opts: { pc?: number } = {}): CardText {
  if (card.kind === "custom") {
    const name = card.params.name ?? "custom card";
    return {
      text: `${name}, ${CUSTOM_SLOT}`,
      parts: [
        { role: "verb", text: name },
        { role: "text", text: ", " },
        { role: "text", text: CUSTOM_SLOT },
      ],
    };
  }
  const described = describe(card.word, { vocabulary: "boxes", ...opts });
  return { text: described.text, parts: described.parts };
}

/** The parameter behind each box part of the sentence, in the order the sentence shows them. */
const BOX_KEYS: Record<CardKind, (keyof CardParams)[]> = {
  put: ["box"],
  "add-number": ["box"],
  "add-boxes": ["a", "b", "to"],
  "subtract-boxes": ["b", "a", "to"],
  multiply: ["a", "b", "to"],
  "save-byte": ["box"],
  save: ["box"],
  fetch: ["box"],
  "jump-if-different": ["a", "b"],
  "jump-if-smaller": ["a", "b"],
  stop: [],
  custom: [],
};

export const boxKeys = (kind: CardKind): (keyof CardParams)[] => BOX_KEYS[kind];

export interface NumberSpec {
  /** The number as the face shows it. */
  value: number;
  min: number;
  max: number;
  /** A new card for the number as the face shows it. */
  apply: (shown: number) => Card;
}

/** The editable number of a card, or null (add boxes, stop, custom, ...). */
export function numberSpec(card: Card): NumberSpec | null {
  const p = card.params;
  switch (card.kind) {
    case "put":
    case "add-number": {
      const sign = (p.n ?? 0) < 0 ? -1 : 1;
      return { value: Math.abs(p.n ?? 0), min: 0, max: 2047, apply: (shown) => withParams(card, { n: sign * shown }) };
    }
    case "save":
    case "fetch":
      return { value: p.address ?? 0, min: 0, max: 2047, apply: (shown) => withParams(card, { address: shown }) };
    case "save-byte": {
      const address = p.address ?? 0;
      if (address >= SCREEN_START && address < SCREEN_START + SCREEN_SIZE) {
        return { value: address - SCREEN_START, min: 0, max: SCREEN_SIZE - 1, apply: (shown) => withParams(card, { address: SCREEN_START + shown }) };
      }
      return { value: address, min: 0, max: 2047, apply: (shown) => withParams(card, { address: shown }) };
    }
    case "jump-if-different":
    case "jump-if-smaller": {
      const sign = (p.offset ?? -1) < 0 ? -1 : 1;
      return { value: Math.abs(p.offset ?? 1), min: 1, max: 99, apply: (shown) => withParams(card, { offset: sign * shown }) };
    }
    default:
      return null;
  }
}

// Validation for custom cards

/** Why these cards cannot become a custom card, in plain language, or null when they can. */
export function customBodyProblem(cards: Card[]): string | null {
  if (cards.some((c) => c.kind === "jump-if-different" || c.kind === "jump-if-smaller")) {
    return "A custom card can't contain a jump yet. Pick cards that only work with boxes.";
  }
  if (cards.some((c) => c.kind === "custom")) return "A custom card can't contain another custom card yet.";
  if (cards.some((c) => c.kind === "stop")) return "A custom card can't contain a Stop card.";
  return null;
}

/** Why this name cannot be used, or null when it can. `taken` are the names already in use. */
export function nameProblem(name: string, taken: string[]): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Give the card a name.";
  if (trimmed.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  if (taken.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return "You already have a card called that.";
  return null;
}

// Saving and loading (plain JSON)

export interface ProgramFile {
  version: 1;
  cards: Card[];
  customCards: CustomCard[];
}

export const programToJson = (cards: Card[], customCards: CustomCard[]): string =>
  JSON.stringify({ version: 1, cards, customCards } satisfies ProgramFile, null, 2);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Read a saved program. Every card is rebuilt through the model, so words can never disagree with params. */
export function programFromJson(text: string): { cards: Card[]; customCards: CustomCard[] } {
  const bad = () => new CardError("That is not a saved program.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw bad();
  }
  if (!isRecord(data) || data["version"] !== 1 || !Array.isArray(data["cards"]) || !Array.isArray(data["customCards"])) throw bad();
  const card = (raw: unknown): Card => {
    if (!isRecord(raw) || typeof raw["kind"] !== "string" || !isRecord(raw["params"])) throw bad();
    try {
      return makeCard(raw["kind"] as CardKind, raw["params"] as CardParams);
    } catch {
      throw bad();
    }
  };
  const customCards = (data["customCards"] as unknown[]).map((raw): CustomCard => {
    if (!isRecord(raw) || typeof raw["name"] !== "string" || !Array.isArray(raw["cards"])) throw bad();
    const cards = (raw["cards"] as unknown[]).map(card);
    if (customBodyProblem(cards)) throw bad();
    return { name: raw["name"], cards };
  });
  if (customCards.length > MAX_CUSTOM_CARDS) throw bad();
  const names = customCards.map((c) => c.name);
  if (customCards.some((c, i) => nameProblem(c.name, names.slice(0, i)))) throw bad();
  const cards = (data["cards"] as unknown[]).map(card);
  if (cards.some((c) => c.kind === "custom" && !names.includes(c.params.name!))) throw bad();
  return { cards, customCards };
}
