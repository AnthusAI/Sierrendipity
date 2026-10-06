# Course 1 design: a self-guided "how a computer really works" tutor

Condensed from a design review (2026-10-06). It supersedes `docs/curriculum-design.md` wherever they differ. Machine words quoted here were run through our own `assemble`, `decode` and `Machine`; the pixel display, cards and coach are proposals, not built. Teaching-research claims are from memory.

## The learner and the product

- One student with zero programming knowledge. No Python, no binary or hex assumed.
- There is no human tutor: the tool is the tutor. Explanation, guidance, hints, pacing, encouragement and recovery from being stuck are built into the product.
- Sessions are short (5 to 15 minutes), very easy at first, and end on a win.
- Order: machine code, assembly, C, C++, then problem solving (Rust optional later). No Python lessons. The Workshop of native practice problems starts with C in Course 4.

## Principles for a tool-as-tutor

- Explain a little at a time: at most two short sentences on screen, next to the thing they describe.
- Point: a spotlight dims everything except the control or diagram part being discussed.
- Ask before telling: the signature habit is predict, then watch. A wrong guess gets "let's watch why", never "wrong".
- Notice when stuck (two failed checks, 75 s idle, three resets in two minutes, the same edit toggled three times) and offer a quiet nudge: [Nudge] [Show me] [I'm fine].
- Diagnose anticipated misconceptions with a specific reply (for example predicting 57 for 5 + 7).
- Escalating help that costs nothing: nudge, narrower question, near-answer, then Show me (a ghost does the step, then hands control back).
- End every lesson on a success with a "Now you can" card and [Next lesson] / [Stop here]. After 12 minutes suggest stopping.
- Avoid: walls of text, fake praise, timers, lives, streaks, XP, jargon before the student has a picture for it, red failure screens.
- Lessons 1 to 3 cannot be failed; afterwards aim for about 80 to 90 percent of goals passed on the first or second try. If the pilot shows lower, the lesson is too hard.

## On-ramp: one real machine, several lenses

Every card is one real 32-bit RV32IM word in memory. The face shows `describe(word)` in English ("Put 5 into box a0"). Lenses are revealed one at a time: card, flip to 32 lamps coloured by field, hex, then assembly (a faint chip from lesson 4, the main view in Course 2). Register names (a0..a3, a7, t0..t2) are real from the start. A separate toy machine and a diagrams-only start were rejected.

Course 1 cards: put N in box, add N to box, add boxes, subtract boxes, paint a pixel (`sb`), save and fetch (`sw`/`lw`), jump back if different (`bne`), jump if smaller (`blt`), stop (`ebreak`). Unknown words get an honest fallback card. Negative numbers and overflow come later (a side room in Course 1, the main path in Courses 2 and 4).

Pixel display (proposal): 16x16 screen at addresses 1024 to 1279, one byte per pixel, values 0 to 15 pick a palette colour; a view over `readMem(1024, 256)` with no emulator change.

## Revision (2026-10-06): the first lessons are much simpler

Owner feedback: the early assignments must be much, much simpler. Rule for the early lessons: ONE new idea, ONE student action, at most THREE cards, about THREE minutes. The machine starts small (one box visible, no pointing arrow, no hex, no jargon) and parts appear only when a lesson needs them. The program's final `ebreak` is hidden and shown only as "the end of the list" until a later lesson introduces the Stop card.

New opening ladder, replacing the old lessons 1 to 3:

1. Press the button: one card, "Put 5 into the box"; press Step; a 5 appears. Cannot fail.
2. Change the number: the same card with a spinner; make the box show 9.
3. Last one wins: put 3, then put 8 in the same box; predict 8 (a box holds one number; a new one replaces it).
4. Two boxes: a second box appears; put 4 in A and 6 in B; make B hold 9 by changing one card.
5. Add: put 5, put 7, add them into a third box; predict (the 57 misconception), then 12. This is the old lesson 1.
6. In order: the pointing hand appears; drag two cards into the right order so the add works.
7. Add one: the card "add 1 to the box"; make the box show 3 with three cards.
8. Make it count to 7: seven copies is tedious, which motivates loops later.

The first ten-minute session is lessons 1 to 4. After this ladder the earlier plan resumes at a similarly slow pace: flip a card to see its number, lamps and binary, fields, the pixel, then decisions and loops. The table below is the earlier plan and should be renumbered after the ladder.

## Course 1: The Machine Follows a List (13 micro-lessons)

1. Wake the Machine (step a four-card program; a2 = 12; cannot fail)
2. Change One Number (spinner on a card; a2 = 42)
3. Build a List (drag cards; a3 = 10)
4. The Heartbeat (fetch, do, move on; the arrow is the program counter)
5. Shelves with Numbers (memory addresses; `sw` and `lw`)
6. Flip the Card (a card is one big number; match cards to lamp patterns)
7. Counting with Lamps (binary, carry)
8. Inside the Number (fields; flip bit 30 to turn add into sub)
9. Make Your Own Instruction (set lamps for "Put 9 in box a0" = `0x00900513`)
10. Light a Pixel (`sb t0, 1024(zero)`)
11. A Fork in the Road (branch)
12. Round and Round (a loop painting 16 pixels; steps as cost: 52 steps for 7 cards versus 18 for 18)
13. Boss: The Picture Machine

Lessons 1 to 8 need no typing; Course 1 never requires typing.

Roadmap: Course 2 Names for Numbers (assembly, typing begins, negatives, ecall output); 3 Calls and the Stack; 4 C, Seen Through Glass (the Compilation Explorer); 5 Memory You Ask For (pointers, heap); 6 C++; 7 Rust (optional) then problem solving.

## Diagrams (live views of the real machine, never canned video)

Every diagram is a pure function of the machine's recorded state; a timeline scrubs via `step` and `stepBack`; play, pause, step, scrub and speed controls everywhere; reduced motion shows highlighted changes plus captions and an `aria-live` log. Implementation: React + SVG + CSS transitions, with the small Motion `animate()` only for token flights. Canvas, Lottie and Rive were rejected (accessibility, testability, being a live model, size).

D1 clerk and boxes; D2 shelves (memory); D3 fetch-do-move-on CPU; D4 binary lamps; D5 card flip; D6 program counter walk; D7 carry ripple; D8 field bands; D9 shelves to screen; D10 fork; D11 loop track; D12 plate stack; D13 call as bookmark; D14 elevator of levels (compiling).

## Coach and lesson player

A lesson is a directory: `lesson.yaml` (scenes), `checks.feature` (real Gherkin), `solutions/` with declared stars, `ghosts/` for Show me. A scene has narration, diagrams, spotlight, an optional prediction, `until` conditions, wrong-answer branches, three hints, a ghost script, and UI locks. Scene conditions and Gherkin checks share one step vocabulary implemented once in a pure TypeScript library; CI runs every reference solution through it. Progress lives behind a `ProgressStore` interface (localStorage per user first): pass, bonuses, best card and step counts, hints, Show me use, prediction accuracy, and per-concept mastery (Leitner boxes). Each session opens with one predict-the-result warm-up from the weakest older concept. The path shows one primary [Continue] button, the next lesson dim, later ones in fog, side rooms as small doors.

## Gamification (revised)

Keep: pass star plus up to two bonus stars; par scores from lesson 12; side rooms opened by stars (Below zero, Hex secrets, Make a sprite); a Gallery of things made; an Instruction Deck of cards used in passing programs. Early bonus types: Called it (correct prediction), Another way, Fewer cards, Twist. Quiet discovery badges (First crash, Stubborn zero, Time traveller, Bit flipper). Cut: separate Quick and Lean stars in Course 1, the separate Insight star. Stars never block the path; Show me never removes the pass star; crashes are exhibits.

## Engineering breakdown (dependency order)

E1 `describe(word)` English card text (S); E2 lesson step library (M); E3 lesson format, loader and authoring CLI that runs reference solutions (M); E4 timeline with trace recorder and scrub (M); E5 diagram kit with reduced-motion captions (L); E6 scene engine and coach (L); E7 cards view and card editor (M); E8 drag-and-drop program builder (M); E9 bit-lamp widget (M); E10 pixel display (S); E11 stuck detection, hint ladder, Show me ghost (M); E12 progress store, mastery, warm-up (M); E13 course path, Now-you-can card, Gallery, Deck (M).

Smallest vertical slice for lesson 1 alone: E1, E2, minimal E3, E4, E5 (D1 only), E6 (say, spotlight, until, number prediction), a hard-coded end card, and a minimal E12 pass flag.

## Risks and defaults

Pilot lessons 1 to 4 with the student alone before authoring the rest; log stuck events, hints and Show me; keep "I'm stuck" always visible; real register names and a faint assembly chip avoid a clash with Course 2; captions always on, audio later; precompile `.feature` files to JSON at build time; pilot rule: if more than 20 percent of goals need rung 3 or Show me, or a lesson is abandoned twice, rewrite it before building further.
