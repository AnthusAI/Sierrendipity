@web
Feature: The IDE copes with a misbehaving environment
  Slow or failing backends, leftovers from earlier sessions and damaged
  browser storage never leave the student with a blank or dead-end screen.

  Scenario: A workspace that fails to start can be retried
    Given a mock backend whose workspace fails to start
    And the IDE is opened in dev mode
    Then the backend status is "error"
    And I see the error "could not start"
    When the backend recovers
    And I press "Retry"
    Then the backend status is "ready"

  Scenario: A run left over from before a reload does not block a new run
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    When I press Run
    Then the terminal shows "Name: "
    When I reload the page
    And I press Run
    Then the terminal shows "Name: "

  Scenario: Damaged saved projects do not break the IDE
    Given a mock backend that needs 0 ms to start
    And saved projects that are damaged
    And the IDE is opened in dev mode
    Then the file tree lists "main.py"

  Scenario: Project names that look like object properties work
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    When I create a project "toString" in Python
    Then the selected project is "toString"

  Scenario: Bad file paths are rejected with a message
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    When I try to create the file "../escape.py"
    Then I see the error "not a valid path"

  Scenario: Renaming onto an existing file is rejected
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    When I create the file "a.py"
    And I try to rename the file "a.py" to "main.py"
    Then I see the error "already exists"
    And the file tree lists "a.py"

  Scenario: Ctrl-C in the terminal stops the program
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    When I create a project "loop" in Python
    And I replace the editor text with "while True: pass"
    And I press Run
    Then the terminal shows "still running"
    When I press the key "Control+c" in the terminal
    Then the terminal shows "stopped"
    And the program has finished

  Scenario: Ctrl-D in the terminal sends end of input
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    When I press Run
    Then the terminal shows "Name: "
    When I press the key "Control+d" in the terminal
    Then the terminal shows "end of input"
    And the program has finished
