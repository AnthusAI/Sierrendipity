Feature: Change One Number

  @pass
  Scenario: Box a2 holds 42 and the machine stopped
    Then the machine halted normally
    And box a2 holds 42
    And the program has at most 4 cards

  @bonus @star=another-way
  Scenario: Another way, the first card was left alone
    Then the word at address 0 is 0x00500513
    And box a2 holds 42
