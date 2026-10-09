@web @coach @function
Feature: A lesson with a function shows its rule, takes an input and asks for a table
  When a lesson declares a function, a banner above the boxes shows the rule, then the rule with the
  number for x in it (f(7) = 7·7 + 1 = 50), then what the machine holds now. The student sets x. A table ask
  has the student fill in f(x) for several values of x, and a wrong row gets a reply about that row. These
  scenarios drive the fixture lesson x1/05-function.

  Scenario: The banner shows the rule and the rule with the starting x
    Given the coach lab shows lesson "x1/05-function"
    Then the rule banner reads "f(x) = x·x + 1"
    And the rule banner shows "f(1) = 1·1 + 1 = 2"
    And the rule banner is above the boxes
    And the stage shows "banner:rule"

  Scenario: A lesson without a function shows no banner
    Given the coach lab shows lesson "c1/05-add"
    Then the lesson shows no rule banner

  Scenario: The student sets x and the banner follows
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    Then the rule banner shows "f(3) = 3·3 + 1 = 10"
    When I type -4 for x
    Then the rule banner shows "f(-4) = (-4)·(-4) + 1 = 17"

  Scenario: The banner follows the machine as the cards run
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    Then the rule banner says "The program has not finished. Box a0 holds 3."
    When I select Run
    Then the rule banner says "The program has not finished. Box a0 holds 9."
    When I select Run
    Then box "a0" shows 10
    And the rule banner says "Box a0 holds 10. This is the same as the rule."

  Scenario: Back moves the banner back with the machine
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    And I select Run
    And I press Back
    Then the rule banner says "The program has not finished. Box a0 holds 3."

  Scenario: Changing x starts the machine again
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    And I select Run
    And I type 5 for x
    Then the lesson shows the step count 0
    And the rule banner shows "f(5) = 5·5 + 1 = 26"
    And the rule banner says "The program has not finished. Box a0 holds 5."

  Scenario Outline: Text that is not a whole number does not change x
    Given the coach lab shows lesson "x1/05-function"
    When I type "<typed>" for x
    Then the rule banner shows "f(1) = 1·1 + 1 = 2"

    Examples:
      | typed   |
      | abc     |
      | 2.5     |
      | 123456  |

  Scenario: The scene is done when the machine has run the rule for 3
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    And I select Run
    And I select Run
    Then the coach says "Now fill in the table."

  Scenario: The table has a row and a named cell for each x
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    Then the table has the columns "x" and "f(x)"
    And the table has a row for each of "1, 2, 3"
    And the table cells are named "f(1), f(2), f(3)"
    And the table is described by its question
    And the focus is on "f(1)"
    And the stage shows "banner:rule"

  Scenario: The student fills the table with the keyboard alone
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I type "2" in the focused table cell and press the Tab key
    And I type "5" in the focused table cell and press the Tab key
    And I type "10" in the answer box and press the Enter key
    Then the Now you can card is shown

  Scenario: A table with the right values finishes the lesson
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 5, 10"
    And I submit the table
    Then the Now you can card is shown

  Scenario: A wrong row gets a reply about that exact value
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 4, 10"
    And I submit the table
    Then the coach replies "Row x = 2: you wrote 4. That is x·x. The rule also adds 1."

  Scenario: A wrong row gets a reply about that row for any value
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 5, 9"
    And I submit the table
    Then the coach replies "Row x = 3: you wrote 9. Check the row for 3. Put 3 in place of x."

  Scenario: A wrong row with no reply of its own gets the lesson's reply
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "7, 5, 10"
    And I submit the table
    Then the coach replies "Row x = 1: you wrote 7. Use the rule above the boxes. Put the number in place of x."

  Scenario: The first wrong row is the one the reply is about
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 4, 9"
    And I submit the table
    Then the coach replies "Row x = 2: you wrote 4."

  Scenario: The student keeps the typed values after a wrong row and fixes only that row
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 4, 10"
    And I submit the table
    And I fill the table with "2, 5, 10"
    And I submit the table
    Then the Now you can card is shown

  Scenario: An empty or broken row is asked again before it counts as a guess
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, , 10"
    And I submit the table
    Then the table says "Row x = 2: type a whole number, like 12."

  Scenario: The input for x cannot change while the table is asked
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    Then the box for x cannot be changed

  Scenario: The input for x can change while the lesson waits for the machine
    Given the coach lab shows lesson "x1/05-function"
    Then the box for x can be changed

  Scenario: The banner and the cells have names a screen reader can use
    Given the coach lab shows lesson "x1/05-function"
    Then the rule banner is a region named "The rule"
    And the rule banner status is announced politely
    And every button and spinner of the stage has an accessible name

  Scenario: The banner never depends on colour alone
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    And I select Run
    And I select Run
    Then the rule banner says "This is the same as the rule."

  Scenario Outline: The banner and the table fit a phone and a tablet
    Given the coach lab shows lesson "x1/05-function" at <width> by <height> at the scene "<scene>"
    Then the lab page does not scroll sideways
    And the rule banner and the table fit the window

    Examples:
      | width | height | scene  |
      | 320   | 568    | enter  |
      | 320   | 568    | table  |
      | 390   | 844    | table  |

  Scenario: Reduced motion draws no animation on the banner
    Given the coach lab shows lesson "x1/05-function" at the scene "enter" with reduced motion
    When I type 3 for x
    And I select Run
    Then the rule banner has no animation or transition longer than a millisecond
    And the rule banner says "Box a0 holds 9."

  Scenario Outline: The banner is readable in the <theme> theme and <mode> mode
    Given the coach lab shows lesson "x1/05-function" in the "<theme>" theme and <mode> mode
    Then the stage text meets 4.5:1 contrast

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |
