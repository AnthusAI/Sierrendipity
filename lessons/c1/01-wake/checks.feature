Feature: Wake the Machine

  @pass
  Scenario: The machine adds 5 and 7 into box a2 and stops
    Then the machine halted normally
    And box a2 holds 12

  @bonus @star=called-it
  Scenario: Called it, the student's first guess was right
    Then the student's first prediction for "a2" was 12
