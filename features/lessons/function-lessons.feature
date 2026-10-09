Feature: The function lessons of Course 1 (make your own card, use it again, order matters)
  Lesson 08 saves two cards as one card named f. Lesson 09 uses that card for several numbers and runs it two
  times in a row. Lesson 10 shows that the order of two cards changes the answer. Each lesson is data, proven by
  running its reference solutions through the machine and its checks.

  Scenario Outline: Each function lesson is small, loads cleanly and is not a draft
    Given the lesson "<id>"
    Then the lesson loads from disk
    And the lesson has <scenes> scenes
    And the starter has <cards> cards
    And the lesson shows the boxes "a0"
    And the lesson hides the end marker and the pointing arrow
    And every scene says at most 2 sentences
    And every scene says at most 30 words
    And the lesson has a ghost for every Show me
    And the lesson takes at most 4 minutes
    And the lesson is not a draft
    And the lesson introduces "<introduces>"

    Examples:
      | id                        | scenes | cards | introduces    |
      | c1/08-make-your-own-card  | 3      | 2     | function-card |
      | c1/09-use-it-again        | 7      | 1     | reuse         |
      | c1/10-order-matters       | 3      | 3     | composition   |

  Scenario Outline: The button is called Step (the lesson has two or more cards) and Reset is called Start again
    Given the lesson "<id>"
    Then the lesson loads from disk
    And the lesson ui shows the controls "step, reset" with the default step label
    And the lesson ui says the spotlight is "ring" and the reset label is "Start again"

    Examples:
      | id                        |
      | c1/08-make-your-own-card  |
      | c1/09-use-it-again        |
      | c1/10-order-matters       |

  Scenario: Lesson 08 asks for a save of two cards named f
    Given the lesson "c1/08-make-your-own-card"
    Then the lesson loads from disk
    And the scene "save" lets the student save 2 to 2 cards named "f"
    And the scene "save" has a tray of 2 cards
    And the scene "save" says if missed something that includes "Use Select, check both cards, then use Save as card."
    And the scene "use" says if missed something that includes "Type 7 for x"

  Scenario: Lesson 08 checks and solutions
    Given the lesson "c1/08-make-your-own-card"
    When I check the lesson
    Then the check passes
    And the solution "good.cards" earned "pass" in 4 steps with 1 cards
    And the solution "put-seven.cards" earned "nothing" in 5 steps with 2 cards
    And the solution "unsaved.s" earned "nothing" in 2 steps with 2 cards
    And the solution "wrong-no-plus-one.s" earned "nothing" in 1 steps with 1 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 09 gives the card f and starts with a card that changes nothing
    Given the lesson "c1/09-use-it-again"
    Then the lesson loads from disk
    And the lesson gives the custom card "f" with 2 cards
    And the starter is the cards "0x00050513"
    And the scene "bring" says if missed something that includes "Drag f from the tray into the list."
    And the scene "five" says if missed something that includes "Type 5 for x"
    And the scene "three" says if missed something that includes "Type 3 for x"
    And the scene "seven" says if missed something that includes "Type 7 for x"

  Scenario: Lesson 09 checks and solutions
    Given the lesson "c1/09-use-it-again"
    When I check the lesson
    Then the check passes
    And the solution "good.cards" earned "pass" in 4 steps with 1 cards
    And the solution "good-with-add-zero.cards" earned "pass" in 5 steps with 2 cards
    And the solution "put-two-twice.cards" earned "twice" in 9 steps with 3 cards
    And the solution "twice.cards" earned "nothing" in 9 steps with 3 cards
    And the solution "wrong-no-card.s" earned "nothing" in 1 steps with 1 cards
    And the solution "wrong-only-five.s" earned "nothing" in 3 steps with 3 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 10 guesses the new order, then drags the add 1 card above the multiply card
    Given the lesson "c1/10-order-matters"
    Then the lesson loads from disk
    And the starter is the cards "0x00700513 0x02a50533 0x00150513"
    And the scene "predict" answers a guess of 50 with a "first order" reply that goes to "swap"
    And the scene "swap" says if missed something that includes "Put the add 1 card above the multiply card"

  Scenario: Lesson 10 checks and solutions
    Given the lesson "c1/10-order-matters"
    When I check the lesson
    Then the check passes
    And the solution "good.s" earned "pass" in 3 steps with 3 cards
    And the solution "wrong-same-order.s" earned "nothing" in 3 steps with 3 cards
    And the solution "wrong-adds-twice.s" earned "nothing" in 3 steps with 3 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario Outline: A goal scene says something kind when it is done
    Given the lesson "<id>"
    Then the lesson loads from disk
    And every scene that waits on the machine says something when it is done

    Examples:
      | id                        |
      | c1/08-make-your-own-card  |
      | c1/09-use-it-again        |
      | c1/10-order-matters       |
