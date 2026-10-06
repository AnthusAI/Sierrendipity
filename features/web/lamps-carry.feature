@web
Feature: Adding in binary with a carry that hops left
  Two small binary numbers are added column by column. The carry hops one column to the left,
  and the same story is told as a text trace so it works with animation off.

  Background:
    Given the lamp lab is open

  Scenario: 5 + 7 step by step
    Then "Carry ripple 5 + 7" shows no steps yet
    When I take the next step in "Carry ripple 5 + 7"
    Then the trace of "Carry ripple 5 + 7" is:
      | column 0: 1 + 1 = 0 carry 1 |
    When I take the next step in "Carry ripple 5 + 7"
    And I take the next step in "Carry ripple 5 + 7"
    And I take the next step in "Carry ripple 5 + 7"
    Then the trace of "Carry ripple 5 + 7" is:
      | column 0: 1 + 1 = 0 carry 1               |
      | column 1: 0 + 1 + 1 (carry in) = 0 carry 1 |
      | column 2: 1 + 1 + 1 (carry in) = 1 carry 1 |
      | column 3: 0 + 0 + 1 (carry in) = 1 carry 0 |
    And "Carry ripple 5 + 7" announces the answer "5 + 7 = 12"

  Scenario: 15 + 1 ripples all the way across
    When I play "Carry ripple 15 + 1" to the end
    Then the trace of "Carry ripple 15 + 1" is:
      | column 0: 1 + 1 = 0 carry 1               |
      | column 1: 1 + 0 + 1 (carry in) = 0 carry 1 |
      | column 2: 1 + 0 + 1 (carry in) = 0 carry 1 |
      | column 3: 1 + 0 + 1 (carry in) = 0 carry 1 |
      | column 4: 0 + 0 + 1 (carry in) = 1 carry 0 |
    And "Carry ripple 15 + 1" announces the answer "15 + 1 = 16"

  Scenario: Stepping back and starting over
    When I take the next step in "Carry ripple 5 + 7"
    And I take the next step in "Carry ripple 5 + 7"
    And I take the previous step in "Carry ripple 5 + 7"
    Then "Carry ripple 5 + 7" shows 1 step
    When I start "Carry ripple 5 + 7" over
    Then "Carry ripple 5 + 7" shows no steps yet

  Scenario: With reduced motion the ripple is instant
    Given the system prefers reduced motion
    And the lamp lab is open
    When I press play in "Carry ripple 5 + 7"
    Then "Carry ripple 5 + 7" shows all 4 steps at once
    And "Carry ripple 5 + 7" announces the answer "5 + 7 = 12"

  Scenario: A full 32-lamp sum scrolls inside its own box instead of the page
    Then "Carry ripple 4294967295 + 1" scrolls sideways inside itself
    And the page does not scroll sideways

  Scenario: Numbers that are not whole 32-bit numbers get a friendly message
    Then "Carry ripple of a negative number" asks for whole numbers from 0 to 4294967295
    And "Carry ripple of a negative number" shows no table
