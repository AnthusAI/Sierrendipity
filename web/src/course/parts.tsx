import { Star } from "lucide-react";
import { starLabel } from "./model";

/** Stars earned, each with a text label ("Passed", "Called it"); the label is the meaning, the glyph is decoration. */
export function StarChips({ stars }: { stars: string[] }) {
  return (
    <>
      {stars.map((id) => (
        <span key={id} data-star={id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          <Star aria-hidden className="size-3 fill-current" />
          {starLabel(id)}
        </span>
      ))}
    </>
  );
}

/** "about 3 min" */
export const about = (minutes: number): string => `about ${minutes} min`;
