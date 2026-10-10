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
draft: true                 # optional, default false: a draft lesson, see "Draft lessons" below
ui: { controls: [step], stepLabel: Run }          # optional (Run only for a one-card starter), what the stage shows; see "The ui block"
function: { name: f, inputs: [a0], output: a0, rule: "f(x) = x·x + 1" }   # optional; see "Functions"
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

**The step contract with a hidden end.** The hidden Stop is not a student step. When the last visible card has
run, `runProgram` and `liveRun` execute the marker automatically, so Step count equals card count (3 cards =
3 steps). `the machine has taken N steps` and `the program ran at most N steps` count student-visible steps only
(the machine's own `steps` is one higher once the marker has run; `run.steps` subtracts it), and `maxSteps`
is a cap on visible steps. `startLive(cards, { hideEnd })`, `pressStep(live)`, `pressBack(live)` (undoes the
hidden Stop together with the last card) and `liveRunOf(live)` implement this for the player. **When
conditions apply:** the player evaluates a scene's `until` on the live machine after every student action
(Step, Back, an edit, an answer); it evaluates `@pass` and the bonus scenarios on the finished run. Because an
exact count would be overshot by one extra press, scenes may not use exact step counts (`the machine has taken
3 steps`); use `at least` or `the machine reached the end`.

**Early lessons.** A lesson with `hideEnd: true` and no `pointer` is an early lesson: at most 3 cards
(starter, solutions, warm-ups) and 5 minutes (`EARLY_MAX_CARDS`, `EARLY_MAX_MINUTES` in `lesson.ts`). Add
`earlyLesson: false` to opt out explicitly.

**Boxes are enforced.** Every register named by the starter, solutions, warm-ups, `until`, `ask.target` and
`spotlight: box:` must be in `boxes`; duplicates are rejected; `show` entries that are tabs (`screen`, `hex`, ...)
must be in `tabs`. Spotlight targets and ghost `point` targets must be real UI targets: `button:step|back|run|pause|reset`,
`card:<n>` (an existing card), `glass:<n>` (the glass line under that card; needs `ui.glass: true`, for scene spotlights and for ghost `point` targets), `box:<one of boxes>`, `tab:<one of tabs>`, `diagram:D1`..`D14`, and the parts of the
real stage: `band:<field>` (`opcode rd rs1 rs2 funct3 funct7 imm shamt special`), `lamp:<0-31>`, `flip` (the card flip)
and `tray` (the builder's tray). The real stage gives each of them a `data-coach-id` (see `docs/ui-design.md`).

**Wrong answers.** `onWrong.match` must not be the correct answer, must be a number for a number ask, and
must not repeat. Any lesson with an `ask` needs a lesson-level `onWrongDefault` reply
("Not quite yet. Watch what the machine does, then try again.") for every other wrong answer. Cover the
likely misconceptions with specific, kind replies (lesson 5: 57 digits side by side, 35 the product, 5 and 7
a box read back, 0 the starting value). The idea "last one wins" holds for put cards, not for add: an add card
combines two boxes instead of replacing one, so lesson 3 teaches it for put cards only.

**Locks.** A scene may not lock a control its own `until` needs (Step for step or box conditions, Edit for
`the student edited`, Back for `the student rewound`).

**Length limits.** Hints at most 120 characters, ask and warm-up questions at most 200, `nowYouCan` lines at
most 80. Sentences are counted by terminators followed by a capital letter, digit or the end of the text.

### The ui block

`ui` is optional. A lesson shows only the parts of the machine its one idea needs; every field defaults to the
full machine. Unknown keys and wrong types are errors.

| Key | Values | Default | Meaning |
| --- | --- | --- | --- |
| `controls` | list of `step`, `back`, `reset` (no repeats; must include `step`) | all three | The buttons under the title. A scene may not spotlight `button:back` or `button:reset` when the list hides it |
| `stepLabel` | short text, at most 20 characters | Step | The name of the Step button. The label `Run` is only for a starter of one card (c1/01, c1/02): the loader rejects `stepLabel: Run` when the starter has more than one card, because one press runs one card. From two cards on, leave it out so the button is called Step, and introduce the name once, in the first scene of the first lesson that has two cards (c1/03: "With two cards, the button is now called Step. Each Step runs one card.") |
| `resetLabel` | short text, at most 20 characters | Reset | The name of the Reset button (for example `Start again`) |
| `log` | true or false | true | The "What just happened" log |
| `deskTitle` | true or false | true | The "The desk" heading |
| `endMarker` | true or false | true | The "end of the list" row |
| `boxNames` | true or false | true | The register name (a0) on each box. When false, text says "the box" instead of "box a0" |
| `glass` | true or false | false | A faint one-line "glass" under each card: the card's real assembly and its machine word in hex (for example `addi a0, zero, 9 · 0x00900513`). It updates when the number changes. The line is hidden from screen readers until a scene sets `glassNamed: true` (see the scene table); introduce it there in one short sentence, with the term "the machine's own text" (c1/02) |
| `spotlight` | `ring` or `dim` | ring | A ring around the target, or a dimming spotlight |
| `spotlightAfterHint` | boolean | false | Goal and question scenes show their spotlight only after the first hint |

When Back is hidden, a run that misses the goal points at Reset (the `resetLabel`) instead of Back, and the idle Run button says "Select Start again first" until the student starts again. Reset is disabled, with the reason "Nothing to start again yet", until the machine has run something.
Use the same label for a button in every sentence of the lesson: if `stepLabel` is `Run`, the text says "Run"; otherwise it says "Step". The coach panel, the idle notes and the Show me narration use the lesson's own button names.

**A new goal is marked.** When a scene completes and the next scene has a goal, the coach panel shows a "Next goal" label (an arrow icon and words, never colour alone) above the new text. If that scene needs a card changed while the machine has already finished, its spotlight shows at once (even with `spotlightAfterHint`) and the idle Step button says what to do: "Change the number on card 2 first" (taken from a `card:<n>` spotlight, else "Change a number first").

### Simplified Technical English (STE)

All text the student reads follows ASD-STE100 style: `say`, `doneSay`, `ifMissed`, hints, `onWrong` replies, `ask`
questions and choices, `onWrongDefault`, `nowYouCan` and warm-up questions. The loader checks what a program can
check and reports each problem with its scene (`npm run lesson -- check --all` fails on any problem, drafts
included):

- At most 20 words in a sentence. Aim for 15 or fewer.
- No contractions: write "do not", "it is", "let us" (or rephrase).
- Avoid list: spin, tiny, just, simply, easily, quickly, "kind of", "sort of", "pretty much", press, click, tap,
  basically, obviously, "of course", "that is all", and get, gets, got. Use "select" for a button, "change" for a
  number, "small" for tiny, and a precise verb such as "receive" or "make" for "get".

The author keeps to the rest by hand: simple present tense, active voice, one idea in a sentence, one word for one
thing (card, box, number, instruction), the exact button names (Run, Step, Continue), and no idioms or filler words.
The checker is in `lesson-core/src/ste.ts`.

### Scenes

```yaml
- id: predict                       # lowercase slug, unique in the lesson
  say: The next card adds a0 and a1 into box a2. What will a2 hold?   # <= 2 sentences, <= 30 words
  show: [cards, boxes, D1]          # tabs/panels, diagram ids D1..D14, `timeline`, `builder` (see "What a scene shows")
  spotlight: "box:a2"               # dims everything else; "kind:name"
  ask:                              # number | choice | click-target | machine-query | table
    { kind: number, question: "...", target: a2, answer: 12 }
  until: [ "the machine has taken at least 3 steps", "box a2 holds 12" ]   # step phrases, all must hold
  onWrong:
    - { match: 57, say: "Adding is not gluing digits together. Watch the box.", goto: watch-add }
  hints: [ nudge, narrower question, near-answer ]   # exactly 3; required when the scene has until or ask
  showMe: demo-step                 # id of a file in ghosts/
  doneSay: The box now holds 5.     # optional, same limits as say; said when the goal is met
  ifMissed: The box shows the number from the card. Change the card, then select Run.   # optional, see below
  lock: [edit, drag, toggle]        # UI controls disabled in this scene
  skippable: true
  glassNamed: true                  # optional, needs ui.glass: from this scene on, screen readers hear the glass line
```

- `ask` kinds: `number` (`answer`, optional `target` box), `choice` (`choices`, `answer` index),
  `click-target` (`target`), `machine-query` (`query` is a step phrase), `table` (`inputs`, `target`; see "Functions").
- `until` conditions are phrases of the shared step vocabulary. A scene with no `until` and no `ask`
  waits for [Continue]. Write `until` phrases that stay true once reached (`at least`), because they
  are evaluated against the live run.
- `doneSay` is the only confirmation the player shows when a scene's goal is met (it clears on the student's next
  action). Without it nothing is shown and screen readers hear a quiet "Scene complete."; the player never
  builds a line from the `until` phrases.
- `ifMissed` (optional, needs `until`) is the help the coach shows when the student runs the machine and the
  goal is still not met. It says what the machine did and what to change. The coach shows it as
  `[data-coach-missed]` with a "Try again" button; "Try again" resets the machine to the start and keeps the
  cards as the student left them, then moves keyboard focus to the Run (Step) button (`engine.tryAgain()`). A scene
  with `ask` cannot have `ifMissed`. When the cards are not the starter cards, the same box also shows
  "Start again", which puts the starter cards back and starts the machine over (`engine.restoreCards()`), so a
  goal that no edit of the current cards can reach never traps the student. Limits: at most 3 sentences and 45 words.
- `onWrongDefault` is text, or `{ say, goto }`. `goto` names the scene that reveals the answer; the checker
  requires it when the scene after an `ask` does not wait on the machine (`until`).
- The player locks Step, Back, Reset and Edit in `ask` scenes (the prediction comes before the reveal), restores the
  starter cards on entering a scene that locks `edit`, and advances at once past a scene whose `until` already holds.
  A prediction made after the machine has finished is not a prediction: it is not recorded and cannot earn `called-it`.
- `onWrong.match` is the wrong answer to react to (a number, or text for choices); `goto` names a scene.
- `showMe` must name an existing ghost; `goto` must name an existing scene.

### Functions

A lesson whose program computes a function of one number says so with a `function` block:

```yaml
function:
  name: f              # a short lowercase word
  inputs: [a0]         # exactly one box: it holds x when the program starts
  output: a0           # the box that holds f(x) when the program stops
  rule: "f(x) = x·x + 1"
```

Both boxes must be in `boxes`. The block turns on four things:

- **The rule banner.** A small panel above the boxes (`data-coach-id="banner:rule"`, a region named "The rule";
  `web/src/machine/RulePanel.tsx`) shows the rule, a box for x, the rule with that number in it
  (`f(7) = 7·7 + 1 = 50`) and a polite status line that says in words whether the output box holds the
  value of the rule (never colour alone). It reads the shared `Session`, so Step, Back and Reset update it.
  The student sets x in the banner (a whole number from -99999 to 99999, default `DEFAULT_FUNCTION_INPUT`, 1);
  the number counts when the student presses Enter or leaves the box, never key by key, and text that is not a
  whole number gets a plain message and changes nothing. The machine then starts again with the input box
  holding x (`startLive(..., { startRegs })`). The box is read-only in a scene that locks `edit`, in every `ask`
  scene and in a scene with `input`. While a scene asks a question the banner shows the rule only (no
  numbers, no status), so it cannot give the answer away. When a step of the rule does not fit in a box (for
  example `f(46341)` for `x·x + 1`) the banner says `f(46341) is too big for a box` instead of an equation. The
  status line also says when the program faulted or was stopped by the step limit. A scene may spotlight
  `banner:rule`.
- **A scene can fix x:** `input: 3` on a scene. On entry the player sets x to 3 (the machine starts again if x
  changes) and locks the box; the checker judges that scene at x = 3 (number asks, `until` phrases, reference
  solutions). Use it for any ask whose answer depends on x. A scene that waits for the student to type x says
  `x is 3` in `until`; the checker judges it at x = 3. In a lesson with a function, a scene with a number ask, or
  with a box phrase in `until`, must do one of these (the loader refuses it otherwise), because the checker and the
  player would judge it at different x. A scene with `input` or any `ask` starts the machine again on entry, so the
  answer is not already on screen; the first scene's `input` is applied from the start. A table answer records
  the pass if the lesson's `@pass` facts hold, even when later scenes have goals.
  `lesson-core` renders the text as pure functions: `ruleText`, `ruleSubstitution`, `ruleValue`, `ruleStatus`.
- **Function phrases** in `until`, `checks.feature` and ask queries (see the step vocabulary).
- **The table ask:** `ask: { kind: table, question: "...", inputs: [1, 2, 3], target: a0 }`. The student fills one
  number for each input (1 to 8 whole numbers, no repeats; `target` is a box of the lesson). The right answers
  are not written down: the checker and the player run the starter program on each input (input box set to x,
  at most 1,000 steps) and read the output box (`tableExpected`). A table that is all right finishes the scene.
  A wrong table gets a reply about the first wrong row. `onWrong.match` for a table is `"2:4"` (row x = 2, the
  student wrote 4) or `"2"` (any wrong value in the row x = 2); `"2:4"` wins over `"2"`, and either wins over
  `onWrongDefault`. The reply starts with `Row x = 2: you wrote 4.` The loader rejects a match that is not a row
  of the table or that is the right answer.
- **The rule check.** `npm run lesson -- check` fails when the rule disagrees with the program on a listed input.
  The listed inputs are the `inputs` of the table asks, the numbers in function phrases (`f(3) is 10`, decimal, hex or binary, and the outer input of `f(f(2))`) and `x is N`, or
  1, 2 and 3 when the lesson lists none. The programs are every reference solution that earns `pass`, and the
  starter when the lesson has a table (the table's answers come from it).

The rule grammar (machine-evaluable, at most 60 characters):

```
rule    = name "(x)" "=" sum
sum     = product { ("+" | "-") product }
product = factor { ("*" | "·" | "×") factor }
factor  = whole number | "x" | "(" sum ")" | "-" factor
```

Spaces are free. Values are computed as 32-bit signed numbers, the size of a box. The banner writes `*` and `×`
as `·`, and a negative x in brackets (`(-3)·(-3) + 1`). Anything else (`^`, other letters, a name that is not the
function's) is a load error.

In a function lesson the checker's runs start with the input box holding `DEFAULT_FUNCTION_INPUT`, the same x
the player starts with, so a scene may say `box a0 holds 2` about the default x. A reference solution is
assumed to fill every table of the lesson (the run carries a `table` event for each); the checker proves the
answers separately.

### What a scene shows

`show` lists what the real stage draws. The machine view (D1, the clerk and boxes with real card faces and number
spinners, driven by the lesson's `boxes`, `pointer` and `hideEnd`) is on when the scene shows `D1` or shows none of the
pictures below; a scene that shows only one picture gets just that picture, so it is the only thing to look at. Step,
Back and Reset are always there. `cards` and `boxes` are tabs of the machine view and need no other setting.

| `show` id | Draws | Scene field |
| --- | --- | --- |
| `D1` | the clerk and boxes (the machine view) | none |
| `D3` | the heartbeat: fetch, do, move on | none |
| `D4` | bit lamps on one card, switchable | `lamps: { card, of?, width?, allowedBits?, lockedBits?, target?, hide? }` (`hide`: `worth`, `total`) |
| `D5` | one card that flips through its views | `flip: { card, lenses? }` (`card lamps number hex assembly`; `number` is only the lamps of a put card's number) |
| `D6` | the program counter walk, with addresses | none |
| `D7` | adding two numbers in lamps, with the carry | `carry: { a, b }` |
| `D8` | field bands on one card, each a button; its lamps switch | `bands: { card, allowedBits?, lockedBits? }` |
| `D9` | the 16 by 16 pixel screen (needs `screen` in `tabs`) | none |
| `timeline` | Run, Pause and a scrubber, wired to the player | none |
| `builder` | drag cards from a tray into the program | `tray: [asm, ...]` |

A scene field needs its `show` id (`lamps` needs `D4`, `bands` `D8`, `flip` `D5`, `carry` `D7`, `tray` `builder`); the loader
rejects the field without it, a card that is not in the starter, bits outside 0 to 31, unknown keys and a tray line that
does not assemble to one instruction. Notes:

- **`lamps`** shows all 32 lamps of the card (`of: word`, the default) or, with `of: number`, just the number of a put or
  add-a-number card as `width` lamps (1 to 11, default 8) worth 1, 2, 4 ... with a running total. `allowedBits` and
  `lockedBits` count the lamps as shown. `target` adds "Make the lamps add up to N" next to the lamps. A lamp toggle
  replaces the whole 32-bit word of the card (`onEditStarter(card, word, "toggle")`), so the card text and the machine
  follow. The lamps are read-only when the scene locks `toggle`; they are a different lock from the number spinner (`edit`).
- **`bands`** is how a `click-target` question is asked about a card: `ask: { kind: click-target, target: "band:rd" }`
  is answered by clicking (or focusing and pressing Enter on) a band. A click counts as an answer only when it lands on
  a part of the same kind as the target (a band for `band:rd`, a card for `card:2`); any other click is just a click.
  A wrong band is answered by `onWrong: [{ match: "band:rs1", say, goto }]`; `goto` the scene's own id keeps the question open.
- **`tray`** lists the cards the builder offers as lines of assembly (`addi a0, zero, 5`); each must be a Course 1 card.
  The program the student builds replaces the player's cards (`onReplaceCards`), so `until: the program has 3 cards`
  works. `lock: [drag]` closes the builder.
- Switching a lamp or dropping a card is a real edit: it restarts the machine and counts for `the student edited a card`
  and `the program differs from the starter by exactly N bits`.

### Draft lessons

`draft: true` marks a lesson that is not ready to ship. `npm run lessons:build` still builds it (into `lessons/dist/drafts/`,
and `npm run lesson -- check --all` checks it), but it is left out of `web/public/catalog.json`, so it is not on the Learn
path, the Deck or "Next lesson". It plays only at `/learn/<id>?draft=1` (and in the component lab) in a dev build or a build
with `VITE_DEV_TOOLS=1`; a production bundle does not contain it at all. The stage fixtures (`lessons/x1/`) are drafts too.

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
predictions by target), `stdin`, `maxSteps` (default 10,000), `capped`, `note` and `scenes`. Every file in
`solutions/` must be declared. `scenes: [make-five]` names the scenes whose `until` this solution is the way to finish
even though it does not pass the lesson: a lesson with several goals in a row (lesson 07 makes 5, 7, 12 and then 42)
declares one such solution per goal, and the checker accepts a scene's `until` when a pass solution, the starter or a solution
that names the scene satisfies it.

### ghosts/*.json (Show me)

```json
{ "id": "demo-step", "events": [
  { "at": 0,   "type": "point", "target": "button:step" },
  { "at": 900, "type": "press", "control": "step" } ] }
```

`at` is milliseconds from the start (non-decreasing, at most 60,000; at most 200 events). Event types
(`GhostEvent` in `lesson-core/src/ghost.ts`): `point {target}`, `press {control: step|back|run|pause|reset}`,
`spin {card, to}` (card index, new 32-bit word), `toggle {card, bit 0-31}` (flips that bit of the card's 32-bit word, so
the number field of a put card is bits 20 to 31), `drag {from, to}` (move a card within the list) or
`drag {tray, to}` (drag tray card `tray` into the list at position `to`; the scene needs a `tray`),
`type {text}` (types a whole number into the number spinner of the card the ghost last pointed at with
`point card:<n>`). During Show me all of these act on a COPY of the machine, drawn by the same real components; the
student's own cards, boxes and progress are untouched until control is handed back. The file name (without `.json`)
must equal `id`. Validated by `validateGhost`.

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
| `f(3) is 10` | the program run on a fresh machine with the input box set to 3 leaves 10 in the output box (the name is the lesson's `function.name`; at most 1,000 steps; needs a `function` block) |
| `x is 3` | the x the machine started with (the input box) is 3: use it in `until` when the student must set x themselves, because `f(3) is 10` is true of the starter before the student does anything |
| `f(f(2)) is 26` | the same, with the first result fed back in as the input |
| `the student filled the table for 1, 2, 3` | the student answered a table ask over these inputs correctly (a `table` event) |

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

## The sample lessons

`lessons/c1/` holds six complete sample lessons, each with one new idea, one student action and at most three
cards (all with `hideEnd: true`, no pointer arrow, no hex):

| Lesson | Idea and action | Cards | Boxes | Stars |
| --- | --- | --- | --- | --- |
| `01-press-the-button` | a card tells the machine what to do; press Step once (cannot fail) | put 5 in a0 | a0 | pass |
| `02-change-the-number` | a card carries a number; spin it until the box shows 9 | put N in a0 | a0 | pass, another-way (any other number) |
| `03-last-one-wins` | a later card replaces the box; predict 8 (a wrong guess gets "You said N" and a pointer to watch) | put 3, put 8 in a0 | a0 | pass, called-it |
| `04-two-boxes` | boxes keep their own numbers; change one card so a1 holds 9 | put 4 in a0, put 6 in a1 | a0, a1 | pass |
| `05-add` | a card can add two boxes; predict 12 | put 5, put 7, add into a2 | a0, a1, a2 | pass, called-it |
| `06-multiply` | a card can multiply, and one box can be used twice; predict 49 (7 times 7). Bonus: change the first number so a1 holds 81 | put 7 in a0, multiply a0 by a0 into a1 | a0, a1 | pass, called-it, nine-times-nine |

Each has solutions including deliberately wrong ones and a never-ending one that proves the step cap.

Three more lessons are **drafts** (`draft: true`, not on the path; play them at `/learn/c1/15-flip-the-card?draft=1`
in a dev or test build) and prove the new visuals. They follow the same rules (one idea, one action, at most three
cards, at most two short sentences per scene, three free hints, a friendly `doneSay`):

| Lesson | Idea and action | Cards | Uses |
| --- | --- | --- | --- |
| `14-counting-with-lamps` | lamps are switches worth 1, 2, 4 ...; make 5, 7, 12 and 42 with `of: number` lamps, with an optional carry peek | put 1 in a0 | `D4` with `allowedBits` and `target`, `D7` carry |
| `15-flip-the-card` | a card is one big number; flip it to its lamps, then click the card that matches each lamp pattern | put 1, put 2, put 3 in a0 | `D5` flip, `D4` lamps, `click-target` on cards |
| `16-inside-the-number` | the lamps of a card are bands with jobs; click the band that names the answer box, choose what lamp 30 makes the card say, then flip lamp 30 to turn add into subtract (a2 becomes 7); bonus `below-zero` shows -2 | put 9, put 2, add into a2 | `D8` bands, `click-target` on `band:rd`, `bands.allowedBits` |

`lessons/x1/` holds three more drafts that are test fixtures for the real stage: one scene for every picture
(`01-diagrams`), the lamps, flip, bands and carry (`02-lamps`), and the builder with its Show me ghost (`03-builder`).

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
- an `ask.answer` differs from the value the starter produces in `ask.target`;
- a scene's `until` phrase is satisfied by neither a declared pass solution (with the student's edits as
  events) nor the starter, so the scene could never finish (UI-only phrases like `the student rewound` are skipped);
- the lesson has no `@pass`, no solution earns `pass`, a bonus star is never earned, or there is no
  wrong solution;
- a warm-up's `target` does not hold `expected`;
- a declared `function.rule` disagrees with a reference solution (or with the starter of a lesson with a table)
  on a listed input (see "Functions");
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

- Ids are validated: lesson, concept and star ids match `/^[a-z0-9][a-z0-9/_-]*$/`, user ids are 1 to 64
  letters, digits or `. _ @ -` (no colon). Records are prototype-free, so `"constructor"` is an ordinary
  lesson id and `"__proto__"` is rejected. A throwing subscriber is ignored. A clock that returns a non-finite
  value is refused. At most 500 lessons, 500 concepts and 20 bonuses per lesson, at runtime and on load.
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
  warm-up in a lesson the student has passed (lowest box, then longest unseen, then id) and rotates its warm-ups by a monotonic per-concept counter (`warmupCounts`), which the capped event log cannot disturb.
- `courseState(progress, lessons)` returns the path: `lessons` (done with bonuses, current, next dim, fog
  with titles only), `current`, `next`, `sideRooms` (open when their lesson is passed and their bonus star earned) and exactly one
  `continueTarget` (`{ kind: "lesson", lessonId }` or `{ kind: "complete" }`). The first unpassed lesson
  is current; passing gates the next lesson and stars never do.
