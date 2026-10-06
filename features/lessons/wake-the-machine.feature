Feature: Lesson 1, Wake the Machine
  The first lesson is authored as data and proven by running its reference solutions.

  Background:
    Given the lesson "c1/01-wake"

  Scenario: The lesson loads and has the shape the design asks for
    Then the lesson loads from disk
    And the lesson has 7 scenes
    And every scene says at most 2 sentences
    And the starter is the four cards "0x00500513 0x00700593 0x00b50633 0x00100073"
    And the lesson introduces "cards, boxes, add, stop"
    And the lesson has a ghost for every Show me

  Scenario: The starter wakes the machine: a2 is 12 after 4 steps
    When the starter program runs
    Then the phrase "the machine halted normally" passes
    And the phrase "box a2 holds 12" passes
    And the phrase "the machine has taken 4 steps" passes

  Scenario: The prediction scene expects 12 and answers the common wrong guess of 57
    Then the scene "predict" asks for the number 12 for "a2"
    And the scene "predict" answers a guess of 57 with a "watch" reply that goes to "watch-add"

  Scenario: The scenes finish when their conditions hold
    When the starter program runs
    Then every scene condition holds at the end, except "the student rewound"

  Scenario: Solutions earn exactly the declared stars
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass, called-it" in 4 steps with 4 cards
    And the solution "good-asm.s" earned "pass, called-it" in 4 steps with 4 cards
    And the solution "good-wrong-guess.hex" earned "pass" in 4 steps with 4 cards
    And the solution "wrong-sub.hex" earned "nothing" in 4 steps with 4 cards
    And the solution "wrong-no-stop.hex" earned "nothing" in 3 steps with 3 cards
    And the solution "wrong-doubles.hex" earned "nothing" in 4 steps with 4 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 2 changes one number
    Given the lesson "c1/02-change-one-number"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass" in 4 steps with 4 cards
    And the solution "another-way.hex" earned "pass, another-way" in 4 steps with 4 cards
    And the solution "unchanged.hex" earned "nothing" in 4 steps with 4 cards
    And the solution "forever.s" was stopped by the step cap
