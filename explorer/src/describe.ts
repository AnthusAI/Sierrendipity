import { decode, registerName } from "./decode";

/**
 * Plain-English card text for the Course 1 card set (docs/course-1-design.md).
 * Pure: no DOM, no timers, no Node-only APIs.
 */

export const CARD_KINDS = [
  // The Course 1 set.
  "put",
  "add-number",
  "add-boxes",
  "subtract-boxes",
  "paint-pixel",
  "save",
  "fetch",
  "jump-if-different",
  "jump-if-smaller",
  "stop",
  // The rest of the common base set.
  "copy",
  "do-nothing",
  "jump-if-same",
  "jump-if-not-smaller",
  "jump",
  "jump-to-box",
  "compare",
  "logic",
  "shift",
  "multiply",
  "divide",
  "big-number",
  "ask-system",
  "unknown",
] as const;

export type CardKind = (typeof CARD_KINDS)[number];

/** What a piece of the card text is, so the interface can colour it. */
export type PartRole = "verb" | "box" | "number" | "shelf" | "label" | "text";

export interface CardPart {
  role: PartRole;
  text: string;
}

export interface CardText {
  kind: CardKind;
  /** The whole sentence; always equals the parts joined together. */
  text: string;
  parts: CardPart[];
  /** True for words that are not a card we describe (unmet instruction or not an instruction). */
  fallback: boolean;
}

export interface DescribeOptions {
  /** "boxes" (default, Course 1) or "registers" (later courses). */
  vocabulary?: "boxes" | "registers";
  /**
   * The card's own address. With it, jumps say "jump to card 5" (address / 4, counting from 0);
   * without it they say "jump back 2 cards".
   */
  pc?: number;
}

/** Pixel display: one byte per pixel at 1024 to 1279. */
const SCREEN_START = 1024;
const SCREEN_SIZE = 256;

interface Words {
  box: string;
  shelf: string;
  card: string;
  cards: string;
}
const VOCABULARY: Record<"boxes" | "registers", Words> = {
  boxes: { box: "box", shelf: "shelf", card: "card", cards: "cards" },
  registers: { box: "register", shelf: "memory address", card: "instruction", cards: "instructions" },
};

type Item = CardPart | string;

/** Join items into parts; bare strings are plain text and neighbouring text merges. */
function seq(...items: Item[]): CardPart[] {
  const parts: CardPart[] = [];
  for (const item of items) {
    const part: CardPart = typeof item === "string" ? { role: "text", text: item } : item;
    const last = parts[parts.length - 1];
    if (part.role === "text" && last?.role === "text") last.text += part.text;
    else parts.push({ ...part });
  }
  return parts;
}

const verb = (text: string): CardPart => ({ role: "verb", text });
const num = (n: number | string): CardPart => ({ role: "number", text: String(n) });
const label = (text: string): CardPart => ({ role: "label", text });
const shelfNo = (n: number): CardPart => ({ role: "shelf", text: String(n) });

/** Sign-extend the low `n` bits of v. */
const sext = (v: number, n: number): number => (v << (32 - n)) >> (32 - n);

