# The real machine in the lessons: a curriculum and component design

Written 2026-10-07 on `feature/real-machine-plan` (a checkout of `develop` at `792a6ab`). It uses the panel and
standards of `.claude/skills/educator-review`, but it is a design: it recommends, it does not survey. It extends
`docs/course-1-design.md` and the review `docs/reviews/2026-10-07-educator-review.md`; where they differ, this
document says so.

The guardian's request, in one line: put the cloud runner and the Compilation Explorer into the lessons early
and often, refine their UI so it fits a lesson, and move by degrees from teaching diagrams to small, narrated
views of the real machine (instructions, registers, memory, stack, heap).

## 0. What I verified and what I could not

Verified by reading code and docs in this worktree (file and line references below), and by a sub-agent survey
of `explorer/`, `runner/`, `api/`, `infra/` and `web/src`.

Verified by running:

- The dev server on `localhost:5180` (it serves the main checkout, with the in-repo mock backend on port 8787;
  its `/catalog.json` matched the lesson titles in this worktree). With Playwright I opened lesson `c1/05-add`
  (seeded progress) and the Workspace. I used C, selected Explore, and looked at the Assembly, Registers and
  Memory panes at 1280 px and 800 px widths. The lesson stage is about 480 px wide. The Inspector tables need about
  420 px and show all 32 registers in hex and signed form. At 800 px the editor is squeezed to a few
  characters.
- The mock `/explain` returns one canned program whatever the source is. So in the Workspace the line labels
  ("Line 4: char name[64];") do not match the instructions. This comes from the mock, not from the product, but
  you cannot use the mock to judge linking quality.

Could not verify:

- **A live `/explain` of f(x) = x*x + 1.** I started the runner image from the local Docker cache.
  - With the sandbox on, the container exited on the first request. It probably needs the capabilities and
    seccomp setup it has on Fargate. I did not diagnose this.
  - Running it with the sandbox off was blocked by the permission system, so I stopped. I removed the container
    and the files.
  - The f(x) words in section 4 come from the table in `docs/course-1-design.md` ("Verified with the real
    `riscv64-unknown-elf-gcc` 12.2 ... and run in our emulator"), which I did not re-run.
- Fargate cold-start times: nothing in the repo measures them. `docs/architecture.md` estimates "about 5 to 15 s
  more" for the Rust layers.
- Any playtest: no notes exist.
- A screen reader or keyboard-only walk.
- Fargate prices: the numbers in section 5 are from memory.
- The previous planner's wave plan and gaps G1-G13. They live only on the Kanbus board, which I was told not to
  read. I know only the outline in my brief, so section 6 maps the old plan by topic, not by number.

## 1. Diagnosis

### 1.1 Two tracks that do not touch

| | Track A: lessons | Track B: the real system |
|---|---|---|
| Where | `lessons/c1/*`, `web/src/coach/`, `web/src/diagrams/`, `web/src/cards/`, `web/src/lamps/` | `runner/`, `api/`, `infra/`, `web/src/Ide.tsx` (856 lines), `Inspector.tsx` (473), `TerminalPane.tsx`, `FileTree.tsx`, `emulator.ts`, `program.ts`, `backend.ts` |
| Machine | the explorer `Machine`, used through lesson-core `startLive` (`lesson-core/src/steps/run.ts:209`, 64 KiB) and again, as a shadow copy, through `useMachineTimeline` (`web/src/diagrams/useMachineTimeline.ts:141`, 16 KiB, cut at 2,000 steps) | the explorer `Machine`, wrapped by a third driver, `Emulator` (`web/src/emulator.ts`). It has its own bounded undo and no `Timeline`, and memory is 64 KiB for asm or the image size for compiled code |
| Programs | hand-written hex or assembly words, at most 3 cards in early lessons | Python, C, C++ and Rust run natively. Assembly and machine code are assembled in the browser. C and Rust go through `POST /explain` |
| Cloud | never | `Backend` is created only inside `Ide.tsx:102`, so the Learn area cannot reach the cloud at all |
| Views | D1 boxes (`MachineView`), D3, D4, D5, D6, D7, D8, D9, timeline, builder | Assembly with source-line chips, Machine (binary word), Bits (`BitsCard`), Registers (32 rows), Memory (8x16 hex dump that can follow write, sp, pc or an address), terminal |

Evidence that they do not meet:

- No lesson uses `/explain`, the cloud runner, C, Rust or any Inspector panel.
- `RealStage.tsx` draws only the diagrams. The coach imports only `describe` and `cardsUsed` from the explorer
  (`engine.ts:18`).
- The lesson format already accepts the tabs `hex`, `assembly`, `shelves` and `output` (`lesson-core/src/lesson.ts:179`),
  but the stage never draws them. `grep` finds no use of `tabs` in `web/src/coach`. This promise is not built.
- `CardFace` has a `showAssembly` prop (`web/src/cards/CardFace.tsx:145`) that no lesson turns on.
- The Workspace is a separate area (`web/src/course/Shell.tsx`). `/` sends the student there only after
  Course 1 is passed.

### 1.2 What the real machine can already show

- **Instructions, decode and bit fields.** `decode` gives format, mnemonic and fields with human labels
  (`explorer/src/decode.ts`). `BitsCard` (`Inspector.tsx:429`) draws them and takes only a `Row`, so it is the
  most portable panel today. `FieldBands` and `BitLamps` (`web/src/lamps/`) draw the same fields as lamps that
  the student can switch.
- **Registers.** `RegistersTab` (`Inspector.tsx:101`) shows the PC, the step count, all 32 registers in hex and
  signed form, and "changed". It needs an `Emulator` instance.
- **Memory.** `MemoryTab` (`Inspector.tsx:162`) shows an 8 x 16 hex dump with ASCII. It follows the last write,
  sp, pc or a typed address, and highlights the last store.
- **Program counter and control flow.** The pc highlight in the Assembly tab, breakpoints, `PointerWalk` (D6)
  and `HeartbeatView` (D3).
- **Source and assembly linking.** `/explain` returns `instructions[].src` and a `lineMap` from the linked ELF's
  DWARF (`runner/src/elf.ts`; `docs/explorer-endpoint.md`).
  - Hover and selection are linked both ways, with Monaco decorations (`riscvMonaco.ts`).
  - Runtime rows are hidden behind "Show runtime".
  - C and Rust are supported. C++ is rejected by `/explain` (`runner/src/explain.ts:67`), although
    `docs/m9-plan.md` says "C and C++".
- **Output.** Write ecalls go to the IDE terminal. `Timeline.outputText(fd, position)` is exact while scrubbing.
- **The cloud machine.** Native runs stream over SSE with stdin (`POST /runs`, `docs/architecture.md`). The task is
  0.5 vCPU, 1 GB, ARM64 Fargate Spot (`infra/lib/stack.ts:162-176`). It exits after 20 idle minutes.
- **Process recording.** `Timeline` (`explorer/src/timeline.ts`) has `seek`, `snapshotAt`,
  `readMem(addr, len, position)`, `diff(a, b)` and an output log. It checkpoints every 256 steps. This is the
  SICP "process" as a data structure, and the IDE does not use it.

### 1.3 What is missing (each item matters for a lesson in section 4)

1. **No stack view and no heap view.** The closest is the memory dump following sp.
2. **The emulator knows nothing about the heap.** `malloc` is a bump allocator inside the cross-compiled runtime
   (`runner/riscv/libruntime.c`; Rust `sier` too). `/explain` returns `stackTop` and `memorySize` but not
   `__heap_start`, `__heap_end` or any other symbol.
3. **No variable names for stack slots.** `/explain` parses only the line table, not `.debug_info`.
4. **Three machine drivers with three memory sizes.** They are the lesson live machine, the stage's shadow
   timeline and the IDE `Emulator`. The stage keeps the two lesson machines in step with `useFollow`
   (`RealStage.tsx:21`). That works, but every new panel would need a fourth copy.
5. **The Inspector panels are IDE-shaped.**
   - They are fixed-width tables that need an `Emulator` or the IDE's `InspectorState`.
   - They have no coach ids. `coachId` in `web/src/coach/ids.ts` knows only `button`, `card`, `box`, `tab` and
     `diagram`.
   - They have no "show only a0, a1" filter and no narration.
6. **No source editor or source panel in the lesson stage, and no way to call the cloud from Learn.**
7. **The assembler has no data directives.** It lacks `.data`, `.string` and `la` (`explorer/src/asm.ts:39`).
   This does not matter until printing strings from assembly.
8. **The cloud runs ARM64, not RISC-V.** A native run is real but invisible: there is no ptrace, no gdb and no
   register snapshot. Everything visible about compiled code is the real compiler's RV32 output, run in our
   verified RV32 emulator. This is not a flaw, but it must be said honestly in the lessons. Section 5 turns it
   into a lesson.
9. **The emulator lacks the C (compressed) extension, CSRs, interrupts and timers.** The ESP32-C3 is
   RV32IMC with Zicsr, so these matter only for the board.

### 1.4 The key architectural fact

The "real machine" for teaching is not the Fargate box. It is this chain:

**the real compiler (cloud) -> the real RV32 bytes and DWARF -> the verified RV32 emulator (browser) -> the panels.**

- The emulator is checked against riscv-tests and GNU `as`/objdump (`docs/explorer.md`, "Specs").
- Every register, frame and heap block the student sees can therefore be both real and steppable.
- The cloud's job in lessons is twofold:
  - turn source into those bytes (`/explain`);
  - show that a real computer runs the same program at full speed (`/runs`).

## 2. The principle and the arc: from diagram to real component

### 2.1 The stages

| Stage | Lessons | What the student looks at | What changes from the stage before |
|---|---|---|---|
| S1 Cards over real words | c1/01-09 | card faces, boxes, the log | From c1/02 each card carries a faint **glass strip**: its real assembly and hex word, live as the number changes. Not taught, never asked about; it is simply there (Kay and Victor: make it visible). Boxes are drawn by the real Registers panel in a "box skin" (no visible change). |
| S2 Cards beside real artifacts | c1/10-15 | the same cards next to real compiler output, real bytes in memory, the Instruction panel with bit fields | The real component appears as a **twin**, linked to the familiar picture: the same highlight, the same step. The cards are still the main view. |
| S3 Real panels, narrated single steps | c1/16-22 | the Registers panel (with pc and ra), Memory, Screen, Timeline | The card face becomes a caption under each instruction row. Each step is narrated in one sentence from `Timeline.diff`. |
| S4 Typed real code | c2/01-03 | a small editor, the Instruction panel, Registers in register words, Output | The student writes the program, and the cards are generated from her text. |
| S5 Compiled code, frames and heap | c3/01-02, c4/01-05 | the Source, Asm, Stack and Heap panels, the cloud terminal | Code from a tiny C source; frames and heap blocks are derived from the real run. |
| S6 Her program on her own board (later) | after c4 | an ESP32-C3 on the desk | Real hardware: the same function lights an LED. |

### 2.2 The single graduation rule: twin, then real

An idea may be shown by a diagram until the student has answered one question about it correctly with that
diagram. The next lesson that uses the idea shows the real component **linked** to the diagram (one timeline,
one highlight) and asks one question that can be answered **only by reading the real component**. After that
question is passed, the diagram for that idea is off by default in every later lesson. A hint may still open it
as "Show the picture".

Why this rule:

- It is a fading scaffold (Vygotsky) that the student earns rather than receives on a schedule.
- It forces the real view to be **engaged**, not watched (Sorva).
- It respects split attention (Mayer): the twin is linked, not just placed beside the diagram.

Optional enforcement, cheap: a lesson declares `retires: [D5]`, and `npm run lesson -- check --all` warns when a
later lesson on the path shows D5 outside a hint.

### 2.3 What we take from SICP and Papert, and what we do not

- **Code versus process (SICP 1.1-1.2).**
  - The card list is the code; the `Timeline` is the process it generates.
  - From c1/09 the stage prints both counts ("4 cards, 13 steps"). In c1/21 the student must predict the step
    count of a loop before she runs it.
  - This is the most important SICP idea for us, and we already have the data structure for it.
- **Register machines (SICP 5.1).**
  - Course 1 *is* a register machine: boxes are registers, cards are controller instructions, and the arrow is
    the pc.
  - We teach it from below, because the project is machine-first. SICP builds it from above, after Scheme.
  - We do not copy SICP's order (`docs/curriculum-design.md` already records that machine-first was our choice).
- **Procedural abstraction (SICP 1.1.8).**
  - The custom card f is a black box with a "Peek inside".
  - In c1/10 the student learns that the compiler writes the same two cards she wrote.
- **Environments and state (SICP 3.2).**
  - A stack frame is the environment of one call: it holds the binding x = 7 for this call of f.
  - c3/01 and c4/03 teach frames as "the place where this call keeps its x", not as "the stack segment".
- **Compilation (SICP 5.5).** f(x) = x*x + 1 at every level (card, asm, bytes, C), compiled live, is the course's
  spine.
- **Interpreters (SICP 4).** The "make the rules explicit by building one" moment comes *after* this plan:
  - the student writes, in C, a small interpreter for her own Course 1 cards;
  - it is compiled to RV32 and runs in the RV32 emulator.
  - It needs C loops, arrays and `switch`, so it belongs in Course 5. I list it as the next capstone and do not
    squeeze it in.
- **Papert.** Every lesson from c1/08 on makes or changes something the student owns: her card f, her table,
  her graph, her program. Each artifact goes to the Gallery and opens in the real panels to be inspected and
  revised ("Open in the Workspace").
  - What we do not take: Papert's open exploration without a goal. There is no tutor here, so every lesson keeps
    one goal, but it opens edits after the goal is met (review recommendation 7).

## 3. Component plan: one machine, many panels

### 3.1 One timeline model

**Recommendation: make the explorer `Timeline` the only machine driver everywhere, wrapped in one pure
`Session`.**

`explorer/src/session.ts` (new, pure TypeScript, no DOM):

```ts
export interface ProgramImage {             // what every source produces
  image: Uint8Array; loadAddress: number; entry: number; stackTop: number; memorySize: number;
  rows: Row[];                              // index, addr, word, origin, function, src?  (program.ts Row moves here)
  lineMap: Record<string, number[]>;
  symbols: Record<string, number>;          // labels for asm; __heap_start, __heap_end, malloc ... from /explain
}
export function fromWords(words: number[], opts?): ProgramImage;   // cards, hex, assembly (wraps assemble)
export function fromExplain(r: ExplainResponse): ProgramImage;     // moves from web/src/program.ts
export class Session {
  constructor(program: ProgramImage, opts?: { maxSteps?: number; hideEnd?: boolean });
  readonly timeline: Timeline;
  frames(position?: number): Frame[];       // shadow call stack, see 3.2
  heap(position?: number): HeapBlock[];     // see 3.2
  rowAt(pc: number): Row | undefined;
  narrate(a: number, b: number, vocabulary: "boxes" | "registers"): string[]; // from Timeline.diff; moves from diagrams/narrate.ts
}
```

Then:

- **lesson-core `startLive`** owns a `Session`. `pressStep` and `pressBack` become `stepForward` and
  `stepBackward`, and the hidden end marker logic stays where it is. `RealStage` reads that same session, so
  `useFollow` and the shadow `useMachineTimeline` copy go away. This keeps "the player owns the one live
  machine" (`docs/ui-design.md`) and makes it literally true.
- **The IDE** uses the same `Session`. It gains scrubbing and unbounded step-back for free. "Continue" becomes
  `timeline.play({ steps })` in slices.
- **One default memory size per kind of program:**
  - 64 KiB for cards and assembly. The stage timeline uses 16 KiB today, so the change needs a spec showing
    that no lesson behaves differently. I did not check this.
  - the image's `memorySize` for compiled code.
- **Risk.** Recording costs memory: about 25 MB for 500,000 steps (`docs/explorer.md`). Long interactive IDE
  runs then need a cap with an honest message ("Step back works for the last N steps of this run"). Do the
  lesson side first and the IDE side last (wave W8).

### 3.2 Derived views (pure, specified in Gherkin)

- **Call stack (frames).** A shadow stack built from the recorded steps.
  - It pushes on `jal`/`jalr` with rd = ra and pops on `jalr zero, 0(ra)`.
  - Each frame records the function (from `rows[].function` or the label) and sp at entry.
  - The frame's memory is `[sp_now, sp_at_entry)`.
  - This works for hand-written assembly and for compiled code at -O0 and -Og alike. It does not need a frame
    pointer or DWARF CFI.
  - Checkpoint it with the timeline's 256-step checkpoints, so `seek` stays cheap.
- **Heap blocks.** Watch the calls to the `malloc` symbol: the size comes from a0 at entry and the address from
  a0 at return.
  - The heap region comes from `__heap_start` and `__heap_end`.
  - The panel says honestly that "free does nothing here" (bump allocator).
  - Needs `/explain` to return `symbols`. That is a small change in `runner/src/explain.ts` and `elf.ts`, which
    already read `__stack_top` from the symbol table.
- **Slot names.** Not built (YAGNI).
  - c4/03 asks the student to find which slot holds x by watching the store. That is a better question than a
    label.
  - Parse `.debug_info` locations only if a later lesson cannot work without them.

### 3.3 The panels

All panels live in `web/src/machine/` (new). Each takes a `SessionHandle` (a React hook over `Session`: position,
step, back, seek, play, focus) and a small config.

Every panel:

- has a narrow "lesson" density that works at 320 px and an "ide" density that is today's look;
- gives a `data-coach-id` to every part a scene may point at;
- has a polite live region fed by `Session.narrate`;
- uses the existing theme tokens (`--pc-highlight`, `--changed`, `--linked`, `--field-1..7`, `--pixel-N`);
- under `prefers-reduced-motion`, shows highlights and words and never moves anything;
- is keyboard operable, with roving tabindex inside lists and tables;
- carries a text label for every colour.

| Panel | Exists today | Gaps | Refinement | New coach ids |
|---|---|---|---|---|
| **Instruction** (one instruction: card text, assembly, hex, bytes, fields, lamps) | `BitsCard` (`Inspector.tsx:429`), `FieldBands`, `BitLamps`, `CardFlip`, `CardFace` | four components for one thing; D5 and D8 duplicate `BitsCard` | One `InstructionPanel` with `lenses: [card, asm, hex, bytes, fields, lamps]`. A lens shows or hides; `lamps` can be switchable (D4/D8 behaviour kept). D5 and D8 become configs of this panel. | `field:<name>` (alias of today's `band:`), `lamp:<n>`, `lens:<name>` |
| **Glass strip** (on each card) | `showAssembly` on `CardFace` | unused; shows no hex | one muted line: `addi a0, zero, 9 · 0x00900513`; `aria-hidden` until a lesson names it, then real text | `glass:<card>` |
| **Registers** | `RegistersTab` (`Inspector.tsx:101`) | all 32 or nothing; needs `Emulator`; no box skin | `only: [a0, a1, pc]`, `names: boxes | registers`, `number: signed | hex | both`, `skin: boxes | table`. The D1 box row becomes `skin: boxes` of this panel. | `reg:<name>` (and today's `box:<name>` as an alias), `reg:pc` |
| **Memory** (shelves and hex dump) | `MemoryTab` (`Inspector.tsx:162`) | 16 bytes a row does not fit; no labels; no regions | `width: 4` (one word, one card, one shelf a row) or 8 or 16; `from`, `rows`; `label: shelves | addresses`; `follow`; region tags (code, data, heap, stack) from symbols; bytes of the current instruction linked to the Instruction panel | `mem:<addr>`, `region:<name>` |
| **Program and control flow** | the Assembly tab (pc highlight, breakpoints), `PointerWalk`, `HeartbeatView` | needs `InspectorState`; no lesson density | `ProgramPanel` lists rows with an optional caption (the card text) under each; pc arrow; `function` filter (`show: [f]`); breakpoints only when `ui.controls` has `breakpoint` | `row:<index>`, `fn:<name>` |
| **Source** | Monaco in `Ide.tsx` with `riscvMonaco.decorate` | not in lessons; heavy | read-only mode is plain `<pre>` with line buttons (no Monaco); edit mode lazy-loads Monaco (c2, c4); linked highlight both ways through `lineMap` | `line:<path>:<n>`, `button:compile` |
| **Stack** | none | not built | frames top-down: function name, "called from row N", the slots as words with offsets from sp; the current frame first; a frame appears and disappears with call and return | `frame:<depth>`, `slot:<depth>:<offset>` |
| **Heap** | none | not built | one bar for the heap region; blocks in order with size and address; the free space left | `heap:<n>`, `region:heap` |
| **Output** (emulator) | IDE terminal only | no lesson output | a plain `role="log"` text box from `outputText(1, position)`, exact under scrubbing | `output` |
| **Cloud terminal** | `TerminalPane` (xterm) and SSE `backend.ts` | in the IDE only; the backend is created in `Ide.tsx` | lift `Backend` to a `CloudProvider` in `Shell.tsx`; a compact terminal with a status line ("The cloud computer is starting: 12 s"); stdin only when the lesson asks | `button:cloud-run`, `terminal` |
| **Screen** | `PixelDisplay` (D9) | already a real view over memory | keep; rename "Screen" panel; link a pixel to its memory row | `pixel:<row>:<col>` |
| **Timeline** | `TimelineControls`, `PlayerControls` | fine | add "N cards, M steps" (code versus process) | unchanged |

**Risks:**

- Extracting from `Inspector.tsx` while the IDE uses it. Mitigation: extract one panel at a time behind an adapter,
  and keep `features/web/explore*.feature` green at each step.
- Narrow tables. The lesson density must not be the IDE table squeezed. Design it at 320 px first.
- Too many lenses at once. That is the lesson 06 cliff again, so the loader must reject more than one *new* lens
  per lesson (see 3.4).

### 3.4 How a lesson configures panels (an extension of the `ui` block)

```yaml
program:                         # replaces `starter` for compiled lessons; `starter` stays for cards and asm
  c:
    files: [main.c]              # lesson files under source/
    opt: Og
    show: { functions: [f] }     # rows of other functions stay hidden (runtime is always hidden)
  recorded: compiled/main.json   # the /explain answer, recorded and checked (section 5)
ui:
  panels:
    registers: { only: [a0, pc], names: boxes, number: signed, skin: table }
    memory:    { width: 4, from: 0, rows: 4, label: shelves }
    instruction: { lenses: [card, asm, hex] }
    source:    { file: main.c, edit: false }
    stack:     {}
    output:    {}
    cloud:     { run: native }   # the lesson may use the cloud terminal
  needs: cloud                   # the path pre-warms the cloud before this lesson (section 5)
scenes:
  - id: compile
    show: [cards, source, program]       # panel ids join D1..D14, timeline, builder
    spotlight: "button:compile"
```

Loader rules (in `lesson-core/src/lesson.ts`):

- A panel in a scene's `show` must be configured in `ui.panels`.
- `spotlight` and ghost targets must be ids from 3.3.
- At most one panel or lens is new compared with the lesson before on the path (one new control per lesson).
- A lesson with `program.c` must have a `recorded` file whose hash matches.
- `tabs` is deprecated in favour of `ui.panels`, and the unbuilt `hex`, `assembly`, `shelves` and `output` tabs
  map to panels. That ends today's unkept promise.

New step phrases (one table, `lesson-core/src/steps/table.ts`):

- `register pc holds 8`
- `the card "f" gives 50 for 7` and `the function f gives 50 for 7` (function checks: run the body from a fresh
  machine with a0 = input, at most 1,000 steps)
- `the stack is N frames deep` and `the stack was at least N frames deep`
- `the heap holds N blocks`
- `the student compiled the program`
- `the program ran on the cloud computer`
- `the output is "..."` (exists)

The scene sees all of these through `liveRun`, as today.

### 3.5 Files to change

| Area | Files |
|---|---|
| Pure core | `explorer/src/session.ts` (new), `explorer/src/index.ts`; move `Row`, `fromExplain` and `groupRows` out of `web/src/program.ts`; move the pure parts of `web/src/diagrams/narrate.ts` |
| Lesson core | `lesson-core/src/steps/run.ts` (Live over `Session`), `lesson-core/src/lesson.ts` (`program`, `ui.panels`, `needs`, ids, `tabs` deprecation), `lesson-core/src/steps/table.ts` (phrases), `lesson-core/src/node/cli.ts` (`lesson compile` records `/explain`), `lesson-core/src/check.ts` (function checks, recorded hash) |
| Web | `web/src/machine/*` (new panels and `useSession`), `web/src/coach/RealStage.tsx` (render panels; remove `useFollow`), `web/src/coach/ids.ts` (ids), `web/src/coach/types.ts` (`StageProps.session`), `web/src/Inspector.tsx` and `Ide.tsx` (use the panels), `web/src/course/Shell.tsx` (`CloudProvider`), `web/src/backend.ts` (status events for the lesson status line), `web/src/course/PathPage.tsx` (pre-warm) |
| Runner | `runner/src/explain.ts`, `runner/src/elf.ts` (`symbols` in the response) |
| Specs | `features/explorer/session.feature`, `features/lessons/panels.feature`, `features/web/machine-panels.feature`, `features/runner/explain-symbols.feature`, `features/lessons/differential-cloud.feature` (`@linux-only`) |

## 4. Lessons

### 4.1 Changes to the published lessons (01-05)

The owner asked for "much, much simpler" first lessons, and the review agrees on one action per lesson. So:

- **c1/01** stays as it is. It has no real component; its simplicity is the point.
- **c1/02** shows the glass strip for the first time. One short sentence names it after the goal ("Under the card is the machine's own
  text for it."; the scene sets `glassNamed`, so a screen reader hears it only from then on). One optional
  last scene asks her to predict, not to be told: "Which part of that text changes when you change the number?"
  (scene `spot-it`; no star yet).
- **c1/04** draws its boxes with the Registers panel in box skin. Nothing changes on screen; this is the first
  real component, invisible.
- **c1/05** adds one `doneSay` sentence: "Box a2 now holds 12, so a2 = a0 + a1. The machine's own text for this card is add a2, a0, a1." The log is
  narrated from `Timeline.diff`.
- The review's quick fixes stand: guess shown beside the result, honest end card, STE in the UI chrome.

### 4.2 The next 27 lessons

Notes for the table:

- "Real" lists the real components on the stage; **bold** marks a component that is new in that lesson.
- Every lesson has one new idea, one action, at most 4 minutes (the two capstones say why they may be longer),
  and at most one new control.
- The existing drafts 06-08 are now c1/14-16 (counting-with-lamps, flip-the-card, inside-the-number); c1/06 is Multiply (published, see below). They are drafts, so renumbering costs no progress data.
- Each prediction needs one inference, and the answer is never printed on the screen (review recommendation 2).

| Id | Title | New idea | The one action | Real components | Diagram retired or kept | Engine work |
|---|---|---|---|---|---|---|
| c1/06-in-order | In Order | a program is a sequence; order changes the result | drag three cards into an order so a2 holds 12 (a Parsons problem) | glass strip, Registers (box skin) | D1 kept; builder (exists) | builder in a lesson (exists in `x1/03`) |
| c1/07-multiply | Multiply | a card can multiply; a box may be used twice | predict a0 after "multiply a0 by a0" with 7 (49), then run | same | D1 kept | none |
| c1/08-make-your-own-card | Make Your Own Card | two cards can become one named card: a function | select two cards and save them as **f** (x squared plus 1); put 7 in, receive 50 | custom card with "Peek inside"; **Gallery** save | D1 kept | custom cards in lessons; function check `the card "f" gives 50 for 7`; Gallery save from the coach |
| c1/09-use-it-again | Use It Again | the same function works for any input | predict f(3) (10), then run; the stage fills a table x, f(x) | Timeline counts "N cards, M steps" | D1 kept | table widget (S); step count line |
| c1/10-the-cloud-writes-cards | A Computer Writes Cards | a compiler is a program that writes cards from code | choose whether the compiler's cards for `return x * x + 1;` will match her f; select **Compile** | **Source** (read-only, one line visible), **Program** rows with card captions, compile status; **first time the cloud is used; first time she reads real assembly** (`mul a0, a0, a0`, `addi a0, a0, 1`, `jalr zero, 0(ra)`) | D1 kept beside; no diagram retired | compile harness: `program.c`, `recorded`, live `/explain` through `CloudProvider`; word-by-word "same" marks |
| c1/11-run-it-on-the-cloud | The Cloud Computer | a real computer runs the same function many times, fast | predict what it prints for f(4) (17), then select **Run on the cloud computer** | **Cloud terminal**; **first program run on the real cloud VM** | none | `needs: cloud` pre-warm; fallback run in the emulator with an honest label |
| c1/12-counting-with-lamps | Counting with Lamps (was 06) | lamps are switches worth 1, 2, 4 ... | make 5, then 12, with the total hidden for the read question | Instruction panel, lamps lens of the number only | D4 kept (it is now a lens) | lamps lens; hide total |
| c1/13-flip-the-card | Flip the Card (was 07) | a card is one 32-bit number | twin: D5 flip linked to the Instruction panel; click the card whose lamps are shown (no total shown) | **Instruction panel** (card, lamps, hex lenses) | **D5 retired** after this lesson | D5 as a panel config; `retires` |
| c1/14-inside-the-number | Inside the Number (was 08) | the lamps form fields with jobs; one lamp turns add into subtract | choose what the card will say after lamp 30 switches on, then switch it | Instruction panel, **fields lens** (named `rd`, `rs1`, `rs2`, `funct7`; "exact job" names fixed per the review) | **D8 retired** (it is the fields lens) | fields lens with switchable lamps |
| c1/15-your-card-in-memory | Your Card in Memory | cards live on numbered shelves as bytes; each card takes 4 | predict the address where the second card of f starts, then select that shelf | **Memory panel** (width 4, shelves) linked to the Program rows; **first time she sees the machine-code bytes of her own function** | no D2 is ever built (the real panel replaces it) | Memory lesson density; `mem:` ids |
| c1/16-the-arrow-has-a-number | The Arrow Is a Number | the program counter is a register that holds an address | twin: the D6 arrow linked to `pc` in Registers; predict pc after one Step (4) | Registers with **pc** | **D6 and D3 retired** | `reg:pc`; `register pc holds N` |
| c1/17-a-call-is-a-bookmark | A Call Is a Bookmark | calling f saves where to come back in `ra` | predict the value in ra while f runs (the address after the call) | Registers (a0, pc, **ra**), Program rows with the caller and f | none (D13 is never built) | none new |
| c1/18-light-a-pixel | Light a Pixel | some shelves are a screen | change the colour number so pixel 0 becomes colour 4 | Memory linked to **Screen** (D9 as a panel) | D9 kept as the Screen panel | pixel-to-row link |
| c1/19-save-and-fetch | Save and Fetch | a value can wait on a shelf and come back | predict what a1 holds after `lw` from shelf 512 | Memory, Registers | none | none |
| c1/20-a-fork-in-the-road | A Fork in the Road | a branch picks the next card (absolute value, a piecewise rule) | predict which card runs after the branch for x = -3 | Program rows with a taken or not-taken arrow, pc | D10 is never built | branch arrow in the Program panel |
| c1/21-round-and-round | Round and Round | a loop: few cards, many steps (code versus process) | predict the number of steps before running a 4-card loop that fills a table of f | **Timeline** scrubber, Memory | none | none (timeline exists) |
| c1/22-graph-machine | The Graph Machine (capstone 1) | a loop draws a function on the screen | choose her own rule as a card and plot it for x = 0 to 15 | Screen, Memory, Timeline; **saved to the Gallery with all its levels** | none | Gallery item with cards, words and screen; may take 6 minutes, because a capstone is a project, not a step |
| c2/01-type-a-card | Type a Card | an instruction is text you can type | type `addi a0, zero, 5` and run it; the card appears from the text | **Editor** (one line, lazy Monaco or a plain textbox), assembler errors in STE; **first time she types real code** | D1 retired in Course 2: Registers switch to register words | editor stage; STE error text for the assembler |
| c2/02-write-f | Write f | a function in assembly has a label, a body and `ret` | type the two body lines of `f:` so `f(7)` gives 50 | Editor, Program, Registers | none | function check `the function f gives 50 for 7` |
| c2/03-say-a-number | Say a Number | the machine can ask the system to print (ecall) | change one line so it prints the digit of f(2) | **Output panel** | none | Output panel in a lesson |
| c3/01-f-of-g | f of g | a function that calls a function must save its bookmark on the stack (f(g(x))) | predict what happens when `ra` is not saved (a fault exhibit), then add the two save lines | **Stack panel**; **first time she sees a stack frame** | D12 is never built | frames from `Session.frames`; `the stack is N frames deep` |
| c3/02-deeper | Deeper | each call has its own frame; recursion (sum to n) | predict the deepest stack for n = 4, then scrub the timeline to check | Stack, Timeline | none | none new |
| c4/01-f-in-c | f in C | C is a shorter way to write the same cards | type the body of `int f(int x)` and compile; compare the words with her c2/02 words | Source (edit), Program, Instruction; **first time she types C** | none | Source edit mode; live `/explain` with a recorded answer for the starter |
| c4/02-same-c-different-effort | Same C, Different Effort | the compiler can work more or less hard (-O0 and -Og) | predict which listing is longer, then switch the optimization | Program for two levels side by side | none | optimization toggle in a lesson |
| c4/03-where-x-lives | Where x Lives | at -O0 the call keeps x in a slot of its frame | after a step, select the slot that holds x | Stack with slots, Memory, Source line link | none | slot coach ids |
| c4/04-ask-for-shelves | Ask for Shelves | `malloc` gives a block of memory that stays after the call (the heap) | predict the address of the second block (first plus 16), then run | **Heap panel**, Memory regions; **first time she sees the heap** | none | `symbols` in `/explain`; `Session.heap`; `the heap holds N blocks` |
| c4/05-my-function-everywhere | My Function Everywhere (capstone 2) | one idea at every level | choose her own function and make one page with it as a card, assembly, C, its bytes, and a table run on the cloud computer | all panels; the cloud terminal | none | Gallery "Rosetta page"; may take 8 minutes |

Firsts, in one place:

| First time | Lesson |
|---|---|
| She reads real assembly | c1/10 |
| The cloud is used | c1/10 |
| A program runs on the real cloud VM | c1/11 |
| She sees the machine-code bytes of her own function | c1/15 |
| She types real code | c2/01 (assembly) and c4/01 (C) |
| She sees a stack frame | c3/01 |
| She sees the heap | c4/04 |
| She makes a project of her own | c1/08 (her card), c1/22 (her graph) and c4/05 (her function everywhere) |

Sample lesson text (STE, at most 2 sentences and 30 words in a scene):

- c1/10: "A compiler is a program that writes cards from code. Will its cards for f match your cards?"
- c1/11: "The cloud computer runs f for x from 0 to 5. What will it print for f(4)?"
- c1/15: "Your card f lives on the shelves as numbers. At which address does its second card start?"
- c1/16: "The arrow is a number in the machine, the program counter. What will pc hold after one Step?"

## 5. The emulator and the real VM

### 5.1 Which one, when

| Use | Emulator (browser) | Cloud `/explain` | Cloud native run |
|---|---|---|---|
| Step, step back, registers, memory, stack, heap | always | no | no (ARM64, no tracing) |
| Cards, assembly, machine code | always | no | no |
| Turning C or Rust into RV32 bytes and line maps | runs the result | only when the source is new; a recorded answer otherwise | no |
| Pass and bonus checks (`checks.feature`) | always: checks run on the emulator run of the same image | never gates a check | never gates a check |
| "A real computer runs it fast" | no | no | c1/11, c4/05 and the Workspace |

An honest framing for the student, said once in c1/11:

- "The cloud computer uses a different kind of processor, so its cards are different."
- "We look inside the RISC-V machine because every step there can be seen."

This is also the first lesson on why compilers exist: one source, two machines. Showing the ARM64 listing is a
possible later side room (`objdump` on the runner); it is not needed now.

### 5.2 The trust and consistency question: a differential spec

`features/lessons/differential-cloud.feature`, tagged `@linux-only` and run with `npm run test:linux` in the
runner image. For every C program in `lessons/**/source/` and in a small `lessons/corpus/`:

```gherkin
@linux-only
Feature: The RISC-V machine and the cloud computer agree

  Scenario: Every lesson program gives the same output on every machine
    Given every C program in the lesson corpus
    When each is compiled by /explain at -O0 and at -Og and run in the explorer Machine
    And each is compiled by the native gcc and run on the runner
    And each /explain ELF is run in qemu-riscv32
    Then the output and exit code are the same for all five runs

  Scenario: Recorded lesson answers are fresh
    Given every recorded /explain answer in the lessons
    When each source is compiled again by /explain
    Then each answer matches byte for byte
```

The steps go through the corpus themselves, because our Gherkin subset does not allow Scenario Outline
(see `docs/lesson-format.md`).

Known, documented differences, which the corpus must avoid or test on purpose:

- `long` is 32 bits on RV32 and 64 bits on ARM64. This is a good later lesson, not a bug.
- `printf("%f")` is not supported by `libruntime`.
- `sizeof(void *)` differs.
- `HashMap` is missing in `sier`.

The differential uses qemu, which is already installed in the Dockerfile's `test` stage, and the re-link at
0x10000 that `docs/explorer-endpoint.md` already describes.

### 5.3 Cold start and latency: a lesson never stalls

1. **Recorded answers.** `npm run lesson -- compile <id>`, run in the runner image, writes
   `lessons/<id>/compiled/*.json`:
   - the `/explain` response;
   - a hash of the source, the flags and the toolchain version.

   `lesson check` fails when the hash is stale. A lesson whose source is set by the author plays from this file
   at once.
2. **Live compile.**
   - When the student's source equals the starter, the lesson still sends the live request if the cloud is ready
     (it is the real thing), but it shows the recorded answer first.
   - When the two agree (they must; see 5.2), nothing visible happens except the status line "Compiled by the
     cloud computer".
   - When the student changed the source (c4), only the live answer counts. The browser caches answers by the
     hash of the source, so the same source never costs a second request.
3. **Pre-warm.** `PathPage` calls `warm()` when the current or next lesson has `needs: cloud`, and the lesson
   calls it on open. The runner then has the time of one or two short lessons to start. It exits after 20 idle
   minutes anyway.
4. **The status line.** "The cloud computer is starting (12 s)." It is one line, polite, and has no spinner
   under reduced motion.
5. **The fallback for runs.**
   - After 20 s with no ready runner, the coach offers [Run it here] on the emulator, using the recorded image.
   - The output shows the label "Ran on the RISC-V machine in your browser".
   - The pass check is the same either way.
6. **Offline or failure.** Lessons are static files. A cloud lesson with no network plays from the recorded
   answer and the emulator, and says: "The cloud computer is not available now. This lesson uses the machine in
   your browser." Only c4/01 to c4/05 need live compiles for student edits. They keep the starter playable,
   save the student's source, and say: "Your code is saved. Compile it when the cloud computer is back."

### 5.4 Cost and abuse limits

What exists:

- sign-up with an allowlist (`api/src` pre-sign-up, SSM);
- one task per user and `MAX_TASKS = 3` (`api/src/control.ts:5`);
- idle exit after 20 minutes;
- a 30-minute wall time for interactive runs;
- per-run limits (5 s run, 15 s compile, 256 MB);
- 4 concurrent runs per task;
- a $20 monthly budget that alerts and does not stop (`infra/lib/stack.ts:287-317`).

For one student this is enough. From memory, unverified: 0.5 vCPU and 1 GB of ARM64 Fargate cost about 2 cents
an hour on demand and less on Spot, so one hour a day is well under a dollar a month.

Add only:

- the browser cache of `/explain` answers by hash;
- pre-warm only for `needs: cloud` lessons, never for every Learn page.

A hard daily cap on task hours is a guardian question (section 8), not a default.

## 6. Engineering waves (re-planned)

I could not read the board, so I map the old plan by topic:

- "functions throughline" is W2;
- "custom cards in lessons" and "function checks" are W2;
- "compile harness" and "Explorer inside lessons" are W3 (narrow) and W8 (full);
- "editor stage" is W6;
- "course 2 typed assembly" is W6;
- "course 4 C seen through glass" is W8;
- "ESP32-C3" is W9.

Re-triage every other G item against the lessons in section 4. Close any item that no lesson needs (YAGNI).

Each wave can ship on its own and ends with lessons on the path.

| Wave | Contents | Riskiest assumption | One-session playtest question for the guardian |
|---|---|---|---|
| W0 Pilot | the review's quick fixes are merged; play c1/01-05 once and keep the progress export | the first lessons are not too easy for an Algebra 2 student | At which lesson does she first look interested, and does she read the coach? |
| W1 One machine, first panels | `Session` in the explorer; lesson Live over it; `RealStage` without the shadow timeline; the Registers panel (box skin) and the glass strip; c1/02, 04 and 05 updated | one component can be the 3-box lesson look and the 32-register IDE table without making either worse | In c1/02, does she notice the grey line change, and what does she say it is? |
| W2 Functions | c1/06-09; custom cards in lessons; function checks; Gallery save from the coach; table widget | saving a custom card is one action for her, not three | After c1/08, without help: "What does your card give for 3?" and "Make a card for 2x + 1." |
| W3 The cloud in lessons | `CloudProvider`; compile harness with recorded answers; Source (read-only), Program rows with captions, cloud terminal; pre-warm and fallback; the differential spec; c1/10-11 | the cold start is hidden by pre-warm, and "the compiler wrote my cards" is a wow, not a shrug | Time from Compile to result, and her words when the words match. |
| W4 Glass | `InstructionPanel` (lenses, fields, lamps); the Memory panel in lesson density; `reg:pc`; `retires`; c1/12-16 (drafts 06-08 re-cut) | hex and 4-byte shelves do not create a new cliff like the old lesson 06 | Can she say, with no total shown, which card a lamp pattern is, and where the second card of f starts? |
| W5 Calls, memory, control, capstone 1 | ra; Screen panel link; branch arrow; step counts; Gallery item with all levels; c1/17-22 | a loop that draws her own rule is motivating enough to carry six lessons | Does she show the graph to someone without being asked? |
| W6 Typing | the editor stage (lazy Monaco or a textbox), assembler messages in STE, the Output panel, register vocabulary; c2/01-03 | typing assembly is not a wall after 22 lessons of cards | Errors per line typed, and does she fix them from the message alone? |
| W7 The stack | `Session.frames`, the Stack panel, frame phrases; c3/01-02 | a shadow call stack is a correct model for all our programs (hand asm and -O0/-Og) | Can she say why the program faulted when ra was not saved? |
| W8 C through glass, the heap, capstone 2 | Source edit, the optimization toggle, `symbols` in `/explain`, `Session.heap`, the Heap panel; the IDE moved to `Session` and panels; c4/01-05 | the -O0 listing is readable in a 480 px column with runtime hidden | Does she predict which listing is longer, and does she choose to open her capstone in the Workspace? |
| W9 Board (later) | ESP32-C3 spike: build image size, Web Serial flashing, C-extension decode | the toolchain fits in the runner image, or a second task image is acceptable | Not before W8. |

### 6.1 Proposed Kanbus epics and stories (not filed)

**Epic: One machine model (W1).**
- Story: `Session` over `Timeline` in `explorer/src/session.ts`. Acceptance:
  - `features/explorer/session.feature` passes;
  - `narrate`, `rowAt` and `fromWords` are pure;
  - lesson-core `startLive` uses it;
  - every `features/lessons` and `features/web/stage-*` spec stays green;
  - `useFollow` is deleted.
- Story: Registers panel with `only`, `names`, `number` and `skin`. Acceptance:
  - c1/04 looks the same in all six theme and mode combinations (screenshot spec);
  - `box:a0` and `reg:a0` both resolve;
  - the IDE Registers tab is drawn by the same component.
- Story: the glass strip. Acceptance:
  - c1/02 shows `addi a0, zero, 9 · 0x00900513` after the student spins to 9;
  - it is `aria-hidden` while the lesson does not name it;
  - it passes the contrast spec.

**Epic: Functions in lessons (W2).**
- Story: custom cards in lessons. Acceptance: a scene with `builder` and `save: true` lets the student save two
  cards as one named card; Show me can demonstrate it; the card is saved to the Gallery.
- Story: function checks. Acceptance:
  - `the card "f" gives 50 for 7` and `the function f gives 50 for 7` are in the step table, with specs for
    pass, fail and a step cap;
  - the checker runs them over the reference solutions.
- Story: lessons c1/06-09. Acceptance: `npm run lesson -- check --all` is green, STE is clean, at most one new
  control each, and every `ask` needs one inference.

**Epic: The cloud in lessons (W3).**
- Story: `CloudProvider` in `Shell.tsx`, with a status line. Acceptance:
  - one `Backend` per signed-in user, shared by Learn and the Workspace;
  - the IDE behaviour is unchanged.
- Story: compile harness. Acceptance:
  - `npm run lesson -- compile <id>` writes `compiled/*.json` with a hash;
  - `check` fails on a stale hash;
  - the player shows the recorded answer at once and the live answer when ready.
- Story: pre-warm and fallback. Acceptance, with a mock backend that starts in 30 s:
  - c1/11 offers [Run it here] after 20 s;
  - the pass is the same;
  - the output label says where the program ran.
- Story: the differential spec. Acceptance: `@linux-only` scenarios compare the emulator, the native build and
  qemu output for every lesson program and the corpus.
- Story: Source (read-only) and Program-with-captions panels in lesson density, with `line:` and `row:` coach
  ids.
- Story: lessons c1/10-11.

**Epic: Glass (W4).**
- Story: `InstructionPanel`, which replaces D5 and D8 as configs.
- Story: Memory panel at width 4 with `mem:` ids.
- Story: `retires`.
- Story: c1/12-16.

**Epic: Calls and control (W5).**
- Story: `reg:ra`.
- Story: branch arrow.
- Story: Screen link.
- Story: the "N cards, M steps" line.
- Story: a Gallery item with levels.
- Story: c1/17-22.

**Epic: Typing (W6).**
- Story: editor stage.
- Story: assembler errors in STE (a spec lists every message and runs the STE checker over it).
- Story: Output panel.
- Story: c2/01-03.

**Epic: Frames (W7).**
- Story: `Session.frames`. Acceptance: hand asm, -O0 and -Og fixtures give the same frame list as a reference
  trace.
- Story: Stack panel.
- Story: c3/01-02.

**Epic: C through glass (W8).**
- Story: `symbols` in `/explain`.
- Story: `Session.heap`.
- Story: Heap panel.
- Story: Source edit mode.
- Story: the IDE on `Session`, with a step-back cap message.
- Story: c4/01-05.

## 7. Constraints and values

- **ASD-STE100.**
  - All new lesson text follows `lesson-core/src/ste.ts`.
  - New UI strings in `web/src/machine/` go through the same checker. That needs a small spec that collects
    exported strings, which the review asked for anyway.
  - New terms are taught once and then used as one word for one thing: "compiler", "cloud computer", "program
    counter", "stack", "heap", "address".
  - Avoid "server", "VM", "Fargate" and "task" in student text.
- **Real Gherkin.** Every phrase in 3.4 and every derived view in 3.2 is specified before it is built. The
  differential is a real `.feature` file.
- **YAGNI.** Not in this plan:
  - DWARF variable names;
  - an ARM64 listing;
  - a hard cost cap;
  - C++ in `/explain`;
  - Rust in lessons;
  - the ESP32-C3;
  - the interpreter capstone.

  Each is a later, separate decision.
- **Accessibility.**
  - Every panel is a table or list with headers and text labels, operable by keyboard, narrated in a polite live
    region, and still under reduced motion.
  - No meaning is carried by colour alone.
  - The contrast spec covers the new tokens.
- **No real emails** appear in this document, and none are needed by the plan.

Where this plan breaks a constraint, and why:

1. **C appears in Course 1** (c1/10, c1/11), against the order "machine code, assembly, C"
   (`docs/course-1-design.md`). The C is read-only, and only one line of it is in view. This is the "window
   lesson" that `docs/curriculum-design.md` already wants. It is moved early because the guardian asked for
   the real system early, and because "the compiler wrote my cards" is the strongest proof that her card is a
   real function.
2. **Course 1 lessons that depend on the cloud.** The fallback in 5.3 keeps "a lesson never stalls" true, but
   the live wow is lost when the cloud is down.
3. **The two capstones may take 6 to 8 minutes,** above the 4-minute target. A project is not a step, and
   splitting it would destroy the sense of having made one thing.
4. **c1/16 and c1/17 teach the pc and ra before Course 3,** which the old roadmap reserved for "Calls and the
   Stack". This is justified by the function throughline: she has made f and called it, so she should see the
   call.
5. **The `tabs` field is deprecated.** A format change, but today it promises views the stage does not draw.

## 8. Questions only the guardian can answer

1. **May she see one line of read-only C in Course 1 (c1/10)?** Recommended: yes. It is the bridge the whole
   arc stands on, and it costs no typing.
2. **What should the two machines be called in lesson text?** Recommended: "the RISC-V machine" for the
   emulator (it is an exact model, not a toy) and "the cloud computer" for Fargate. Do not use "simulator",
   "fake" or "practice".
3. **Will she use a laptop with a keyboard from Course 2 on?** Recommended: assume yes. Make Course 1 work on a
   tablet, and do not build a touch editor.
4. **Is a pre-warmed cloud task for up to 20 idle minutes acceptable** each time a cloud lesson is next?
   Recommended: yes. The cost is cents.
5. **Do you want a hard daily cap on cloud hours** (for example, the control Lambda refuses a new task after 3
   task-hours a day)? Recommended: no, while there is one student and an allowlist. Revisit if a second student
   joins.
6. **Should the capstones allow any rule she chooses**, including ones that overflow or go off the 16 x 16
   screen? Recommended: yes. Overflow and clipping become exhibits, with a plain note, not an error.
7. **Rust in this span?** Recommended: no lessons. Offer one side room after c4/05, "f in Rust", since `/explain`
   already supports it.
8. **The ESP32-C3: when, and which board?** Recommended: after Course 4. Start with a one-day spike on a small
   ESP32-C3 board that can be flashed from Chrome over Web Serial. The spike must also measure the build image
   size and decide whether to add compressed-instruction decoding to the explorer, because the C3 runs
   compressed (16-bit) instructions by default.
