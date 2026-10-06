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

## Lessons, the coach and the component lab

- **Loading lessons.** The browser consumes the precompiled lesson JSON, never YAML or Gherkin.
  `npm run lessons:build` writes `lessons/dist/*.json` (gitignored); `npm run build -w web` runs it first
  (the `prebuild` hook), and the spec harness builds the web app, so the app always has lessons.
  `web/src/lessons/` globs `lessons/dist/*.json` lazily and exposes `loadLesson(id)`, `listLessons()`,
  `useLesson(id)` and `nextLessonAfter(id)`. In `vite dev`, run `npm run lessons:build` once first.
- **Component lab.** `/lab` renders `web/src/lab/` (every file in `lab/sections/*.tsx` is one section). It
  holds no user data; `?lesson=<id>` picks the lesson of the coach section, and `?testclock` swaps the coach
  clock for a fake one (`window.__testclock.advance(ms)`) so specs can drive the idle, stuck, session and
  Show me timers.
- **Coach and lesson player** (`web/src/coach/`). `LessonEngine` (no DOM) is the scene state machine:
  scenes with `goto`, `until` evaluated by lesson-core on the live machine after every action, predictions
  (`ask`) with `onWrong` / `onWrongDefault` replies framed as "Let's watch" (never red), `lock`, `skippable`
  with a store-based "Quick version?" offer after two clean lessons, the hint ladder (three free rungs),
  Show me (the ghost replays `ghosts/<id>.json` on a copy of the machine, then "Your turn"), the four stuck
  rules (2 failed checks, 75 s idle while the tab is visible, 3 resets or undos in 2 minutes, one edit
  toggled back and forth 3 times) offering [Nudge] [Show me] [I'm fine] (silence for 2 minutes), a
  suggestion to stop after 12 minutes, and progress recording (every storage call is wrapped, so play never
  blocks on storage). `useLessonPlayer` connects it to React; `LessonPlayer` draws the stage, the coach
  panel (`aria-live="polite"`), the spotlight (a transparent frame with a huge box-shadow: it never
  intercepts the pointer or traps the keyboard; Escape asks "Skip the tour?") and the ghost pointer.
  Reduced motion makes the spotlight and the ghost pointer instant (`data-motion="reduced"`).
- **Stage slot.** The machine is drawn by a `stage` render prop receiving `StageProps`
  (`web/src/coach/types.ts`: `lesson`, `live`, `scene`, `onEditStarter(card, word)`,
  `controls { step, back, reset, isLocked }`). The default stage is a plain accessible list of cards (number
  spinners are native inputs), labelled boxes and Step, Back and Reset buttons. Every element a scene may
  spotlight carries a `data-coach-id` from the set lesson-core defines (`knownTarget`): `button:step|back|run|pause|reset`,
  `card:<n>`, `box:<register>`, `tab:<name>`, `diagram:D1`..`D14` (`coach/ids.ts`). A locked control is
  `aria-disabled` with the explanation "Not yet".

## Machine diagrams (`web/src/diagrams/`)

Live views of the real machine, shown at `/lab` (the developer component lab, `web/src/lab/`, which holds
no user data). `useMachineTimeline(words, { hideEnd, boxes, pointer, memorySize })` builds a `Machine` and a
`Timeline` and returns `{ position, length, snapshot, diff, stepForward, stepBackward, seek, play, pause,
speed, setSpeed, isAtEnd, reset, t, ... }`. With `hideEnd` the trailing `ebreak` is appended and run
automatically after the last card, so the number of steps equals the number of visible cards.
`MachineView` (D1), `HeartbeatView` (D3), `PointerWalk` (D6) and `PixelDisplay` (E10) are pure functions of
that state; `TimelineControls` is the shared playback bar (native range and select, shadcn buttons).

- One clock: `t` runs 0 to 1 per forward step (800 ms at 1x). Tokens, the hand and the heartbeat stations are
  all derived from `t` in render, so there is nothing to keep in sync and nothing to cancel. Under
  `prefers-reduced-motion` (or speed Instant) `t` is 1 at once: no token is drawn, and the box is
  highlighted and the "What just happened" log (`role="log"`, polite) says it in words.
- Tests add `?testclock` to the URL: the clock then stays at 1 and `window.__diagramClock.set(t)` freezes
  it mid-step, and diagram roots carry `data-animation-t`.
- Motion library: not added. Because `t` drives the render, a token flight needs no animation engine, and
  there are no Web Animations to run on tokens. Bundle impact of the diagrams and the lab is about +31 kB
  raw (+10 kB gzip) in the main chunk, mostly the explorer `Timeline` and the icons.
- Pixel colors are 16 dedicated tokens, `--pixel-N` (fill) and `--pixel-N-fg` (the number printed on it),
  solid Radix steps chosen so each looks like its label in every theme and mode (the text steps of the
  `--ansi-*` tokens read as near-black when used as fills). Specs check pairwise distance, hue class per
  label and 4.5:1 numbers. Bytes above 15 are drawn as striped "other" with a legend entry.
- Honest states: a faulted step is shown as "The machine stopped: <plain reason>" (log, notice in the
  views and controls) and changes no box; a trailing `ebreak` is the only hidden end marker; a program
  that never halts is cut at `maxSteps` (default 2000) with "This program keeps going"; the log keeps
  the newest 50 entries. Prose numbers cards from 1 and says "address" only for byte addresses.
- Controls use `aria-disabled` so focus stays on Step or Back when it reaches the end or start.
