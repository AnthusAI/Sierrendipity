Feature: Cap concurrent runs
  A small task cannot serve unlimited simultaneous programs.

  Scenario: Runs beyond the cap are refused
    Given a C project
    And the file "main.c" containing:
      """
      int main() { for (;;) {} }
      """
    And a time limit of 2000 ms
    When 6 projects are run at once
    Then 4 of them finish with status "time_limit_exceeded"
    And 2 of them are refused with status 429
