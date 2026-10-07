@web @coach @stage
Feature: The lesson player draws the real machine
  Lessons play with the real visuals (the clerk and boxes, number spinners on real card faces, the pointing
  hand), not a plain list. The player owns the one live machine; the stage follows it, so the diagram never
  disagrees with the player after Step, Back, Reset or an edit, and animations replay the real step.

  Scenario: Lesson 01 plays on the real stage
    Given the coach lab shows lesson "c1/01-press-the-button"
    Then the stage is the real machine view
    When I press Continue 3 times
    Then the spotlight surrounds "button:step"
    When I select Run
    Then box "a0" shows 5
    And the diagram agrees with the player
    And the end of the list is not shown

  Scenario Outline: Lesson <lesson> is played end to end on the real stage
    Given the coach lab shows lesson "<lesson>"
    Then the stage is the real machine view
    When I play the lesson to the end answering <answer>
    Then the Now you can card is shown
    And the stored progress of "<lesson>" has passed

    Examples:
      | lesson                   | answer |
      | c1/01-press-the-button   | -      |
      | c1/03-last-one-wins      | 8      |
      | c1/05-add                | 12     |

  Scenario: The diagram stays in sync after Step, Back and Reset
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    Then the diagram agrees with the player
    And the timeline is at step 1
    When I press Step
    Then box "a1" shows 6
    And the diagram agrees with the player
    And the timeline is at step 2
    When I press Back
    Then the diagram agrees with the player
    And the timeline is at step 1
    And box "a1" is empty
    When I press Reset
    Then the diagram agrees with the player
    And the timeline is at step 0
    And box "a0" is empty

  Scenario: A spinner edit sends the whole new word to the player and restarts the diagram
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I set the number on card 1 to 9
    Then the player's cards are "0x00900513"
    And the diagram agrees with the player
    When I select Run
    Then box "a0" shows 9
    When I set the number on card 1 to 4
    Then the player's cards are "0x00400513"
    And the timeline is at step 0
    And box "a0" is empty
    And the diagram agrees with the player

  Scenario: A negative number is a real number on a put card
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I set the number on card 1 to -3
    Then the player's cards are "0xffd00513"

  Scenario: The token flies from the card to the box and replays on every Step
    Given the coach lab shows lesson "c1/05-add"
    When I press Continue
    And I press Step
    And the timeline is at step 1
    And the diagram clock is frozen at 0.5
    Then a token carrying 5 is flying
    When the diagram clock is frozen at 1
    Then no token is flying
    When I press Back
    And the timeline is at step 0
    And I press Step
    And the timeline is at step 1
    And the diagram clock is frozen at 0.5
    Then a token carrying 5 is flying

  Scenario: Reduced motion shows no token and says what happened in words
    Given the coach lab shows lesson "c1/04-two-boxes" with reduced motion
    When I press Continue
    And I press Step
    And the timeline is at step 1
    And the diagram clock is frozen at 0.5
    Then no token is flying
    And the diagram says "Box a0 changed from – to 4."

  Scenario: The pointing hand follows the player on a lesson that has one
    Given the coach lab shows lesson "x1/01-diagrams"
    Then the pointing hand is at address 0
    When I press Step
    Then the pointing hand is at address 4
    And the diagram agrees with the player
    When I press Back
    Then the pointing hand is at address 0

  Scenario: Locked controls say "Not yet" and the spinner stays put
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue 3 times
    Then the number on card 1 is locked with the explanation "Not yet"

  Scenario: While a prediction is asked the machine's controls say "Not yet"
    Given the coach lab shows lesson "c1/05-add"
    When I press Continue
    And I press Step
    And I press Step
    Then the Step button is locked with the explanation "Not yet"
    And the Back button is locked with the explanation "Not yet"
    And the Reset button is locked with the explanation "Not yet"

  Scenario: The coach panel comes first for the keyboard and on a narrow screen
    Given the coach lab shows lesson "c1/01-press-the-button" at 400 by 800
    Then the coach panel comes before the machine
    And the first thing the Tab key reaches in the lesson is in the coach panel
    And the lab page does not scroll sideways
