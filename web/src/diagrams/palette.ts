/**
 * The 16 pixel colors. The fills and the number printed on them are theme tokens (`--pixel-N` and
 * `--pixel-N-fg`, see theme/palette.ts), so they follow the theme and mode. Every color also has a text
 * label, so color is never the only cue.
 */
export interface PixelColor {
  value: number;
  label: string;
  bg: string;
  fg: string;
}

const LABELS = [
  "blank", "blue", "orange", "green", "purple", "red", "cyan", "yellow",
  "pink", "lime", "teal", "brown", "indigo", "grey", "black", "sky",
] as const;

export const PIXEL_PALETTE: readonly PixelColor[] = LABELS.map((label, value) => ({
  value,
  label,
  bg: `var(--pixel-${value})`,
  fg: `var(--pixel-${value}-fg)`,
}));

/** Any byte above 15 is not in the palette: it is drawn as "other" (a striped mark), never as blank. */
export const OTHER_COLOR = { label: "other", bg: "var(--muted)", fg: "var(--foreground)" } as const;
