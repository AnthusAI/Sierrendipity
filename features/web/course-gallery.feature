@web @course
Feature: The Gallery of things I made
  Pictures and programs the student made live in the Gallery, per student, in this browser.

  Background:
    Given a mock backend that needs 0 ms to start
    And a course of five lessons

  Scenario: An empty Gallery says so kindly
    When I open the app at "/learn/gallery"
    Then I see the heading "Gallery"
    And the Gallery says "Nothing here yet. Things you make in lessons will show up here."

  Scenario: Pictures are 16 by 16 grids with text labels and programs are card lists
    Given the Gallery holds a pixel picture "Heart" from "Press the Button"
    And the Gallery holds a program "Two boxes" from "Two Boxes"
    When I open the app at "/learn/gallery"
    Then the Gallery shows "Heart" as a pixel picture with 256 pixels labelled "Heart, a 16 by 16 pixel picture"
    And the Gallery shows "Two boxes" as a list of 2 cards
    And the program "Two boxes" reads "Put 5 in box a0" and "Put 7 in box a1"

  Scenario: Replay takes a program back to its lesson
    Given the Gallery holds a program "Two boxes" from "Two Boxes"
    And the student has passed "Press the Button"
    And the student has passed "Change the Number"
    And the student has passed "Last One Wins"
    When I open the app at "/learn/gallery"
    And I press "Replay Two boxes"
    Then I am on "/learn/c1/04-two-boxes"

  Scenario: Removing an item asks first and sticks after a reload
    Given the Gallery holds a pixel picture "Heart" from "Press the Button"
    And the Gallery holds a pixel picture "Star" from "Press the Button"
    When I open the app at "/learn/gallery"
    And I press "Remove Heart"
    Then I am asked "Remove Heart from your Gallery?"
    When I cancel the question
    Then the Gallery lists "Heart" and "Star"
    When I press "Remove Heart"
    And I confirm the question "Remove"
    Then the Gallery lists "Star"
    When I go to "/learn/gallery"
    Then the Gallery lists "Star"

  Scenario: Damaged Gallery data shows an empty Gallery without errors
    Given the stored Gallery is damaged
    When I open the app at "/learn/gallery"
    Then the Gallery says "Nothing here yet. Things you make in lessons will show up here."
    And no page errors occurred

  Scenario: The Gallery is reached from the path and leads back to it
    When I open the app at "/learn"
    And I follow the link "Gallery"
    Then I am on "/learn/gallery"
    When I follow the link "Path"
    Then I am on "/learn"

  Scenario Outline: The Gallery is readable in <theme> <mode> and fits 1024 by 768
    Given the saved settings are the theme "<theme>" and the mode "<mode>"
    And the viewport is 1024 by 768
    And the Gallery holds a pixel picture "Heart" from "Press the Button"
    And the Gallery holds a program "Two boxes" from "Two Boxes"
    When I open the app at "/learn/gallery"
    Then every piece of text on the page has enough contrast
    And no two items on the path overlap and nothing is cut off at the sides

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario: Two students on one browser have separate Galleries
    Given Cognito is the hosted UI at "https://auth.example.test"
    And the Gallery of "sub-ada" holds a pixel picture "Heart" from "Press the Button"
    And the IDE is opened with sign-in required
    And I press "Sign in with Google"
    And Google sends me back to Learn as "ada@example.test" whose subject is "sub-ada"
    When I go to "/learn/gallery"
    Then the Gallery lists "Heart"
    When I press "Sign out"
    And I press "Sign in with Google"
    And Google sends me back to Learn as "bob@example.test" whose subject is "sub-bob"
    And I go to "/learn/gallery"
    Then the Gallery says "Nothing here yet. Things you make in lessons will show up here."
