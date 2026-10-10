Feature: Multiply

  @pass
  Scenario: The student changed the first number to 9 and the machine multiplies it by itself into box a1
    Then the machine reached the end
    And the program differs from the starter
    And box a0 holds 9
    And box a1 holds 81

  @bonus @star=called-it
  Scenario: Called it, the student's first guess was right
    Then the student's first prediction for "a1" was 49
