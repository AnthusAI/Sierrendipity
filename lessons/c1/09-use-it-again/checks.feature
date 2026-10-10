Feature: Use It Again

  @pass
  Scenario: The card f is in the list and gives the rule's answer for 3, 5 and 7
    Then the program uses the card "f"
    And the machine made at least 1 call
    And every call returned
    And the machine reached the end
    And f(3) is 10
    And f(5) is 26
    And f(7) is 50

  @bonus @star=twice
  Scenario: Twice, the card f runs two times on the same number
    Then the machine made at least 2 calls
    And every call returned
    And box a0 holds 26
    And f(2) is 26
