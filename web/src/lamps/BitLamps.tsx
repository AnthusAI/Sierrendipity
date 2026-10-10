import { Lock } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { clampWidth, isLit, placeText, placeValue, signed as signedValue, toggleBit, unsigned } from "./bits";

/** The seven field colour tokens as full class names (Tailwind only keeps classes it can read). */
export const FIELD_CLASSES = [
  { fill: "bg-field-1 text-field-foreground border-field-1", ring: "ring-2 ring-inset ring-field-1" },
  { fill: "bg-field-2 text-field-foreground border-field-2", ring: "ring-2 ring-inset ring-field-2" },
  { fill: "bg-field-3 text-field-foreground border-field-3", ring: "ring-2 ring-inset ring-field-3" },
  { fill: "bg-field-4 text-field-foreground border-field-4", ring: "ring-2 ring-inset ring-field-4" },
  { fill: "bg-field-5 text-field-foreground border-field-5", ring: "ring-2 ring-inset ring-field-5" },
  { fill: "bg-field-6 text-field-foreground border-field-6", ring: "ring-2 ring-inset ring-field-6" },
  { fill: "bg-field-7 text-field-foreground border-field-7", ring: "ring-2 ring-inset ring-field-7" },
] as const;

export interface BitLampsProps {
  /** The number the lamps show, as an unsigned whole number below 2^width. */
  value: number;
  /** Called with the new unsigned value when a lamp is switched. Without it the lamps are read-only. */
  onChange?: (value: number) => void;
  /** How many lamps (default 32). Lamp 0 is on the right. */
  width?: number;
  /** Show the place value under each lamp (default true). */
  labels?: boolean;
  /** The accessible name of the whole row of lamps. */
  label?: string;
  /** Show the lamps but do not let them be switched. */
  readOnly?: boolean;
  /** Also show the number read as signed (the top lamp counts as a minus sign). */
  signed?: boolean;
  /** Lamps per group, separated by a gap (default 4). */
  groupSize?: 4 | 8;
  /** Show the running total under the lamps (default true). */
  showTotal?: boolean;
  /** The colour band of a lamp, 1 to 7 (the `--field-N` tokens), or undefined for the plain colour. */
  bandOf?: (bit: number) => number | undefined;
  /** Lamps that cannot be switched. */
  lockedBits?: readonly number[];
  /** When given, only these lamps can be switched. */
  allowedBits?: readonly number[];
  /** Give every lamp a `data-coach-id` ("lamp:<bit>") so a lesson can point at it. */
  coachIds?: boolean;
  className?: string;
}

/**
 * A row of lamps that are on/off switches worth powers of two. Lamp 0 is on the right.
 * Arrow keys move between lamps; Space or Enter flips the focused lamp.
 */
export function BitLamps({
  value,
  onChange,
  width: requestedWidth = 32,
  labels = true,
  label = "Bit lamps",
  readOnly = false,
  signed = false,
  groupSize = 4,
  showTotal = true,
  bandOf,
  lockedBits,
  allowedBits,
  coachIds = false,
  className,
}: BitLampsProps) {
  const width = clampWidth(requestedWidth);
  const number = unsigned(value, width);
  const inert = readOnly || !onChange;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(width - 1);

  const locked = (bit: number) =>
    (lockedBits?.includes(bit) ?? false) || (allowedBits !== undefined && !allowedBits.includes(bit));

  const bits = Array.from({ length: width }, (_, i) => width - 1 - i);
  const groups: number[][] = [];
  for (let end = bits.length; end > 0; end -= groupSize) groups.unshift(bits.slice(Math.max(0, end - groupSize), end));

  const focusBit = (bit: number) => {
    const next = Math.min(width - 1, Math.max(0, bit));
    setActive(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, bit: number) => {
    const moves: Record<string, number> = { ArrowLeft: bit + 1, ArrowRight: bit - 1, ArrowUp: bit + 1, ArrowDown: bit - 1, Home: width - 1, End: 0 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusBit(target);
  };

  return (
    <div role="group" aria-label={label} dir="ltr" className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-x-3 gap-y-3">
        {groups.map((group) => (
          <div key={group[0]} data-lamp-group className="flex gap-0.5">
            {group.map((bit) => {
              const lit = isLit(number, bit);
              const band = bandOf?.(bit);
              const colours = band ? FIELD_CLASSES[band - 1] : undefined;
              const isLocked = !inert && locked(bit);
              const name = labels ? `bit ${bit}, worth ${placeValue(bit)}` : `bit ${bit}`;
              return (
                <div key={bit} data-bit={bit} data-coach-id={coachIds ? `lamp:${bit}` : undefined} className="flex w-6 flex-col items-center gap-0.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={lit}
                    aria-label={name}
                    aria-disabled={isLocked || undefined}
                    aria-readonly={inert || undefined}
                    data-locked={isLocked || undefined}
                    data-lit={lit}
                    ref={(el) => void (refs.current[bit] = el)}
                    tabIndex={bit === active ? 0 : -1}
                    onFocus={() => setActive(bit)}
                    onKeyDown={(event) => onKeyDown(event, bit)}
                    onClick={() => {
                      if (inert || isLocked) return;
                      onChange?.(toggleBit(number, bit));
                    }}
                    className={cn(
                      "relative grid size-6 place-items-center rounded-full border-2 border-foreground font-mono text-xs font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      lit
                        ? cn(colours ? colours.fill : "bg-primary text-primary-foreground", "border-foreground")
                        : cn("bg-background text-foreground", colours?.ring),
                      isLocked && "cursor-not-allowed border-dashed",
                      isLocked && !lit && "bg-muted text-muted-foreground",
                      inert ? "cursor-default" : !isLocked && "cursor-pointer hover:brightness-95",
                    )}
                  >
                    {lit ? "1" : "0"}
                    {isLocked && (
                      <Lock data-lock-icon aria-hidden="true" className="absolute -right-1.5 -top-1.5 size-3 rounded-full bg-background p-px text-foreground" />
                    )}
                  </button>
                  {labels && (
                    <span data-place={placeText(bit)} aria-hidden="true" className="font-mono text-[11px] leading-none text-muted-foreground">
                      {bit < 10 ? placeValue(bit) : <>2<sup>{bit}</sup></>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {showTotal && (
        <div aria-live="polite" className="space-y-0.5 text-sm">
          <p data-total>{`Lit lamps add up to ${number}`}</p>
          {signed && <p data-signed className="text-muted-foreground">{`Read as a signed number: ${signedValue(number, width)}`}</p>}
        </div>
      )}
    </div>
  );
}
