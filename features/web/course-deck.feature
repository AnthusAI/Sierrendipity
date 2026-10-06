@web @course
Feature: The Instruction Deck
  One card per kind of card. A card stays face down until the student has used that kind in a passing
  program. Flip it to see the plain English on the front and the assembly name and 32 bits on the back.

  Background:
    Given a mock backend that needs 0 ms to start
    And a course of five lessons

  Scenario: Nothing is met at the start
    When I open the app at "/learn/deck"
    Then I see the heading "Instruction Deck"
    And the Deck says "0 of 24 met"
    And every card of the Deck is face down

  Scenario: Cards used in passing programs are face up
    Given the student has used the card kinds "put, add-boxes" in passing programs
    When I open the app at "/learn/deck"
    Then the Deck says "2 of 24 met"
    And the Deck card "Put" is face up
    And the Deck card "Add boxes" is face up
    And the Deck card "Subtract boxes" is face down

  Scenario: Face-down cards do not give the card away
    When I open the app at "/learn/deck"
    Then the Deck card "Add boxes" is face down and says "Not met yet"
    And the Deck card "Add boxes" cannot be flipped

  Scenario: Flipping a card shows the assembly name and the 32 bits
    Given the student has used the card kinds "put" in passing programs
    When I open the app at "/learn/deck"
    Then the front of the Deck card "Put" reads "Put 5 in box a0"
    When I flip the Deck card "Put"
    Then the back of the Deck card "Put" shows the assembly name "li" and the bits "00000000010100000000010100010011"
    And the back of the Deck card "Put" has a lamp strip of 32 lamps with 7 lit
    When I flip the Deck card "Put"
    Then the front of the Deck card "Put" reads "Put 5 in box a0"

  Scenario: Cards flip with the keyboard
    Given the student has used the card kinds "put" in passing programs
    When I open the app at "/learn/deck"
    And I press Tab until focus is on "Flip Put"
    And I press the key "Enter"
    Then the back of the Deck card "Put" shows the assembly name "li" and the bits "00000000010100000000010100010011"

  Scenario: The Deck follows progress after a reload
    Given the student has used the card kinds "put" in passing programs
    When I open the app at "/learn/deck"
    Then the Deck says "1 of 24 met"
    When the student has used the card kinds "put, add-boxes, stop" in passing programs
    And I go to "/learn/deck"
    Then the Deck says "3 of 24 met"

  Scenario: Damaged card kinds in the stored progress are ignored
    Given the stored progress has the card kinds "put, nonsense, 7"
    When I open the app at "/learn/deck"
    Then the Deck says "1 of 24 met"

  Scenario: Two students on one browser have separate Decks
    Given Cognito is the hosted UI at "https://auth.example.test"
    And the student "sub-ada" has used the card kinds "put" in passing programs
    And the IDE is opened with sign-in required
    And I press "Sign in with Google"
    And Google sends me back to Learn as "ada@example.test" whose subject is "sub-ada"
    When I go to "/learn/deck"
    Then the Deck says "1 of 24 met"
    When I press "Sign out"
    And I press "Sign in with Google"
    And Google sends me back to Learn as "bob@example.test" whose subject is "sub-bob"
    And I go to "/learn/deck"
    Then the Deck says "0 of 24 met"

  Scenario Outline: The Deck is readable in <theme> <mode>, face up and flipped, and fits 1024 by 768
    Given the saved settings are the theme "<theme>" and the mode "<mode>"
    And the viewport is 1024 by 768
    And the student has used the card kinds "put, add-boxes, stop" in passing programs
    When I open the app at "/learn/deck"
    Then every piece of text on the page has enough contrast
    And no two items on the path overlap and nothing is cut off at the sides
    When I flip the Deck card "Put"
    Then every piece of text on the page has enough contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |
