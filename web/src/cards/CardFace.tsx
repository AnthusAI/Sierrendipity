import { decode, describe } from "@sierrendipity/explorer";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NumberSpinner } from "./NumberSpinner";
import {
  DEFAULT_BOXES,
  boxKeys,
  cardText,
  numberSpec,
  withParams,
  type Card,
  type CustomCard,
  type Position,
} from "./model";

/** Theme tokens for the coloured parts of a card (the editor's syntax colours, so they pass the same contrast checks). */
export const PART_CLASS: Record<string, string> = {
  verb: "font-medium text-[color:var(--syntax-keyword)]",
  box: "font-mono text-[color:var(--syntax-register)]",
  number: "font-mono text-[color:var(--syntax-number)]",
  shelf: "font-mono text-[color:var(--syntax-string)]",
  label: "text-[color:var(--syntax-type)]",
  text: "text-editor-foreground",
};

/** True when the sentence is the one this kind of card normally makes (so its parts map to its parameters). */
function sentenceMatches(card: Card): boolean {
  const kind = describe(card.word, { vocabulary: "boxes" }).kind;
  if (card.kind === "save-byte") return kind === "save" || kind === "paint-pixel";
  return kind === card.kind;
}

export interface CardContentProps {
  card: Card;
  /** Spinners on the number part. Needs `onChange`. */
  editable?: boolean;
  editableBoxes?: boolean;
  boxes?: string[];
  onChange?: (card: Card) => void;
  pc?: number;
  /** For a custom card: the definitions (its input slot is worked out from its cards). */
  customCards?: CustomCard[];
  /** Where the card sits in its list; a jump's spinner stays inside the list. */
  position?: Position;
  /** The spoken name of the number's spin button (default "number"), such as "Number on card 1". */
  numberLabel?: string;
  /** The spin button is switched off for now (it says "Not yet"). */
  locked?: boolean;
}

/** The coloured sentence of a card, without any frame or role (the tray and the face both use it). */
export function CardContent({
  card,
  editable = false,
  editableBoxes = false,
  boxes = DEFAULT_BOXES,
  onChange,
  pc,
  customCards,
  position,
  numberLabel,
  locked = false,
}: CardContentProps) {
  const { parts } = cardText(card, { pc, customCards });
  if (card.kind === "custom") {
    return (
      <span className="flex min-w-0 flex-col [overflow-wrap:anywhere]">
        <span data-part="verb" className={PART_CLASS.verb}>
          {card.params.name}
        </span>
        <span data-testid="input-slot" data-part="text" className="text-xs text-editor-foreground">
          {parts[2]?.text}
        </span>
      </span>
    );
  }
  const mapped = sentenceMatches(card);
  const spec = editable && mapped ? numberSpec(card, position) : null;
  const keys = boxKeys(card.kind);
  let boxIndex = 0;
  return (
    <span className="block leading-7">
      {parts.map((part, i) => {
        if (part.role === "box") {
          const key = keys[boxIndex++];
          const name = part.text.startsWith("box ") ? part.text.slice(4) : null;
          const current = key ? (card.params[key] as string | undefined) : undefined;
          if (editableBoxes && onChange && mapped && key && current && name !== null) {
            const options = boxes.includes(current) ? boxes : [current, ...boxes];
            return (
              <span key={i} data-part="box" className={PART_CLASS.box}>
                box{" "}
                <select
                  aria-label="box"
                  value={current}
                  className="rounded border border-input bg-background px-1 font-mono text-[color:var(--syntax-register)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  onChange={(event) => onChange(withParams(card, { [key]: event.target.value }))}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </span>
            );
          }
        }
        if ((part.role === "number" || part.role === "shelf") && spec && onChange) {
          return (
            <NumberSpinner
              key={i}
              value={spec.value}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              locked={locked}
              {...(numberLabel ? { label: numberLabel } : {})}
              onChange={(shown) => onChange(spec.apply(shown))}
            />
          );
        }
        return (
          <span key={i} data-part={part.role} className={PART_CLASS[part.role]}>
            {part.text}
          </span>
        );
      })}
    </span>
  );
}

export interface CardFaceProps extends CardContentProps {
  /** Show the faint assembly chip (hidden by default). */
  showAssembly?: boolean;
  className?: string;
}

/**
 * One card: plain English over a real machine word. Focusable, named by its text. With `onChange` the
 * number is a spin button; with `editableBoxes` the boxes are pickers. A custom card shows its input slot
 * and a "Peek inside" control that lists its cards (read-only, same faces).
 */
export function CardFace({ card, showAssembly = false, customCards, className, editable, ...content }: CardFaceProps) {
  const { text } = cardText(card, { pc: content.pc, customCards });
  const [open, setOpen] = useState(false);
  const peekId = useId();
  const definition = card.kind === "custom" ? customCards?.find((c) => c.name === card.params.name) : undefined;
  const assembly = card.kind === "custom" ? null : decode(card.word)?.text;
  return (
    <div
      data-testid="card-face"
      data-kind={card.kind}
      role="group"
      tabIndex={0}
      aria-label={text}
      className={cn(
        "min-w-0 rounded-md border bg-editor px-3 py-2 text-sm text-editor-foreground [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <CardContent card={card} editable={editable ?? Boolean(content.onChange)} customCards={customCards} {...content} />
      {showAssembly && assembly ? (
        <code data-testid="assembly" className="mt-1 block font-mono text-xs text-muted-foreground">
          {assembly}
        </code>
      ) : null}
      {definition ? (
        <div className="mt-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-6"
            aria-expanded={open}
            aria-controls={peekId}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight aria-hidden className={cn("transition-transform", open && "rotate-90")} />
            Peek inside
          </Button>
          {open ? (
            <ol id={peekId} data-testid="peek" aria-label={`Inside ${definition.name}`} className="mt-1 space-y-1 border-l pl-3">
              {definition.cards.map((inner, i) => (
                <li key={i}>
                  <CardFace card={inner} showAssembly={showAssembly} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
