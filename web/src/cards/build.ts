import { assemble } from "@sierrendipity/explorer";
import { cardAssembly, customBodyProblem, type Card, type CustomCard } from "./model";

export interface BuiltProgram {
  /** The real words: the main program, the hidden `ebreak` end marker, then the body of each used custom card. */
  words: number[];
  /** The assembly text that was assembled (labels, not hand-computed offsets). */
  source: string;
  /** Where each card of the main program lives: a custom card is one `jal` word. */
  map: { card: number; address: number }[];
  /** Address of the end marker (an `ebreak`). */
  endAddress: number;
  /** Where each used custom card's body starts. */
  bodies: { name: string; address: number }[];
  /** Plain-language problems; when there are any, `words` is empty. */
  errors: string[];
}

/**
 * Turn cards into a real program. Custom cards become real calls: the main program does
 * `jal ra, <body>` and each used body is placed once after the end marker, ending in
 * `jalr zero, 0(ra)` (ret). A body may not contain jumps or other custom cards, so `ra` never needs saving.
 */
export function buildProgram(cards: Card[], customCards: CustomCard[] = []): BuiltProgram {
  const errors: string[] = [];
  const lines: string[] = [];
  const used: CustomCard[] = [];
  const map: BuiltProgram["map"] = [];
  cards.forEach((card, index) => {
    map.push({ card: index, address: index * 4 });
    if (card.kind === "custom") {
      const definition = customCards.find((c) => c.name === card.params.name);
      if (!definition) {
        errors.push(`There is no custom card called "${card.params.name}".`);
        return;
      }
      if (!used.includes(definition)) used.push(definition);
      lines.push(`jal ra, card_${used.indexOf(definition)}`);
      return;
    }
    try {
      lines.push(cardAssembly(card.kind, card.params));
    } catch (error) {
      errors.push(`Card ${index + 1}: ${(error as Error).message}.`);
    }
  });
  lines.push("ebreak");
  for (const [i, definition] of used.entries()) {
    const problem = customBodyProblem(definition.cards);
    if (problem) {
      errors.push(`"${definition.name}": ${problem}`);
      continue;
    }
    lines.push(`card_${i}:`);
    for (const card of definition.cards) {
      try {
        lines.push(cardAssembly(card.kind, card.params));
      } catch (error) {
        errors.push(`"${definition.name}": ${(error as Error).message}.`);
      }
    }
    lines.push("jalr zero, 0(ra)");
  }
  const source = lines.join("\n");
  const empty = { words: [], source, map, endAddress: cards.length * 4, bodies: [], errors };
  if (errors.length > 0) return empty;
  const result = assemble(source);
  if (result.errors.length > 0) return { ...empty, errors: result.errors.map((e) => e.message) };
  return {
    words: result.words,
    source,
    map,
    endAddress: cards.length * 4,
    bodies: used.map((definition, i) => ({ name: definition.name, address: result.labels[`card_${i}`]! })),
    errors: [],
  };
}
