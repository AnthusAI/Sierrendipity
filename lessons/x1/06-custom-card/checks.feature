Feature: Stage fixture, make your own card

  @pass
  Scenario: The program calls the new card and every call returns
    Then the program uses the card "Square-plus-one"
    And the machine made at least 1 call
    And every call returned
    And f(3) is 10
    And f(f(2)) is 26
