Feature: Two Boxes

  @pass
  Scenario: Box a1 holds 9 and box a0 was left alone
    Then the machine reached the end
    And box a1 holds 9
    And box a0 holds 4
