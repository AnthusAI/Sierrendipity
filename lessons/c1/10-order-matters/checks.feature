Feature: Order Matters

  @pass
  Scenario: The add 1 card runs before the multiply card, so the box holds 64
    Then the machine reached the end
    And box a0 holds 64
    And the program has 3 cards
    And the word at address 4 is 0x00150513
