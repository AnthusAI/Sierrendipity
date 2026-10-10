Feature: A lesson can declare a function and check it
  A lesson may say that its program computes a function: one input box, one output box and a rule such as
  f(x) = x·x + 1. The rule is checked against the program, step phrases such as "f(3) is 10" run the
  program on a fresh machine, and a "table" ask has the student fill in f(x) for several values of x.

  Scenario Outline: A rule is read, shown with a number in place of x, and evaluated
    When I read the rule "<rule>" for the function f
    Then the rule reads "<shown>"
    And the rule with x = <x> reads "<substituted>"
    And the rule gives <value> for x = <x>

    Examples:
      | rule                  | shown                | x     | substituted                | value |
      | f(x) = x·x + 1        | f(x) = x·x + 1       | 7     | f(7) = 7·7 + 1 = 50        | 50    |
      | f(x) = x*x+1          | f(x) = x·x + 1       | 7     | f(7) = 7·7 + 1 = 50        | 50    |
      | f(x) = x×x + 1        | f(x) = x·x + 1       | 3     | f(3) = 3·3 + 1 = 10        | 10    |
      | f(x) = 2*(x + 3) - x  | f(x) = 2·(x + 3) - x | 4     | f(4) = 2·(4 + 3) - 4 = 10  | 10    |
      | f(x) = -x + 1         | f(x) = -x + 1        | -2    | f(-2) = -(-2) + 1 = 3      | 3     |
      | f(x) = x·x + 1        | f(x) = x·x + 1       | -3    | f(-3) = (-3)·(-3) + 1 = 10 | 10    |
      | f(x) = 2*x + 1        | f(x) = 2·x + 1       | 0     | f(0) = 2·0 + 1 = 1         | 1     |
      | f(x) = x·x            | f(x) = x·x           | 65536 | f(65536) is too big for a box | 0  |
      | f(x) = x·x + 1        | f(x) = x·x + 1       | 46341 | f(46341) is too big for a box | -2147479014 |
      | f(x) = x·x + 1        | f(x) = x·x + 1       | 46340 | f(46340) = 46340·46340 + 1 = 2147395601 | 2147395601 |
      | f(x) = - -x           | f(x) = -(-x)         | 3     | f(3) = -(-3) = 3           | 3     |
      | f(x) = 2 - -x         | f(x) = 2 - (-x)      | 3     | f(3) = 2 - (-3) = 5        | 5     |
      | f(x) = 2 - x          | f(x) = 2 - x         | -3    | f(-3) = 2 - (-3) = 5       | 5     |

  Scenario Outline: A rule the checker cannot evaluate is refused with a reason
    When I read the rule "<rule>" for the function f
    Then the rule is refused saying "<message>"

    Examples:
      | rule           | message                               |
      | f(x) = x ^ 2   | not a number, x, + - * or a bracket   |
      | f(x) = y + 1   | not a number, x, + - * or a bracket   |
      | f(x) =         | nothing after the equals sign         |
      | f(x) = (x + 1 | a bracket is not closed               |
      | f(x) = x +     | the rule ends too soon                |
      | f(x) = x x     | where it should end                   |
      | g(x) = x       | but the function is called            |
      | x + 1          | must look like                        |

  Scenario Outline: The banner says in words whether the machine agrees with the rule
    Then the rule status for box a0 is "<said>" when finished is <finished>, the box holds <held> and the rule gives <rule>

    Examples:
      | finished | held | rule | said                                                              |
      | false    | 3    | 10   | The program has not finished. Box a0 holds 3.                     |
      | true     | 10   | 10   | Box a0 holds 10. This is the same as the rule.                    |
      | true     | 9    | 10   | Box a0 holds 9. The rule gives 10. These are different.           |

  Scenario Outline: The banner says what happened when the program did not finish well
    Then the rule status for box a0 after a <trouble> with the box at <held> is "<said>"

    Examples:
      | trouble | held | said                                                        |
      | fault   | 4    | The program stopped with a fault. Box a0 holds 4.           |
      | limit   | 4    | The program kept running and was stopped. Box a0 holds 4.   |
      | too-big | 4    | The rule gives a number that does not fit in a box. Choose a smaller number for x. |

  Scenario Outline: A function phrase runs the program on a fresh machine
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0
    When I check the function phrase: <phrase>
    Then the function phrase <verdict>

    Examples:
      | phrase           | verdict |
      | f(3) is 10       | passes  |
      | f(3) is 9        | fails   |
      | f(0) is 1        | passes  |
      | f(-2) is 5       | passes  |
      | f(f(2)) is 26    | passes  |
      | f(f(2)) is 25    | fails   |
      | f(0x10) is 257   | passes  |
      | f(0b11) is 10    | passes  |
      | f(4294967295) is 2 | passes |

  Scenario Outline: The phrase about x is true of the x the machine started with
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0 started with x = 3
    When I check the function phrase: <phrase>
    Then the function phrase <verdict>

    Examples:
      | phrase | verdict |
      | x is 3 | passes  |
      | x is 1 | fails   |

  Scenario: The phrase about x says what x was
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0 started with x = 1
    When I check the function phrase: x is 3
    Then the function phrase says "x is 1, not 3"

  Scenario: The phrase about x in a lesson without a function fails with a reason
    Given the program "addi a0, zero, 1; ebreak" with no function
    When I check the function phrase: x is 3
    Then the function phrase fails
    And the function phrase says "this lesson has no function"

  Scenario: A function phrase says what the program gave
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0
    When I check the function phrase: f(3) is 9
    Then the function phrase fails
    And the function phrase says "f(3) is 10, not 9"

  Scenario: A function phrase uses the input box and the output box of the function
    Given the function program "mul a1, a0, a0; addi a1, a1, 1; ebreak" named g from box a0 to box a1
    When I check the function phrase: g(4) is 17
    Then the function phrase passes

  Scenario: A function phrase does not use the machine state the student left behind
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0
    And the student filled the table for "1" on the function program
    When I check the function phrase: f(3) is 10
    Then the function phrase passes

  Scenario: A phrase about another function name fails with a reason
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0
    When I check the function phrase: g(3) is 10
    Then the function phrase fails
    And the function phrase says "this lesson's function is called f, not g"

  Scenario: A function phrase in a lesson without a function fails with a reason
    Given the program "addi a0, zero, 1; ebreak" with no function
    When I check the function phrase: f(3) is 10
    Then the function phrase fails
    And the function phrase says "this lesson has no function"

  Scenario: A program that never stops has no value for the function
    Given the function program "loop: jal zero, loop" named f from box a0 to box a0
    When I check the function phrase: f(3) is 10
    Then the function phrase fails
    And the function phrase says "does not stop for f(3) within 1000 steps"

  Scenario Outline: The table phrase is true only for rows the student filled
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0
    And the student filled the table for "<filled>" on the function program
    When I check the function phrase: the student filled the table for 1, 2, 3
    Then the function phrase <verdict>

    Examples:
      | filled  | verdict |
      | 1, 2, 3 | passes  |
      | 3, 1, 2 | passes  |
      | 1, 2    | fails   |

  Scenario: The table phrase says which rows are missing
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0
    And the student filled the table for "1" on the function program
    When I check the function phrase: the student filled the table for 1, 2, 3
    Then the function phrase says "has not filled the table for 2, 3"

  Scenario: The right answers of a table come from running the program on each input
    Given the function program "mul a0, a0, a0; addi a0, a0, 1; ebreak" named f from box a0 to box a0
    Then the table for the inputs "1, 2, 3, 0" expects "2, 5, 10, 1"

  Scenario: The fixture lesson with a function loads
    Given the lesson "x1/05-function"
    Then the lesson loads from disk

  Scenario Outline: A broken function block is refused when the lesson loads
    Given the lesson "x1/05-function"
    When I replace "<find>" with "<replace>" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | find                       | replace                         | message                                     |
      | rule: \"f(x) = x·x + 1\"   | rule: \"f(x) = x ^ 2\"          | function: rule:                             |
      | rule: \"f(x) = x·x + 1\"   | rule: \"g(x) = x·x + 1\"        | names the function                          |
      | rule: \"f(x) = x·x + 1\"   | rule: 5                         | rule must be text                           |
      | inputs: [a0]\n  output     | inputs: [a0, a1]\n  output      | inputs must list exactly one box            |
      | inputs: [a0]\n  output     | inputs: [a5]\n  output          | inputs[0] uses box a5 but boxes lists only a0 |
      | output: a0\n  rule         | output: a1\n  rule              | output uses box a1 but boxes lists only a0  |
      | name: f\n                  | name: F\n                       | name must be a short lowercase word         |
      | name: f\n                  | name: f\n  speed: 3\n            | unknown key                                 |
      | function:\n  name: f\n  inputs: [a0]\n  output: a0\n  rule: \"f(x) = x·x + 1\" | function: 3 | function: must be a mapping |

  Scenario Outline: Function phrases and table asks need a function and agree with it
    Given the lesson "x1/05-function"
    When I replace "<find>" with "<replace>" in "<file>"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | file         | find                                                            | replace                              | message                                         |
      | lesson.yaml  | function:\n  name: f\n  inputs: [a0]\n  output: a0\n  rule: \"f(x) = x·x + 1\"\n | | a table ask needs a function block   |
      | lesson.yaml  | function:\n  name: f\n  inputs: [a0]\n  output: a0\n  rule: \"f(x) = x·x + 1\"\n | | needs a function block in lesson.yaml |
      | lesson.yaml  | - x is 3                                                        | - g(3) is 10                         | names g but the function is called f            |
      | checks.feature | Then f(3) is 10                                               | Then g(3) is 10                      | names g but the function is called f            |
      | lesson.yaml  | inputs: [1, 2, 3]                                               | inputs: [1, 1, 3]                    | must not repeat a number                        |
      | lesson.yaml  | inputs: [1, 2, 3]                                               | inputs: []                           | list of 1 to 8 whole numbers                    |
      | lesson.yaml  | inputs: [1, 2, 3]                                               | inputs: [1, 100000]                  | each from -99999 to 99999                       |
      | lesson.yaml  | input: 3\n    ask:                                                | ask:                                 | must say which x it is judged at                |
      | lesson.yaml  | input: 3\n    until:                                              | until:                               | must say which x it is judged at                |
      | lesson.yaml  | - x is 3                                                        | - x is 100000                        | x must be a whole number from -99999            |
      | lesson.yaml  | input: 3                                                        | input: 2.5                           | input must be a whole number from -99999        |
      | lesson.yaml  | input: 3                                                        | input: 100000                        | input must be a whole number from -99999        |
      | lesson.yaml  | inputs: [1, 2, 3]                                               | inputs: [1, 2.5]                     | list of 1 to 8 whole numbers                    |
      | lesson.yaml  | inputs: [1, 2, 3]                                               | inputs: [1, 2, 3, 4, 5, 6, 7, 8, 9]  | list of 1 to 8 whole numbers                    |
      | lesson.yaml  | target: a0\n    onWrong                                         | target: zork\n    onWrong              | no box called 'zork' |
      | lesson.yaml  | target: a0\n    onWrong                                         | target: a1\n    onWrong              | ask uses box a1 but boxes lists only a0         |
      | lesson.yaml  | match: \"2:4\"                                                  | match: \"2:5\"                       | is the correct answer                           |
      | lesson.yaml  | match: \"2:4\"                                                  | match: \"9:4\"                       | 9 is not one of the table inputs 1, 2, 3       |
      | lesson.yaml  | match: \"2:4\"                                                  | match: \"two\"                       | a table ask needs a match like                  |
      | lesson.yaml  | mul a0, a0, a0\n    addi                                        | b: jal zero, b\n    addi    | does not stop for input                         |

  Scenario: The checker accepts a lesson whose rule agrees with the program
    Given the lesson "x1/05-function"
    When I check the lesson
    Then the check passes
    And the solution "good.s" earned "pass" in 2 steps with 2 cards
    And the solution "wrong.s" earned "nothing" in 1 steps with 1 cards

  Scenario: The checker fails when the rule disagrees with a reference solution on a listed input
    Given the lesson "x1/05-function"
    When I replace "rule: \"f(x) = x·x + 1\"" with "rule: \"f(x) = x·x + 2\"" in "lesson.yaml"
    And I check the lesson
    Then the check fails with "rule f(x) = x·x + 2 says f(1) is 3 but solution good.s gives 2"
    And the check fails with "says f(3) is 11 but solution good.s gives 10"

  Scenario: The checker fails when the rule disagrees with the starter of a lesson that has a table
    Given the lesson "x1/05-function"
    When I replace "rule: \"f(x) = x·x + 1\"" with "rule: \"f(x) = x + 1\"" in "lesson.yaml"
    And I check the lesson
    Then the check fails with "rule f(x) = x + 1 says f(2) is 3 but the starter gives 5"

  Scenario: The checker fails when the program changes and the rule stays
    Given the lesson "x1/05-function"
    When I replace "addi a0, a0, 1" with "addi a0, a0, 2" in "solutions/good.s"
    And I check the lesson
    Then the check fails with "says f(1) is 2 but solution good.s gives 3"

  Scenario: A scene that fixes x is judged at that x, so a number ask can depend on x
    Given the lesson "x1/05-function"
    When I check the lesson
    Then the check passes

  Scenario: A number ask that depends on x fails when its answer is for another x
    Given the lesson "x1/05-function"
    When I replace "input: 3" with "input: 4" in "lesson.yaml"
    And I check the lesson
    Then the check fails with "ask answer 10 but the starter produces 17"

  Scenario: A scene that waits for the student to type x is judged at that x
    Given the lesson "x1/05-function"
    When I replace "- x is 3" with "- x is 4" in "lesson.yaml"
    And I check the lesson
    Then the check fails with "no pass solution (or the starter) satisfies"

  Scenario: The checker refuses a rule that does not fit in a box at a listed input
    Given the lesson "x1/05-function"
    When I replace "inputs: [1, 2, 3]" with "inputs: [1, 2, 60000]" in "lesson.yaml"
    And I replace "match: 3" with "match: 60000" in "lesson.yaml"
    And I check the lesson
    Then the check fails with "is too big for a box at f(60000)"

  Scenario: The checker reads a hex input of a phrase
    Given the lesson "x1/05-function"
    When I replace "Then f(3) is 10" with "And f(0xFFFF) is 0" in "checks.feature"
    And I check the lesson
    Then the check fails with "is too big for a box at f(65535)"

  Scenario: The checker checks the outer input of a nested phrase
    Given the lesson "x1/05-function"
    When I replace "And f(f(2)) is 26" with "And f(f(300)) is 0" in "checks.feature"
    And I check the lesson
    Then the check fails with "is too big for a box at f(90001)"

  Scenario: The checker includes the x of a scene in the rule-fit check
    Given the lesson "x1/05-function"
    When I replace "input: 5" with "input: 60000" in "lesson.yaml"
    And I check the lesson
    Then the check fails with "is too big for a box at f(60000)"
