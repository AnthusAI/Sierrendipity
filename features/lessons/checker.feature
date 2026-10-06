Feature: The lesson checker runs every reference solution
  The authoring checker runs each solution through the machine and the lesson's checks, and compares
  the stars earned with the stars the lesson declares. Any difference is an error.

  Background:
    Given a valid test lesson
    And the known concepts are "machine, boxes"

  Scenario: A correct lesson passes and reports each solution
    When I check the lesson
    Then the check passes
    And the solution "good.s" earned "pass, called-it" in 2 steps with 2 cards
    And the solution "wrong.s" earned "nothing" in 2 steps with 2 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario Outline: Each kind of broken declaration is reported
    When I replace "<find>" with "<replace>" in "<file>"
    And I check the lesson
    Then the check fails with "<message>"

    Examples:
      | file                      | find                                   | replace                                | message                               |
      | solutions/solutions.yaml  | {file: wrong.s, earns: []}             | {file: wrong.s, earns: [pass]}         | declared to pass but fails @pass      |
      | solutions/wrong.s         | addi a0, zero, 6                       | addi a0, zero, 5                       | a wrong solution passes               |
      | solutions/solutions.yaml  | earns: [pass, called-it], predictions: {a0: [5]} | earns: [pass], predictions: {a0: [5]} | unexpected: called-it |
      | solutions/solutions.yaml  | predictions: {a0: [5]}                 | predictions: {a0: [6]}                 | missing: called-it                    |
      | solutions/solutions.yaml  | earns: [], capped: true                | earns: []                              | not declared capped                   |
      | solutions/solutions.yaml  | {file: good.s, earns: [pass, called-it] | {file: good.s, capped: true, earns: [pass, called-it] | declared capped      |
      | solutions/good.s          | addi a0, zero, 5                       | addi a0, zero, 6                       | good.s: declared to pass but fails @pass |
      | lesson.yaml               | expected: 5                            | expected: 6                            | warmup "five"                         |
      | lesson.yaml               | addi a0, zero, 5                       | jal zero, 0                            | does not halt                         |
      | solutions/solutions.yaml  | {file: wrong.s, earns: []}             | {file: wrong.s, earns: [pass]}         | need at least one wrong solution      |
      | solutions/solutions.yaml  | {file: forever.s, earns: [], capped: true} | {file: forever.s, earns: [pass], capped: true} | declared to earn pass         |

  Scenario: The step cap is per solution
    When I replace "{file: forever.s, earns: [], capped: true}" with "{file: forever.s, earns: [], capped: true, maxSteps: 7}" in "solutions/solutions.yaml"
    And I check the lesson
    Then the check passes
    And the solution "forever.s" ran 7 steps

  Scenario: The Gherkin parser agrees with the official one
    Then the official Gherkin parser agrees with ours about the checks
