/**
 * The 16 pixel colors, built only from theme tokens (see theme/palette.ts) so they follow the theme and
 * mode. `fg` is the readable text color for a number printed on the color; every color also has a
 * text label, so color is never the only cue.
 */
export interface PixelColor {
  value: number;
  label: string;
  bg: string;
  fg: string;
}

const field = (n: number) => `var(--field-${n})`;
const onField = "var(--field-foreground)";
const onStrong = "var(--background)";

export const PIXEL_PALETTE: readonly PixelColor[] = [
  { value: 0, label: "blank", bg: "var(--muted)", fg: "var(--foreground)" },
  { value: 1, label: "blue", bg: field(1), fg: onField },
  { value: 2, label: "orange", bg: field(2), fg: onField },
  { value: 3, label: "green", bg: field(3), fg: onField },
  { value: 4, label: "purple", bg: field(4), fg: onField },
  { value: 5, label: "red", bg: field(5), fg: onField },
  { value: 6, label: "cyan", bg: field(6), fg: onField },
  { value: 7, label: "yellow", bg: field(7), fg: onField },
  { value: 8, label: "strong blue", bg: "var(--ansi-blue)", fg: onStrong },
  { value: 9, label: "strong red", bg: "var(--ansi-red)", fg: onStrong },
  { value: 10, label: "strong green", bg: "var(--ansi-green)", fg: onStrong },
  { value: 11, label: "strong yellow", bg: "var(--ansi-yellow)", fg: onStrong },
  { value: 12, label: "strong magenta", bg: "var(--ansi-magenta)", fg: onStrong },
  { value: 13, label: "strong cyan", bg: "var(--ansi-cyan)", fg: onStrong },
  { value: 14, label: "grey", bg: "var(--ansi-muted)", fg: onStrong },
  { value: 15, label: "ink", bg: "var(--foreground)", fg: onStrong },
];
