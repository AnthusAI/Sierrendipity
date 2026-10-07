@web @coach
Feature: The coach records progress and never blocks on storage
  Attempts, hints, Show me and predictions go to the progress store, which lives in localStorage per
  user. A pass is recorded only when the lesson's @pass check holds on the finished run.

  Scenario: Progress survives a reload
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue 3 times
    And I select Run
    Then the stored progress of "c1/01-press-the-button" has passed
    When I reload the lab
    Then the stored progress of "c1/01-press-the-button" has passed
    And the lab progress line says "passed"

  Scenario: Stepping a lesson without reaching its goal is not a pass
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Step
    And I press Reset
    And I press Step
    And I press Step
    Then the stored progress of "c1/04-two-boxes" has not passed
    And the stored progress of "c1/04-two-boxes" has 1 attempt

  Scenario: A broken browser storage does not break play
    Given the coach lab shows lesson "c1/01-press-the-button" with storage that always fails
    When I press Continue 3 times
    And I select Run
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
    And I select Run
    Then the Now you can card is shown

  Scenario: Without that history the optional part cannot be skipped
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I set the number on card 1 to 9
    And I select Run
    Then the coach says "try a different number"
    And the coach has no "Skip" button

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

  Scenario: Forced colors keep the spotlight visible
    Given the coach lab shows lesson "x1/03-builder" with forced colors
    When I press Continue
    Then the spotlight surrounds "tray"
    And the spotlight is outlined in a system color
    And the spotlight still dims the rest of the page

  Scenario: The step button explains itself when it cannot step
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Step
    Then the Step button explains "Select Start again first"
    And the idle Step button meets 4.5:1 contrast

  Scenario: In a lesson without a Back button the idle Run button says all done
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I set the number on card 1 to 9
    And I select Run
    Then the Step button explains "All done"
    And the idle Step button meets 4.5:1 contrast

  Scenario: At 400 by 800 the coach comes first and the number pad is easy to hit
    Given the coach lab shows lesson "c1/03-last-one-wins" at 400 by 800
    When I press Continue
    Then the coach panel comes before the machine
    And the number pad buttons are at least 44px tall
    And the lab page does not scroll sideways

  Scenario: A lesson that does not exist is explained kindly
    Given the coach lab is asked for the lesson "c9/99-nothing"
    Then the lab says "This lesson couldn't load. Try again, or pick another lesson."
    And the lab shows no technical error text
    When I choose "Back to the path"
    Then the coach says "exactly what each instruction says"

  Scenario: A lesson file that is damaged is explained kindly
    Given the lesson file of "c1/01-press-the-button" is damaged
    And the coach lab is asked for the lesson "c1/01-press-the-button"
    Then the lab says "This lesson couldn't load. Try again, or pick another lesson."
    And the lab shows no technical error text

  Scenario: A lesson file that cannot be fetched is explained kindly, and Try again fetches it again
    Given the lesson file of "c1/01-press-the-button" cannot be fetched
    And the coach lab is asked for the lesson "c1/01-press-the-button"
    Then the lab says "This lesson couldn't load. Try again, or pick another lesson."
    And the lab shows no technical error text
    When the lesson file can be fetched again
    And I choose "Try again"
    Then the coach says "exactly what each instruction says"

  Scenario: Visitors to the app do not download the coach
    Then the main bundle does not contain the coach

  Scenario: A lesson opened from the path is played by the coach and records to the course progress
    Given a mock backend that needs 0 ms to start
    And a course of five lessons
    When I open the app at "/learn/c1/01-press-the-button"
    Then I see the heading "Press the Button"
    And the coach says "exactly what each instruction says"
    When I press Continue 3 times
    And I select Run
    And I press Continue 2 times
    Then the Now you can card is shown
    And the stored progress of "c1/01-press-the-button" has passed
