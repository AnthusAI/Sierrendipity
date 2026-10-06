# Lesson format and the lesson core (`@sierrendipity/lesson-core`)

The non-UI core of the self-guided lesson system described in `docs/course-1-design.md` (stories E2,
E3 and E12). It is a pure TypeScript workspace (`lesson-core/`) that exports its source directly, like
`explorer/`, so Cucumber (tsx) and Vite use it without a build step. Entry points:

| Import | Contents | Environment |
| --- | --- | --- |
| `@sierrendipity/lesson-core` | step vocabulary, `runProgram`, Gherkin subset parser, lesson types, ghost schema, progress stores, `pickWarmup`, `courseState` | browser and Node, no DOM, no fs, no YAML |
| `@sierrendipity/lesson-core/loader` | `loadLesson(files)` (YAML plus validation), `publishLesson` | browser and Node (pulls in the `yaml` package) |
| `@sierrendipity/lesson-core/check` | `checkLesson` (runs reference solutions) | browser and Node |
| `@sierrendipity/lesson-core/node` | directory reader, CLI, official-Gherkin cross-check | Node only (`lesson-core/src/node/`) |

## A lesson is a directory

```
lessons/concepts.yaml                  the concept registry (ids and titles)
lessons/<course>/<nn-slug>/
  lesson.yaml                          scenes, starter, concepts, warm-ups
  checks.feature                       real Gherkin: what "done" means
  solutions/solutions.yaml             which stars each reference solution must earn
  solutions/*.s | *.hex                reference solutions (assembly or hex words)
  ghosts/*.json                        recorded UI event scripts for Show me
```

`lessons/dist/` holds build output and is gitignored.

### lesson.yaml

```yaml
id: c1/01-press-the-button  # must equal the directory, "<course>/<nn-slug>"
title: Press the Button
minutes: 3                  # 1 to 60
concepts: { introduces: [cards], requires: [] }   # ids from lessons/concepts.yaml
boxes: [a0]                 # the only boxes (registers) the machine shows; more appear when a lesson needs them
pointer: false              # show the arrow at the card being run (the program counter); default false
hideEnd: true               # hide the Stop card, see below; default false
starter: { hex: ["0x00500513"] }                  # or { asm: "addi a0, zero, 5" }
tabs: [cards]               # cards lamps hex assembly boxes shelves screen output
scenes: [ ... ]
nowYouCan: [ "Step a program one card at a time." ]
warmups: [ ... ]
sideRooms: [ { id: hex-secrets, title: Hex secrets, opensWith: another-way } ]   # optional
```

Cards are just words: `starter` is assembly text or hex words, loaded at address 0, one word per card.
Unknown keys are errors (typos are caught).

**The small machine.** Early lessons teach one idea with one student action, at most three cards and about
three minutes. `boxes` lists the only registers shown (lesson 1 has one box, `a0`; `a1` appears in lesson 4,
`a2` in lesson 5), `pointer: false` hides the program-counter arrow, and `tabs` hides hex and lamps until a
lesson needs them. Everything the machine really has is still there; the lesson just does not show it.

**The hidden end (`hideEnd: true`).** Programs normally finish with a Stop card (`ebreak`). While the student
has not met Stop, the lesson hides it. With `hideEnd`, the starter, every solution and every warm-up list only
the student's cards (the loader rejects a trailing `ebreak`), and the player appends the end marker itself with
`runProgram(cards, { hideEnd: true })`. The UI shows it only as "the end of the list". `run.cards` counts the
student's cards, `run.words` includes the marker, and `the machine reached the end` is true once the marker has
run. A later lesson that introduces Stop sets `hideEnd: false` and puts the `ebreak` in the starter.

### Scenes

```yaml
- id: predict                       # lowercase slug, unique in the lesson
  say: The next card adds a0 and a1 into box a2. What will a2 hold?   # <= 2 sentences, <= 30 words
  show: [cards, boxes, D1]          # tabs/panels and diagram ids D1..D14
  spotlight: "box:a2"               # dims everything else; "kind:name"
  ask:                              # number | choice | click-target | machine-query
    { kind: number, question: "...", target: a2, answer: 12 }
  until: [ "the machine has taken at least 3 steps", "box a2 holds 12" ]   # step phrases, all must hold
  onWrong:
    - { match: 57, say: "Close! Adding is not gluing digits together, so let's watch.", goto: watch-add }
  hints: [ nudge, narrower question, near-answer ]   # exactly 3; required when the scene has until or ask
  showMe: demo-step                 # id of a file in ghosts/
  lock: [edit, drag, toggle]        # UI controls disabled in this scene
  skippable: true
```

