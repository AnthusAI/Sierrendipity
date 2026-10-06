import { decode, type Field } from "@sierrendipity/explorer";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
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
  special: { label: "special job", color: 1 },
};

/** The colour (1 to 7) of a field, by its name. */
export const bandColor = (field: string): number => BAND_NAMES[field]?.color ?? 7;

/** Instructions that use none of the usual fields: they get one band that says so. */
const SPECIAL = new Set(["ecall", "ebreak", "fence"]);

/**
 * The label of a field in this word. Boxes say what they are for: loads, stores and `jalr` use
 * the first box as the address base, a store's second box is the value it saves, jumps and branches
 * call their number "where to jump", and a big number (lui, auipc) says it lands in the top bits.
 */
export function bandLabel(name: string, word: number): string {
  const op = word & 0x7f;
  if (name === "rs1" && (op === 0x03 || op === 0x67 || op === 0x23)) return "address from box";
  if (name === "rs2" && op === 0x23) return "box to save";
  if (name === "imm") {
    if (op === 0x6f || op === 0x63 || op === 0x67) return "where to jump";
    if (op === 0x37 || op === 0x17) return "the number (placed in the top 20 bits)";
  }
  return BAND_NAMES[name]?.label ?? name;
}

/** What a field holds, in words: "a2" for a register, "-8" for an immediate, "0x33" for an opcode. */
export const fieldMeaning = (field: Field, word = 0): string => {
  const value = field.label.includes(" = ") ? field.label.split(" = ").slice(1).join(" = ") : String(field.value);
  const plain = value.replace(/\s*\(.*\)$/, "");
  const op = word & 0x7f;
  if (field.name === "imm" && (op === 0x37 || op === 0x17)) return `${plain} (used as 0x${(field.value * 4096).toString(16)})`;
  return plain;
};

const bitString = (field: Field): string => (field.value >>> 0).toString(2).padStart(field.hi - field.lo + 1, "0");

export interface FieldBandsProps extends Pick<BitLampsProps, "onChange" | "lockedBits" | "allowedBits" | "readOnly" | "signed"> {
  /** The 32-bit instruction word. */
  word: number;
  /**
   * Called with a field name ("rd", "imm", ...) when a band is hovered or focused, and null when it is left.
   * Giving this or `onFieldClick` makes the bands buttons; without either they are plain list items.
   */
  onHoverField?: (field: string | null) => void;
  /** Called with a field name when a band is clicked. */
  onFieldClick?: (field: string) => void;
  /** Show the 32 lamps under the bands (default true). */
  lamps?: boolean;
  /** The accessible name of the whole widget. */
  label?: string;
  /** Give each band `data-coach-id="band:<field>"` and each lamp `lamp:<bit>`, so a lesson can point at or ask about them. */
  coachIds?: boolean;
}

/**
 * The 32 lamps of an instruction word, split into coloured bands. Every band has a text label, its
 * bits and what they mean, so colour is never the only clue. Pieces of one scattered number
 * (an immediate) share one label and one colour.
 */
export function FieldBands({ word, onHoverField, onFieldClick, lamps = true, label = "Field bands", coachIds = false, ...lampProps }: FieldBandsProps) {
  const id = useId();
  const decoded = useMemo(() => decode(word), [word]);
  const fields = useMemo<Field[]>(() => {
    if (!decoded) return [];
    if (SPECIAL.has(decoded.mnemonic)) {
      return [{ name: "special", hi: 31, lo: 0, value: word >>> 0, label: `special = ${decoded.mnemonic}` }];
    }
    return decoded.fields;
  }, [decoded, word]);
  const [hot, setHot] = useState<string | null>(null);
  const hotRef = useRef<string | null>(null);
  const interactive = onHoverField !== undefined || onFieldClick !== undefined;

  const point = (field: string | null) => {
    hotRef.current = field;
    setHot(field);
    onHoverField?.(field);
  };

  // A band can vanish when the word changes (focus never fires blur on a removed node): start clean.
  useEffect(() => {
    if (hotRef.current !== null) point(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  const colorOfBit = useMemo(() => {
    const map = new Map<number, number>();
    for (const f of fields) for (let bit = f.lo; bit <= f.hi; bit++) map.set(bit, bandColor(f.name));
    return map;
  }, [fields]);

  const rangesOf = (name: string): [number, number][] => fields.filter((f) => f.name === name).map((f) => [f.hi, f.lo]);
  const hotRanges = hot ? rangesOf(hot) : [];
  const hotText =
    hot && hotRanges.length > 0
      ? `${bandLabel(hot, word)}: ${rangesText(hotRanges)}`
      : "Point at a band to see which lamps it covers";

  const bands = fields.map((f) => {
    const text = bandLabel(f.name, word);
    const color = bandColor(f.name);
    const pieces = rangesOf(f.name);
    const meaning = fieldMeaning(f, word);
    const own = rangesText([[f.hi, f.lo]]);
    const ranges = `${rangesText(pieces)}${pieces.length > 1 ? `; this piece is ${own}` : ""}`;
    const key = `${f.hi}-${f.lo}`;
    const rangesId = `${id}-${key}`;
    const common = {
      "data-band": true,
      "data-coach-id": coachIds ? `band:${f.name}` : undefined,
      "data-field": f.name,
      "data-label": text,
      "data-hi": f.hi,
      "data-lo": f.lo,
      title: `${text}: ${rangesText(pieces)}`,
      style: { flexGrow: f.hi - f.lo + 1, flexBasis: 0 },
    };
    const inside: ReactNode = (
      <>
        <span data-band-label className="font-semibold [overflow-wrap:anywhere]">{text}</span>
        <span data-band-bits className="break-all font-mono tracking-wider">{bitString(f)}</span>
        <span data-band-meaning className="font-medium [overflow-wrap:anywhere]">{meaning}</span>
        <span id={rangesId} data-band-ranges className="sr-only">{ranges}</span>
      </>
    );
    const classes = cn(
      "flex min-w-[5.5rem] flex-col items-center gap-0.5 rounded-md border-2 px-1.5 py-1 text-center text-xs",
      FIELD_CLASSES[color - 1]!.fill,
    );
    if (!interactive) {
      return (
        <li key={key} {...common} className={classes}>
          {inside}
        </li>
      );
    }
    return (
      <button
        key={key}
        type="button"
        {...common}
        aria-label={`${text}: ${meaning}`}
        aria-describedby={rangesId}
        onMouseEnter={() => point(f.name)}
        onMouseLeave={() => point(null)}
        onFocus={() => point(f.name)}
        onBlur={() => point(null)}
        onClick={() => onFieldClick?.(f.name)}
        className={cn(
          classes,
          "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          hot === f.name && "border-foreground",
        )}
      >
        {inside}
      </button>
    );
  });

  return (
    <div role="group" aria-label={label} dir="ltr" className="space-y-2">
      {fields.length === 0 ? (
        <p data-no-bands className="rounded-md border border-dashed p-3 text-sm">
          These lamps do not make an instruction the machine knows yet, so there are no bands to show.
        </p>
      ) : (
        <>
          {interactive ? <div className="flex flex-wrap gap-1">{bands}</div> : <ul className="flex flex-wrap gap-1">{bands}</ul>}
          {interactive && (
            <p data-band-caption aria-live="polite" className="min-h-4 text-xs text-muted-foreground">{hotText}</p>
          )}
        </>
      )}
      {lamps && (
        <BitLamps label="Instruction lamps" value={word >>> 0} bandOf={(bit) => colorOfBit.get(bit)} coachIds={coachIds} {...lampProps} />
      )}
    </div>
  );
}
