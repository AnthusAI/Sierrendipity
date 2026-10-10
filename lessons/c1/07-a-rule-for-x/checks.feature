Feature: A rule for x

  @pass
  Scenario: The two cards follow the rule f(x) = x·x + 1 and the table is filled
    Then f(3) is 10
    And f(4) is 17
    And f(f(2)) is 26
    And the student filled the table for 1, 2, 3

  @bonus @star=called-it
  Scenario: Called it, the student's first guess for f(4) was right
    Then the student's first prediction for "a0" was 17
