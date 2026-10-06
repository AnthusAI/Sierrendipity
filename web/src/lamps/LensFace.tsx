import { decode } from "@sierrendipity/explorer";
import { CardFace, FRIENDLY_FALLBACK } from "./CardFace";
import { FieldBands, type FieldBandsProps } from "./FieldBands";
import { hex32 } from "./bits";

/** The ways to look at one 32-bit word. */
export type Lens = "card" | "lamps" | "hex" | "assembly";
export const ALL_LENSES: readonly Lens[] = ["card", "lamps", "hex", "assembly"];
export const LENS_LABELS: Record<Lens, string> = { card: "Card", lamps: "Lamps", hex: "Hex", assembly: "Assembly" };

export interface LensFaceProps extends Pick<FieldBandsProps, "lockedBits" | "allowedBits" | "readOnly" | "signed"> {
  word: number;
  lens: Lens;
  /** Make the lamps editable: called with the new word. */
  onWordChange?: (word: number) => void;
  /** A field name to highlight in the card text (set by hovering a band). */
  highlight?: string | null;
  onHoverField?: (field: string | null) => void;
  onFieldClick?: (field: string) => void;
}

/** The inside of one lens. Used by the card flip (one at a time) and the word editor (stacked). */
export function LensFace({ word, lens, onWordChange, highlight, onHoverField, onFieldClick, ...rest }: LensFaceProps) {
  switch (lens) {
    case "card":
      return <CardFace word={word} highlight={highlight} />;
    case "lamps":
      return (
        <FieldBands
          word={word}
          label="Lamps and bands"
          onChange={onWordChange}
          onHoverField={onHoverField}
          onFieldClick={onFieldClick}
          {...rest}
        />
      );
    case "hex":
      return (
        <div className="space-y-1">
          <code data-word className="block font-mono text-2xl">{hex32(word)}</code>
          <p className="text-sm text-muted-foreground">Hex: a short way to write the lamps. Each digit stands for four lamps.</p>
        </div>
      );
    case "assembly": {
      const decoded = decode(word);
      return decoded ? (
        <code data-assembly className="block font-mono text-xl">{decoded.text}</code>
      ) : (
        <p data-assembly-fallback className="text-lg">{FRIENDLY_FALLBACK}</p>
      );
    }
  }
}
