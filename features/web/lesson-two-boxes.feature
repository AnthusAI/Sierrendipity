@web @coach
Feature: Lesson 04 Two Boxes never leaves the student stuck
  A student can change either card, type a wrong number, or run the machine too few times. Every run that
  misses the goal says what the machine did and what to change, and Start again puts the first cards back.

  Scenario: Both cards run and the lesson moves to the change goal
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    Then the coach confirms "Each card filled its own box"
    And the coach marks the next goal with the words "NEXT GOAL"
    And the coach says "Change one card so that box a1 holds 9"

  Scenario: Changing card 2 to 9 and stepping twice completes the lesson
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I set the number on card 2 to 9
    And I press Step
    And I press Step
    Then box "a1" shows 9
    And the Now you can card is shown
    And the stored progress of "c1/04-two-boxes" has passed

  Scenario: A third Step after the lesson is complete changes nothing
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I set the number on card 2 to 9
    And I press Step
    And I press Step
    Then the Now you can card is shown
    And the stored progress of "c1/04-two-boxes" has passed

  Scenario: Changing card 1 instead of card 2 says what went wrong and offers Start again
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I set the number on card 1 to 9
    And I press Step
    And I press Step
    Then the missed-goal help says "Box a0 must hold 4 and box a1 must hold 9"
    And the missed-goal help offers Start again
    When I select Start again in the missed-goal help
    Then there is no missed-goal help
    And the number on card 1 is 4
    And the number on card 2 is 6
    And the lesson shows the step count 0
    When I set the number on card 2 to 9
    And I press Step
    And I press Step
    Then the Now you can card is shown

  Scenario: Changing card 1 as well as card 2 leaves box a0 wrong, and the coach says so
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I set the number on card 1 to 5
    And I set the number on card 2 to 9
    And I press Step
    And I press Step
    Then the missed-goal help says "Box a0 must hold 4"
    And the missed-goal help offers Start again
    When I set the number on card 1 to 4
    And I press Step
    And I press Step
    Then the Now you can card is shown

  Scenario: A wrong number on card 2 says what went wrong and Try again keeps the cards
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I set the number on card 2 to 96
    And I press Step
    And I press Step
    Then the missed-goal help says "Box a1 must hold 9"
    When I select Try again
    Then the number on card 2 is 96
    And the lesson shows the step count 0
    When I set the number on card 2 to 9
    And I press Step
    And I press Step
    Then the Now you can card is shown

  Scenario: Running the machine on the first cards in the change goal says what to change
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I press Reset
    And I press Step
    And I press Step
    Then the missed-goal help says "Box a0 must hold 4 and box a1 must hold 9"
    And the missed-goal help does not offer Start again

  Scenario: Only one Step after the change shows no missed help yet
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I set the number on card 2 to 9
    And I press Step
    Then there is no missed-goal help
    And the lesson shows the step count 1

  Scenario: Reloading in the middle of the lesson starts the lesson goal again
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    And I set the number on card 2 to 9
    And I reload the lab
    And I press Step
    And I press Step
    Then the coach confirms "Each card filled its own box"
