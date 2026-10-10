Feature: Make Your Own Card

  @pass
  Scenario: The program calls the card f and the card gives the rule's answer
    Then the program uses the card "f"
    And the machine made at least 1 call
    And every call returned
    And the machine reached the end
    And f(3) is 10
    And f(7) is 50

  @bonus @star=fewer-cards
  Scenario: The list is only the card f
    Then the program uses the card "f"
    And the program has at most 1 card
