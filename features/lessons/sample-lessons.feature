Feature: The five sample lessons of Course 1
  The early lessons are tiny: one new idea, one student action, at most three cards, about three
  minutes. The machine starts small (one box, no pointing arrow, no hex) and the Stop card is hidden
  as "the end of the list". Each lesson is authored as data and proven by running its reference
  solutions through the machine and its checks.

  Scenario Outline: Each lesson is small and loads cleanly
    Given the lesson "<id>"
    Then the lesson loads from disk
    And the lesson has <scenes> scenes
    And the starter has <cards> cards
    And the lesson shows the boxes "<boxes>"
    And the lesson hides the end marker and the pointing arrow
    And every scene says at most 2 sentences
    And every scene says at most 30 words
    And the lesson has a ghost for every Show me
    And the lesson takes at most 4 minutes

    Examples:
      | id                       | scenes | cards | boxes      |
      | c1/01-press-the-button   | 2      | 1     | a0         |
      | c1/02-change-the-number  | 3      | 1     | a0         |
      | c1/03-last-one-wins      | 2      | 2     | a0         |
      | c1/04-two-boxes          | 2      | 2     | a0, a1     |
      | c1/05-add                | 3      | 3     | a0, a1, a2 |

  Scenario: The boxes and ideas appear one at a time
    Given the lesson "c1/04-two-boxes"
    Then the lesson loads from disk
    And the lesson introduces "two-boxes"

  Scenario: Lesson 1 cannot be failed: the starter is already right
    Given the lesson "c1/01-press-the-button"
    Then the lesson loads from disk
    And the starter is the cards "0x00500513"
    When the starter program runs
    Then the phrase "the box shows 5" passes
    And the phrase "the machine reached the end" passes
    And the phrase "the machine has taken 1 step" passes
    And every scene condition holds at the end

  Scenario: Lesson 1 checks and solutions
    Given the lesson "c1/01-press-the-button"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass" in 1 steps with 1 cards
    And the solution "wrong-six.hex" earned "nothing" in 1 steps with 1 cards
    And the solution "wrong-no-card.hex" earned "nothing" in 0 steps with 0 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 2 accepts any other number for the bonus, but the goal is 9
    Given the lesson "c1/02-change-the-number"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass" in 1 steps with 1 cards
    And the solution "another-way.hex" earned "another-way" in 1 steps with 1 cards
    And the solution "unchanged.hex" earned "nothing" in 1 steps with 1 cards
    And the solution "wrong-no-card.hex" earned "nothing" in 0 steps with 0 cards
    And the solution "wrong-two-cards.hex" earned "nothing" in 2 steps with 2 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario Outline: A wrong answer says what the student guessed and sends her to watch the machine
    Given the lesson "<id>"
    Then the lesson loads from disk
    And the scene "predict" asks for the number <answer> for "<box>"
    And no reply says "Close"
    And the lesson has the fallback reply "<fallback>"

    Examples:
      | id                  | answer | box | fallback         |
      | c1/03-last-one-wins | 8      | a0  | Watch the box.   |
      | c1/05-add           | 12     | a2  | Watch box a2.    |

  Scenario Outline: Goal scenes confirm in friendly words, not in test-log words
    Given the lesson "<id>"
    Then the lesson loads from disk
    And every scene that waits on the machine says something when it is done

    Examples:
      | id                      |
      | c1/01-press-the-button  |
      | c1/02-change-the-number |
      | c1/03-last-one-wins     |
      | c1/04-two-boxes         |
      | c1/05-add               |

  Scenario: Lesson 3 ends with 8 whatever the student guessed
    Given the lesson "c1/03-last-one-wins"
    Then the lesson loads from disk
    When the starter program runs
    Then the phrase "the box shows 8" passes
    And every scene condition holds at the end

  Scenario: Lesson 3 checks and solutions
    Given the lesson "c1/03-last-one-wins"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass, called-it" in 2 steps with 2 cards
    And the solution "good-wrong-guess.hex" earned "pass" in 2 steps with 2 cards
    And the solution "good-guessed-three.hex" earned "pass" in 2 steps with 2 cards
    And the solution "wrong-swapped.hex" earned "nothing" in 2 steps with 2 cards
    And the solution "wrong-adds.hex" earned "nothing" in 2 steps with 2 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 4 changes one card to fill the second box
    Given the lesson "c1/04-two-boxes"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass" in 2 steps with 2 cards
    And the solution "unchanged.hex" earned "nothing" in 2 steps with 2 cards
    And the solution "wrong-first-card.hex" earned "nothing" in 2 steps with 2 cards
    And the solution "wrong-both.hex" earned "nothing" in 2 steps with 2 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 5 is the add lesson
    Given the lesson "c1/05-add"
    Then the lesson loads from disk
    And the starter is the cards "0x00500513 0x00700593 0x00b50633"
    And the scene "predict" asks for the number 12 for "a2"
    When the starter program runs
    Then the phrase "box a2 holds 12" passes
    And the phrase "the machine has taken 3 steps" passes
    And every scene condition holds at the end

  Scenario: Lesson 5 checks and solutions
    Given the lesson "c1/05-add"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass, called-it" in 3 steps with 3 cards
    And the solution "good-asm.s" earned "pass, called-it" in 3 steps with 3 cards
    And the solution "good-wrong-guess.hex" earned "pass" in 3 steps with 3 cards
    And the solution "wrong-sub.hex" earned "nothing" in 3 steps with 3 cards
    And the solution "wrong-doubles.hex" earned "nothing" in 3 steps with 3 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario Outline: The pass is reachable by pressing Step once per card
    Given the lesson "<id>"
    Then the lesson loads from disk
    When the student presses Step once per card on the starter
    Then the lesson's pass check holds
    And every scene condition holds at the end

    Examples:
      | id                      |
      | c1/01-press-the-button  |
      | c1/03-last-one-wins     |
      | c1/05-add               |

  Scenario Outline: Every scene's until condition is met by a pass solution
    Given the lesson "<id>"
    When I check the lesson
    Then the check passes

    Examples:
      | id                      |
      | c1/01-press-the-button  |
      | c1/02-change-the-number |
      | c1/03-last-one-wins     |
      | c1/04-two-boxes         |
      | c1/05-add               |

  Scenario: The lessons say Continue where a scene waits for it and name the boxes
    Given the lesson "c1/01-press-the-button"
    Then the lesson loads from disk
    And the scene "the-card" says "Continue"
    Given the lesson "c1/04-two-boxes"
    Then the lesson loads from disk
    And the scene "run" says "name"
    And the lesson doc says that last one wins holds for put cards, not for add
