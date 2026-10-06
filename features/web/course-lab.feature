@web @course
Feature: The component lab shows the course components
  The developer gallery at /lab holds one section per component family. The course section shows the path,
  the warm-up card, the Now-you-can card, the Gallery and the Deck on a fake in-memory store.

  Scenario: The course section shows every component
    When I open the component lab
    Then the lab has a section "Course path and progress"
    And the lab section "Course path and progress" shows the path, a warm-up card, a Now-you-can card, a Gallery and a Deck

  Scenario: Buttons set the progress of the fake store
    When I open the component lab
    And I press "Set progress: all passed" in the lab section "Course path and progress"
    Then the lab path offers "Continue: open the Workspace"
    When I press "Set progress: nothing passed" in the lab section "Course path and progress"
    Then the lab path offers "Continue: Press the Button, about 3 min"

  Scenario: The Now-you-can card says one sentence, shows stars and offers two ways on
    When I open the component lab
    Then the Now-you-can card in the lab says "Spin a number on a card."
    And the Now-you-can card in the lab shows the stars "Passed, Called it"
    And the Now-you-can card in the lab offers "Next lesson, about 4 min" and "Stop here"
    And the Now-you-can card in the lab holds the thing the student made

  Scenario: Pressing the Now-you-can buttons reports the choice
    When I open the component lab
    And I press "Next lesson, about 4 min" in the lab section "Course path and progress"
    Then the lab reports "Next lesson chosen"
    When I press "Stop here" in the lab section "Course path and progress"
    Then the lab reports "Stopped here"
