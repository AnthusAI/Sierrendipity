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
    When I press Step
    Then the rule banner says "The program has not finished. Box a0 holds 9."
    When I press Step
    Then the coach says "The rule now uses 3 for x."

  Scenario: Back moves the banner back with the machine
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    And I press Step
    And I press Back
    Then the rule banner says "The program has not finished. Box a0 holds 3."

  Scenario: Changing x starts the machine again
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    And I press Step
    And I type 5 for x
    Then the lesson shows the step count 0
    And the rule banner shows "f(5) = 5·5 + 1 = 26"
    And the rule banner says "The program has not finished. Box a0 holds 5."

  Scenario Outline: Text that is not a whole number does not change x and gets a plain message
    Given the coach lab shows lesson "x1/05-function"
    When I type "<typed>" for x
    Then the box for x says "Type a whole number from -99999 to 99999. The number for x stays 1."
    And the rule banner shows "f(1) = 1·1 + 1 = 2"

    Examples:
      | typed   |
      | abc     |
      | 2.5     |
      | 123456  |

  Scenario: Keystrokes do not change x until the student confirms
    Given the coach lab shows lesson "x1/05-function"
    When I type "2" for x without confirming
    Then the rule banner shows "f(1) = 1·1 + 1 = 2"
    When I type "2.5" for x without confirming
    And I leave the box for x
    Then the box for x says "Type a whole number"
    And the box for x holds "1"
    And the rule banner shows "f(1) = 1·1 + 1 = 2"

  Scenario: Leaving the box confirms a good number
    Given the coach lab shows lesson "x1/05-function"
    When I type "7" for x without confirming
    And I leave the box for x
    Then the rule banner shows "f(7) = 7·7 + 1 = 50"
    And the box for x has no message

  Scenario: A number whose square does not fit in a box is not printed as an equation
    Given the coach lab shows lesson "x1/05-function"
    When I type 46341 for x
    Then the rule banner shows "f(46341) is too big for a box"
    And the rule banner says "does not fit in a box"
    When I type 46340 for x
    Then the rule banner shows "f(46340) = 46340·46340 + 1 = 2147395601"

  Scenario: Running at the starting x does not finish the first scene
    Given the coach lab shows lesson "x1/05-function"
    When I press Step
    And I press Step
    Then the coach says "Type 3 for x above the boxes."
    And the rule banner says "Box a0 holds 2. This is the same as the rule."

  Scenario: The scene is done when the machine has run the rule for 3
    Given the coach lab shows lesson "x1/05-function"
    When I type 3 for x
    And I press Step
    And I press Step
    Then the coach says "The rule now uses 3 for x."
    And the box for x holds "3"
    And the box for x cannot be changed

  Scenario: A student who typed 3 is right to say 10 and goes on
    Given the coach lab shows lesson "x1/05-function" at the scene "guess"
    When I type "10" in the answer box and press the Enter key
    Then the coach confirms "You called it."
    And the coach says "Watch the box hold the answer."

  Scenario: The guess scene does not show its own answer
    Given the coach lab shows lesson "x1/05-function" at the scene "guess"
    Then the lesson shows the step count 0
    And the box for x holds "3"
    And the box for x cannot be changed

  Scenario: A wrong guess gets the reply of the scene and the next scene shows the answer
    Given the coach lab shows lesson "x1/05-function" at the scene "guess"
    When I type "9" in the answer box and press the Enter key
    Then the coach replies "You said 9. That is x·x. The rule also adds 1."

  Scenario: A scene that fixes x puts x there and starts the machine again
    Given the coach lab shows lesson "x1/05-function" at the scene "again"
    Then the box for x holds "5"
    And the box for x cannot be changed
    And the lesson shows the step count 0
    When I type "26" in the answer box and press the Enter key
    Then the coach says "Watch the box for x = 5."

  Scenario: A wrong guess does not skip the scene after it
    Given the coach lab shows lesson "x1/05-function" at the scene "guess"
    When I type "9" in the answer box and press the Enter key
    Then the coach says "Watch the box hold the answer."
    When I press Step
    And I press Step
    Then the coach says "Now x is 5."

  Scenario: The banner gives no values while a question is open
    Given the coach lab shows lesson "x1/05-function" at the scene "again"
    Then the rule banner reads "f(x) = x·x + 1"
    And the rule banner shows no values

  Scenario: The banner gives no values while the table is asked
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    Then the rule banner reads "f(x) = x·x + 1"
    And the rule banner shows no values
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

  Scenario: Filling the table is what earns the pass of a lesson whose pass needs the table
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 5, 10"
    And I submit the table
    Then the stored progress of "x1/05-function" has passed

  Scenario: A wrong table is not a pass
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 4, 10"
    And I submit the table
    Then the stored progress of "x1/05-function" has not passed

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

  Scenario: A wrong row with no exact reply gets the reply of its row
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "7, 5, 10"
    And I submit the table
    Then the coach replies "Row x = 1: you wrote 7. Check the row for 1. Put 1 in place of x."

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
    When I press Step
    And I press Step
    Then the rule banner says "This is the same as the rule."

  Scenario Outline: The banner fits a phone and a tablet
    Given the coach lab shows lesson "x1/05-function" at <width> by <height> at the scene "enter"
    Then the lab page does not scroll sideways
    And the rule banner fits the window

    Examples:
      | width | height |
      | 320   | 568    |
      | 390   | 844    |

  Scenario Outline: The table and the banner fit a phone and a tablet
    Given the coach lab shows lesson "x1/05-function" at <width> by <height> at the scene "table"
    Then the lab page does not scroll sideways
    And the rule banner fits the window
    And the table fits the window

    Examples:
      | width | height |
      | 320   | 568    |
      | 390   | 844    |

  Scenario: Reduced motion draws no animation on the banner
    Given the coach lab shows lesson "x1/05-function" at the scene "enter" with reduced motion
    When I type 3 for x
    And I press Step
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

  Scenario: A pass is recorded even when a scene with a goal comes after the table
    Given the coach lab shows lesson "x1/05-function" at the scene "table"
    When I fill the table with "2, 5, 10"
    And I submit the table
    Then the stored progress of "x1/05-function" has passed
    And the Now you can card is shown

  Scenario: A scene that fixes x on the first scene is applied from the start
    Given the coach lab shows lesson "x1/06-first-input"
    Then the box for x holds "4"
    And the box for x cannot be changed
    And the lesson shows the step count 0
    And the rule banner shows no values
    When I type "17" in the answer box and press the Enter key
    Then the coach confirms "You called it."
