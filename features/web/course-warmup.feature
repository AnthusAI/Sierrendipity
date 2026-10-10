@web @course
Feature: The session warm-up
  A session starts with the first visit of the day, or after 30 minutes without activity. It opens with one
  predict-the-result question about an older idea. A miss is shown kindly, skipping is free, and there is at
  most one per session.

  Background:
    Given a mock backend that needs 0 ms to start
    And a course of five lessons
    And the time is "2026-10-06T09:00:00"
    And the student passed "Add" 3 days ago

  Scenario: The first visit of the day opens with one warm-up
    When I open the app at "/learn"
    Then I see the warm-up "Box a0 holds 3 and box a1 holds 4. After the add card, what does box a2 hold?"
    And the warm-up offers "Check" and "Skip"
    And there is exactly one primary button named "Continue: Press the Button, about 3 min"

  Scenario: A correct answer raises what the student knows
    When I open the app at "/learn"
    And I answer the warm-up with "7"
    And I press "Check"
    Then the warm-up says "Yes, 7."
    And the concept "add" is in box 2
    And the progress log holds a correct warm-up for "add"

  Scenario: Pressing Enter checks the answer
    When I open the app at "/learn"
    And I answer the warm-up with "7"
    And I press the key "Enter"
    Then the warm-up says "Yes, 7."

  Scenario: A miss shows the answer kindly and moves on
    When I open the app at "/learn"
    And I answer the warm-up with "34"
    And I press "Check"
    Then the warm-up says "Let's see why."
    And the warm-up shows the answer "7" and the cards in plain English
    And the warm-up does not say "wrong" or "incorrect"
    And the concept "add" is in box 0
    When I press "Close"
    Then there is no warm-up

  Scenario: Skipping is free
    When I open the app at "/learn"
    And I press "Skip"
    Then there is no warm-up
    And the concept "add" is in box 1
    And the progress log holds no warm-up

  Scenario: A warm-up cannot be checked without an answer
    When I open the app at "/learn"
    And I press "Check"
    Then the warm-up asks for a number

  Scenario: Never twice in a session
    When I open the app at "/learn"
    And I answer the warm-up with "7"
    And I press "Check"
    And I switch to the "Workspace" area
    And I switch to the "Learn" area
    Then there is no warm-up
    When I go to "/learn"
    Then there is no warm-up

  Scenario: A skipped warm-up does not come back on reload
    When I open the app at "/learn"
    And I press "Skip"
    And I go to "/learn"
    Then there is no warm-up

  Scenario: After 30 idle minutes a new session starts with a new warm-up
    When I open the app at "/learn"
    And I answer the warm-up with "7"
    And I press "Check"
    And the time is "2026-10-06T09:20:00"
    And I go to "/learn"
    Then there is no warm-up
    When the time is "2026-10-06T09:51:00"
    And I go to "/learn"
    Then I see the warm-up "Box a0 holds 2 and box a1 holds 6. After the add card, what does box a2 hold?"

  Scenario: The next day starts a new session
    When I open the app at "/learn"
    And I press "Skip"
    And the time is "2026-10-07T09:00:00"
    And I go to "/learn"
    Then I see a warm-up

  Scenario: Nothing is due, so there is no warm-up
    Given the student passed "Add" 0 days ago
    When I open the app at "/learn"
    Then there is no warm-up

  Scenario: The warm-up is not offered before anything is passed
    Given the student has passed nothing
    When I open the app at "/learn"
    Then there is no warm-up

  Scenario Outline: The warm-up is readable in <theme> <mode>
    Given the saved settings are the theme "<theme>" and the mode "<mode>"
    When I open the app at "/learn"
    Then I see a warm-up
    And every piece of text on the page has enough contrast
    When I answer the warm-up with "34"
    And I press "Check"
    Then every piece of text on the page has enough contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario: The warm-up is used with the keyboard and fits 1024 by 768
    Given the viewport is 1024 by 768
    When I open the app at "/learn"
    Then no two items on the path overlap and nothing is cut off at the sides
    And the warm-up answer box has focus
    When I press "Skip" with the keyboard
    Then there is no warm-up
