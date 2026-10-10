@web @coach
Feature: A reached goal is celebrated
  A missed goal looks plainly wrong, so a reached goal looks plainly right: a thick green outline, a check
  icon and the word "Right!", a pop, a green flash on the boxes and a small burst of confetti. The way on
  (Continue, Next lesson, Stop here) appears only when the celebration has finished, and focus moves to it.
  With reduced motion the outline and icon stay, and nothing waits.

  Scenario: A finished goal in lesson 02 is celebrated and Continue waits for it
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I set the number on card 1 to 9
    And I select Run
    Then the coach celebrates with a thick green outline, a check icon and the words "Right!"
    And the boxes flash green
    And the confetti is shown
    And the coach offers no Continue button
    When the celebration ends
    Then the coach offers a Continue button
    And the focus is on "Continue"

  Scenario: A finished goal in lesson 04 is celebrated
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Step
    And I press Step
    Then the coach celebrates with a thick green outline, a check icon and the words "Right!"
    And the boxes flash green

  Scenario: A right prediction is celebrated
    Given the coach lab shows lesson "c1/03-last-one-wins"
    When I answer 8
    Then the coach celebrates with a thick green outline, a check icon and the words "Right!"

  Scenario: The end card is celebrated more and its buttons wait
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And I select Run
    Then the Now you can card is shown
    And the coach celebrates the end of the lesson with the words "The lesson is done"
    And the Now you can card offers no "Next lesson, about 3 min" button
    And the Now you can card offers no "Stop here" button
    When the celebration ends
    Then the Now you can card offers "Next lesson, about 3 min" and "Stop here"
    And the focus is on "Next lesson, about 3 min"

  Scenario: A screen reader hears the celebration and the confetti is hidden from it
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I set the number on card 1 to 9
    And I select Run
    Then the celebration is a polite status named by "Right!"
    And the check icon and the confetti are hidden from screen readers

  Scenario: With reduced motion the outline stays and nothing waits
    Given the coach lab shows lesson "c1/01-press-the-button" with reduced motion
    When I press Continue
    And I select Run
    Then the coach celebrates with a thick green outline, a check icon and the words "Right!"
    And the confetti is not shown
    And the celebration does not move
    And the Now you can card offers "Next lesson, about 3 min" and "Stop here"

  Scenario: A missed goal is not celebrated
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I select Run
    Then the missed-goal help says "the goal is 9"
    And there is no celebration

  Scenario Outline: The success outline is visible in <theme> <mode> mode
    Given the coach lab shows lesson "c1/02-change-the-number" in the "<theme>" theme and <mode> mode
    When I set the number on card 1 to 9
    And I select Run
    Then the celebration outline meets 3:1 contrast on the panel
    And the celebration text meets 4.5:1 contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |
