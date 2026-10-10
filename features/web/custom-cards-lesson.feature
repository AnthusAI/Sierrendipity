@web @coach @function
Feature: A lesson can ask the student to save cards as one custom card
  In a scene with a save, the student selects cards in the program and saves them as one named card. The list
  then calls that card, and the machine really makes a call and returns from it. Show me does the same on a
  copy. These scenarios drive the fixture lesson x1/06-custom-card.

  Scenario: The student selects two cards and saves them as the card the scene names
    Given the coach lab shows lesson "x1/06-custom-card"
    Then the lesson's program has 2 cards
    When I use "Select" in the lesson's builder
    And I tick the card 1 and the card 2 in the lesson's builder
    And I use "Save as card" in the lesson's builder
    Then the lesson's program has 1 cards
    And the lesson's program shows the card "Square-plus-one"
    And the lesson's builder says "You made the card \"Square-plus-one\"."
    And the coach confirms "You made a card."

  Scenario: The new card is a real call and the rule agrees with it
    Given the coach lab shows lesson "x1/06-custom-card"
    When I use "Select" in the lesson's builder
    And I tick the card 1 and the card 2 in the lesson's builder
    And I use "Save as card" in the lesson's builder
    And I type 3 for x
    And I press Step
    Then the lesson shows the step count 1
    And the rule banner says "The program has not finished. Box a0 holds 3."
    When I press Step
    And I press Step
    And I press Step
    Then box "a0" shows 10
    And the rule banner says "Box a0 holds 10. This is the same as the rule."
    And the coach confirms "The new card did the work."

  Scenario: Saving needs the number of cards the scene asks for
    Given the coach lab shows lesson "x1/06-custom-card"
    When I use "Select" in the lesson's builder
    And I tick the card 1 in the lesson's builder
    Then the button "Save as card" in the lesson's builder is not available
    And the lesson's program has 2 cards

  Scenario: The controls for a save have names a screen reader can read
    Given the coach lab shows lesson "x1/06-custom-card"
    When I use "Select" in the lesson's builder
    Then the lesson's builder has a checkbox named "Select card 1"
    And the lesson's builder has a checkbox named "Select card 2"
    And the lesson's builder has a list named "Program"
    And the lesson's builder has a region named "Card tray"

  Scenario: A scene without a save offers no way to make a card
    Given the coach lab shows lesson "x1/03-builder" at the scene "build"
    Then the lesson's builder has no button named "Select"

  Scenario: Show me selects and saves the cards on a copy
    Given the coach lab shows lesson "x1/06-custom-card"
    When I ask to be shown
    Then the ghost pointer is on "card:0"
    When the clock advances 1 seconds
    Then the lesson's program shows the card "Square-plus-one"
    When the clock advances 5 seconds
    Then the lesson's program has 2 cards
    And the lesson's program shows no card "Square-plus-one"
    And the coach says "Your turn"
