import { useState } from "react";
import { ALL_LENSES, LensFace, type Lens, type LensFaceProps } from "./LensFace";

export interface WordEditorProps extends Pick<LensFaceProps, "lockedBits" | "allowedBits" | "signed"> {
  /** The real 32-bit word being edited. */
  word: number;
  /** Called with the new word each time a lamp is flipped. */
  onChange: (word: number) => void;
  /** Which views to show at once, in a fixed order (default all four). */
  lenses?: readonly Lens[];
  /** The accessible name of the widget. */
  label?: string;
}

/**
 * Flip lamps to edit a real instruction word. The card, the bands, the hex and the assembly all
 * follow live. `lockedBits` or `allowedBits` limit which lamps can be flipped.
 */
export function WordEditor({ word, onChange, lenses = ALL_LENSES, label = "Word editor", ...limits }: WordEditorProps) {
  const [hot, setHot] = useState<string | null>(null);
  return (
    <div role="group" aria-label={label} className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      {ALL_LENSES.filter((l) => lenses.includes(l)).map((lens) => (
        <LensFace key={lens} word={word} lens={lens} onWordChange={onChange} highlight={hot} onHoverField={setHot} {...limits} />
      ))}
    </div>
  );
}
