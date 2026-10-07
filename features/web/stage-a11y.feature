@web @coach @stage
Feature: The real stage is keyboard operable, readable and fits every window
  Keyboard only, reduced motion, contrast in every theme and mode, and no sideways scrolling from a phone to a
  desktop. The coach comes first in the tab order, then the controls, the cards and the boxes.

  Scenario: Lesson 01 is played with the keyboard alone on the real stage
    Given the coach lab shows lesson "c1/01-press-the-button"
    Then the focus is on "Continue"
    When I press the Enter key
    Then the focus is on "Run"
    When I press the Enter key
    Then box "a0" shows 5
    And the Now you can card is shown
    And the focus is on "Next lesson, about 3 min"

  Scenario: Lesson 06 is played with the keyboard alone
    Given the coach lab shows lesson "c1/06-counting-with-lamps"
    Then the focus is on "Continue"
    When I press the Enter key
    And I type "4" in the answer box and press the Enter key
    Then the coach says "Switch lamps on until they make 5"
    When I tab until the focus is on "bit 5, worth 32"
    And I press the ArrowRight key 3 times
    Then the focus is on "bit 2, worth 4"
    When I press the Space key
    And I shift-tab until the focus is on "Run"
    And I press the Enter key
    Then box "a0" shows 5
    And the coach says "Now make 7"

  Scenario: The Tab order is the coach, then the controls, then the cards, then the boxes
    Given the coach lab shows lesson "c1/05-add"
    Then the tab order of the lesson is the coach panel, then Run and Start again, then the cards
    And the boxes come after the cards in the page

  Scenario: Every control of the stage has a name a screen reader can use
    Given the coach lab shows lesson "c1/04-two-boxes"
    Then every button and spinner of the stage has an accessible name

  Scenario: Reduced motion makes the flip and the token instant
    Given the coach lab shows lesson "x1/02-lamps" at the scene "flip" with reduced motion
    Then the card flip is instant

  Scenario: Reduced motion draws no token on the real stage
    Given the coach lab shows lesson "c1/05-add" with reduced motion
    When I press Step
    And the timeline is at step 1
    And the diagram clock is frozen at 0.5
    Then no token is flying
    And the diagram says "Box a0 changed from – to 5."

  Scenario Outline: The stage is readable in the <theme> theme and <mode> mode
    Given the coach lab shows lesson "c1/04-two-boxes" in the "<theme>" theme and <mode> mode
    When I press Step
    Then the stage text meets 4.5:1 contrast
    And the stage controls meet 3:1 contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario Outline: The lamps and bands are readable in the <theme> theme and <mode> mode
    Given the coach lab shows lesson "x1/02-lamps" in the "<theme>" theme and <mode> mode at the scene "bands"
    Then the stage text meets 4.5:1 contrast
    And the lamps meet 3:1 contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario Outline: The stage fits a window of <width> by <height>
    Given the coach lab shows lesson "c1/05-add" at <width> by <height>
    When I press Step
    And I press Step
    Then the lab page does not scroll sideways
    And the stage has nothing wider than the window

    Examples:
      | width | height |
      | 400   | 800    |
      | 1024  | 768    |
      | 1440  | 900    |

  Scenario Outline: The lamps and bands fit a window of <width> by <height>
    Given the coach lab shows lesson "x1/02-lamps" at <width> by <height> at the scene "bands"
    Then the lab page does not scroll sideways
    And the stage has nothing wider than the window

    Examples:
      | width | height |
      | 400   | 800    |
      | 1024  | 768    |
      | 1440  | 900    |
