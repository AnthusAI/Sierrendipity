# Curriculum design: machine code first, then assembly, then C

Condensed from a learning-design review (2026-10-06). Pedagogy and ISA facts there came from memory, not search; encodings in the sample lessons should be checked with an assembler before use.

## Stance

- Order: machine code first, but as a short microworld with a visible effect (a 16x16 pixel display at memory-mapped addresses), so there is a turtle-like payoff. The student unlocks the assembler as a reward after hand-encoding a few instructions.
- Each course ends with a "window" lesson: the same idea one level up (C next to the instructions the student wrote by hand). There are no Python lessons (`course-1-design.md`).
- A parallel Workshop track of native C and C++ practice problems starts with C in Course 4, so problem-solving payoff follows the machine ideas it needs.
- SICP itself starts in Scheme and reaches register machines in chapter 5; machine-code-first was the instructors' choice. Patt and Patel (LC-3) is the closest published precedent.
- Run a one or two week pilot with the student before building much beyond lesson 1.1. Measure bonuses attempted without prompting, prediction accuracy, explain-back, and "want another one?". If the C-first contrast session wins, reorder; the lesson format and tools carry over.

## Courses

1. The Machine Reads Numbers: edit and step real RV32 words; `addi add sub sw ebreak`; Machine, Display, Bits tabs.
2. Names for Numbers: assembly, labels, loops, `beq bne blt jal lw li mv`, `mul div rem`; ecall putchar, getchar, exit.
3. Calls and the Stack: calling convention, recursion, stack depth.
4. C, Seen Through Glass: Explorer (C and assembly), `-O0` versus `-Og`, int width and overflow.
5. Memory You Ask For: pointers, structs, heap, linked lists.
6. C++: Same Machine, More Words (compile-and-show; STL work runs natively).
7. Rust, the Compiler as Coach (later).

Tool-building exercises (an `encode_addi` function, then a disassembler) use C.

## Gamification

- One pass star is required; up to two independent bonus stars per lesson: Lean (instruction count), Quick (cycles), Twist (a creative extension), Insight (a checkable prediction or bug hunt).
- Par comes from the author's reference solution. No leaderboards, XP, streaks, timers, lives, or notifications.
- Passes unlock courses; stars open optional side rooms, never block the path.
- A three-rung hint ladder that never costs anything; crashes become exhibits; step back is always available.
- Celebrate creations: a Gallery of framed programs and an Instruction Deck of instructions the student has used in passing programs.

## Right pane and bottom pane

Tabs: Lesson, Machine (registers, PC), Memory, Display, Explorer, Bits, Stack, Heap, Progress. A lesson declares its default tabs. The bottom pane is program I/O (the xterm terminal) with a checks strip showing each case's expected versus observed result. Colour is always paired with a text label; everything is keyboard-operable.

## Lesson format

One directory per lesson: `lesson.md` (frontmatter, text, hints), `starter/`, `checks.feature` (Gherkin with a small fixed step vocabulary: registers, memory, stdout, exit code, step limit, instruction counts, whitelist, bit distance), and `solutions/` with the stars each should earn. A CLI runs every reference solution through the same TypeScript emulator and fails if it earns different stars than declared. Progress lives in `localStorage` first behind a store interface.

## First lessons

1.1 Wake the Machine: four words that set a0=5, a1=7, a2=a0+a1, halt; make a2 equal 42 by changing one word; bonuses flip one bit (`add` to `sub`) and make a2 zero (two's complement). 1.5 Be the Assembler: hand-encode three instructions to light a pixel. 2.3 Multiply Without `mul`: a loop with an instruction whitelist and size and cycle stars. 4.1 Glass Box: C `for` loop in the Explorer, `-O0` versus `-Og`, and the overflow at n = 65536. 5.2 Who Lives Where: build a linked list and watch stack and heap.
