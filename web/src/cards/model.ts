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
  /** Put, add a number: the number (-2048 to 2047). */
  n?: number;
  /** Add, subtract, multiply, branches: the first and second box; `to` is where the answer goes. */
  a?: string;
  b?: string;
  to?: string;
  /** Save and fetch: the shelf address, counted from zero (a multiple of 4 for save and fetch). */
  address?: number;
  /** Jumps: how many cards to move; negative goes back; never 0. */
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

export const MAX_CUSTOM_CARDS = 6;
export const NAME_MAX = 24;
export const SCREEN_START = 1024;
export const SCREEN_SIZE = 256;
/** The longest program the builder and `programFromJson` accept, and the longest custom card body. */
export const MAX_CARDS = 200;
export const MAX_BODY = 12;
export const TOO_BIG = "That program is too big.";
export const NOT_SAVED = "That is not a saved program.";

/** The boxes of Course 1: a0 to a7 and t0 to t6 (no ra, sp, gp or tp). `zero` is also accepted where a box is read. */
export const DEFAULT_BOXES = [..."01234567"].map((i) => `a${i}`).concat([..."0123456"].map((i) => `t${i}`));
/** What a custom card may change: the answer box a0, a1 to a3, and t0 to t2 as scratch. */
const BODY_WRITES = ["a0", "a1", "a2", "a3", "t0", "t1", "t2"];

export class CardError extends Error {}

/** A box name, normalised (x10 is a0). `zero` is only accepted where a box is read. */
function box(value: unknown, what: string, zero = false): string {
  if (typeof value !== "string") throw new CardError(`bad box for ${what}`);
  let name = value.trim().toLowerCase();
  const numbered = /^x(\d{1,2})$/.exec(name);
  if (numbered) name = registerName(Number(numbered[1]));
  if ((zero && name === "zero") || DEFAULT_BOXES.includes(name)) return name;
  throw new CardError(`bad box for ${what}`);
}
const checkInt = (value: unknown, what: string, min: number, max: number, step = 1): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max || value % step !== 0) {
    throw new CardError(`${what} must be a whole number from ${min} to ${max}`);
  }
  return value;
};

