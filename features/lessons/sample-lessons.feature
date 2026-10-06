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
      | c1/01-press-the-button   | 3      | 1     | a0         |
      | c1/02-change-the-number  | 3      | 1     | a0         |
      | c1/03-last-one-wins      | 4      | 2     | a0         |
      | c1/04-two-boxes          | 4      | 2     | a0, a1     |
      | c1/05-add                | 4      | 3     | a0, a1, a2 |

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
    And the phrase "the machine has taken 2 steps" passes
    And every scene condition holds at the end

  Scenario: Lesson 1 checks and solutions
    Given the lesson "c1/01-press-the-button"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass" in 2 steps with 1 cards
    And the solution "wrong-six.hex" earned "nothing" in 2 steps with 1 cards
    And the solution "wrong-no-card.hex" earned "nothing" in 1 steps with 0 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 2 accepts any other number for the bonus, but the goal is 9
    Given the lesson "c1/02-change-the-number"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass" in 2 steps with 1 cards
    And the solution "another-way.hex" earned "another-way" in 2 steps with 1 cards
    And the solution "unchanged.hex" earned "nothing" in 2 steps with 1 cards
    And the solution "wrong-no-card.hex" earned "nothing" in 1 steps with 0 cards
    And the solution "wrong-two-cards.hex" earned "nothing" in 3 steps with 2 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 3 predicts 8 and answers the two anticipated wrong guesses
    Given the lesson "c1/03-last-one-wins"
    Then the lesson loads from disk
    And the scene "predict" asks for the number 8 for "a0"
    And the scene "predict" answers a guess of 11 with a "replaces" reply that goes to "watch"
    And the scene "predict" answers a guess of 3 with a "second card" reply that goes to "watch"
    When the starter program runs
    Then the phrase "the box shows 8" passes
    And every scene condition holds at the end

  Scenario: Lesson 3 checks and solutions
    Given the lesson "c1/03-last-one-wins"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass, called-it" in 3 steps with 2 cards
    And the solution "good-wrong-guess.hex" earned "pass" in 3 steps with 2 cards
    And the solution "good-guessed-three.hex" earned "pass" in 3 steps with 2 cards
    And the solution "wrong-swapped.hex" earned "nothing" in 3 steps with 2 cards
    And the solution "wrong-adds.hex" earned "nothing" in 3 steps with 2 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 4 changes one card to fill the second box
    Given the lesson "c1/04-two-boxes"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass" in 3 steps with 2 cards
    And the solution "unchanged.hex" earned "nothing" in 3 steps with 2 cards
    And the solution "wrong-first-card.hex" earned "nothing" in 3 steps with 2 cards
    And the solution "wrong-both.hex" earned "nothing" in 3 steps with 2 cards
    And the solution "forever.s" was stopped by the step cap

  Scenario: Lesson 5 is the add lesson with the anticipated wrong answer 57
    Given the lesson "c1/05-add"
    Then the lesson loads from disk
    And the starter is the cards "0x00500513 0x00700593 0x00b50633"
    And the scene "predict" asks for the number 12 for "a2"
    And the scene "predict" answers a guess of 57 with a "watch" reply that goes to "watch-add"
    When the starter program runs
    Then the phrase "box a2 holds 12" passes
    And the phrase "the machine has taken 4 steps" passes
    And every scene condition holds at the end

  Scenario: Lesson 5 checks and solutions
    Given the lesson "c1/05-add"
    When I check the lesson
    Then the check passes
    And the solution "good.hex" earned "pass, called-it" in 4 steps with 3 cards
    And the solution "good-asm.s" earned "pass, called-it" in 4 steps with 3 cards
    And the solution "good-wrong-guess.hex" earned "pass" in 4 steps with 3 cards
    And the solution "wrong-sub.hex" earned "nothing" in 4 steps with 3 cards
    And the solution "wrong-doubles.hex" earned "nothing" in 4 steps with 3 cards
    And the solution "forever.s" was stopped by the step cap
