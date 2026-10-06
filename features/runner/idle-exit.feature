Feature: Exit when idle
  An unused runner shuts itself down so the task stops costing money.

  Scenario: The runner exits after the idle timeout
    Given a runner process with an idle timeout of 2 seconds
    Then the runner process exits successfully within 15 seconds

  Scenario: A runner with an active program does not exit
    Given a runner process with an idle timeout of 2 seconds
    And a Python project
    And the file "main.py" containing:
      """
      input()
      """
    When the project is started interactively
    Then the runner process is still running after 4 seconds