- `ask` kinds: `number` (`answer`, optional `target` box), `choice` (`choices`, `answer` index),
  `click-target` (`target`), `machine-query` (`query` is a step phrase).
- `until` conditions are phrases of the shared step vocabulary. A scene with no `until` and no `ask`
  waits for [Continue]. Write `until` phrases that stay true once reached (`at least`), because they
  are evaluated against the live run.
- `onWrong.match` is the wrong answer to react to (a number, or text for choices); `goto` names a scene.
- `showMe` must name an existing ghost; `goto` must name an existing scene.

### Warm-ups

```yaml
warmups:
  - id: add-three-four
    concept: add                    # must be a concept this lesson introduces
    question: Box a0 holds 3 and box a1 holds 4. After the add card, what does box a2 hold?
    program: { asm: "addi a0, zero, 3\naddi a1, zero, 4\nadd a2, a0, a1" }   # no ebreak when hideEnd
    target: a2
    expected: 7
```

A warm-up is a small machine setup plus a question. The checker runs the program and fails if `target`
does not hold `expected`, so the answer key cannot drift from the machine.

### checks.feature

Real Gherkin (Feature, Scenario, tags, Given/When/Then/And/But). Keywords are ignored; each step is a
phrase of the shared vocabulary.

```gherkin
Feature: Add

  @pass
  Scenario: The machine adds 5 and 7 into box a2
    Then the machine reached the end
    And box a2 holds 12

  @bonus @star=called-it
  Scenario: Called it, the student's first guess was right
    Then the student's first prediction for "a2" was 12
```

