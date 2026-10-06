import assert from "node:assert/strict";
import { assemble } from "@sierrendipity/explorer";

import type { LessonRun } from "@sierrendipity/lesson-core";

/** State shared between the lesson step files. */
export const world: { run?: LessonRun } = {};

/** Assemble a one-line program where ";" separates lines. */
export function assembleOrThrow(source: string): number[] {
  const result = assemble(source.replace(/;/g, "\n"));
  assert.deepEqual(result.errors, [], `the program should assemble: ${source}`);
  return result.words;
}

/** A minimal valid lesson as an in-memory file map, used by the loader and checker specs. */
export function validTestLesson(): Record<string, string> {
  return {
    "lesson.yaml": `id: c1/99-test
title: Test lesson
minutes: 5
concepts:
  introduces: [machine]
  requires: []
starter:
  hex: ["0x00500513", "0x00100073"]
tabs: [cards, boxes]
scenes:
  - id: intro
    say: This is a test. It has two short sentences.
    show: [cards]
  - id: step
    say: Press Step.
    spotlight: "button:step"
    ask:
      kind: number
      question: What will a0 hold?
      target: a0
      answer: 5
    until:
      - the machine has taken 1 step
    hints:
      - Look at the Step button.
      - It is on the right.
      - Press it once.
    showMe: demo
    onWrong:
      - match: 57
        say: Close.
        goto: intro
    lock: [edit]
    skippable: true
nowYouCan:
  - Step a program.
warmups:
  - id: five
    concept: machine
    question: What lands in a0?
    program:
      asm: |
        addi a0, zero, 5
        ebreak
    target: a0
    expected: 5
`,
    "checks.feature": `Feature: Test lesson

  @pass
  Scenario: It puts 5 in box a0
    Then the machine halted normally
    And box a0 holds 5

  @bonus @star=called-it
  Scenario: Called it
    Then the student's first prediction for "a0" was 5
`,
    "solutions/solutions.yaml": `solutions:
  - {file: good.s, earns: [pass, called-it], predictions: {a0: [5]}}
  - {file: wrong.s, earns: []}
  - {file: forever.s, earns: [], capped: true}
`,
    "solutions/good.s": "addi a0, zero, 5\nebreak\n",
    "solutions/wrong.s": "addi a0, zero, 6\nebreak\n",
    "solutions/forever.s": "loop: jal zero, loop\n",
    "ghosts/demo.json": `{
  "id": "demo",
  "events": [
    {"at": 0, "type": "point", "target": "button:step"},
    {"at": 100, "type": "press", "control": "step"},
    {"at": 500, "type": "press", "control": "back"}
  ]
}
`,
  };
}
