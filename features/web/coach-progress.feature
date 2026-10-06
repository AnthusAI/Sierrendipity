@web @coach
Feature: The coach records progress and never blocks on storage
  Attempts, hints, Show me and predictions go to the progress store, which lives in localStorage per
  user. A pass is recorded only when the lesson's @pass check holds on the finished run.

  Scenario: Progress survives a reload
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And I press Step
    Then the stored progress of "c1/01-press-the-button" has passed
    When I reload the lab
    Then the stored progress of "c1/01-press-the-button" has passed
    And the lab progress line says "passed"

  Scenario: Stepping a lesson without reaching its goal is not a pass
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Step
    Then the stored progress of "c1/04-two-boxes" has not passed
    And the stored progress of "c1/04-two-boxes" has 1 attempt

  Scenario: A broken browser storage does not break play
    Given the coach lab shows lesson "c1/01-press-the-button" with storage that always fails
    When I press Continue
    And I press Step
    Then box "a0" shows 5
    When I press Continue
    And I press Continue
    Then the Now you can card is shown

  Scenario: A student with two clean lessons is offered a quick version
    Given the coach lab shows lesson "c1/02-change-the-number" after two clean lessons
    Then the coach asks "Quick version?"
    When I choose "Quick version"
    And I press Continue
    And I set the number on card 1 to 9
    And I press Step
    Then the Now you can card is shown

  Scenario: Without that history the optional part cannot be skipped
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I set the number on card 1 to 9
    And I press Step
    Then the coach says "Try a different number"
    And there is no "Skip" button

  Scenario Outline: The coach panel is readable in <theme> <mode> mode
    Given the coach lab shows lesson "c1/03-last-one-wins" in the "<theme>" theme and <mode> mode
    When I press Continue
    And I answer 3
    Then the coach text meets 4.5:1 contrast on the panel
    And the coach buttons meet 4.5:1 contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario Outline: The player fits at <width> by <height>
    Given the coach lab shows lesson "c1/05-add" at <width> by <height>
    Then the lab page does not scroll sideways
    And the coach panel is fully inside the window

    Examples:
      | width | height |
      | 1024  | 768    |
      | 1440  | 900    |
