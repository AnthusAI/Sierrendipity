# UI design

The web app is a Vite + React single page styled with Tailwind CSS, shadcn/ui components (Radix
primitives) and Radix Colors. This page records the decisions behind it.

## Stack

- **Tailwind CSS v4** with `@tailwindcss/vite`. shadcn/ui supports v4 with Vite, v4 has no config file
  (theme tokens live in CSS: `@theme inline` in `web/src/styles.css`), and the plugin supports the
  Vite 5 we already use. v3 would have needed PostCSS and a JS config for no benefit.
- **shadcn/ui components** are copied into `web/src/components/ui/` (Button, Input, Label, Badge, Alert,
  Checkbox, Tabs, Dialog, RadioGroup, Tooltip, ScrollArea, Separator, NativeSelect), built on
  `@radix-ui/react-*`, `class-variance-authority`, `clsx` and `tailwind-merge`; icons come from
  `lucide-react`. We only copied what the app uses (no DropdownMenu: Settings is a Dialog opened from
  a gear button, so a menu would be dead code). The pane splitter stays a hand-written
  `role="separator"` because it already had keyboard and ARIA behavior the specs rely on.
- The project, language, optimization and memory "Follow" pickers are **native `<select>`s**, styled
  (`NativeSelect`). They keep the platform keyboard, touch and screen reader behavior and the
  accessible names the specs use; a Radix Select would add nothing here.
- Fonts are the system stacks (`ui-sans-serif`, `ui-monospace`): zero bytes, instant, and the
  monospace is the same in the editor, the terminal and the tables.
- `window.prompt` / `window.confirm` became dialogs (`web/src/dialogs.tsx`): a name Dialog with an
  Input, and a delete confirmation.

## Color system

`web/src/theme/palette.ts` is the single source of truth. It maps every semantic token to a Radix
Colors step (1-12, or an alpha step such as `a4`) for **three themes x two modes**:

| Theme   | Neutrals | Accent | Notes |
|---------|----------|--------|-------|
| cool    | slate    | indigo | default |
| warm    | sand     | orange | |
| neutral | gray     | gray   | restrained: primary buttons are "ink" |

Tokens are the shadcn set (`--background`, `--foreground`, `--card`, `--popover`, `--primary`,
`--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, each with a
`-foreground` where it applies) plus app tokens: `--chrome`, `--editor-bg`, `--terminal-bg`,
`--pc-highlight`, `--pc-mark`, `--bp`, `--linked`, `--changed`, the status colors, `--ansi-*`,
`--syntax-*` and `--field-1..7` (the instruction-field palette of the Bits card).

`web/src/theme/themes.generated.css` is generated from the table (`npm run theme:css -w web`) and a
spec fails when it is stale. Tailwind colors reference the variables (`bg-card`, `text-muted-foreground`,
`bg-editor`, ...), so every component themes automatically. The theme is `data-theme` on `<html>`; the
mode is the `dark` class (Tailwind's `dark:` variant is `@custom-variant dark`) plus `data-mode`, and
each block sets `color-scheme` so native controls and scrollbars match. Monaco themes
(`sierrendipity-<theme>-<mode>`) and the xterm theme (including an ANSI palette from Radix text steps)
are derived from the same table (`theme/editorThemes.ts`) and switch in place, keeping the editor and
terminal state.

### Contrast

`CONTRAST_PAIRS` lists every foreground/background pair the interface uses (text 4.5:1, UI components
and large text 3:1). `features/web/theme-contrast.feature` computes the ratios (translucent colors are
composited) for all six combinations and fails below WCAG AA. Browser specs additionally read the
computed colors of the header, the Run button, the project selector and the status badge. Bit fields
always carry text labels and accessible names; color is never the only signal.

## Mode and settings

- The default mode is **System**: `prefers-color-scheme` is followed live through `matchMedia`. There is
  deliberately no light/dark control on the main screen. A gear button in the header opens Settings
  with **Appearance**: Mode (Light, Dark, System) and Color theme (Cool, Warm, Neutral), each theme with a
  live palette preview.
- `web/src/settings.ts` defines `SettingsStore` (`get`, `set`, `subscribe`, `last`) with a localStorage
  implementation keyed `sierrendipity:settings:<userId>`; the user is the Cognito `sub`, or `local` with
  the dev bypass. Stored data is validated and migrated on load (corrupt JSON, unknown values, unknown
  versions fall back to the defaults, per value, and never throw). Shape:
  `{ appearance: { mode, theme }, version: 1 }`.
- To avoid a flash of the wrong theme, an inline script in `index.html` applies the appearance in
  `sierrendipity:settings:last` (written whenever settings load or change) before first paint, and
  resolves "system" itself.
- **Follow-up (not built):** sync settings to the server so they follow the student across devices.
  Implement `SettingsStore` against the control API and swap it in `theme/appearance.tsx`.

## Layout and motion

An 8px rhythm (controls are 32px high, rows 24px, panel padding 12-16px), subtle borders and shadows,
transitions of 150 ms. `prefers-reduced-motion` turns every animation and transition off. Focus rings
use `outline` with the `--ring` color (3:1 against the page, header, cards and dialogs). The layout works down to about
1024px: the toolbar wraps and the right pane is resizable (260-900px).

## Cards, the program builder and custom cards (`web/src/cards/`)

The self-guided tutor's cards are plain-English faces over real RISC-V words
(`docs/course-1-design.md`). Everything below is shown in the developer gallery at `/lab`
("Cards and builder"), which holds no user data; `features/web/cards-*.feature` drive it.

- **Model** (`model.ts`). `Card = { kind, word, params }` is plain JSON. The word is always rebuilt from kind
  and params by assembling text with the explorer `assemble` (never hand-encoded); `wordToCard` reads a word
  back with `decode`. Kinds: put, add-number, add-boxes, subtract-boxes, multiply, save-byte, save, fetch,
  jump-if-different, jump-if-smaller, stop, custom. Jump offsets are counted in cards (negative goes back).
- **Face** (`CardFace`). Shows `describe(word, { vocabulary: "boxes" })` with its parts coloured by the
  `--syntax-*` tokens (verb: keyword, box: register, number: number, shelf: string, label: type) on
  `bg-editor`, so the editor's contrast checks cover them. The assembly chip is hidden unless `showAssembly`.
  The number is a `role="spinbutton"` text box (typing, arrows, PageUp/Down, Home/End, limits; announced as
  "number, 5"); boxes become native selects with `editableBoxes`. Faces are focusable and named by their text.
- **Builder** (`ProgramBuilder`). Tray, list, undo/redo (Ctrl/Cmd+Z, Shift+Z or Y), remove, duplicate, move
  up/down buttons, Enter on a tray card to add. `hideEnd` (default) hides the final Stop and shows "the end
  of the list" (the built program always ends in a hidden `ebreak`, so it halts); with `hideEnd` off a missing
  Stop is flagged in plain language. `maxCards` is enforced with a friendly message.
- **Why `@dnd-kit`.** `@dnd-kit/core` + `sortable` + `utilities` give pointer, touch and keyboard drag with
  live-region announcements, and sortable lists, with no HTML5 drag-and-drop quirks (which have no keyboard
  or touch story). The tray's cards start a drag only from the pointer; the keyboard adds with Enter and the
  list's drag handles lift with Space and move with the arrows, as well as buttons. Size: see the PR (about
  17 kB gzip, 49 kB minified, for the three packages).
- **Custom cards (functions).** Select two or more neighbouring cards (Select mode, checkboxes) and
  "Save as card"; a dialog asks for a name (1 to 24 characters, unique ignoring case). The cards are replaced
  by one custom card that also appears in the tray labelled with its input slot. **Convention: the input is
  box a0 and the answer comes back in box a0** ("uses box a0, answer in box a0"). A custom card has a "Peek
  inside" control listing its cards read-only with the same faces.
- **`buildProgram(cards, customCards?)`** assembles one text program (with labels, never hand-computed
  offsets): the main cards, the hidden end marker `ebreak`, then each used custom card's body once, ending in
  `jalr zero, 0(ra)` (`ret`); a use is `jal ra, <body>`, so calls and returns are real instructions. It
  returns `{ words, source, map, endAddress, bodies, errors }`.
- **v1 restrictions.** A custom card body may not contain jumps or branches, another custom card, or Stop
  (so `ra` never needs saving); at most 6 custom cards. The builder explains each in plain language.
- **Saving.** `programToJson(cards, customCards)` / `programFromJson(text)`:
  `{ "version": 1, "cards": [Card], "customCards": [{ "name": string, "cards": [Card] }] }`. Loading rebuilds
  every card through the model, so a stored word can never disagree with its parameters.
