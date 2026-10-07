# Educator review, 2026-10-07

Reviewed: `lessons/c1/01` to `05` (on the path) and the drafts `06` to `08`, on `develop` at `68d1217`.
Method: the skill `.claude/skills/educator-review`. I walked every lesson in the running app with Playwright as a
student (wrong guesses first, then right ones), then read the lesson files, `docs/course-1-design.md`,
`docs/curriculum-design.md`, `docs/lesson-format.md`, `docs/ui-design.md` and the coach code
(`web/src/coach/CoachPanel.tsx`, `engine.ts`, `web/src/course/WarmupCard.tsx`).

What I could not verify: no playtest notes or guardian report exist, so nothing here is evidence of what the
student does. The dev server at `localhost:5180` serves another checkout; its catalog and lesson text matched this
worktree in every screen I compared, but I did not diff them. I did not run `npm run lesson -- check --all`, a
screen reader, or keyboard-only play. Teaching-research claims are from the panel's published ideas, from memory,
with no quotations.

## 1. Verdict

The machinery is excellent: real RV32 words behind plain-English cards, a kind coach that never shows red, a free
three-rung hint ladder with Show me, specific replies to wrong guesses, live lamps with a running total, and a
loader that enforces the rules. The three biggest problems are these. First, the throughline the design promises
(functions, f(x) from Algebra 2) is gone: the planned lessons 6 to 9 ("In order", "Multiply", "Make your own card",
"Use it again", `course-1-design.md` lines 43-46) were replaced by flip, lamps and fields, so after eight lessons
the student has never made anything, the Gallery says "Nothing here yet", and the custom-card builder that already
exists (`docs/ui-design.md`, "Custom cards (functions)") is used by no lesson. Second, most of the work is reading
and selecting Continue, and most predictions can be answered by reading the screen, so an Algebra 2 student is
under-challenged and the "predict, then watch" habit becomes "copy, then watch". Third, lesson 6 is a cliff: its
first flip shows 32 lamps, five coloured bands, hex (`0x13`), powers of two up to 2^31 and "Lit lamps add up to
1049875" before lesson 7 has taught what a lamp is worth, and the controls change name and number at the same moment.

## 2. Panel voices

- **Seymour Papert.** Nothing in eight lessons belongs to the student. Every program is the starter, every number
  is set by the lesson, and the end card still says "You made: Put 5 in the box" (lesson 1) for a card the student
  did not make. The microworld has no project; the one object-to-think-with that this student already owns, the
  function, never appears. Give her the custom card f(x) = x squared plus 1 early and let her make her own rules.
- **Mitchel Resnick.** The floor is very low, but the walls are narrow and the ceiling is close. Edits are locked
  in most scenes (`lock: [edit, drag, toggle]` in 3, 5, 6 and most of 8), lesson 1 shows a minus and plus button
  that do nothing, and the only open moment ("You can try a different number", lesson 2 scene `another`) is one
  Continue away from the end. Let her tinker after each goal is met.
- **Mark Guzdial.** The notional machine is good and honest: cards run in order, a box holds one number, the log
  says "Box a0 changed from – to 5". But the cards are never read as a program with subgoals, and the builder (the
  Parsons-problem tool this course already has) is unused. A "put the cards in order so a2 holds 12" lesson is the
  cheapest Parsons problem possible and is in the plan.
