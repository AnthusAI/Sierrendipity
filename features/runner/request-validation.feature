Feature: Validate run requests
  Bad requests are refused with a clear error instead of crashing the runner.

  Scenario Outline: Invalid limits are refused
    Given a C project
    And the file "main.c" containing:
      """
      int main() { return 0; }
      """
    And a time limit of <limit> ms
    When the project is run
    Then the request is rejected

    Examples:
      | limit |
      | 0     |
      | -5    |

  Scenario: A non-string stdin is refused
    Given a Python project
    And the file "main.py" containing:
      """
      print("hi")
      """
    And the request field "stdin" set to the number 5
    When the project is run
    Then the request is rejected

  Scenario Outline: Conflicting file paths are refused
    Given a C project
    And the file "<first>" containing:
      """
      int main() { return 0; }
      """
    And the file "<second>" containing:
      """
      int x;
      """
    When the project is run
    Then the request is rejected

    Examples:
      | first  | second  |
      | a.c    | a.c     |
      | a      | a/b.c   |
      | a/b.c  | a       |

  Scenario Outline: The entry must be one of the submitted files
    Given a Python project
    And the file "main.py" containing:
      """
      print("hi")
      """
    And the entry "<entry>"
    When the project is run
    Then the request is rejected

    Examples:
      | entry     |
      | -         |
      | -c        |
      | other.py  |

  Scenario: An oversized request is refused
    Given a Python project
    And a file "main.py" of 6000000 bytes
    When the project is run
    Then the request is rejected with status 413

  Scenario: A source file named like a compiler option is treated as a file
    Given a C project
    And the file "-v.c" containing:
      """
      int main() { return 0; }
      """
    When the project is run
    Then the status is "ok"
