// The color system: three themes (cool, warm, neutral) x two modes (light, dark), every token mapped
// to a Radix Colors scale step (1-12, or the alpha scales). This table is the single source of truth:
// the stylesheet (themes.generated.css), Monaco and xterm themes, the Settings previews and the
// WCAG contrast specs are all derived from it.
import {
  amber, amberA, amberDark, amberDarkA,
  blue, blueA, blueDark, blueDarkA,
  brown, brownDark,
  cyan, cyanDark,
  gray, grayA, grayDark, grayDarkA,
  green, greenDark,
  indigo, indigoA, indigoDark, indigoDarkA,
  lime, limeDark,
  orange, orangeA, orangeDark, orangeDarkA,
  pink, pinkDark,
  plum, plumDark,
  purple, purpleDark,
  red, redA, redDark, redDarkA,
  sand, sandA, sandDark, sandDarkA,
  sky, skyDark,
  slate, slateA, slateDark, slateDarkA,
  teal, tealDark,
  violet, violetDark,
  yellow, yellowDark,
} from "@radix-ui/colors";

export const THEMES = ["cool", "warm", "neutral"] as const;
export const MODES = ["light", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];
export type Mode = (typeof MODES)[number];

type Steps = Record<string, string>;
type ScaleSet = { light: Steps; dark: Steps; lightA?: Steps; darkA?: Steps };

const SCALES: Record<string, ScaleSet> = {
  slate: { light: slate, dark: slateDark, lightA: slateA, darkA: slateDarkA },
  sand: { light: sand, dark: sandDark, lightA: sandA, darkA: sandDarkA },
  gray: { light: gray, dark: grayDark, lightA: grayA, darkA: grayDarkA },
  indigo: { light: indigo, dark: indigoDark, lightA: indigoA, darkA: indigoDarkA },
  orange: { light: orange, dark: orangeDark, lightA: orangeA, darkA: orangeDarkA },
  amber: { light: amber, dark: amberDark, lightA: amberA, darkA: amberDarkA },
  red: { light: red, dark: redDark, lightA: redA, darkA: redDarkA },
  green: { light: green, dark: greenDark },
  blue: { light: blue, dark: blueDark, lightA: blueA, darkA: blueDarkA },
  cyan: { light: cyan, dark: cyanDark },
  purple: { light: purple, dark: purpleDark },
  violet: { light: violet, dark: violetDark },
  plum: { light: plum, dark: plumDark },
  yellow: { light: yellow, dark: yellowDark },
  pink: { light: pink, dark: pinkDark },
  lime: { light: lime, dark: limeDark },
  teal: { light: teal, dark: tealDark },
  brown: { light: brown, dark: brownDark },
  sky: { light: sky, dark: skyDark },
};

interface ThemeConfig {
  label: string;
  /** The neutral scale ("n" in refs) and the accent scale ("a"). */
  neutral: string;
  accent: string;
  /** Per mode: [primary, text on primary, primary on hover]. */
  primary: Record<Mode, [string, string, string]>;
  /** Per mode: the focus ring and the accent used for link-like text. */
  ring: Record<Mode, string>;
  link: Record<Mode, string>;
}

const CONFIG: Record<ThemeName, ThemeConfig> = {
  cool: {
    label: "Cool",
    neutral: "slate",
    accent: "indigo",
    primary: { light: ["a.9", "white", "a.10"], dark: ["a.9", "white", "a.8"] },
    ring: { light: "a.9", dark: "a.10" },
    link: { light: "a.11", dark: "a.11" },
  },
  warm: {
    label: "Warm",
    neutral: "sand",
    accent: "orange",
    primary: { light: ["a.11", "white", "a.12"], dark: ["a.9", "n.1", "a.10"] },
    ring: { light: "a.11", dark: "a.9" },
    link: { light: "a.12", dark: "a.11" },
  },
  neutral: {
    label: "Neutral",
    neutral: "gray",
    accent: "gray",
    primary: { light: ["n.12", "n.1", "n.11"], dark: ["n.12", "n.1", "n.11"] },
    ring: { light: "n.11", dark: "n.11" },
    link: { light: "n.11", dark: "n.11" },
  },
};

export const THEME_LABELS: Record<ThemeName, string> = { cool: "Cool", warm: "Warm", neutral: "Neutral" };

