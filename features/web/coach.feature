@web
Feature: The coach plays the lessons
  The tool is the tutor. A coach panel says a little at a time, a spotlight points at the part being
  discussed, predictions are asked before the machine shows the answer, and the lesson ends on a
  "Now you can" card. These scenarios drive the lesson player in the component lab with the
  real lessons from lessons/c1/ and a fake clock.

  Scenario: Lesson 01 is played with the pointer, with no typing
    Given the coach lab shows lesson "c1/01-press-the-button"
    Then the coach says "one card and one box"
    When I press Continue
    Then the coach says "Press Step"
    When I press Step
    Then box "a0" shows 5
    And the coach says "the box shows 5"
    And the coach announces "Done:"
    When I press Continue
    And I press Continue
    Then the Now you can card lists "Make the machine follow a card."
    And the Now you can card shows what I made, "Put 5 into box a0"
    And the Now you can card offers "Next lesson, about 3 min" and "Stop here"

  Scenario: Lesson 01 is playable with the keyboard alone
    Given the coach lab shows lesson "c1/01-press-the-button"
    Then the focus is on "Continue"
    When I press the Enter key
    Then the focus is on "Step"
    When I press the Enter key
    Then the focus is on "Continue"
    When I press the Enter key
    And I press the Enter key
    Then the Now you can card is shown
    And the focus is on "Next lesson, about 3 min"

  Scenario: Lesson 02 asks for the number 9 and rewards another way
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    Then the coach says "Spin the number"
    When I set the number on card 1 to 9
    And I press Step
    Then box "a0" shows 9
    And the coach says "Try a different number"
    When I press Reset
    And I set the number on card 1 to 7
    And I press Step
    Then the stored progress of "c1/02-change-the-number" has passed with the bonus "another-way"

  Scenario Outline: Lesson 03 answers the wrong guess <guess> in its own words
    Given the coach lab shows lesson "c1/03-last-one-wins"
    When I press Continue
    And I answer <guess>
    Then the coach replies "<reply>"
    And the reply is not styled as an error
    And the coach says "Press Step twice"
    When I press Step
    And I press Step
    Then box "a0" shows 8
    And the stored progress of "c1/03-last-one-wins" has passed without the bonus "called-it"

    Examples:
      | guess | reply                       |
      | 3     | what the first card put in  |
      | 11    | these cards don't add       |
      | 38    | digits side by side         |
      | 5     | these cards don't subtract  |
      | 0     | does not end up empty       |
      | 99    | Watch what the machine does |

  Scenario: Lesson 03 rewards a correct first prediction
    Given the coach lab shows lesson "c1/03-last-one-wins"
    When I press Continue
    And I answer 8
    Then the coach says "Press Step twice"
    When I press Step
    And I press Step
    Then the stored progress of "c1/03-last-one-wins" has passed with the bonus "called-it"
    And the stored progress of "c1/03-last-one-wins" asked 1 prediction and got 1 right

  Scenario: Lesson 04 changes one card so that box a1 holds 9
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Step
    Then the coach says "Change one card"
    When I press Reset
    And I set the number on card 2 to 9
    And I press Step
    And I press Step
    Then box "a1" shows 9
    And the stored progress of "c1/04-two-boxes" has passed

  Scenario Outline: Lesson 05 answers the guess <guess> and then adds
    Given the coach lab shows lesson "c1/05-add"
    When I press Continue
    And I press Step
    And I press Step
    And I answer <guess>
    Then the coach replies "<reply>"
    When I press Step
    Then box "a2" shows 12
    And the stored progress of "c1/05-add" has passed

    Examples:
      | guess | reply               |
      | 57    | digits side by side |
      | 35    | That is 5 times 7   |

  Scenario: Lesson 05 rewards the right guess of 12
    Given the coach lab shows lesson "c1/05-add"
    When I press Continue
    And I press Step
    And I press Step
    And I answer 12
    And I press Step
    Then the Now you can card is shown
    And the stored progress of "c1/05-add" has passed with the bonus "called-it"

  Scenario: Controls that a scene locks say "Not yet" and do nothing
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    Then the number on card 1 is locked with the explanation "Not yet"
    When I try to set the number on card 1 to 8
    Then the number on card 1 is 5

  Scenario: The spotlight dims everything but the target, which stays reachable by keyboard
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    Then the spotlight surrounds "button:step"
    And the spotlight dims the rest of the page
    And the spotlight lets clicks through
    When I tab until the focus is on "Step"
    Then the focus is on "Step"

  Scenario: Escape asks before ending the tour
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And I press the Escape key
    Then the coach asks "Skip the tour?"
    And the spotlight surrounds "button:step"
    When I choose "Keep going"
    Then the coach says "Press Step"
    When I press the Escape key
    And I choose "Skip the tour"
    Then there is no spotlight

  Scenario: Reduced motion makes the spotlight instant and the ghost pointer jump
    Given the coach lab shows lesson "c1/01-press-the-button" with reduced motion
    When I press Continue
    Then the spotlight is instant
    When I ask to be shown
    Then the ghost pointer is instant
