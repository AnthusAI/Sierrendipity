import { decode, type Field } from "@sierrendipity/explorer";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BitLamps, FIELD_CLASSES, type BitLampsProps } from "./BitLamps";
import { rangesText } from "./bits";

/** Plain-English Course 1 names for the fields of an instruction, and which `--field-N` colour each uses. */
export const BAND_NAMES: Record<string, { label: string; color: number }> = {
  opcode: { label: "what kind of job", color: 1 },
  rd: { label: "answer goes in box", color: 2 },
  rs1: { label: "first box", color: 3 },
  rs2: { label: "second box", color: 4 },
  funct3: { label: "exact job", color: 5 },
  funct7: { label: "exact job", color: 5 },
  imm: { label: "the number", color: 6 },
  shamt: { label: "how many places", color: 7 },
};

/** The colour (1 to 7) of a field, by its name. */
export const bandColor = (field: string): number => BAND_NAMES[field]?.color ?? 7;

/** What a field holds, in words: "a2" for a register, "-8" for an immediate, "0x33" for an opcode. */
export const fieldMeaning = (field: Field): string => {
  const value = field.label.includes(" = ") ? field.label.split(" = ").slice(1).join(" = ") : String(field.value);
  return value.replace(/\s*\(.*\)$/, "");
};

const bitString = (field: Field): string => field.value.toString(2).padStart(field.hi - field.lo + 1, "0");

export interface FieldBandsProps extends Pick<BitLampsProps, "onChange" | "lockedBits" | "allowedBits" | "readOnly" | "signed"> {
  /** The 32-bit instruction word. */
  word: number;
  /** Called with a field name ("rd", "imm", ...) when a band is hovered or focused, and null when it is left. */
  onHoverField?: (field: string | null) => void;
  /** Called with a field name when a band is clicked. */
  onFieldClick?: (field: string) => void;
  /** Show the 32 lamps under the bands (default true). */
  lamps?: boolean;
  /** The accessible name of the whole widget. */
  label?: string;
}

/**
 * The 32 lamps of an instruction word, split into coloured bands. Every band has a text label, its
 * bits and what they mean, so colour is never the only clue. Pieces of one scattered number
 * (an immediate) share one label and one colour.
 */
export function FieldBands({ word, onHoverField, onFieldClick, lamps = true, label = "Field bands", ...lampProps }: FieldBandsProps) {
  const fields = useMemo(() => decode(word)?.fields ?? [], [word]);
  const [hot, setHot] = useState<string | null>(null);

  const colorOfBit = useMemo(() => {
    const map = new Map<number, number>();
    for (const f of fields) for (let bit = f.lo; bit <= f.hi; bit++) map.set(bit, bandColor(f.name));
    return map;
  }, [fields]);

  const point = (field: string | null) => {
    setHot(field);
    onHoverField?.(field);
  };

  const rangesOf = (name: string): [number, number][] => fields.filter((f) => f.name === name).map((f) => [f.hi, f.lo]);
  const hotText = hot ? `${BAND_NAMES[hot]?.label ?? hot}: ${rangesText(rangesOf(hot))}` : "Point at a band to see which lamps it covers";

  return (
    <div role="group" aria-label={label} className="space-y-2">
      {fields.length === 0 ? (
        <p data-no-bands className="rounded-md border border-dashed p-3 text-sm">
          These lamps do not make an instruction the machine knows yet, so there are no bands to show.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {fields.map((f) => {
              const info = BAND_NAMES[f.name] ?? { label: f.name, color: 7 };
              const pieces = rangesOf(f.name);
              const meaning = fieldMeaning(f);
              const own = rangesText([[f.hi, f.lo]]);
              const name = `${info.label} (${f.name}): ${meaning}, ${rangesText(pieces)}${pieces.length > 1 ? `; this piece is ${own}` : ""}`;
              const lit = hot === f.name;
              return (
                <button
                  key={`${f.hi}-${f.lo}`}
                  type="button"
                  data-band
                  data-field={f.name}
                  data-label={info.label}
                  data-hi={f.hi}
                  data-lo={f.lo}
                  aria-label={name}
                  title={`${info.label}: ${rangesText(pieces)}`}
                  onMouseEnter={() => point(f.name)}
                  onMouseLeave={() => point(null)}
                  onFocus={() => point(f.name)}
                  onBlur={() => point(null)}
                  onClick={() => onFieldClick?.(f.name)}
                  style={{ flexGrow: f.hi - f.lo + 1, flexBasis: 0 }}
                  className={cn(
                    "flex min-w-[5.5rem] flex-col items-center gap-0.5 rounded-md border-2 px-1.5 py-1 text-center text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    FIELD_CLASSES[info.color - 1]!.fill,
                    lit && "border-foreground",
                  )}
                >
                  <span data-band-label className="font-semibold">{info.label}</span>
                  <span data-band-bits className="font-mono tracking-wider">{bitString(f)}</span>
                  <span data-band-meaning className="font-medium">{meaning}</span>
                </button>
              );
            })}
          </div>
          <p data-band-caption aria-live="polite" className="min-h-4 text-xs text-muted-foreground">{hotText}</p>
        </>
      )}
      {lamps && (
        <BitLamps
          label="Instruction lamps"
          value={word >>> 0}
          bandOf={(bit) => colorOfBit.get(bit)}
          {...lampProps}
        />
      )}
    </div>
  );
}