/** The seven instruction-field colors of the Bits card, as [token, Radix scale]. */
const FIELD_SCALES = ["blue", "orange", "green", "purple", "red", "cyan", "yellow"] as const;
export const FIELD_TOKENS = FIELD_SCALES.map((_, i) => ({ bg: `field-${i + 1}` as const, fg: "field-foreground" as const }));

/**
 * The 16 pixel colors of the pixel display, as [fill, number printed on it]. Fills are solid Radix steps
 * (not the text steps the ANSI tokens use), so each looks like its label; the number is black or white,
 * whichever reads at 4.5:1. Labels live in web/src/diagrams/palette.ts.
 */
export const PIXEL_COUNT = 16;
const PIXEL_COLORS = (mode: Mode): [string, string][] => [
  ["n.4", "n.12"], // blank
  ["blue.9", "black"],
  ["orange.9", "black"],
  ["green.9", "black"],
  ["purple.9", "white"],
  ["red.9", "black"],
  ["cyan.9", "black"],
  ["yellow.9", "black"],
  ["pink.9", "black"],
  ["lime.9", "black"],
  ["teal.9", "black"],
  ["brown.9", "black"],
  ["indigo.9", "white"],
  ["gray.9", mode === "light" ? "black" : "white"], // grey
  ["black", "white"],
  ["sky.9", "black"],
];

/**
 * Token -> Radix reference. A reference is `<scale>.<step>` (`n` and `a` are the theme's neutral and
 * accent scales; a step `a5` means the alpha scale) or the literal `white` / `black`.
 */
function refsFor(config: ThemeConfig, mode: Mode) {
  const [primary, primaryText, primaryHover] = config.primary[mode];
  return {
    // shadcn/ui tokens
    background: "n.1",
    foreground: "n.12",
    card: "n.2",
    "card-foreground": "n.12",
    popover: mode === "light" ? "n.1" : "n.3",
    "popover-foreground": "n.12",
    primary,
    "primary-foreground": primaryText,
    "primary-hover": primaryHover,
    secondary: "n.3",
    "secondary-foreground": "n.12",
    muted: "n.3",
    "muted-foreground": "n.11",
    accent: "n.4",
    "accent-foreground": "n.12",
    destructive: mode === "light" ? "red.11" : "red.9",
    "destructive-foreground": mode === "light" ? "white" : "n.1",
    border: "n.6",
    input: "n.9",
    ring: config.ring[mode],
    link: config.link[mode],
    // application chrome and editor surfaces
    chrome: "n.2",
    "chrome-foreground": "n.12",
    "editor-bg": "n.1",
    "editor-fg": "n.12",
    "editor-line-number": "n.11",
    "editor-selection": "a.a4",
    "editor-line-highlight": "n.a3",
    "terminal-bg": "n.2",
    "terminal-fg": "n.12",
    "terminal-selection": "a.a5",
    // debugging marks
    "pc-highlight": "amber.a3",
    "pc-mark": "amber.9",
    "pc-mark-foreground": "black",
    bp: "red.9",
    "bp-text": "red.11",
    linked: "blue.a3",
    changed: "amber.a4",
    "changed-fg": "amber.12",
    // status and banners
    "success-bg": "green.3",
    "success-fg": mode === "light" ? "green.12" : "green.11",
    "warning-bg": "amber.3",
    "warning-fg": "amber.12",
    "danger-bg": "red.3",
    "danger-fg": mode === "light" ? "red.11" : "red.12",
    // terminal ANSI colors and editor syntax colors (text steps of Radix scales)
    "ansi-red": "red.11",
    "ansi-green": mode === "light" ? "green.12" : "green.11",
    "ansi-yellow": mode === "light" ? "amber.12" : "amber.11",
    "ansi-blue": "blue.11",
    "ansi-magenta": "purple.11",
    "ansi-cyan": "cyan.11",
    "ansi-muted": "n.11",
    "syntax-comment": "n.11",
    "syntax-keyword": mode === "light" ? "violet.12" : "violet.11",
    "syntax-string": mode === "light" ? "green.12" : "green.11",
    "syntax-number": mode === "light" ? "amber.12" : "amber.11",
    "syntax-type": mode === "light" ? "blue.12" : "blue.11",
    "syntax-register": mode === "light" ? "cyan.12" : "cyan.11",
    "syntax-directive": mode === "light" ? "plum.12" : "plum.11",
    "syntax-invalid": mode === "light" ? "red.12" : "red.11",
    // bracket pair colorization (Monaco levels 1-6) and unexpected brackets
    "bracket-1": mode === "light" ? "blue.12" : "blue.11",
    "bracket-2": mode === "light" ? "green.12" : "green.11",
    "bracket-3": mode === "light" ? "purple.12" : "purple.11",
    "bracket-4": mode === "light" ? "amber.12" : "amber.11",
    "bracket-5": mode === "light" ? "cyan.12" : "cyan.11",
    "bracket-6": mode === "light" ? "red.12" : "red.11",
    "bracket-unexpected": mode === "light" ? "red.12" : "red.11",
    // instruction fields of the Bits card
    ...Object.fromEntries(FIELD_SCALES.map((scale, i) => [`field-${i + 1}`, `${scale}.5`])),
    "field-foreground": "n.12",
    // the 16 pixel colors: pixel-N is the fill, pixel-N-fg the number printed on it
    ...Object.fromEntries(PIXEL_COLORS(mode).flatMap(([fill, fg], i) => [[`pixel-${i}`, fill], [`pixel-${i}-fg`, fg]])),
  } as Record<string, string>;
}

