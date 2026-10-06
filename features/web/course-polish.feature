@web @course
Feature: The course pages are announced, fit narrow screens and say kindly when something is missing

  Background:
    Given a mock backend that needs 0 ms to start
    And a course of five lessons

  # Navigation announcements and focus

  Scenario Outline: Moving to <page> sets the title and moves focus to the heading
    Given the Gallery holds a pixel picture "Heart" from "Press the Button"
    When I open the app at "/learn"
    Then the page title is "Course 1 · Sierrendipity"
    When I follow the link "<link>"
    Then the page title is "<title>"
    And focus is on the heading "<heading>"

    Examples:
      | page    | link    | title                    | heading          |
      | Gallery | Gallery | Gallery · Sierrendipity  | Gallery          |
      | Deck    | Deck    | Instruction Deck · Sierrendipity | Instruction Deck |

  Scenario: Pressing Continue moves focus to the lesson heading and titles the page with the lesson
    When I open the app at "/learn"
    And I press the primary button
    Then the page title is "Press the Button · Sierrendipity"
    And focus is on the heading "Press the Button"

  Scenario: The Workspace has its own title
    When I open the app at "/learn"
    And I switch to the "Workspace" area
    Then the page title is "Workspace · Sierrendipity"

  Scenario: After Check in the warm-up, focus stays inside the warm-up
    Given the time is "2026-10-06T09:00:00"
    And the student passed "Add" 3 days ago
    When I open the app at "/learn"
    And I answer the warm-up with "7"
    And I press "Check"
    Then focus is on the warm-up button "Done"

  # Narrow screens

  Scenario Outline: The <page> fits a 400 pixel wide screen
    Given the viewport is 400 by 800
    And the student has used the card kinds "put, add-boxes" in passing programs
    And the Gallery holds a pixel picture "Heart" from "Press the Button"
    And the Gallery holds a program "Two boxes" from "Two Boxes"
    And the student has passed "Press the Button"
    When I open the app at "<path>"
    Then nothing scrolls sideways and every button and link on the page is on screen

    Examples:
      | page    | path          |
      | path    | /learn        |
      | Gallery | /learn/gallery |
      | Deck    | /learn/deck    |

  Scenario: A flipped Deck card fits a 400 pixel wide screen
    Given the viewport is 400 by 800
    And the student has used the card kinds "put" in passing programs
    When I open the app at "/learn/deck"
    And I flip the Deck card "Put"
    Then nothing scrolls sideways and every button and link on the page is on screen

  # Lessons that are not open

  Scenario: A lesson that is not open yet gets a friendly page
    When I open the app at "/learn/c1/04-two-boxes"
    Then I am on "/learn/c1/04-two-boxes"
    And I see the heading "Not open yet"
    And I see "Two Boxes"
    When I press "Back to the path"
    Then I am on "/learn"

  Scenario: An unknown lesson gets a friendly page
    When I open the app at "/learn/c9/99-nothing"
    Then I see the heading "Not open yet"
    And I see "We could not find that lesson"

  Scenario: Replay works for a lesson that is not open, after a reset
    Given the Gallery holds a program "Two boxes" from "Two Boxes"
    When I open the app at "/learn/gallery"
    And I press "Replay Two boxes"
    Then I am on "/learn/c1/04-two-boxes"
    And I see the heading "Two Boxes"

  Scenario: A closed side room is not honoured from the address bar
    Given the student has passed "Press the Button"
    And the student has passed "Change the Number"
    When I open the app at "/learn/c1/02-change-the-number?room=hex-secrets"
    Then I see the heading "Not open yet"

  Scenario: An unknown side room is not honoured
    Given the student has passed "Press the Button"
    When I open the app at "/learn/c1/01-press-the-button?room=nope"
    Then I see the heading "Not open yet"

  # Dev tools

  Scenario: Dev tools are available in the spec build
    When I open the app at "/learn/c1/01-press-the-button?dev=1"
    Then I see the button "Mark as passed (dev)"

  # A missing course list

  Scenario: A missing course list says so kindly and offers another try
    Given the course list is served as a web page
    When I open the app at "/"
    Then I am on "/learn"
    And I see "The course list is missing. Try again later."
    And there is no "Unexpected token" message
    And the page offers the link "Open the Workspace"
    When the course list comes back
    And I press "Try again"
    Then there is exactly one primary button named "Continue: Press the Button, about 3 min"

  # The Deck

  Scenario: Cards that are not met are one group for a screen reader
    Given the student has used the card kinds "put, add-boxes" in passing programs
    When I open the app at "/learn/deck"
    Then the Deck offers one group "22 cards you have not met yet"
    And no card of the Deck that is not met is a button

  Scenario Outline: The back of <card> shows the alias and the real instruction
    Given the student has used the card kinds "<kind>" in passing programs
    When I open the app at "/learn/deck"
    And I flip the Deck card "<card>"
    Then the back of the Deck card "<card>" shows the assembly name "<name>" and the instruction "<real>"

    Examples:
      | kind       | card       | name | real              |
      | put        | Put        | li   | addi a0, zero, 5  |
      | add-number | Add number | addi | addi a0, a0, 3    |
      | copy       | Copy       | mv   | addi a0, a1, 0    |
      | do-nothing | Do nothing | nop  | addi zero, zero, 0 |
      | jump       | Jump       | j    | jal zero, -4      |

  Scenario: Every card kind's back agrees with the explorer decoder with aliases
    Given the student has used every card kind in passing programs
    When I open the app at "/learn/deck"
    Then every Deck back names its card as the decoder does with aliases

  # Doors and the next card

  Scenario: A closed side room is plain text, not a button
    When I open the app at "/learn"
    Then the door "Hex secrets" is plain text saying "Opens after you pass Change the Number"

  Scenario: Unlock all makes the next lesson a link too
    When I open the app at "/learn"
    And I open Settings
    And I turn on "Unlock all lessons"
    And I close Settings
    Then I can open the lesson "Change the Number" from the path

  # Branch pick

  Scenario: The pick at a branch point is remembered
    Given the course also offers "Sticky Notes" as an alternate to "Two Boxes"
    And the student has passed "Press the Button"
    And the student has passed "Change the Number"
    And the student has passed "Last One Wins"
    When I open the app at "/learn"
    And I pick "Sticky Notes"
    And I press the primary button
    And I go back
    Then there is exactly one primary button named "Continue: Sticky Notes, about 5 min"
    When I go to "/learn"
    Then there is exactly one primary button named "Continue: Sticky Notes, about 5 min"

  # The lab

  Scenario: The lab is also found with a trailing slash
    When I go to "/lab/"
    Then the lab has a section "Course path and progress"