/** The assembly text of a card (not a custom card). Parameters are validated, so no text is injected. */
export function cardAssembly(kind: CardKind, p: CardParams): string {
  switch (kind) {
    case "put":
      return `addi ${box(p.box, "box")}, zero, ${checkInt(p.n, "number", -2048, 2047)}`;
    case "add-number": {
      const b = box(p.box, "box");
      return `addi ${b}, ${b}, ${checkInt(p.n, "number", -2048, 2047)}`;
    }
    case "add-boxes":
    case "subtract-boxes":
    case "multiply": {
      const op = kind === "add-boxes" ? "add" : kind === "subtract-boxes" ? "sub" : "mul";
      return `${op} ${box(p.to, "answer")}, ${box(p.a, "first box", true)}, ${box(p.b, "second box", true)}`;
    }
    case "save-byte":
      return `sb ${box(p.box, "box", true)}, ${checkInt(p.address, "address", 0, 2047)}(zero)`;
    case "save":
      return `sw ${box(p.box, "box", true)}, ${checkInt(p.address, "address", 0, 2044, 4)}(zero)`;
    case "fetch":
      return `lw ${box(p.box, "box")}, ${checkInt(p.address, "address", 0, 2044, 4)}(zero)`;
    case "jump-if-different":
    case "jump-if-smaller": {
      const offset = checkInt(p.offset, "offset", -1000, 1000);
      if (offset === 0) throw new CardError("a jump must move at least one card");
      return `${kind === "jump-if-different" ? "bne" : "blt"} ${box(p.a, "first box", true)}, ${box(p.b, "second box", true)}, ${offset * 4}`;
    }
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
  // Shelf 512 is clear of the program, which starts at address 0.
  "save-byte": { box: "a0", address: 512 },
  save: { box: "a0", address: 512 },
  fetch: { box: "a0", address: 512 },
  "jump-if-different": { a: "a0", b: "a1", offset: -2 },
  "jump-if-smaller": { a: "a0", b: "a1", offset: -2 },
  stop: {},
  custom: {},
};

/** Box parameters, normalised through the one box rule (so a stored x10 becomes a0). */
function normalizeParams(kind: CardKind, merged: CardParams): CardParams {
  const out: CardParams = { ...merged };
  const sources = kind === "save" || kind === "save-byte";
  if (out.box !== undefined) out.box = box(out.box, "box", sources);
  for (const key of ["a", "b"] as const) if (out[key] !== undefined) out[key] = box(out[key], key, true);
  if (out.to !== undefined) out.to = box(out.to, "answer");
  return out;
}

/** A card of `kind`; missing parameters take the defaults. Throws CardError for a bad parameter. */
export function makeCard(kind: CardKind, params: CardParams = {}): Card {
  if (!CARD_KINDS.includes(kind)) throw new CardError(`unknown card kind ${String(kind)}`);
  if (kind === "custom") {
    if (typeof params.name !== "string" || normalizeName(params.name) === "") throw new CardError("a custom card needs a name");
    return { kind, word: 0, params: { name: normalizeName(params.name) } };
  }
  const merged = normalizeParams(kind, { ...DEFAULT_PARAMS[kind], ...params });
  const word = assembleOne(cardAssembly(kind, merged));
  // Keep only the parameters the kind uses.
  const kept: CardParams = {};
  for (const key of Object.keys(DEFAULT_PARAMS[kind]) as (keyof CardParams)[]) (kept as Record<string, unknown>)[key] = merged[key];
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

// Names

const RESERVED = ["put", "add", "subtract", "multiply", "paint", "copy", "fetch", "stop", "jump"];

/** A name as it is stored: NFC, no control or invisible characters, single spaces, trimmed. */
export const normalizeName = (name: string): string =>
  name
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

const nameKey = (name: string): string => normalizeName(name).toLowerCase();

/** Why this name cannot be used, or null when it can. `taken` are the names already in use. */
export function nameProblem(name: string, taken: string[]): string | null {
  const clean = normalizeName(name);
  if (clean === "") return "Give the card a name.";
  if ([...clean].length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  if (RESERVED.includes(nameKey(clean))) return "That name is already used by a built-in card.";
  if (taken.some((t) => nameKey(t) === nameKey(clean))) return "You already have a card called that.";
  return null;
}

// What a custom card reads and changes

function cardIo(card: Card): { reads: string[]; writes: string[] } {
  const p = card.params;
  const list = (...names: (string | undefined)[]) => names.filter((n): n is string => n !== undefined && n !== "zero");
  switch (card.kind) {
    case "put":
    case "fetch":
      return { reads: [], writes: list(p.box) };
    case "add-number":
      return { reads: list(p.box), writes: list(p.box) };
    case "add-boxes":
    case "subtract-boxes":
    case "multiply":
      return { reads: list(p.a, p.b), writes: list(p.to) };
    case "save":
    case "save-byte":
      return { reads: list(p.box), writes: [] };
    default:
      return { reads: list(p.a, p.b), writes: [] };
  }
}

/** The boxes a body reads before it writes them, and the boxes it writes (first write first). */
export function bodyIo(cards: Card[]): { inputs: string[]; outputs: string[] } {
  const inputs: string[] = [];
  const outputs: string[] = [];
  for (const card of cards) {
    const io = cardIo(card);
    for (const r of io.reads) if (!outputs.includes(r) && !inputs.includes(r)) inputs.push(r);
    for (const w of io.writes) if (!outputs.includes(w)) outputs.push(w);
  }
  return { inputs, outputs };
}

const say = (names: string[]): string =>
  names.length === 1 ? `box ${names[0]}` : `boxes ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The input slot of a custom card: the boxes it reads, the answer box (always a0) and any scratch
 * boxes. Convention: input in box a0, answer in box a0; t0 to t2 are scratch (the caller's t0 to t2 are not kept).
 */
export function customSlot(definition?: CustomCard): string {
  if (!definition) return "uses box a0, answer in box a0";
  const { inputs, outputs } = bodyIo(definition.cards);
  const extra = outputs.filter((o) => o !== "a0");
  const scratch = extra.filter((o) => o.startsWith("t"));
  const changed = extra.filter((o) => o.startsWith("a"));
  const notes: string[] = [];
  if (scratch.length) notes.push(`${say(scratch)} ${scratch.length === 1 ? "is" : "are"} scratch`);
  if (changed.length) notes.push(`also changes ${say(changed)}`);
  return `${inputs.length ? `uses ${say(inputs)}` : "uses no boxes"}, answer in box a0${notes.length ? ` (${notes.join("; ")})` : ""}`;
}

// What the face needs to know about a card

export interface CardText {
  text: string;
  parts: { role: "verb" | "box" | "number" | "shelf" | "label" | "text"; text: string }[];
}

/** The english of a card: `describe` for words, the name and input slot for custom cards. */
export function cardText(card: Card, opts: { pc?: number; customCards?: CustomCard[] } = {}): CardText {
  if (card.kind === "custom") {
    const name = card.params.name ?? "custom card";
    const slot = customSlot(opts.customCards?.find((c) => c.name === name));
    return {
      text: `${name}, ${slot}`,
      parts: [
        { role: "verb", text: name },
        { role: "text", text: ", " },
        { role: "text", text: slot },
      ],
    };
  }
  // A negative number reads as arithmetic ("Add -3 to box a0"), so the number box can show its sign.
  if (card.kind === "add-number" && (card.params.n ?? 0) < 0) {
    const parts: CardText["parts"] = [
      { role: "verb", text: "Add" },
      { role: "text", text: " " },
      { role: "number", text: String(card.params.n) },
      { role: "text", text: " to " },
      { role: "box", text: `box ${card.params.box}` },
    ];
    return { text: parts.map((p) => p.text).join(""), parts };
  }
  const described = describe(card.word, { vocabulary: "boxes", ...(opts.pc === undefined ? {} : { pc: opts.pc }) });
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
  /** The number as the face shows it (signed). */
  value: number;
  min: number;
  max: number;
  /** Arrows move by this much and typed numbers must be a multiple of it. */
  step: number;
  /** A new card for the number as the face shows it. */
  apply: (shown: number) => Card;
}

/** Where a card sits in its list, so a jump can stay inside it. */
export interface Position {
  index: number;
  count: number;
}

/** The editable number of a card, or null (add boxes, stop, custom, ...). */
export function numberSpec(card: Card, where?: Position): NumberSpec | null {
  const p = card.params;
  switch (card.kind) {
    case "put":
    case "add-number":
      return { value: p.n ?? 0, min: -2048, max: 2047, step: 1, apply: (shown) => withParams(card, { n: shown }) };
    case "save":
    case "fetch":
      return { value: p.address ?? 0, min: 0, max: 2044, step: 4, apply: (shown) => withParams(card, { address: shown }) };
    case "save-byte": {
      const address = p.address ?? 0;
      if (address >= SCREEN_START && address < SCREEN_START + SCREEN_SIZE) {
        return { value: address - SCREEN_START, min: 0, max: SCREEN_SIZE - 1, step: 1, apply: (shown) => withParams(card, { address: SCREEN_START + shown }) };
      }
      // Stay on this side of the screen: crossing into it would turn a shelf into a pixel.
      const below = address < SCREEN_START;
      return {
        value: address,
        min: below ? 0 : SCREEN_START + SCREEN_SIZE,
        max: below ? SCREEN_START - 1 : 2047,
        step: 1,
        apply: (shown) => withParams(card, { address: shown }),
      };
    }
    case "jump-if-different":
    case "jump-if-smaller": {
      const offset = p.offset ?? -1;
      const room = where ? (offset < 0 ? where.index : where.count - where.index) : 1000;
      return {
        value: Math.abs(offset),
        min: 1,
        max: Math.max(1, room),
        step: 1,
        apply: (shown) => withParams(card, { offset: (offset < 0 ? -1 : 1) * shown }),
      };
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
  if (cards.length > MAX_BODY) return `A custom card can hold at most ${MAX_BODY} cards.`;
  const { outputs } = bodyIo(cards);
  const bad = outputs.find((o) => !BODY_WRITES.includes(o));
  if (bad) return `This card changes box ${bad}, which would surprise the program that uses it. Use box a0 for your answer.`;
  if (!outputs.includes("a0")) return "A custom card needs to put its answer in box a0.";
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

/**
 * Read a saved program. Every card is rebuilt through the model, so words can never disagree with params.
 * Programs longer than `maxCards` (at most MAX_CARDS) are refused as too big.
 */
export function programFromJson(text: string, opts: { maxCards?: number } = {}): { cards: Card[]; customCards: CustomCard[] } {
  const bad = () => new CardError(NOT_SAVED);
  const big = () => new CardError(TOO_BIG);
  if (text.length > 4_000_000) throw big();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw bad();
  }
  if (!isRecord(data) || data["version"] !== 1 || !Array.isArray(data["cards"]) || !Array.isArray(data["customCards"])) throw bad();
  const rawCards = data["cards"] as unknown[];
  const rawCustom = data["customCards"] as unknown[];
  if (rawCards.length > Math.min(MAX_CARDS, opts.maxCards ?? MAX_CARDS) || rawCustom.length > MAX_CUSTOM_CARDS) throw big();
  const card = (raw: unknown): Card => {
    if (!isRecord(raw) || typeof raw["kind"] !== "string" || !isRecord(raw["params"])) throw bad();
    try {
      return makeCard(raw["kind"] as CardKind, raw["params"] as CardParams);
    } catch {
      throw bad();
    }
  };
  const customCards = rawCustom.map((raw): CustomCard => {
    if (!isRecord(raw) || typeof raw["name"] !== "string" || !Array.isArray(raw["cards"])) throw bad();
    if (raw["cards"].length > MAX_BODY) throw big();
    const cards = (raw["cards"] as unknown[]).map(card);
    if (customBodyProblem(cards)) throw bad();
    return { name: normalizeName(raw["name"]), cards };
  });
  const names = customCards.map((c) => c.name);
  if (customCards.some((c, i) => nameProblem(c.name, names.slice(0, i)))) throw bad();
  const cards = rawCards.map(card);
  if (cards.some((c) => c.kind === "custom" && !names.includes(c.params.name!))) throw bad();
  return { cards, customCards };
}
