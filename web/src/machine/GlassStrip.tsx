import { decode } from "@sierrendipity/explorer";

/** The machine word in hex, the way the machine stores it: 0x00900513. */
export const wordHex = (word: number) => `0x${(word >>> 0).toString(16).padStart(8, "0")}`;

/** The line the glass strip shows for a card: its real assembly text and its machine word. */
export function glassText(word: number): string {
  const assembly = decode(word)?.text ?? "unknown word";
  return `${assembly} · ${wordHex(word)}`;
}

interface Props {
  word: number;
  /** The card's 0-based index, for `data-coach-id="glass:<n>"`. */
  index: number;
  coachIds?: boolean;
}

/** A faint one-line "glass" under a card: the real assembly and the machine word, live as the card changes. */
export function GlassStrip({ word, index, coachIds = true }: Props) {
  return (
    <p data-glass data-testid="glass" data-coach-id={coachIds ? `glass:${index}` : undefined} className="mt-0.5 min-w-0 truncate px-1 font-mono text-xs text-muted-foreground">
      <span className="sr-only">The RISC-V machine writes this card as: </span>
      {glassText(word)}
    </p>
  );
}