export function describe(word: number, opts: DescribeOptions = {}): CardText {
  const words = VOCABULARY[opts.vocabulary ?? "boxes"];
  const registers = opts.vocabulary === "registers";
  const w = Number.isFinite(word) ? word >>> 0 : 0;
  const decoded = Number.isFinite(word) ? decode(w) : null;
  const done = (kind: CardKind, items: Item[], fallback = false): CardText => {
    const parts = seq(...items);
    return { kind, text: parts.map((p) => p.text).join(""), parts, fallback };
  };
  if (!decoded) return done("unknown", ["Not an instruction the machine understands"], true);

  const rdN = (w >>> 7) & 31;
  const rs1N = (w >>> 15) & 31;
  const rs2N = (w >>> 20) & 31;
  const immI = sext(w >>> 20, 12);
  const immS = sext(((w >>> 25) << 5) | rdN, 12);
  const box = (n: number): CardPart => ({
    role: "box",
    text: n === 0 ? `${words.box} zero (always 0)` : `${words.box} ${registerName(n)}`,
  });
  const rd = box(rdN);
  const rs1 = box(rs1N);
  const rs2 = box(rs2N);
  const plus = (imm: number): Item[] => (imm === 0 ? [] : [imm > 0 ? " plus " : " minus ", num(Math.abs(imm))]);
  const unmet = (): CardText =>
    done("unknown", [`An instruction we haven't met yet: ${decoded.text}`], true);
  const answerIn = (): Item[] => [", put the answer in ", rd];
  const unsignedNote = " (counting from 0 up)";

  /** Where a load or store looks: a plain shelf number, or the address held in a box plus an offset. */
  const place = (preposition: string, imm: number): Item[] =>
    rs1N === 0
      ? [`${preposition} `, label(words.shelf), " ", shelfNo(imm >>> 0)]
      : registers
        ? [`${preposition === "on" ? "at" : preposition} the `, label(words.shelf), " in ", rs1, ...plus(imm)]
        : [`${preposition} the `, label(words.shelf), " at ", rs1, ...plus(imm)];

  /** "jump back 2 cards", or "jump to card 5" when the card's own address is known. */
  const target = (offset: number, capital: boolean): Item[] => {
    const cards = offset / 4;
    const absolute = opts.pc !== undefined && Number.isFinite(opts.pc) ? Math.floor((opts.pc + offset) / 4) : -1;
    const cap = (s: string): string => (capital ? s[0]!.toUpperCase() + s.slice(1) : s);
    if (absolute >= 0) return [verb(cap("jump to")), " ", label(words.card), " ", num(absolute)];
    if (cards === 0) return [verb(cap("jump to")), " this same ", label(words.card), " again"];
    const n = Math.abs(cards);
    return [verb(cap(cards < 0 ? "jump back" : "jump forward")), " ", num(n), " ", label(n === 1 ? words.card : words.cards)];
  };

  switch (decoded.mnemonic) {
    case "addi": {
      if (w === 0x13) return done("do-nothing", [verb("Do nothing")]);
      if (rs1N === 0) return done("put", [verb("Put"), " ", num(immI), " in ", rd]);
      if (rs1N === rdN) {
        return immI >= 0
          ? done("add-number", [verb("Add"), " ", num(immI), " to ", rd])
          : done("add-number", [verb("Take"), " ", num(-immI), " away from ", rd]);
      }
      if (immI === 0) return done("copy", [verb("Copy"), " ", rs1, " into ", rd]);
      return done("add-number", [verb("Put"), " ", rs1, ...plus(immI), " into ", rd]);
    }
    case "add":
      if (rs1N === 0) return done("copy", [verb("Copy"), " ", rs2, " into ", rd]);
      if (rs2N === 0) return done("copy", [verb("Copy"), " ", rs1, " into ", rd]);
      return done("add-boxes", [verb("Add"), " ", rs1, " and ", rs2, ...answerIn()]);
    case "sub":
      return done("subtract-boxes", [verb("Subtract"), " ", rs2, " from ", rs1, ...answerIn()]);
    case "sb": {
      const addr = immS >>> 0;
      if (rs1N === 0 && addr >= SCREEN_START && addr < SCREEN_START + SCREEN_SIZE) {
        return done("paint-pixel", [verb("Paint"), " ", label("pixel"), " ", num(addr - SCREEN_START), " with the colour in ", rs2]);
      }
      return done("save", [verb("Copy"), " one byte of ", rs2, " ", ...place("onto", immS)]);
    }
    case "sw":
      return done("save", [verb("Copy"), " ", rs2, " ", ...place("onto", immS)]);
    case "lw":
      return done("fetch", [verb("Fetch"), " the number ", ...place("on", immI), " into ", rd]);
    case "lb":
      return done("fetch", [verb("Fetch"), " one byte ", ...place("from", immI), " into ", rd]);
    case "beq":
    case "bne":
    case "blt":
    case "bge":
    case "bltu":
    case "bgeu": {
      const m = decoded.mnemonic;
      const offset =
        ((w >> 31) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1);
      const unsigned = m === "bltu" || m === "bgeu";
      const condition: Item[] =
        m === "beq"
          ? ["If ", rs1, " and ", rs2, " match, "]
          : m === "bne"
            ? ["If ", rs1, " and ", rs2, " differ, "]
            : ["If ", rs1, m === "blt" || m === "bltu" ? " is smaller than " : " is not smaller than ", rs2, unsigned ? `${unsignedNote}, ` : ", "];
      const kind: CardKind =
        m === "beq" ? "jump-if-same" : m === "bne" ? "jump-if-different" : m === "blt" || m === "bltu" ? "jump-if-smaller" : "jump-if-not-smaller";
      return done(kind, [...condition, ...target(offset, false)]);
    }
    case "jal": {
      const offset =
        ((w >> 31) << 20) | (w & 0xff000) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1);
      return done("jump", [...target(offset, true), ...(rdN === 0 ? [] : [", remembering the way back in ", rd])]);
    }
    case "jalr":
      return done("jump-to-box", [
        verb("Jump to"),
        ` the ${words.card} whose address is `,
        ...(immI === 0 ? ["in ", rs1] : [rs1, ...plus(immI)]),
        ...(rdN === 0 ? [] : [", remembering the way back in ", rd]),
      ]);
    case "ebreak":
      return done("stop", [verb("Stop")]);
    case "ecall":
      return done("ask-system", [verb("Ask"), " the machine to do the job named in ", box(17)]);
    case "lui":
      return done("big-number", [verb("Put"), " the big number ", num(`0x${((w & 0xfffff000) >>> 0).toString(16)}`), " in ", rd]);
    case "auipc":
      return done("big-number", [
        verb("Put"),
        ` this ${words.card}'s address plus `,
        num(`0x${((w & 0xfffff000) >>> 0).toString(16)}`),
        " in ",
        rd,
      ]);
    case "slt":
    case "sltu":
    case "slti":
    case "sltiu": {
      const immediate = decoded.mnemonic.endsWith("i");
      const unsigned = decoded.mnemonic.startsWith("sltu") || decoded.mnemonic === "sltiu";
      const right: Item = immediate ? num(unsigned ? immI >>> 0 : immI) : rs2;
      return done("compare", [
        verb("Put"), " 1 in ", rd, " if ", rs1, " is smaller than ", right, unsigned && !immediate ? unsignedNote : "", ", otherwise 0",
      ]);
    }
    case "and":
    case "or":
    case "xor":
    case "andi":
    case "ori":
    case "xori": {
      const op = decoded.mnemonic.replace(/i$/, "").toUpperCase();
      const immediate = decoded.mnemonic.endsWith("i");
      if (decoded.mnemonic === "xori" && immI === -1) return done("logic", [verb("Flip"), " every bit of ", rs1, ...answerIn()]);
      return done("logic", [verb("Combine"), " ", rs1, " and ", immediate ? num(immI) : rs2, ` bit by bit with ${op}`, ...answerIn()]);
    }
    case "sll":
    case "srl":
    case "sra":
    case "slli":
    case "srli":
    case "srai": {
      const m = decoded.mnemonic;
      const immediate = m.endsWith("i");
      const direction = m.startsWith("sll") ? "left" : "right";
      const signed = m.startsWith("sra");
      const amount: Item[] = immediate
        ? [num(rs2N), rs2N === 1 ? " place" : " places"]
        : ["by the amount in ", rs2];
      return done("shift", [verb("Slide"), " the bits of ", rs1, ` ${direction} `, ...amount, signed ? ", keeping the sign" : "", ...answerIn()]);
    }
    case "mul":
    case "mulh":
    case "mulhu":
      return done("multiply", [
        verb("Multiply"), " ", rs1, " by ", rs2, decoded.mnemonic === "mulhu" ? unsignedNote : "",
        decoded.mnemonic === "mul" ? ", put the answer in " : ", put the top half of the answer in ", rd,
      ]);
    case "div":
    case "divu":
      return done("divide", [verb("Divide"), " ", rs1, " by ", rs2, decoded.mnemonic === "divu" ? unsignedNote : "", ", put the whole-number answer in ", rd]);
    case "rem":
    case "remu":
      return done("divide", [verb("Divide"), " ", rs1, " by ", rs2, decoded.mnemonic === "remu" ? unsignedNote : "", ", put what is left over in ", rd]);
    default:
      return unmet();
  }
}

/** The distinct card kinds used by a program, in the Instruction Deck's (CARD_KINDS) order. */
export function cardsUsed(words: number[]): CardKind[] {
  const seen = new Set<CardKind>();
  for (const word of words) seen.add(describe(word).kind);
  return CARD_KINDS.filter((kind) => seen.has(kind));
}
