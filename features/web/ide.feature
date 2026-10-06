@web
Feature: Edit and run projects in the browser
  Students write code in the browser IDE, run it on their workspace and
  interact with the program in the terminal pane.

  Background:
    Given a mock backend that needs 1500 ms to start
    And the IDE is opened in dev mode

  Scenario: Run shows a starting-your-workspace state then output
    Then I see the message "Starting your workspace"
    And the backend status is "starting"
    When I press Run
    Then the terminal shows "Name: "
    And the backend status is "ready"

  Scenario: Edit and run a multi-file project in the browser
    When I create a project "multi" in C++
    And I create the file "util.cpp"
    And I press Run
    Then the terminal shows "files: main.cpp util.cpp"

  Scenario: Type into the terminal pane
    When I press Run
    Then the terminal shows "Name: "
    When I type "Ada" into the terminal and press Enter
    Then the terminal shows "Hello, Ada!"
    And the program has finished

  Scenario: Compiler errors are visible in the terminal
    When I create a project "broken" in C++
    And I replace the editor text with "#error boom"
    And I press Run
    Then the terminal shows "error: boom"
    And the compiler error is styled distinctly

  Scenario: Stop ends a running program
    When I create a project "forever" in Python
    And I replace the editor text with "while True: pass"
    And I press Run
    Then the terminal shows "still running"
    When I press Stop
    Then the terminal shows "stopped"
    And the program has finished

  Scenario: Projects persist across reloads
    When I create the file "notes.txt"
    And I replace the editor text with "remember me"
    And I reload the page
    Then the file tree lists "notes.txt"
    When I open the file "notes.txt"
    Then the editor shows "remember me"

  Scenario: Switching language loads that language's starter
    When I switch the language to C
    Then the file tree lists "main.c"
    And the editor shows "#include <stdio.h>"
    When I switch the language to Python
    Then the file tree lists "main.py"

  Scenario: Rename and delete files
    When I create the file "scratch.py"
    And I rename the file "scratch.py" to "work.py"
    Then the file tree lists "work.py"
    When I delete the file "work.py"
    Then the file tree does not list "work.py"
