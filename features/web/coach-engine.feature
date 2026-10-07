@coach
Feature: The coach engine never strands a student
  The scene engine runs without a browser. Whatever a student does at any scene (extra Steps, Back, Reset,
  a stray edit, a wrong answer), a few honest actions must always lead to the lesson's pass.

  Scenario Outline: <lesson> can always be finished, whatever happened first
    Given the engine plays "<lesson>"
    Then every sequence of up to 2 stray actions at every scene still leads to the pass

    Examples:
      | lesson                     |
      | c1/01-press-the-button     |
      | c1/02-change-the-number    |
      | c1/03-last-one-wins        |
      | c1/04-two-boxes            |
      | c1/05-add                  |

  Scenario: A prediction made after the reveal is not a prediction
    Given the engine plays "c1/03-last-one-wins"
    When the student presses Step twice and then answers 8
    And the student presses Reset and Step twice
    Then the lesson is passed once, without "called-it", and the concept "last-wins" is in box 1

  Scenario: Published lessons are validated before the player uses them
    Given the published lesson "c1/01-press-the-button"
    Then it is accepted as a published lesson
    When I remove "starter" from it
    Then it is not accepted as a published lesson
    When I change its format to 2
    Then it is not accepted as a published lesson

  Scenario: A scene that cannot be finished by stepping points at Back
    Given the engine plays "c1/01-press-the-button" with the step scene waiting for "box a0 holds 99"
    And the lesson shows the controls "step, back, reset"
    When the student continues to the Run scene and runs
    Then the coach tells the student to press Back and spotlights "button:back"
    When the player presses Back
    Then the coach no longer tells the student to press Back

  Scenario: When Back is hidden a stranded scene points at Start again
    Given the engine plays "c1/01-press-the-button" with the step scene waiting for "box a0 holds 99"
    And the lesson shows the controls "step, reset"
    When the student continues to the Run scene and runs
    Then the coach tells the student to select "Reset" and spotlights "button:reset"
    When the player presses Reset
    Then the coach is not stranded

  Scenario: When Back and Reset are both hidden nothing points at a missing button
    Given the engine plays "c1/01-press-the-button" with the step scene waiting for "box a0 holds 99"
    When the student continues to the Run scene and runs
    Then the coach is not stranded
