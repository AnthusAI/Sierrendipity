import { decode } from "@sierrendipity/explorer";

/** The machine word in hex, the way the machine stores it: 0x00900513. */
export const wordHex = (word: number) => `0x${(word >>> 0).toString(16).padStart(8, "0")}`;

const assemblyOf = (word: number) => decode(word)?.text ?? "unknown word";

/** The line the glass strip shows for a card: its real assembly text and its machine word. */
export function glassText(word: number): string {
  return `${assemblyOf(word)} · ${wordHex(word)}`;
}

interface Props {
  word: number;
  /** The card's 0-based index, for `data-coach-id="glass:<n>"`. */
  index: number;
  coachIds?: boolean;
  /** False until a scene names the line: it is then hidden from screen readers. */
  named?: boolean;
  /** False in a lesson that hides register names: a screen reader is not given the assembly (it holds a0). */
  registerNames?: boolean;
}

/** A faint "glass" under a card: the real assembly and the machine word, live as the card changes. It wraps; it never cuts. */
export function GlassStrip({ word, index, coachIds = true, named = false, registerNames = true }: Props) {
  const assembly = assemblyOf(word);
  const spoken = registerNames ? `The machine's own text for this card: ${assembly}` : "The machine's own text for this card is on the screen.";
  return (
    <p data-glass data-testid="glass" data-coach-id={coachIds ? `glass:${index}` : undefined} className="mt-0.5 min-w-0 px-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
      {named && <span className="sr-only">{spoken}</span>}
      <span aria-hidden="true">
        <span data-glass-assembly className="whitespace-nowrap">{assembly}</span>
        {" · "}
        <span data-glass-word className="whitespace-nowrap">{wordHex(word)}</span>
      </span>
    </p>
  );
}
