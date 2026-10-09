@web @coach @function
Feature: Lesson c1/07 A Rule for x plays end to end
  Two cards are a rule for the box. The student sees the number go through the rule, changes x until the box
  shows 50, and fills a table of f(x) for x = 1, 2 and 3.

  Scenario: The banner shows the rule and the first x before any card runs
    Given the coach lab shows lesson "c1/07-a-rule-for-x"
    Then the rule banner reads "f(x) = x·x + 1"
    And the rule banner shows "f(1) = 1·1 + 1 = 2"

  Scenario: Running the two cards at x = 1 finishes the first scene without naming f(x)
    Given the coach lab shows lesson "c1/07-a-rule-for-x"
    When I select Run
    And I select Run
    Then the coach confirms "The rule took 1 and gave 2."
    And the rule banner says "Box a0 holds 2. This is the same as the rule."

  Scenario: Typing 7 for x makes the box show 50 and names the function
    Given the coach lab shows lesson "c1/07-a-rule-for-x" at the scene "fifty"
    When I type 7 for x
    Then the rule banner shows "f(7) = 7·7 + 1 = 50"
    When I select Run
    And I select Run
    Then box "a0" shows 50
    And the coach confirms "This rule is f(x) = x·x + 1, the rule you know from Algebra 2."

  Scenario: A run that misses 50 says what to change
    Given the coach lab shows lesson "c1/07-a-rule-for-x" at the scene "fifty"
    When I type 5 for x
    And I select Run
    And I select Run
    Then the missed-goal help says "The box does not show 50."
    When I select Try again
    Then there is no missed-goal help
    And the lesson shows the step count 0

  Scenario: The table with the right values finishes the lesson
    Given the coach lab shows lesson "c1/07-a-rule-for-x" at the scene "table"
    When I fill the table with "2, 5, 10"
    And I submit the table
    Then the Now you can card is shown

  Scenario Outline: A wrong row gets a reply about that row
    Given the coach lab shows lesson "c1/07-a-rule-for-x" at the scene "table"
    When I fill the table with "<values>"
    And I submit the table
    Then the coach replies "<reply>"

    Examples:
      | values   | reply                                                                    |
      | 1, 5, 10 | Row x = 1: you wrote 1. That is x·x. The rule also adds 1.               |
      | 2, 4, 10 | Row x = 2: you wrote 4. That is x·x. The rule also adds 1.               |
      | 2, 5, 9  | Row x = 3: you wrote 9. That is x·x. The rule also adds 1.               |
      | 2, 5, 7  | Row x = 3: you wrote 7. That is 3 + 3 + 1. The rule multiplies 3 by 3.   |
      | 2, 5, 11 | Row x = 3: you wrote 11. Use the rule above the box. Put the number in place of x. |
