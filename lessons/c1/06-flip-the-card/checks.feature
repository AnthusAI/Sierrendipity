Feature: Flip the Card

  @pass
  Scenario: The machine ran all three cards and the box shows 3
    Then the machine reached the end
    And the box shows 3
