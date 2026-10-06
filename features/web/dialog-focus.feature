@web
Feature: Dialogs give focus back
  When a dialog closes, keyboard focus returns to the control that opened it,
  so keyboard users never lose their place.

  Background:
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode

  Scenario: Settings returns focus to the gear button
    When I open Settings by keyboard
    And I press the key "Escape"
    Then the focused control is the "Settings" button

  Scenario: Closing Settings with its close button returns focus too
    When I open Settings
    And I close Settings
    Then the focused control is the "Settings" button

  Scenario: Cancelling New project returns focus to its button
    When I open the "New project" dialog by keyboard
    And I press the key "Escape"
    Then the focused control is the "New project" button

  Scenario: Creating a project returns focus to the New project button
    When I open the "New project" dialog by keyboard
    And I type "focus-test" in the dialog and press Enter
    Then the focused control is the "New project" button

  Scenario: Cancelling a rename returns focus to the rename button
    When I open the "Rename main.py" dialog by keyboard
    And I press the key "Escape"
    Then the focused control is the "Rename main.py" button

  Scenario: Renaming a file leaves focus on a control, not the page
    When I open the "Rename main.py" dialog by keyboard
    And I type "renamed.py" in the dialog and press Enter
    Then the focus is on a control

  Scenario: Deleting a file leaves focus on a control, not the page
    When I open the "Delete main.py" dialog by keyboard
    And I press the key "Enter"
    Then the focus is on a control
