import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./lamps.css";
import { ALL_LENSES, LENS_LABELS, LensFace, type Lens, type LensFaceProps } from "./LensFace";
import { useReducedMotion } from "./motion";

export type { Lens } from "./LensFace";

export interface CardFlipProps extends Omit<LensFaceProps, "lens" | "highlight"> {
  /** The current view when controlled. */
  lens?: Lens;
  /** The starting view when not controlled (default: the first offered). */
  defaultLens?: Lens;
  onLensChange?: (lens: Lens) => void;
  /** Which views are offered, in order (default all four: card, lamps, hex, assembly). */
  lenses?: readonly Lens[];
  /** The accessible name of the widget. */
  label?: string;
}

/** One card that flips through ways of looking at the same real 32-bit word. */
export function CardFlip({ word, lens, defaultLens, onLensChange, lenses = ALL_LENSES, label = "Card", ...face }: CardFlipProps) {
  const reduced = useReducedMotion();
  const [inner, setInner] = useState<Lens>(defaultLens ?? lenses[0] ?? "card");
  const [hot, setHot] = useState<string | null>(null);
  const requested = lens ?? inner;
  const current = lenses.includes(requested) ? requested : (lenses[0] ?? "card");

  const choose = (next: Lens) => {
    if (lens === undefined) setInner(next);
    onLensChange?.(next);
  };
  const flipOn = () => choose(lenses[(lenses.indexOf(current) + 1) % lenses.length]!);

  return (
    <div role="group" aria-label={label} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {lenses.map((l) => (
          <Button
            key={l}
            data-lens-button
            variant={l === current ? "default" : "secondary"}
            size="sm"
            aria-pressed={l === current}
            onClick={() => choose(l)}
          >
            {LENS_LABELS[l]}
          </Button>
        ))}
        {lenses.length > 1 && (
          <Button variant="ghost" size="sm" onClick={flipOn}>
            Flip to the next view
          </Button>
        )}
      </div>
      <div data-flip={reduced ? "instant" : "animated"}>
        <div
          key={current}
          data-lens-face={current}
          className={cn("rounded-lg border bg-card p-4 text-card-foreground shadow-sm", !reduced && "lens-flip")}
        >
          <LensFace {...face} word={word} lens={current} highlight={hot} onHoverField={(f) => { setHot(f); face.onHoverField?.(f); }} />
        </div>
      </div>
    </div>
  );
}
