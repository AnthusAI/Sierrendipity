@web @coach @function
Feature: The function lessons 08 and 09 work in the browser
  The builder, the saved card f and the rule banner play together in the real player. These scenarios drive the
  lessons c1/08-make-your-own-card and c1/09-use-it-again in the coach lab.

  Scenario: Lesson 08 saves the card f, takes a table for 7 and runs the card
    Given the coach lab shows lesson "c1/08-make-your-own-card"
    When I use "Select" in the lesson's builder
    And I tick the card 1 and the card 2 in the lesson's builder
    And I use "Save as card" in the lesson's builder
    Then the lesson's program shows the card "f"
    And the coach says "Fill in the table for x = 7."
    When I fill the table with "50"
    And I submit the table
    Then the coach says "Type 7 for x above the boxes."
    When I type 7 for x
    And I press Step
    And I press Step
    And I press Step
    And I press Step
    Then box "a0" shows 50
    And the rule banner says "Box a0 holds 50. This is the same as the rule."
    And the coach confirms "Your card f gives 50 for 7"

  Scenario: Lesson 09 starts with a card that changes nothing and gives the card f in the tray
    Given the coach lab shows lesson "c1/09-use-it-again"
    Then the lesson's program has 1 cards
    And the stage shows "tray"
    When I drag the tray card "f, uses box a0, answer in box a0" into the lesson's program
    Then the lesson's program shows the card "f"
    And the coach says "What will it give for x = 5?"
