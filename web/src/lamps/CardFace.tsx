import { decode, describe, type CardPart } from "@sierrendipity/explorer";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { bandColor } from "./FieldBands";
import { FIELD_CLASSES } from "./BitLamps";

export const FRIENDLY_FALLBACK = "The machine would not understand this one yet";

/** Which words of the card text a field is responsible for (boxes say so themselves via `part.field`). */
function matches(part: CardPart, field: string): boolean {
  switch (field) {
    case "opcode":
    case "funct3":
    case "funct7":
      return part.role === "verb";
    case "rd":
    case "rs1":
    case "rs2":
      return part.role === "box" && part.field === field;
    case "imm":
    case "shamt":
      return part.role === "number" || part.role === "shelf";
    default:
      return false;
  }
}

export interface CardFaceProps {
  word: number;
  /** A field name ("rd", "imm", ...): the matching words of the card text are highlighted in its band colour. */
  highlight?: string | null;
  className?: string;
}

/** The English face of a card: `describe(word)`, or a friendly message when the word is not an instruction. */
export function CardFace({ word, highlight = null, className }: CardFaceProps) {
  const card = useMemo(() => describe(word), [word]);
  const valid = useMemo(() => decode(word) !== null, [word]);
  return (
    <div role="status" aria-label="Card face" aria-live="polite" className={cn("text-lg leading-snug", className)}>
      {!valid ? (
        <span data-card-fallback>{FRIENDLY_FALLBACK}</span>
      ) : (
        card.parts.map((part, i) => {
          // Always a <span>: toggling the highlight changes attributes only, so the live region
          // does not see new nodes and screen readers do not re-read the sentence.
          const on = highlight !== null && matches(part, highlight);
          return (
            <span
              key={i}
              data-highlight={on || undefined}
              className={cn(part.role === "verb" && "font-semibold", on && cn("rounded px-0.5", FIELD_CLASSES[bandColor(highlight!) - 1]!.fill))}
            >
              {part.text}
            </span>
          );
        })
      )}
    </div>
  );
}
