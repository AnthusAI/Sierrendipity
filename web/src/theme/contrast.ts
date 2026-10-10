// WCAG 2.x contrast math. Pure functions with no DOM, so Node specs can use them too.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse #rgb, #rrggbb, #rrggbbaa, rgb(...) and rgba(...) (comma or space separated). */
export function parseColor(input: string): Rgba {
  const text = input.trim().toLowerCase();
  if (text.startsWith("#")) {
    const hex = text.length === 4 ? [...text.slice(1)].map((c) => c + c).join("") : text.slice(1);
    if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) throw new Error(`Unsupported color: ${input}`);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const match = text.match(/^rgba?\(([^)]+)\)$/);
  if (!match) throw new Error(`Unsupported color: ${input}`);
  const [r, g, b, a = "1"] = match[1].split(/[\s,/]+/).filter(Boolean);
  return { r: +r, g: +g, b: +b, a: a.endsWith("%") ? parseFloat(a) / 100 : +a };
}

/** `top` painted over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number) => Math.round(t * top.a + b * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

export function toHex({ r, g, b }: Rgba): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function luminance({ r, g, b }: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * The WCAG contrast ratio of `foreground` on `background`. Translucent colors are first composited:
 * the background over `backdrop`, then the foreground over that.
 */
export function contrastRatio(foreground: string, background: string, backdrop = "#ffffff"): number {
  const solidBackground = composite(parseColor(background), composite(parseColor(backdrop), { r: 255, g: 255, b: 255, a: 1 }));
  const solidForeground = composite(parseColor(foreground), solidBackground);
  const [a, b] = [luminance(solidForeground), luminance(solidBackground)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