export type TokenName = string;

function lookup(ref: string, config: ThemeConfig, mode: Mode): { hex: string; name: string } {
  if (ref === "white") return { hex: "#ffffff", name: "white" };
  if (ref === "black") return { hex: "#000000", name: "black" };
  const [scaleRef, step] = ref.split(".");
  const scale = scaleRef === "n" ? config.neutral : scaleRef === "a" ? config.accent : scaleRef;
  const set = SCALES[scale];
  if (!set) throw new Error(`Unknown Radix scale in "${ref}"`);
  const alpha = step.startsWith("a");
  const steps = alpha ? (mode === "light" ? set.lightA : set.darkA) : mode === "light" ? set.light : set.dark;
  const key = alpha ? `${scale}A${step.slice(1)}` : `${scale}${step}`;
  const hex = steps?.[key];
  if (!hex) throw new Error(`Radix has no ${key} (${mode}) for "${ref}"`);
  return { hex: hex.toLowerCase(), name: `${scale}-${step}` };
}

/** Every token of a theme in one mode, as #rrggbb (or #rrggbbaa for alpha steps). */
export function resolveTheme(theme: ThemeName, mode: Mode): Record<TokenName, string> {
  const config = CONFIG[theme];
  return Object.fromEntries(
    Object.entries(refsFor(config, mode)).map(([token, ref]) => [token, lookup(ref, config, mode).hex]),
  ) as Record<TokenName, string>;
}

export interface ContrastPair {
  fg: TokenName;
  bg: TokenName;
  /** WCAG AA: 4.5 for text, 3 for large text and UI components. */
  min: 4.5 | 3;
  label: string;
  /** A translucent `bg` is composited over this token (default: background). */
  on?: TokenName;
}

const text = (fg: TokenName, bg: TokenName, label: string, on?: TokenName): ContrastPair => ({ fg, bg, min: 4.5, label, on });
const ui = (fg: TokenName, bg: TokenName, label: string, on?: TokenName): ContrastPair => ({ fg, bg, min: 3, label, on });

const SYNTAX = ["comment", "keyword", "string", "number", "type", "register", "directive", "invalid"].map((n) => `syntax-${n}`);
const BRACKETS = [1, 2, 3, 4, 5, 6].map((n) => `bracket-${n}`).concat("bracket-unexpected");
/** Translucent editor highlights that code is drawn over. */
const OVERLAYS = ["pc-highlight", "linked", "editor-selection"];

