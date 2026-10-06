Feature: Change the Number

  @pass
  Scenario: The box shows 9
    Then the machine reached the end
    And the box shows 9

  @bonus @star=another-way
  Scenario: Another way, a different number in the one card
    Then the machine reached the end
    And the program has 1 card
    And the program differs from the starter
    And the box does not show 9
