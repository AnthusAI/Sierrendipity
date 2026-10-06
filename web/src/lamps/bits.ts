// Pure helpers for the lamp widgets: no DOM, no React.

/** What one lamp is worth. */
export const placeValue = (bit: number): number => 2 ** bit;

/** The place value as short text: plain numbers while they are small, then 2^n. */
export const placeText = (bit: number): string => (bit < 10 ? String(placeValue(bit)) : `2^${bit}`);

/** Is lamp `bit` lit in `value`? Works for any width up to 32 without bitwise tricks. */
export const isLit = (value: number, bit: number): boolean => Math.floor(value / 2 ** bit) % 2 === 1;

/** Flip one lamp, keeping the result an unsigned number below 2^width. */
export const toggleBit = (value: number, bit: number): number =>
  isLit(value, bit) ? value - placeValue(bit) : value + placeValue(bit);

/** The number the lit lamps add up to, as unsigned. */
export const unsigned = (value: number, width: number): number => {
  const v = Number.isFinite(value) ? Math.trunc(value) : 0;
  const range = 2 ** width;
  return ((v % range) + range) % range;
};

/** The same lamps read as a two's complement number: the top lamp counts as a minus sign. */
export const signed = (value: number, width: number): number => {
  const u = unsigned(value, width);
  return u >= 2 ** (width - 1) ? u - 2 ** width : u;
};

/** 0x00500513: a 32-bit word as eight hex digits. */
export const hex32 = (word: number): string => "0x" + (word >>> 0).toString(16).padStart(8, "0");

/** How many binary digits a non-negative whole number needs (0 needs 1). */
export const bitLength = (n: number): number => Math.max(1, n.toString(2).length);

/** "31 to 25", or "7" for a single bit. */
export const rangeText = (hi: number, lo: number): string => (hi === lo ? String(hi) : `${hi} to ${lo}`);

/** "bits 31 to 25 and 11 to 7", "bits 31, 30 to 25 and 7", "bit 7". */
export function rangesText(ranges: [number, number][]): string {
  const parts = ranges.map(([hi, lo]) => rangeText(hi, lo));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]!;
  return ranges.length === 1 && ranges[0]![0] === ranges[0]![1] ? `bit ${list}` : `bits ${list}`;
}

/** Lamp counts are kept between 1 and 32 (the width of a machine word). */
export const clampWidth = (width: number): number => (Number.isFinite(width) ? Math.min(32, Math.max(1, Math.trunc(width))) : 32);

/** Is `n` a whole number that fits in an unsigned 32-bit word? */
export const isWord = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
