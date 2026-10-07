@web @coach
Feature: Lessons show only what their one idea needs
  A lesson chooses its controls, button names, spotlight and box names in a ui block. When a goal is missed, the
  coach says what happened and offers Try again. A number that is replaced leaves the box visibly. These
  scenarios drive the real lessons in the component lab with a fake clock.

  Scenario: Lesson 1 says "the box" and shows no register name
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue 3 times
    Then the lesson text says "in the box"
    And the lesson text never says "a0"
    And the lesson text never says "Reset"

  Scenario: A later lesson names its boxes
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    Then the lesson text says "a1"

  Scenario: Lesson 1 has one button and it is called Run
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue 3 times
    Then the lesson has no "Back" button
    And the lesson has no "Reset" button
    And the lesson has no "Step" button
    And the "Run" button is ready

  Scenario: The spinner has plus and minus buttons
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I select the plus button on card 1
    Then the number on card 1 is 6
    When I select the minus button on card 1
    And I select the minus button on card 1
    Then the number on card 1 is 4

  Scenario: The plus button reaches the goal
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I select the plus button on card 1 4 times
    And I select Run
    Then box "a0" shows 9
    And the stored progress of "c1/02-change-the-number" has passed

  Scenario: The spotlight is a ring unless a lesson asks for dimming
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    Then the spotlight surrounds "button:step"
    And the spotlight is a ring that does not dim the page
    And the spotlight lets clicks through

  Scenario: Start again is disabled, with a reason, until the machine has run
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    Then the "Start again" button is disabled and explains "Nothing to start again yet"
    When I select Run
    Then the "Start again" button is ready

  Scenario: A run that misses the goal says what happened and offers Try again
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I select Run
    Then the missed-goal help says "the goal is 9"
    When I select Try again
    Then there is no missed-goal help
    And the focus is on "Run"
    And the number on card 1 is 5
    And the lesson shows the step count 0
    When I set the number on card 1 to 9
    And I select Run
    Then box "a0" shows 9
    And there is no missed-goal help

  Scenario: A scene without ifMissed shows no missed-goal help after a run that misses
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Step
    And I press Reset
    And I press Step
    And I press Step
    Then the lesson shows the step count 2
    And the lesson shows no goal-met line
    And there is no missed-goal help

  Scenario: After a missed goal the idle Run button points at Start again
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I select Run
    Then the Step button explains "Select Start again"

  Scenario: The plus and minus buttons are reached with the Tab key
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I tab until the focus is on "Minus"
    And I tab until the focus is on "Number on card 1"
    And I tab until the focus is on "Plus"
    Then the focus is on "Plus"

  Scenario: A box with no register name is "the box" to a screen reader
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    Then the boxes are named to a screen reader as "The box"

  Scenario: Lesson 3 keeps the Run button and shows only what it needs
    Given the coach lab shows lesson "c1/03-last-one-wins"
    When I press Continue
    And I answer 8
    Then the "Run" button is ready
    And the lesson has no "Back" button
    And the lesson has no "Step" button
    And the lesson text never says "Step"

  Scenario: Lesson 4 names its boxes and still calls the button Run
    Given the coach lab shows lesson "c1/04-two-boxes"
    Then the lesson text says "a0 and a1"
    And the "Run" button is ready
    And the lesson has no "Back" button

  Scenario: Lesson 5 introduces the log
    Given the coach lab shows lesson "c1/05-add"
    When I press Continue
    Then the lesson text says "A log below the boxes"
    And the lesson has no "Back" button

  Scenario: The second card knocks the first number out of the box
    Given the coach lab shows lesson "c1/03-last-one-wins"
    When I press Continue
    And I answer 8
    And I press Step
    And I press Step
    And the timeline is at step 2
    And the diagram clock is frozen at 0.02
    Then the token starts with the number 8 at the number on card 2
    When the diagram clock is frozen at 0.2
    Then the token starts with the number 8 from the card
    When the diagram clock is frozen at 0.75
    Then the old number 3 is knocked out of the box
    And the knocked-out number is hidden from screen readers

  Scenario: The first card knocks nothing out of an empty box
    Given the coach lab shows lesson "c1/03-last-one-wins"
    When I press Continue
    And I answer 8
    And I press Step
    And the timeline is at step 1
    And the diagram clock is frozen at 0.75
    Then no number is knocked out

  Scenario: A lesson that has passed is a link on the path
    Given a mock backend that needs 0 ms to start
    And a course of five lessons
    And the student has passed "Press the Button" and "Change the Number"
    When I open the app at "/learn"
    And I follow the link "Open Press the Button again"
    Then I am on "/learn/c1/01-press-the-button"

  Scenario: Replaying an earlier lesson ends with the lesson that follows it
    Given a mock backend that needs 0 ms to start
    And a course of five lessons
    And the student has passed "Press the Button" and "Change the Number"
    When I open the app at "/learn/c1/01-press-the-button"
    And I press Continue 3 times
    And I select Run
    And I press Continue 2 times
    Then the Now you can card offers "Next lesson, about 3 min" and "Stop here"
    When I choose "Next lesson, about 3 min"
    Then I am on "/learn/c1/02-change-the-number"
