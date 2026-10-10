@coach
Feature: The function lessons 08, 09 and 10 play from the first scene to the last
  The student saves two cards as a card of her own, uses it for several numbers and then finds that the order
  of two cards changes the answer. The coach engine plays each lesson without a browser: a wrong guess gets a
  kind reply about that guess and leads to the scene that shows the answer, a run that misses the goal gets
  help, and every right action leads on.

  Scenario: Lesson 08 saves two cards as the card f, and the card gives 50 for 7
    Given the player starts the lesson "c1/08-make-your-own-card"
    Then the player is on the scene "save"
    And the Step button is called "Step"
    When the player saves the cards 1 to 2 as the card "f"
    Then the list holds 1 cards
    And the player is on the scene "predict"
    And the coach confirmation says "You made a card named f"
    When the player fills the table with "50"
    Then the player is on the scene "use"
    And the coach shows no reply
    When the player types 7 for x
    And the player selects Step until the machine stops
    Then the box "a0" holds 50
    And the coach confirmation says "Your card f gives 50 for 7"
    And the lesson is finished
    And the lesson is passed

  Scenario Outline: Lesson 08 answers a wrong table with a reply about the row and shows the card at work
    Given the player starts the lesson "c1/08-make-your-own-card"
    When the player saves the cards 1 to 2 as the card "f"
    And the player fills the table with "<wrote>"
    Then the player is on the scene "use"
    And the coach reply says "Row x = 7: you wrote <wrote>."
    And the coach reply says "<said>"
    When the player types 7 for x
    And the player selects Step until the machine stops
    Then the box "a0" holds 50
    And the lesson is passed

    Examples:
      | wrote | said                                   |
      | 49    | The rule also adds 1.                  |
      | 8     | The rule multiplies x by x first.      |
      | 14    | Use the rule above the boxes.          |

  Scenario: Lesson 08 helps a student who runs the two cards before she saves them
    Given the player starts the lesson "c1/08-make-your-own-card"
    When the player selects Step until the machine stops
    Then the player is on the scene "save"
    And the coach help for a missed goal says "Use Select, check both cards, then use Save as card."
    When the player selects Try again
    And the player saves the cards 1 to 2 as the card "f"
    Then the player is on the scene "predict"
    And the lesson is not passed

  Scenario: Lesson 08 helps a student who runs the card f with the wrong x
    Given the player starts the lesson "c1/08-make-your-own-card"
    When the player saves the cards 1 to 2 as the card "f"
    And the player fills the table with "50"
    And the player selects Step until the machine stops
    Then the player is on the scene "use"
    And the box "a0" holds 2
    And the coach help for a missed goal says "Type 7 for x"
    When the player selects Try again
    And the player types 7 for x
    And the player selects Step until the machine stops
    Then the box "a0" holds 50
    And the lesson is passed

  Scenario: Lesson 09 runs one card for 5, 3 and 7 and then runs it two times
    Given the player starts the lesson "c1/09-use-it-again"
    Then the player is on the scene "bring"
    When the player adds the card "f" to the list
    Then the list holds 2 cards
    And the player is on the scene "predict"
    When the player answers 26
    Then the player is on the scene "five"
    When the player types 5 for x
    And the player selects Step until the machine stops
    Then the box "a0" holds 26
    And the player is on the scene "three"
    When the player types 3 for x
    And the player selects Step until the machine stops
    Then the box "a0" holds 10
    And the player is on the scene "seven"
    When the player types 7 for x
    And the player selects Step until the machine stops
    Then the box "a0" holds 50
    And the coach confirmation says "You made it one time and used it three times."
    And the lesson is passed
    And the player is on the scene "twice"
    When the player adds the card "f" to the list
    And the player types 2 for x
    And the player selects Step until the machine stops
    Then the box "a0" holds 26
    And the player has the star "twice"
    When the player continues
    Then the player is on the scene "twice-why"
    When the player answers 0
    Then the coach reply says "The number 2 is the x at the start."
    And the player is on the scene "twice-why"
    When the player answers 1
    Then the coach confirmation says "The second f used 5 and gave 26."
    And the lesson is finished
    And the lesson is passed

  Scenario Outline: Lesson 09 answers a wrong guess for f of 5 and shows the card at work
    Given the player starts the lesson "c1/09-use-it-again"
    When the player adds the card "f" to the list
    And the player answers <guess>
    Then the player is on the scene "five"
    And the coach reply says "You said <guess>."
    And the coach reply says "<said>"

    Examples:
      | guess | said                                    |
      | 25    | The rule also adds 1.                   |
      | 6     | The rule multiplies x by x first.       |
      | 10    | Use the rule above the boxes.           |

  Scenario: Lesson 09 helps a student who runs the list without the card f
    Given the player starts the lesson "c1/09-use-it-again"
    When the player selects Step until the machine stops
    Then the player is on the scene "bring"
    And the coach help for a missed goal says "Drag f from the tray into the list."

  Scenario: Lesson 09 helps a student who types the wrong number
    Given the player starts the lesson "c1/09-use-it-again"
    When the player adds the card "f" to the list
    And the player answers 26
    And the player types 4 for x
    And the player selects Step until the machine stops
    Then the player is on the scene "five"
    And the coach help for a missed goal says "Type 5 for x"
    When the player selects Try again
    And the player types 5 for x
    And the player selects Step until the machine stops
    Then the player is on the scene "three"

  Scenario: Lesson 09 does not record a pass before the run for 7
    Given the player starts the lesson "c1/09-use-it-again"
    When the player adds the card "f" to the list
    And the player answers 26
    And the player types 5 for x
    And the player selects Step until the machine stops
    Then the lesson is not passed

  Scenario: Lesson 10 shows that add 1 before the multiply card gives 64
    Given the player starts the lesson "c1/10-order-matters"
    Then the Step button is called "Step"
    When the player selects Step until the machine stops
    Then the box "a0" holds 50
    And the player is on the scene "predict"
    When the player answers 64
    Then the player is on the scene "swap"
    When the player moves card 3 above card 2
    And the player selects Step until the machine stops
    Then the box "a0" holds 64
    And the coach confirmation says "8 times 8 is 64"
    And the lesson is finished
    And the lesson is passed

  Scenario Outline: Lesson 10 answers a wrong guess about the new order and shows the new order at work
    Given the player starts the lesson "c1/10-order-matters"
    When the player selects Step until the machine stops
    And the player answers <guess>
    Then the player is on the scene "swap"
    And the coach reply says "You said <guess>."
    And the coach reply says "<said>"
    When the player moves card 3 above card 2
    And the player selects Step until the machine stops
    Then the box "a0" holds 64
    And the lesson is passed

    Examples:
      | guess | said                                          |
      | 50    | That is the first order.                      |
      | 8     | The box holds 8 after the add.                |
      | 9     | Think about which card runs first.            |

  Scenario: Lesson 10 helps a student who runs the cards without moving one
    Given the player starts the lesson "c1/10-order-matters"
    When the player selects Step until the machine stops
    And the player answers 64
    And the player selects Start again
    And the player selects Step until the machine stops
    Then the player is on the scene "swap"
    And the box "a0" holds 50
    And the coach help for a missed goal says "Put the add 1 card above the multiply card"
    And the lesson is not passed
    When the player selects Try again
    And the player moves card 3 above card 2
    And the player selects Step until the machine stops
    Then the lesson is passed
