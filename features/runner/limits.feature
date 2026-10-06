Feature: Enforce time, memory, and output limits
  A misbehaving program must not hang or flood the runner.

  Scenario: An infinite loop is stopped at the time limit
    Given a C project
    And the file "main.c" containing:
      """
      int main() { for (;;) {} }
      """
    And a time limit of 2000 ms
    When the project is run
    Then the status is "time_limit_exceeded"

  Scenario: Excessive output is truncated
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdio.h>
      int main() { for (int i = 0; i < 100 * 1024 * 1024 / 16; i++) printf("0123456789abcde\n"); }
      """
    When the project is run
    Then the status is "output_limit_exceeded"
    And the output was truncated

  @linux-only
  Scenario: Excessive memory use is stopped
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdlib.h>
      #include <string.h>
      int main() { char *p = malloc(1024L * 1024 * 1024); memset(p, 1, 1024L * 1024 * 1024); return 0; }
      """
    And a memory limit of 64 MB
    When the project is run
    Then the status is "memory_limit_exceeded"

  Scenario: A nonzero exit status is a runtime error
    Given a Python project
    And the file "main.py" containing:
      """
      import sys
      sys.exit(3)
      """
    When the project is run
    Then the status is "runtime_error"
    And the exit code is 3

  Scenario Outline: Unsafe file paths are refused
    Given a C project
    And the file "<path>" containing:
      """
      int main() { return 0; }
      """
    When the project is run
    Then the request is rejected

    Examples:
      | path       |
      | ../evil.c  |
      | /tmp/x.c   |
      | a/../../b.c |