- **Juha Sorva.** Prediction is in the right place in lessons 3, 5 and 8, but the engagement is shallow. A correct
  guess gets no acknowledgement (lesson 3, answer 8: the coach goes straight to "Select Run two times"), a wrong
  guess is explained before the student watches ("These cards do not add. The second number replaces the first
  number." appears above the Run button), and the student's own guess is never shown next to the result.
- **Felienne Hermans.** Reading before writing is respected and the card text is real text. Good. But the course
  never asks the student to read a program and say what it does in her own words, and the UI text does not keep
  the project's own STE rule: "Let's watch", "Let's see why", "I'm fine", "Want a nudge?", "Got it", "Skip the
  tour?" are in `CoachPanel.tsx` and `WarmupCard.tsx`, outside the checker.
- **John Sweller and Richard Mayer.** Lessons 1 to 5 keep load low, and the "one new element" rule is mostly kept.
  Lesson 6 breaks it badly (the flip lens, above), and it adds Back, Reset, "The desk", "the end of the list", the
  log, and renames Run to Step, all at once, with no word about any of them. Lesson 8 needs a scroll: the Step
  button is off-screen while the lamp the student must switch is visible (split attention). The coach often says
  the same question twice ("What does the box hold at the end?" then "What does the box hold after both cards?").
- **Robert Bjork.** Almost nothing here is a desirable difficulty. The lamps in lesson 7 are labelled 32 16 8 4 2 1
  while the question asks "What is the third lamp from the right worth?". The warm-ups contain their answers ("The
  card says: put 5 in the box ... what does the box show?", lesson 1; "The lamps on a card make 6 ... what does the
  box hold?", lesson 6). Retrieval practice that cannot be failed does not strengthen memory.
- **Lev Vygotsky.** The hint ladder is a fine scaffold, but it never fades. Lesson 5 still says "Select Run two
  times" and spotlights the Run button, after four lessons of exactly that. By lesson 4 the goal alone ("make box
  a1 hold 9") should be enough, with the spotlight only after a hint.
- **Mihaly Csikszentmihalyi and Carol Dweck.** The risk is boredom, not anxiety. Lesson 1 is six scenes for one
  button press (five are read-and-Continue). The framing of failure is kind and good ("Let's watch", no red, "Try
  again"). Praise is mostly honest, except "You made" for starter cards and "You can make any number this way"
  (lesson 7, six lamps make at most 63).
- **Alan Kay and Bret Victor.** Lesson 7 is the best thing in the course: switch a lamp, the card, the total and
  the box all change at once. Lesson 8's "one lamp turns Add into Subtract" is a real wow. Make this direct
  connection the rule everywhere, and connect it to the algebra the student owns: the flip already prints 2^30
  under lamp 30, so 42 = 1·32 + 0·16 + 1·8 + 0·4 + 1·2 + 0·1 is one sentence away.
- **Accessibility and plain language.** Strong: digits 1 and 0 inside the lamps (no colour-only meaning), text
  labels on bands, `aria-live` coach, number pad plus keyboard, reduced-motion spotlight. Weak: UI chrome is not STE
  (above); "its name is a label" (lesson 5 `meet`) is unclear; two bands are both called "exact job" (lesson 8);
  "lamp 30" is used but lamp numbering is never taught; an empty box is shown as "–" and called "empty" (lesson 1)
  but lesson 5 says "Box a2 starts at 0".

## 3. Lesson by lesson

Scores 1 (poor) to 5 (strong). P purpose, L cognitive load (5 = right-sized), A agency and making, Pr prediction
before reveal, F feedback and recovery, Fa scaffold fading, La language and accessibility, M motivation and pacing.

| Lesson | Verdict | P | L | A | Pr | F | Fa | La | M | Most valuable change |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 press-the-button | Gentle and clear, but five of six scenes are read-and-Continue for one Run | 2 | 5 | 1 | 1 | 4 | 3 | 4 | 2 | Cut to two scenes (card, Run) and open with one line about where the course goes: "Soon you will make your own card, like f(x) = x squared plus 1." |
| 02 change-the-number | The first real action; good `ifMissed` | 3 | 5 | 3 | 1 | 4 | 3 | 4 | 3 | Let the student pick the target ("Make the box show your favourite number") and say that the bonus star waits for a second number |
| 03 last-one-wins | The best prediction in the path; the reply explains too early | 3 | 5 | 1 | 4 | 3 | 3 | 4 | 3 | Reply "You said 11. Watch the box." then explain in `doneSay`; acknowledge a correct guess ("You called it") |
| 04 two-boxes | Repeats lesson 2 with a second box; the `change` scene has no `ifMissed` | 2 | 5 | 3 | 1 | 3 | 3 | 4 | 2 | Merge into lesson 3 or add a prediction ("Which box changes?"), and add `ifMissed` to `change` |
| 05 add | Clear, but 5 + 7 is not a prediction for an Algebra 2 student; the hint "To add is to put two amounts together" talks down | 3 | 4 | 1 | 3 | 3 | 2 | 3 | 2 | Make the student change a card to reach a goal ("Make a2 hold 20") and say "a2 = a0 + a1, like a rule in algebra" |
| 06 flip-the-card (draft) | A cliff: the flip shows everything; the match tasks are answered by reading "Lit lamps add up to 3" | 2 | 1 | 1 | 2 | 3 | 2 | 3 | 2 | Move after lesson 7, show only the number band in the flip, hide the total in the match tasks |
| 07 counting-with-lamps (draft) | The best lesson: direct manipulation with good fading (`allowedBits` widens toward 42) | 3 | 3 | 4 | 2 | 4 | 3 | 3 | 4 | Hide the worth labels for the `place` question; end with one number made with the total hidden |
| 08 inside-the-number (draft) | A real wow (one lamp turns Add into Subtract), but the band question is word-matching and the prediction gives the operation away | 3 | 2 | 2 | 2 | 3 | 2 | 2 | 4 | Ask "After lamp 30 switches on, what will the card say?" (a choice), hide hex, give the two "exact job" bands different names, keep Step and lamps on one screen |

## 4. Cross-cutting recommendations (ranked by value over cost)

1. **Put the function lessons back, using the builder and custom cards that already exist.**
   Problem: the throughline is missing and the student makes nothing. Evidence: `course-1-design.md` lines 43-46
   plan "In order", "Multiply", "Make your own card" (f(x) = x squared plus 1, get 50 for 7) and "Use it again";
   `lessons/c1` has none of them; `docs/ui-design.md` documents the finished builder, "Save as card" and "Peek
   inside"; `/learn/gallery` says "Nothing here yet" after eight lessons. Change: author those four as lessons 6
   to 9 on the path and move flip, lamps and fields after them (the design's own line 50 order). Save the custom
   card to the Gallery. Panel: Papert, Resnick, Guzdial, Kay. Effort M (content, not engine). Test in one session:
   after "Make your own card", ask the student without help "What does your card give for 3?" and "Make a card for
   2x + 1"; success is both without Show me.
2. **Ask questions that need thought, and show the guess next to the result.**
   Problem: predictions and warm-ups can be answered by reading the screen. Evidence: lesson 7 `place` with labels
   32 16 8 4 2 1 visible; lesson 6 `match-one` with "Lit lamps add up to 3"; lesson 8 `predict` says "the card
   subtracts"; warm-ups `one-card`, `change-the-six`, `lamps-six`, `lamps-five` contain the answer. Change: hide
   the label or total the question is about; warm-ups that need one inference (two cards, a different box, an add);
   in replies, show "You said N" and move the explanation to after the watch; add a short line for a correct guess.
   Panel: Bjork, Sorva, Dweck. Effort S (lesson text, one coach line). Test: prediction accuracy in the progress
   store should land near 60 to 85 percent, not 100; ask the student to explain one wrong guess in her own words.
3. **Cut the tours: show, then tell, at most one Continue scene per lesson.**
   Problem: reading replaces doing. Evidence: lesson 1 scenes `meet`, `the-card`, `the-box`, `did-it`, `big-idea`
   are Continue-only (one action in six scenes); about half of all scenes in 01 to 05 are Continue-only; lesson 5
   spends two scenes on "its name is a label" and "A log below the boxes lists each change". Change: merge each
   tour line into the scene that needs it (`say` next to the action), keep one closing line as `doneSay`. Panel:
   Papert, Csikszentmihalyi, Mayer (coherence). Effort S. Test: time to first action under 20 s per lesson; watch
   whether she reads or just selects Continue.
4. **Remove the lesson 6 cliff.** Problem: too many new elements at once. Evidence: the flip lens in lesson 6 shows
   bands, hex `0x13`, "first box zero", 2^20 to 2^31 and "1049875"; the same lesson adds Back, Reset, "The desk",
   "the end of the list", the log, and renames Run to Step (06 to 08 have no `ui` block). Change: order lamps (07)
   before flip (06); give the flip a "number only" lens in 06 and the bands in 08; add a `ui` block to 06 to 08 that
   keeps Run and introduces one control per lesson with one line. Panel: Sweller, Vygotsky. Effort S to M (a lens
   option in D5 may need code). Test: no Show me in lesson 6; the student can say what the lit lamps mean.
5. **Name the algebra from lesson 4 on.** Problem: an Algebra 2 student is not told that she already knows this.
   Evidence: no lesson text mentions variables, rules or f(x); `course-1-design.md` says "move faster on math ideas
   than on machine ideas". Change: one line each: lesson 4 "A box is like a variable: it has a name and holds a
   number"; lesson 5 "This card is the rule a2 = a0 + a1"; lesson 7 "Each lamp is a power of 2" (the flip already
   prints 2^n). STE allows this. Panel: Papert, Guzdial, Hermans. Effort S. Test: ask "Where have you seen this
   before?" after lesson 5.
6. **Fade the scaffolds.** Problem: every goal comes with step instructions and a spotlight. Evidence: lesson 5
   `fill` and `watch-add` say "Select Run two times" / "Select Run" with `spotlight: button:step`. Change: from lesson
   4, state only the goal; show the spotlight after the first hint (the engine already does this after "Skip the
   tour"). Panel: Vygotsky, Bjork. Effort S. Test: rung 3 or Show me under 20 percent of goals (the design's pilot rule).
7. **Open the walls: one optional challenge per lesson, stated at the start, and let the student edit after the goal.**
   Evidence: `another-way` (02) and `below-zero` (08) are the only open tasks, and the student is not told a star
   exists; the end card in the coach does not show stars. Change: one "Try this too" line per lesson (for example,
   lesson 2 "What is the biggest number a card can hold?"; spinner limits are -2048 to 2047, a good surprise), unlock
   edits once the goal is met, show stars on the end card. Panel: Resnick, Papert, Csikszentmihalyi. Effort S.
   Test: does she try the challenge without being asked (the design's own pilot measure).
8. **Make the end card honest.** Evidence: "You made: Put 5 in the box. The box holds 5." (lesson 1) when nothing
   was made; "You can make any number this way" (lesson 7) with six lamps. Change: "You ran" for starter cards,
   "You made" only for edited or built cards; qualify the lamps line. Panel: Dweck. Effort S.
9. **Apply STE to the UI chrome.** Evidence: "Let's watch", "Let's see why", "I'm fine", "Want a nudge?", "Got it",
   "Skip the tour?" (`CoachPanel.tsx`, `WarmupCard.tsx`); `docs/lesson-format.md` requires no contractions. Change:
   "Watch why", "I am fine", "Do you want a hint?", "Close". Also: show an empty box as 0 or say "empty" everywhere.
   Panel: Hermans, plain-language. Effort S.
10. **Pilot before authoring more.** Evidence: `course-1-design.md` "Pilot lessons 1 to 4 with the student alone
    before authoring the rest"; eight lessons exist and no playtest notes. Change: one 15-minute session on 01 to 05
    with the progress export kept. Effort S. This is the cheapest way to settle section 8.

## 5. What to stop doing

- Read-and-Continue tour scenes that explain a part before the student needs it.
- Explaining in a wrong-answer reply before the student watches (the reply should send her to look).
- Questions whose answer is printed on the screen, and warm-ups that repeat their answer.
- Locking edits after the goal is met.
- Showing every lens of a card at once (the D5 flip in lesson 6).
- Authoring new lessons before the pilot the design asks for.
- Letting docs drift: `README.md` still says "Languages: Python, C, C++" and `curriculum-design.md` still plans
  Python window lessons and a Workshop "from week one", against `course-1-design.md` ("No Python lessons"; Workshop
  "starts with C in Course 4").

## 6. Goals and values

Goals this curriculum should state, in plain words, with measures:

1. **She can say what a program does before it runs.** Measure: first-guess prediction accuracy on questions that
   need one inference, 60 to 85 percent, and explain-back of one wrong guess per session.
2. **She sees programming as functions, the idea she already owns.** Measure: after the custom-card lessons she
   makes a card for a rule she chooses (for example 2x + 1) and checks f(3) without help.
3. **She makes things she wants to show someone.** Measure: Gallery items she made, and whether she shows one to
   the guardian without being asked.
4. **She knows that the machine is only numbers, and that it is honest.** Measure: given lamps, she says which card
   they are (with no total shown); she can predict what one switched lamp does.
5. **She chooses to come back.** Measure: "Want another one?" yes at the end card; sessions started without a
   reminder; challenges tried without prompting.
6. **She recovers from being stuck on her own.** Measure: rung 3 or Show me under 20 percent of goals; no lesson
   abandoned twice (the design's existing pilot rule).

Where our stated principles are broken or wrong (`course-1-design.md`):

- "At most two short sentences on screen": the coach often shows four or more (lesson 5 `predict`: the `doneSay`,
  two `say` sentences and the question; lesson 3 after a wrong guess: two `say` sentences and a two-sentence reply).
- "Ask before telling": wrong-answer replies tell before the watch; lessons 1, 4 and 6 have no question at all.
- "Avoid fake praise": "You made" for starter cards.
- "Move faster on math ideas than on machine ideas": not done; the math ideas are absent.
- "Pilot lessons 1 to 4 ... before authoring the rest": not done.
- The rule "ONE new idea, ONE action, THREE cards, THREE minutes" is right for the interaction, but it is wrong if
  read as "ideas below the student's level". An Algebra 2 student can take a richer idea per lesson with the same
  single action. The rule should say "one action", not "a small idea".

## 7. Questions for the guardian (only a playtest can answer)

1. In lessons 1 to 4, does she read the coach text, or select Continue without reading?
2. Is she bored by lessons 1 to 5? At which lesson does she first look interested?
3. Does she guess 57 for 5 + 7, or anything like it? (If not, the misconception list targets younger learners.)
4. Does she type numbers in the card spinner, use plus and minus, or not find either?
5. In lesson 6, what does she say the lamps are? Does she use the total line to answer?
6. Does she try any bonus without being told it exists?
7. Does she want to make something to show you? What would she want to make?
8. Does she notice that Run became Step in lesson 6, and does it confuse her?
9. Does she say "f(x)" or "function" by herself at any point?
10. After how many minutes does she want to stop?

## 8. Open disagreements in the panel

- **Simplicity (the owner's "much, much simpler") against challenge (Bjork, Papert, Csikszentmihalyi).** The owner
  asked for very simple early lessons; the panel thinks lessons 1 to 5 are now too easy for Algebra 2.
  Recommendation: keep one action per lesson and the tiny machine, but merge lessons 3 and 4, put a real question
  in every lesson, and add an optional challenge. Let the pilot decide (question 2).
- **Machine first (Patt and Patel, Kay) against function first (Guzdial, Hermans).** Recommendation: keep the
  machine-first constraint (it is the project's choice and it is working in lessons 1 to 5), but reach "Make your
  own card" by lesson 8 at the latest, so the student meets the function as a machine-level object.
- **Running totals (Victor: immediate feedback) against hidden totals (Bjork: retrieval).** Recommendation: show
  the total while she makes a number, hide it when she is asked to read one.
- **Predict everywhere (Sorva) against flow (Csikszentmihalyi).** Recommendation: predict only when the answer
  needs one inference; a trivial prediction teaches that predictions are a formality.

## Skill feedback

- Clear: the panel, the method and the output structure are easy to follow, and "Recommend; do not survey" and
  "never invent quotations" kept the review focused.
- Conflict: "Walk them as the student: do not read the answers first" comes after "Inputs to read first", which
  lists every `lesson.yaml` (with the answers). Put the walk first, then the files.
- Missing: how to reach lessons 2 and later in a fresh browser (the `sierrendipity:progress:local` seed), that
  drafts play only at `?draft=1`, and that a seeded "smooth" history triggers the "Quick version?" offer. Say
  whether draft lessons are in scope (I included them).
- Missing: the STE check should cover UI chrome strings in `web/src`, not only lesson text; the skill should say so.
- Missing: score anchors for 1 and 5 per lens, so two reviews can be compared; a check of docs against lessons
  (drift such as the README and the lost function lessons was the most important finding here).
- Consider adding a mathematics-education voice (research on the function concept as process and object), since
  the throughline is algebra, and say whether the review may file Kanbus issues ("Do not edit ... the board").
- The eight-lens table is wide; a short verdict column plus the one change carries most of the value.
