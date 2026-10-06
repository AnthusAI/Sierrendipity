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
  (`web/src/coach/types.ts`: `lesson`, `live`, `scene`, `onEditStarter(card, word, via?)`, `onReplaceCards(words)`,
  `controls { step, back, reset, isLocked }`). `onEditStarter` takes the FULL new 32-bit word of a card; `via` is
  `"edit"` (a spinner, the default) or `"toggle"` (a lamp), because a scene may lock one and not the other.
  `onReplaceCards` hands back the whole list (the program builder) and is locked by `drag`. `scene` also carries the
  scene's `lamps`, `bands`, `flip`, `carry` and `tray` settings.
  The default stage is `RealStage` (`web/src/coach/RealStage.tsx`, see "The real stage" below); `DefaultStage`, a plain
  accessible list of cards (number spinners are native inputs), labelled boxes and Step, Back and Reset buttons, stays only
  as a stand-in for tests. Every element a scene may spotlight carries a `data-coach-id` from the set lesson-core defines
  (`knownTarget`): `button:step|back|run|pause|reset`, `card:<n>`, `box:<register>`, `tab:<name>`, `diagram:D1`..`D14`,
  `band:<field>`, `lamp:<bit>`, `flip` and `tray` (`coach/ids.ts`). A locked control is `aria-disabled` with the
  explanation "Not yet".

## The real stage (`web/src/coach/RealStage.tsx`)

The lesson player draws the real visuals. The player owns the one live machine (lesson-core `startLive`, `pressStep`, ...);
the stage never has a second opinion.

- **One source of truth.** `RealStage` builds a timeline from `live.cards` with `useMachineTimeline` and follows `live.steps`:
  a forward step of the player replays as an animated step (the token flies from the card to the box; `?testclock` and
  `window.__diagramClock` freeze it mid-flight), Back, Reset and an edit just move the timeline (an edit starts it over).
  The stage root carries `data-live-steps`, `data-live-boxes`, `data-live-words`, `data-live-pc` (the player's numbers) next
  to `data-timeline-position`, so a spec can compare what is drawn with what the player holds.
- **Controls** (`PlayerControls`): Step, Back and Reset call `controls.step/back/reset`; with `show: [timeline]` also Run, Pause
  and a scrubber that presses the player's own Step or Back. Locked or idle controls stay in place, are `aria-disabled` and
  explain themselves. They come first in the stage, so the Tab order is the coach panel, the controls, the cards, the boxes.
- **Machine view (D1)**: `MachineView` with `renderCard`, so every card is a real `CardFace` with a number spinner
  (`Number on card <n>`; signed, -2048 to 2047 on a put card). A spinner edit calls `onEditStarter(card, cardToWord(next))`.
  Box pickers stay off in Course 1. The hidden end shows as "the end of the list".
- **Other pictures**: heartbeat D3, bit lamps D4 (`BitLamps`, on the whole word or just a put card's number), card flip D5
  (`CardFlip`), pointer walk D6, carry ripple D7, field bands D8 (`FieldBands`, each band a button) and the pixel screen D9
  are drawn when the scene's `show` lists them; the program builder (lazy loaded) and the timeline too. See
  `docs/lesson-format.md` ("What a scene shows") for the scene fields.
- **Clicking is answering.** For a `click-target` question a click on a part of the same kind as the target (`band:*`, `card:*`,
  `box:*`) is the answer; clicks on other parts are only clicks.
- **Layout.** In the page the coach panel comes first, then the stage (side by side from 768px). The diagrams wrap down to
  400px. Reduced motion: no token, instant flips and highlights. All surfaces use theme tokens; specs read the computed
  colours in the six theme and mode combinations (`features/web/stage-a11y.feature`).
- **Draft lessons** (`draft: true`) are built into `lessons/dist/drafts/`, left out of the catalog and the path, and play only
  with `?draft=1` in a dev or test build (`DRAFTS_ENABLED` in `web/src/lessons/index.ts`; a production build drops them).

## Learn and Workspace

The signed-in app has two areas, switched by path from a small segmented control in the header (links, so
back and forward work): **Learn** (`/learn`, the course) and **Workspace** (`/workspace`, the IDE). `/`
lands on Learn until the student has passed all of Course 1, then on the Workspace. The IDE mounts the first
time the Workspace opens and stays mounted (hidden) while the student is in Learn.

Learn pages: `/learn` (the path: one primary Continue button, the current lesson large, the next one dim,
later lessons in fog with titles only, passed lessons as small stars with text labels, side rooms as doors,
a "Pick what's next" chooser at a branch point, and "What you can do now"), `/learn/gallery` (things made),
`/learn/deck` (the Instruction Deck) and `/learn/<lessonId>` (the lesson player seam, `LessonRoute`).
Lesson metadata comes from `/catalog.json`, written by `scripts/build-catalog.ts` (part of `npm run
lessons:build` and of the web build). A session (first visit of the day, or after 30 idle minutes) opens
with at most one warm-up. Settings has a Learning section: "Unlock all lessons" (tutor override, off by
default) and "Reset my progress" (progress, stars and Deck; the Gallery stays). Per-user keys:
`sierrendipity:progress:<user>`, `sierrendipity:gallery:<user>`, `sierrendipity:learning:<user>`,
`sierrendipity:session:<user>`. Developer components are shown at `/lab`.

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
  "Save as card"; a dialog asks for a name. The cards are replaced by one custom card that also appears in the
  tray. **Convention: the input is box a0 and the answer comes back in box a0.** The input slot on the card is
  computed from its cards, not a constant: "uses box a0, answer in box a0", "uses boxes a0 and a1, answer in
  box a0", and scratch boxes are named ("(box t0 is scratch)"). A body may use t0 to t2 as scratch (the
  caller's t0 to t2 are not preserved) and a1 to a3 (named as "also changes"). A "Peek inside" control lists
  the cards it is made from, read-only, with the same faces. Names are normalised (NFC, invisible and control
  characters removed, whitespace collapsed), 1 to 24 characters counted as characters, unique ignoring case,
  and not the title of a built-in card ("Stop"). Save and undo/redo cover the program and its custom cards together.
- **`buildProgram(cards, customCards?)`** assembles one text program (with labels, never hand-computed
  offsets): the main cards, the hidden end marker `ebreak`, then each used custom card's body once, ending in
  `jalr zero, 0(ra)` (`ret`); a use is `jal ra, <body>`, so calls and returns are real instructions. It
  returns `{ words, source, map, endAddress, bodies, errors }`. A jump must land on a card or on the end of the
  list (`Card 3 jumps to a card that is not in your list`), and programs over 200 cards (bodies over 12) are
  "too big"; with any error `words` is empty.
- **v1 restrictions.** A custom card body may not contain jumps or branches, another custom card, or Stop
  (so `ra` never needs saving); it must put its answer in a0 and may change only a0 to a3 and t0 to t2 ("This
  card changes box t5, which would surprise the program that uses it. Use box a0 for your answer."); at most 6
  custom cards. The box pickers offer a0 to a7 and t0 to t6 only (no ra, sp, gp, tp); box names such as x10 are
  normalised to a0 when loading.
- **Numbers.** Spinners are signed where the word is (put and add a number: -2048 to 2047; the minus sign is
  shown, arrows step through zero; "Add -3 to box a0" reads as arithmetic). Shelf numbers for save and fetch
  step by 4 (0 to 2044); a save onto an address the program itself occupies is warned about; shelf 512 is the
  default. A pixel (sb at 1024 and up) is 0 to 255 and never wraps into a shelf. A jump never moves by 0 cards
  and its spinner stays inside the list. A rejected typed number shows its rule next to the box.
- **Undo, focus and keys.** History holds the last 100 changes and starts fresh when a program is loaded.
  Ctrl or Cmd+Z / Shift+Z / Y work anywhere on the page while a builder is mounted, except inside a text box
  or an open dialog. Rows keep a stable identity, so focus follows a card that is moved; after removing a card
  focus goes to its neighbour (or the tray), and after saving a custom card to the new card. Drops are
  announced with their final position.
- **Saving.** `programToJson(cards, customCards)` / `programFromJson(text)`:
  `{ "version": 1, "cards": [Card], "customCards": [{ "name": string, "cards": [Card] }] }`. Loading rebuilds
  every card through the model, so a stored word can never disagree with its parameters; bad input is refused
  with "That is not a saved program." and huge input with "That program is too big."

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
  Stuck rule details: "toggled back and forth" is 3 direction reversals of the same card (5, 6, 5, 6, 5). The
  12-minute suggestion is once per session (`sessionStorage`, so a lesson change or reload does not repeat it).
  Attempts are recorded once per scene and cards, only in the lesson's goal scene (or for a new bonus), so Back and
  Reset never inflate attempts. `/lab` is loaded with `React.lazy`, so the coach is not in the main bundle.
