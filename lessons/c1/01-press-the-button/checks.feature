Feature: Press the Button

  @pass
  Scenario: The machine followed the card and the box shows 5
    Then the box shows 5
    And the machine has taken at least 1 step