/** Every foreground/background pair the interface actually uses. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  text("foreground", "background", "page text"),
  text("card-foreground", "card", "card text"),
  text("popover-foreground", "popover", "dialog text"),
  text("chrome-foreground", "chrome", "header text"),
  text("muted-foreground", "background", "secondary text on the page"),
  text("muted-foreground", "card", "secondary text on cards"),
  text("muted-foreground", "chrome", "secondary text in the header"),
  text("muted-foreground", "muted", "secondary text on tab strips"),
  text("muted-foreground", "popover", "secondary text in dialogs"),
  text("secondary-foreground", "secondary", "secondary buttons"),
  text("accent-foreground", "accent", "hovered items"),
  text("primary-foreground", "primary", "primary buttons"),
  text("primary-foreground", "primary-hover", "primary buttons on hover"),
  text("destructive-foreground", "destructive", "destructive buttons"),
  text("link", "background", "links on the page"),
  text("link", "card", "links on cards"),
  text("link", "popover", "links in dialogs"),
  text("editor-fg", "editor-bg", "editor text"),
  text("editor-line-number", "editor-bg", "editor line numbers"),
  text("editor-fg", "pc-highlight", "editor text on the current instruction", "editor-bg"),
  text("editor-fg", "linked", "editor text on a linked line", "editor-bg"),
  text("editor-fg", "editor-selection", "selected editor text", "editor-bg"),
  text("terminal-fg", "terminal-bg", "terminal text"),
  text("foreground", "linked", "linked instructions"),
  text("muted-foreground", "linked", "addresses of linked instructions"),
  text("muted-foreground", "pc-highlight", "addresses of the current instruction"),
  text("link", "linked", "selected machine rows"),
  text("muted-foreground", "changed", "register names in changed rows"),
  text("foreground", "pc-highlight", "the current instruction"),
  text("changed-fg", "changed", "changed registers"),
  text("pc-mark-foreground", "pc-mark", "the PC marker"),
  text("success-fg", "success-bg", "ready status"),
  text("warning-fg", "warning-bg", "warnings and the starting status"),
  text("danger-fg", "danger-bg", "errors"),
  text("bp-text", "background", "breakpoint labels"),
  text("bp-text", "card", "breakpoint labels on cards"),
  ...(["ansi-red", "ansi-green", "ansi-yellow", "ansi-blue", "ansi-magenta", "ansi-cyan", "ansi-muted"] as const).map((fg) =>
    text(fg, "terminal-bg", `terminal ${fg.replace("ansi-", "")} text`),
  ),
  ...(["comment", "keyword", "string", "number", "type", "register", "directive", "invalid"] as const).map((name) =>
    text(`syntax-${name}` as TokenName, "editor-bg", `${name} in code`),
  ),
  ...OVERLAYS.flatMap((overlay) => [
    ...SYNTAX.map((fg) => text(fg, overlay, `${fg} on ${overlay}`, "editor-bg")),
    ...BRACKETS.map((fg) => text(fg, overlay, `${fg} on ${overlay}`, "editor-bg")),
  ]),
  ...BRACKETS.map((fg) => text(fg, "editor-bg", `${fg} on the editor`)),
  ...FIELD_TOKENS.map(({ bg, fg }) => text(fg, bg, `label on ${bg}`)),
  ...Array.from({ length: PIXEL_COUNT }, (_, i) => text(`pixel-${i}-fg`, `pixel-${i}`, `number on pixel color ${i}`)),
  ui("input", "background", "input borders on the page"),
  ui("input", "card", "input borders on cards"),
  ui("input", "popover", "input borders in dialogs"),
  ui("ring", "background", "focus ring on the page"),
  ui("ring", "chrome", "focus ring in the header"),
  ui("ring", "card", "focus ring on cards"),
  ui("ring", "popover", "focus ring in dialogs"),
  ui("ring", "accent", "focus ring on hovered or active rows"),
  ui("ring", "muted", "focus ring on tab strips"),
  ui("ring", "secondary", "focus ring on secondary surfaces"),
  ui("bp", "editor-bg", "breakpoint markers"),
  ui("primary", "background", "primary buttons against the page"),
];

// Stylesheet generation

const BANNER = "/* Generated by web/scripts/generate-theme-css.ts from src/theme/palette.ts. Do not edit by hand. */\n";

function block(selector: string, theme: ThemeName, mode: Mode): string {
  const config = CONFIG[theme];
  const lines = Object.entries(refsFor(config, mode)).map(([token, ref]) => {
    const { hex, name } = lookup(ref, config, mode);
    return `  --${token}: ${hex}; /* ${name} */`;
  });
  return `${selector} {\n  color-scheme: ${mode};\n${lines.join("\n")}\n}\n`;
}

/** The CSS custom properties of every theme and mode. `html.dark` carries the dark mode. */
export function themeStylesheet(): string {
  const parts = [BANNER];
  for (const theme of THEMES) {
    const light = theme === "cool" ? `:root, :root[data-theme="cool"]` : `:root[data-theme="${theme}"]`;
    const dark = theme === "cool" ? `:root.dark, :root[data-theme="cool"].dark` : `:root[data-theme="${theme}"].dark`;
    parts.push(`\n/* ${CONFIG[theme].label}: ${CONFIG[theme].neutral} neutrals, ${CONFIG[theme].accent} accent */\n`);
    parts.push(block(light, theme, "light"), block(dark, theme, "dark"));
  }
  return parts.join("");
}
