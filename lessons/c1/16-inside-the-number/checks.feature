Feature: Inside the Number

  @pass
  Scenario: Lamp 30 turned Add into Subtract and box a2 holds 7
    Then the machine reached the end
    And box a2 holds 7

  @bonus @star=below-zero
  Scenario: A box went below zero
    Then the machine reached the end
    And box a2 holds -2
