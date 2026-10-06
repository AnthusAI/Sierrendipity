Feature: Add

  @pass
  Scenario: The machine adds 5 and 7 into box a2
    Then the machine reached the end
    And box a2 holds 12

  @bonus @star=called-it
  Scenario: Called it, the student's first guess was right
    Then the student's first prediction for "a2" was 12
