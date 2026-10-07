Feature: Stage fixture, a prediction after the reveal

  @pass
  Scenario: The machine ran the card and the box shows 5
    Then the machine reached the end
    And the box shows 5

  @bonus @star=called-it
  Scenario: Called it, the first guess was right
    Then the student's first prediction for "a0" was 5