Exactly one `@pass` scenario is required (it gates the next lesson). `@bonus @star=<id>` scenarios award
bonus stars (side rooms, Gallery); stars never gate the path. A bonus can be earned by a different try than
the pass (lesson 2's `another-way` is a different number, so it is not the goal number): the progress store
records bonuses from any attempt. Only Feature, Scenario, tags, comments and
steps are supported: Background, Scenario Outline, Examples, Rule, tables and doc strings are rejected
with a clear message.

### solutions/solutions.yaml

```yaml
solutions:
  - { file: good.hex, earns: [pass, called-it], predictions: { a2: [12] } }   # hideEnd: cards only, no ebreak
  - { file: wrong-sub.hex, earns: [], note: Subtracts instead of adding. }   # deliberately wrong
  - { file: forever.s, earns: [], capped: true }                             # never stops: proves the step cap
```

Each solution declares the exact set of stars it must earn. Optional: `predictions` (recorded student
predictions by target), `stdin`, `maxSteps` (default 10,000), `capped`, `note`. Every file in
`solutions/` must be declared.

### ghosts/*.json (Show me)

```json
{ "id": "demo-step", "events": [
  { "at": 0,   "type": "point", "target": "button:step" },
  { "at": 900, "type": "press", "control": "step" } ] }
```

`at` is milliseconds from the start (non-decreasing, at most 60,000; at most 200 events). Event types
(`GhostEvent` in `lesson-core/src/ghost.ts`): `point {target}`, `press {control: step|back|run|pause|reset}`,
`spin {card, to}` (card index, new 32-bit word), `toggle {card, bit 0-31}`, `drag {from, to}`,
`type {text}`. The file name (without `.json`) must equal `id`. Validated by `validateGhost`.

## The step vocabulary (E2)

One regex table (`lesson-core/src/steps/table.ts`) implements every phrase once as a pure function of a
`LessonRun`: a `Machine` plus recorded facts (output, predictions, edit/toggle/rewind/look events, step
count, laps, executed mnemonics, optional timeline position, step-cap flag). `parseStep(text)` returns
`{ ok: true, fn }` or `{ ok: false, error, suggestions }`; an unknown phrase lists the close matches.
Leading Given/When/Then/And/But are ignored. Registers are ABI or x-names; numbers are decimal, `0x` hex
or `0b` binary; box comparisons are modulo 2^32, so `-1` and `4294967295` are the same value.

| Phrase | Meaning |
| --- | --- |
| `the machine reached the end` | halted at the end marker (the last word): the whole list ran |
| `the machine halted normally` | halted by Stop (ebreak) or exit(0), anywhere |
| `the machine halted with exit code N` | exit(N) |
| `the machine faulted` / `... with "text"` | faulted, message contains text |
| `the machine has taken [at least] N steps` | steps (use `at least` in scenes) |
| `box a2 holds 12`, `box x12 holds 0xc`, `box zero still holds 0` | register value; `shows` works like `holds` and `does not hold 9` negates |
| `the box shows 9` | the first box, `a0` (also `the box does not show 9`) |
| `memory at 1024 holds 3` | one byte |
| `shelf 1040 holds 3` | a 32-bit word at a 4-aligned address |
| `the word at address 8 is 0x40b50633` | a word in memory (cards live at 0) |
| `the pixel at row R column C is color N` | 16x16 display over bytes 1024..1279, one byte per pixel, row-major, rows and columns 0 to 15, colors 0 to 15 |
| `at least N pixels are lit` | non-zero bytes in the display |
| `bytes A to B are all non-zero` | inclusive range |
| `the program has N card(s)` / `has at most N cards` | the student's cards (without a hidden end marker) |
| `the program ran at most N steps` | steps executed |
| `the program uses only the cards: a, b` | whitelist by mnemonic (static and executed) |
| `the program does not use: a, b` | blacklist by mnemonic (static and executed) |
| `the program differs from the starter` / `... by exactly N bit(s)` | at least one bit / popcount of the xor of the cards (end marker ignored) |
| `the program ends with a Stop card` | last word is ebreak |
| `the loop ran [at least] N laps` | backward branches and jumps taken |
| `the output is "text"` | everything written to fd 1 |
| `the student's first prediction for "a2" was 12` | first recorded prediction |
| `the student has predicted "a2"` | any prediction |
| `the student edited a card` / `at least N cards` | distinct cards edited |
| `the student toggled at least N bits` | toggle events |
| `the student rewound` | a rewind event |
| `the timeline is at step N` | timeline position |
| `the program counter is N` | pc |

`runProgram(words, { stdin, maxSteps, startRegs, startMem, starter, predictions, events, position })`
runs from address 0 (64 KiB of memory; `hideEnd: true` appends the end marker) until the machine stops, faults, waits for input or hits the step
cap (`hitStepCap`). `liveRun(machine, facts)` wraps a live browser machine. `runChecks(feature, run)`
accepts Gherkin text or an already parsed (precompiled) feature, runs every scenario and returns per
scenario failures; `earnedStars(report)` lists `pass` and bonus ids.

## Loader (E3)

`loadLesson(files, { dir, knownConcepts })` is pure over an in-memory map of relative file names to text
(`"lesson.yaml"`, `"checks.feature"`, `"solutions/good.hex"`, ...) so it works in the browser and in
Node. It returns `{ ok: true, lesson }` or `{ ok: false, errors }` and reports every problem it finds:
schema errors (hand-written checker, no schema library), scenes over 2 sentences or 30 words, missing
hints, unknown concepts/tabs/diagrams/locks, duplicate scene ids, bad `goto`/`showMe`, unknown or
malformed step phrases (in scenes and in checks.feature), a starter or solution that does not assemble,
a missing `@pass`, bad ghosts, undeclared stars. `publishLesson(lesson)` drops the solutions and
returns the plain-JSON `PublishedLesson` (`format: 1`) the browser loads; `checks` is already parsed.
YAML is read with the small, dependency-free `yaml` package (used only by the loader, never at runtime
in the browser when published JSON is used).

### Gherkin in the browser: decision

The browser never parses Gherkin. `npm run lessons:build` precompiles each lesson (including
`checks.feature`) to `lessons/dist/<course>-<slug>.json`, and the browser runs `runChecks(published.checks,
run)` on the data. For the build step and for runtime code that does hold Gherkin text we use our own
84-line parser for the Feature/Scenario/tags/step subset (`lesson-core/src/gherkin/parse.ts`, 1.4 kB
minified) instead of `@cucumber/gherkin`. Measured with esbuild (`--bundle --minify --platform=browser`),
`@cucumber/gherkin` plus `@cucumber/messages` is 219 kB (42 kB gzipped) for a bare parser call. For
scale, the whole browser entry `@sierrendipity/lesson-core` (steps, explorer machine and decoder, progress)
bundles to 37 kB minified (13 kB gzipped); the `/loader` entry (adds `yaml` and the assembler) is 133 kB
minified and is only needed when loading raw lesson files rather than published JSON. In Node, `npm run lesson -- check` parses every
`checks.feature` with the official `@cucumber/gherkin` as well and fails if the two parsers disagree on
scenario names, tags or step texts, so our subset cannot drift from real Gherkin.

## The five sample lessons

`lessons/c1/` holds five complete sample lessons, each with one new idea, one student action and at most three
cards (all with `hideEnd: true`, no pointer arrow, no hex):

| Lesson | Idea and action | Cards | Boxes | Stars |
| --- | --- | --- | --- | --- |
| `01-press-the-button` | a card tells the machine what to do; press Step once (cannot fail) | put 5 in a0 | a0 | pass |
| `02-change-the-number` | a card carries a number; spin it until the box shows 9 | put N in a0 | a0 | pass, another-way (any other number) |
| `03-last-one-wins` | a later card replaces the box; predict 8 (wrong guesses 3 and 11 get specific replies) | put 3, put 8 in a0 | a0 | pass, called-it |
| `04-two-boxes` | boxes keep their own numbers; change one card so a1 holds 9 | put 4 in a0, put 6 in a1 | a0, a1 | pass |
| `05-add` | a card can add two boxes; predict 12 (wrong guess 57) | put 5, put 7, add into a2 | a0, a1, a2 | pass, called-it |

Each has solutions including deliberately wrong ones and a never-ending one that proves the step cap.

## Authoring CLI and CI gate

```
npm run lesson -- check lessons/c1/01-press-the-button   # one lesson (a path or an id)
npm run lesson -- check --all                  # every lesson
npm run lessons:build                          # write lessons/dist/*.json
```

`check` loads the lesson (all validation above), then runs every reference solution through
`runProgram` and `runChecks` and exits 1 when:

- a solution earns stars different from its `earns` (extra or missing stars are named);
- a solution declared to pass fails `@pass`, or a wrong solution (`earns: []`) passes;
- a never-terminating solution is not stopped by the step cap, or a solution hits the cap without
  being declared `capped`;
- the lesson has no `@pass`, no solution earns `pass`, a bonus star is never earned, or there is no
  wrong solution;
- a warm-up's `target` does not hold `expected`;
- the official Gherkin parser disagrees with ours.

It prints per solution the stars earned, steps run and cards. `features/lessons/lesson-cli.feature`
runs the checker over `--all` inside `npm test`, so a broken lesson fails CI.

## Progress core (E12)

```ts
interface ProgressStore {
  getLesson(userId, lessonId): LessonProgress;
  recordAttempt(userId, lessonId, attempt): LessonProgress;
  recordEvent(userId, event): void;          // hint, show-me, prediction, warmup, stuck
  getMastery(userId): Record<concept, { box: 0|1|2|3, lastSeen, introducedAt }>;
  export(userId): ProgressData;               // versioned, JSON-safe copy
  subscribe(cb): () => void;
}
```

- `MemoryProgressStore({ now, maxEvents })` is pure; `LocalStorageProgressStore(storage, opts)` takes an
  injected `{ getItem, setItem, removeItem }` and keeps each user under `sierrendipity:progress:<userId>`
  as `{ version: 1, userId, lessons, mastery, events }`.
- On load, data is validated and repaired field by field; version 0 (`{ "passed": [ids] }`) is migrated
  and rewritten as version 1; unparseable data or a newer version falls back to an empty record and the
  raw text is kept under `<key>:backup`; a storage that throws on read or write leaves the data in memory
  (`loadStatus(user)`: `empty | ok | migrated | corrupt | too-new | unavailable`, `lastSaveError`). The
  event log is capped (200 by default, oldest dropped, and halved once more if a write is refused).
- Per lesson: passed, bonus ids (from any attempt), best card count, best step count, hints per
  rung, Show me uses, prediction accuracy (asked and correct), attempts, first-passed and last-attempt
  times (from the injected clock).
- Mastery is Leitner boxes 0 to 3. A pass puts the lesson's concepts in box 1; a correct warm-up or
  prediction moves up one box; a missed warm-up or prediction, or Show me, moves down one. `lastSeen`
  is stamped on every change.
- `pickWarmup(progress, lessons, now)` picks the weakest concept introduced at least a day ago that has a
  warm-up (lowest box, then longest unseen, then id) and rotates its warm-ups by how many were answered.
- `courseState(progress, lessons)` returns the path: `lessons` (done with bonuses, current, next dim, fog
  with titles only), `current`, `next`, `sideRooms` (open when their bonus star is earned) and exactly one
  `continueTarget` (`{ kind: "lesson", lessonId }` or `{ kind: "complete" }`). The first unpassed lesson
  is current; passing gates the next lesson and stars never do.
