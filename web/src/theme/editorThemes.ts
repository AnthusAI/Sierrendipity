// Monaco and xterm themes derived from the same token table as the page, so the editor and the
// terminal always match the active color theme and mode.
import type { ITheme } from "@xterm/xterm";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { composite, parseColor, toHex } from "./contrast";
import { MODES, THEMES, resolveTheme, type Mode, type ThemeName } from "./palette";

export const monacoThemeName = (theme: ThemeName, mode: Mode) => `sierrendipity-${theme}-${mode}`;

const bare = (hex: string) => hex.replace("#", "");

/** Define the six Monaco themes (3 color themes x light/dark). Safe to call once at startup. */
export function defineMonacoThemes() {
  for (const theme of THEMES) {
    for (const mode of MODES) {
      const c = resolveTheme(theme, mode);
      monaco.editor.defineTheme(monacoThemeName(theme, mode), {
        base: mode === "dark" ? "vs-dark" : "vs",
        inherit: true,
        rules: [
          { token: "", foreground: bare(c["editor-fg"]) },
          { token: "comment", foreground: bare(c["syntax-comment"]), fontStyle: "italic" },
          { token: "keyword", foreground: bare(c["syntax-keyword"]) },
          { token: "keyword.directive", foreground: bare(c["syntax-directive"]) },
          { token: "string", foreground: bare(c["syntax-string"]) },
          { token: "number", foreground: bare(c["syntax-number"]) },
          { token: "number.hex", foreground: bare(c["syntax-number"]) },
          { token: "number.binary", foreground: bare(c["syntax-number"]) },
          { token: "type", foreground: bare(c["syntax-type"]) },
          { token: "type.identifier", foreground: bare(c["syntax-type"]) },
          { token: "variable.predefined", foreground: bare(c["syntax-register"]) },
          { token: "predefined", foreground: bare(c["syntax-register"]) },
          { token: "identifier", foreground: bare(c["editor-fg"]) },
          { token: "delimiter", foreground: bare(c["syntax-comment"]) },
          { token: "operator", foreground: bare(c["syntax-comment"]) },
          { token: "invalid", foreground: bare(c["syntax-invalid"]) },
        ],
        colors: {
          "editor.background": c["editor-bg"],
          "editor.foreground": c["editor-fg"],
          "editorLineNumber.foreground": c["editor-line-number"],
          "editorLineNumber.activeForeground": c["editor-fg"],
          "editor.lineHighlightBackground": c["editor-line-highlight"],
          "editor.lineHighlightBorder": "#00000000",
          "editor.selectionBackground": c["editor-selection"],
          "editor.inactiveSelectionBackground": c["editor-line-highlight"],
          "editorCursor.foreground": c["editor-fg"],
          "editorGutter.background": c["editor-bg"],
          "editorIndentGuide.background1": c.border,
          "editorWidget.background": c.popover,
          "editorWidget.foreground": c["popover-foreground"],
          "editorWidget.border": c.border,
          "editorHoverWidget.background": c.popover,
          "editorHoverWidget.foreground": c["popover-foreground"],
          "editorHoverWidget.border": c.border,
          "editorSuggestWidget.background": c.popover,
          "editorSuggestWidget.border": c.border,
          "scrollbarSlider.background": c.input + "55",
          "scrollbarSlider.hoverBackground": c.input + "88",
          "scrollbarSlider.activeBackground": c.input + "aa",
          focusBorder: c.ring,
        },
      });
    }
  }
}

/** The xterm.js theme for a color theme and mode: surface colors plus an ANSI palette from Radix text steps. */
export function terminalTheme(theme: ThemeName, mode: Mode): ITheme {
  const c = resolveTheme(theme, mode);
  const selection = toHex(composite(parseColor(c["terminal-selection"]), parseColor(c["terminal-bg"])));
  return {
    background: c["terminal-bg"],
    foreground: c["terminal-fg"],
    cursor: c["terminal-fg"],
    cursorAccent: c["terminal-bg"],
    selectionBackground: selection,
    black: c["terminal-fg"],
    red: c["ansi-red"],
    green: c["ansi-green"],
    yellow: c["ansi-yellow"],
    blue: c["ansi-blue"],
    magenta: c["ansi-magenta"],
    cyan: c["ansi-cyan"],
    white: c["ansi-muted"],
    brightBlack: c["ansi-muted"],
    brightRed: c["ansi-red"],
    brightGreen: c["ansi-green"],
    brightYellow: c["ansi-yellow"],
    brightBlue: c["ansi-blue"],
    brightMagenta: c["ansi-magenta"],
    brightCyan: c["ansi-cyan"],
    brightWhite: c["terminal-fg"],
  };
}
