import { assemble } from "@sierrendipity/explorer";
import { buildProgram, programParts } from "./cards/build";
import { MAX_BODY, MAX_CUSTOM_CARDS, customBodyProblem, customCard, nameProblem, normalizeName, wordToCard, type Card, type CustomCard } from "./cards/model";
import type { SaveSpec } from "./lesson";
import { registersIn } from "./loader";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A line of assembly as one card, or the reason it is not a card of Course 1. */
function cardOfLine(line: string): Card | string {
  const result = assemble(line);
  if (result.errors.length !== 0 || result.words.length !== 1) return `"${line}" must be one instruction that assembles${result.errors[0] ? ` (${result.errors[0].message})` : ""}`;
  return wordToCard(result.words[0]!) ?? `"${line}" is not one of the cards`;
}

/** Validate the `customCards` list of lesson.yaml (or of a solution): each card has a name and 1 to MAX_BODY lines of assembly. */
export function parseCustomCards(input: unknown, boxes: string[], where: string, errors: string[], taken: string[] = []): CustomCard[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length === 0) return void errors.push(`${where}: customCards must be a list of { name, cards }`);
  if (input.length > MAX_CUSTOM_CARDS) return void errors.push(`${where}: customCards holds at most ${MAX_CUSTOM_CARDS} cards`);
  const n = errors.length;
  const out: CustomCard[] = [];
  const names = [...taken];
  input.forEach((raw, i) => {
    const w = `${where}: customCards[${i}]`;
    if (!isObj(raw)) return void errors.push(`${w}: must be a mapping with name and cards`);
    for (const key of Object.keys(raw)) if (key !== "name" && key !== "cards") errors.push(`${w}: unknown key "${key}"`);
    const m = errors.length;
    if (typeof raw.name !== "string") errors.push(`${w}: name must be text`);
    else {
      const problem = nameProblem(raw.name, names);
      if (problem) errors.push(`${w}: name: ${problem}`);
    }
    if (!Array.isArray(raw.cards) || raw.cards.length === 0 || !raw.cards.every((l) => typeof l === "string")) errors.push(`${w}: cards must be a list of lines of assembly`);
    else if (raw.cards.length > MAX_BODY) errors.push(`${w}: a custom card holds at most ${MAX_BODY} cards`);
    if (errors.length > m) return;
    const cards: Card[] = [];
    for (const line of raw.cards as string[]) {
      const card = cardOfLine(line);
      if (typeof card === "string") errors.push(`${w}: ${card}`);
      else cards.push(card);
    }
    if (cards.length !== (raw.cards as string[]).length) return;
    const problem = customBodyProblem(cards);
    if (problem) return void errors.push(`${w}: ${problem}`);
    for (const r of registersIn(cards.map((c) => c.word))) if (!boxes.includes(r)) errors.push(`${w}: uses box ${r} but boxes lists only ${boxes.join(", ")}`);
    const name = normalizeName(raw.name as string);
    names.push(name);
    out.push({ name, cards });
  });
  return errors.length > n ? undefined : out;
}

/** Validate a scene's `save` block: how many cards the student selects, and the name of the card they make. */
export function parseSaveSpec(input: unknown, where: string, taken: string[], errors: string[]): SaveSpec | undefined {
  if (!isObj(input)) return void errors.push(`${where}: save must be a mapping like { min: 2, max: 3, name: "Square-plus-one" }`);
  for (const key of Object.keys(input)) if (!["min", "max", "name"].includes(key)) errors.push(`${where}: save: unknown key "${key}"`);
  const { min, max, name } = input;
  const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_BODY;
  const n = errors.length;
  if (!whole(min) || !whole(max)) errors.push(`${where}: save min and max must be whole numbers from 1 to ${MAX_BODY}`);
  else if (min > max) errors.push(`${where}: save min must not be more than max`);
  if (name !== undefined) {
    if (typeof name !== "string") errors.push(`${where}: save name must be text`);
    else {
      const problem = nameProblem(name, taken);
      if (problem) errors.push(`${where}: save name: ${problem}`);
    }
  }
  if (errors.length > n) return undefined;
  return { min: min as number, max: max as number, ...(typeof name === "string" ? { name: normalizeName(name) } : {}) };
}

export interface CardSolution {
  /** The main program: one word per card (a custom card is a `jal ra` call), without the end marker. */
  words: number[];
  /** The bodies of the custom cards the program calls, placed after the end marker. */
  tail: number[];
  usedCards: string[];
}

/**
 * Read a card-program solution: one card per line, either a line of assembly or `card "Name"` for a custom card.
 * Blank lines and lines that start with # are ignored.
 */
export function parseCardSolution(text: string, customCards: CustomCard[], label: string, errors: string[]): CardSolution | undefined {
  const cards: Card[] = [];
  const n = errors.length;
  text.split("\n").forEach((raw, k) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const call = /^card\s+"([^"]+)"$/.exec(line);
    if (call) {
      if (!customCards.some((c) => c.name === call[1])) errors.push(`${label}: line ${k + 1}: there is no custom card called "${call[1]}"`);
      else cards.push(customCard(call[1]!));
      return;
    }
    const card = cardOfLine(line);
    if (typeof card === "string") errors.push(`${label}: line ${k + 1}: ${card}`);
    else cards.push(card);
  });
  if (errors.length > n) return undefined;
  if (cards.length === 0) return void errors.push(`${label}: no cards`);
  const built = buildProgram(cards, customCards);
  if (built.errors.length > 0) return void errors.push(...built.errors.map((e) => `${label}: ${e}`));
  const parts = programParts(built);
  return { ...parts, usedCards: [...new Set(cards.filter((c) => c.kind === "custom").map((c) => c.params.name!))] };
}
