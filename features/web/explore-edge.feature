@web
Feature: Explore copes with slow, stale, empty and large results
  The compilation hierarchy always matches the source it was built from.

  Background:
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    And I switch the language to C

  Scenario: A slow result is discarded when the language changes
    Given I paste this into the editor:
      """
      // slow
      int main(void) { return 0; }
      """
    When I press "Explore"
    And I switch the language to Python
    And I wait for the slow response
    Then there is no inspector pane

  Scenario: A slow result is discarded when the source changes
    Given I paste this into the editor:
      """
      // slow
      int main(void) { return 0; }
      """
    When I press "Explore"
    And I paste this into the editor:
      """
      int main(void) { return 1; }
      """
    And I wait for the slow response
    Then there is no inspector pane

  Scenario: Editing after Explore hides the highlights and offers Re-explore
    Given I paste this into the editor:
      """
      int main(void) { return 0; }
      """
    When I press "Explore"
    And I select the instruction "addi sp, sp, -32"
    Then source line 2 is highlighted in the editor
    When I paste this into the editor:
      """
      int main(void) { return 2; }
      """
    Then the stale source note is shown
    And the editor shows no linked highlight
    When I press "Re-explore"
    Then the stale source note is gone

  Scenario: An ok response without a program is reported
    Given I paste this into the editor:
      """
      // noprogram
      """
    When I press "Explore"
    Then the terminal shows "explore returned no program"
    And there is no inspector pane

  Scenario: A program with only runtime code shows a hint
    Given I paste this into the editor:
      """
      // runtimeonly
      """
    When I press "Explore"
    Then I see the message "no user code"

  Scenario: Explore is unavailable while a run is active
    When I press Run
    Then the terminal shows "Name: "
    And the "Explore" button is disabled

  Scenario: Two source files are grouped by file and line
    When I create the file "util.c"
    And I paste this into the editor:
      """
      int add(int a, int b) { return a + b; }
      """
    And I open the file "main.c"
    And I paste this into the editor:
      """
      int main(void) {
        int sum = 0;
        for (int i = 1; i <= 3; i++) {
          sum = add(sum, i);
        }
        return 0;
      }
      """
    And I press "Explore"
    Then the assembly chips include "main.c:4"
    And the assembly chips include "util.c:1"
    When I select the instruction "add a5, a4, a5"
    Then no source line is highlighted in the editor
    When I click the chip "util.c:1"
    Then the editor shows "return a + b"
    And the file tab "util.c" is active
    When I open the file "main.c"
    Then the assembly chips include "util.c:1"

  Scenario: A 20,000 instruction program keeps the DOM small
    Given I paste this into the editor:
      """
      // big
      """
    When I press "Explore"
    Then there are fewer than 300 instruction rows
    When I press "Step"
    Then the PC is 0x00000004
    When I open the "Machine" tab
    Then there are fewer than 300 machine rows
