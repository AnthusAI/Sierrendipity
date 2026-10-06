Feature: Last One Wins

  @pass
  Scenario: The machine ran both cards and the box shows 8
    Then the machine reached the end
    And the box shows 8

  @bonus @star=called-it
  Scenario: Called it, the student's first guess was right
    Then the student's first prediction for "a0" was 8
