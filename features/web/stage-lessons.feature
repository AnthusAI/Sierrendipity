@web @coach @stage
Feature: Lessons 06 to 08 prove the new visuals
  Three draft lessons exercise the lamps, the flip and the bands: 06 Counting with Lamps, 07 Flip the Card and
  08 Inside the Number. Each plays to the end by its intended path, and each anticipated wrong path gets its own
  kind reply. They are drafts, so the lab plays them but the course path does not list them.

  # 07 Flip the Card

  Scenario: Lesson 07 matches three cards to their lamps and runs the cards
    Given the coach lab shows lesson "c1/07-flip-the-card"
    When I press Continue
    Then the coach says "Flip the card"
    And the stage shows "flip"
    When I press Continue
    Then the coach says "These lamps show"
    And the lamps show no total
    When I click the card 3
    Then the coach says "These lamps are different"
    When I click the card 1
    Then the coach says "This is one more pattern"
    When I click the card 2
    Then the coach says "Make the box end with 3"
    When I press Step
    And I press Step
    And I press Step
    Then box "a0" shows 3
    And the Now you can card is shown
    And the stored progress of "c1/07-flip-the-card" has passed

  Scenario Outline: Lesson 07 answers the wrong card <card> in its own words
    Given the coach lab shows lesson "c1/07-flip-the-card" at the scene "match-one"
    When I click the card <card>
    Then the coach replies "<reply>"
    And the reply is not styled as an error
    And the coach is on the scene "match-one"
    When I click the card 3
    Then the coach is on the scene "match-two"

    Examples:
      | card | reply                                                |
      | 1    | That card puts 1. Add up the lit lamps again         |
      | 2    | That card puts 2. Add up the lit lamps again         |

  Scenario: Lesson 07 offers three free hints on a match
    Given the coach lab shows lesson "c1/07-flip-the-card" at the scene "match-one"
    When I ask for a hint
    Then the hint says "Add up the worth of each lit lamp"
    When I ask for a hint
    And I ask for a hint
    Then the hint says "Select the card that puts 3"
    And no more hints are offered

  # 06 Counting with Lamps

  Scenario: Lesson 06 makes 5, 7, 12 and 42 with lamps
    Given the coach lab shows lesson "c1/06-counting-with-lamps"
    When I press Continue
    And I answer 4
    Then the coach says "Switch lamps on until they make 5"
    When I switch lamp 2
    And I press Step
    Then box "a0" shows 5
    And the coach confirms "make 5. The box shows 5"
    And the coach says "Now make 7"
    When I switch lamp 1
    And I press Step
    Then the coach confirms "Lamps 4, 2 and 1 make 7"
    And the coach says "Add 5 and 7"
    When I press Continue
    Then the coach says "Make 12"
    When I switch lamp 3
    And I switch lamp 1
    And I switch lamp 0
    And I press Step
    Then box "a0" shows 12
    And the coach says "Make 42"
    When I switch lamp 5
    And I switch lamp 2
    And I switch lamp 1
    And I press Step
    Then box "a0" shows 42
    And the Now you can card lists "Read lamps as a number."
    And the stored progress of "c1/06-counting-with-lamps" has passed

  Scenario Outline: Lesson 06 answers the place-value guess <guess> kindly
    Given the coach lab shows lesson "c1/06-counting-with-lamps" at the scene "place"
    When I answer <guess>
    Then the coach replies "<reply>"
    And the reply is not styled as an error

    Examples:
      | guess | reply                              |
      | 3     | Three is the place of the lamp     |
      | 6     | the lamps double                   |
      | 8     | That is the fourth lamp            |
      | 99    | Look at the lamps again            |

  Scenario: Lesson 06 hides the worth labels when it asks for a worth
    Given the coach lab shows lesson "c1/06-counting-with-lamps" at the scene "place"
    Then the lamps show no worth labels

  Scenario: Lesson 06 only lets the lamps that the scene allows be switched
    Given the coach lab shows lesson "c1/06-counting-with-lamps" at the scene "make-five"
    Then lamp 5 is locked
    And lamp 2 is not locked
    When I switch lamp 5
    Then the player's cards are "0x00100513"

  Scenario: Lesson 06 keeps the spinner out of the way so the lamps do the work
    Given the coach lab shows lesson "c1/06-counting-with-lamps" at the scene "make-five"
    Then the number on card 1 is locked with the explanation "Not yet"

  Scenario: Lesson 06 shows the carry as an optional peek
    Given the coach lab shows lesson "c1/06-counting-with-lamps" at the scene "carry"
    Then the stage shows "diagram:D7"
    When I press Continue
    Then the coach is on the scene "make-twelve"

  Scenario: A wrong number is answered by the machine, not by a red screen
    Given the coach lab shows lesson "c1/06-counting-with-lamps" at the scene "make-five"
    When I switch lamp 1
    And I press Step
    Then box "a0" shows 3
    And the coach is on the scene "make-five"

  # 08 Inside the Number

  Scenario: Lesson 08 finds the answer band, predicts, flips lamp 30 and gets 7
    Given the coach lab shows lesson "c1/08-inside-the-number"
    When I press Continue
    Then the coach says "Which band names the box for the answer?"
    When I click the band "rd"
    Then the coach says "Lamp 30 is in the exact job band"
    And the coach shows no confirmation
    When I choose "Subtract"
    Then the coach says "Switch on lamp 30"
    And there is no spotlight
    When I ask for a hint
    Then the spotlight surrounds "lamp:30"
    When I switch lamp 30
    And I press Step
    And I press Step
    And I press Step
    Then box "a2" shows 7
    And the coach confirms "One lamp turned Add into Subtract"
    And the stored progress of "c1/08-inside-the-number" has passed
    And the stored progress of "c1/08-inside-the-number" asked 2 predictions and got 2 right

  Scenario Outline: Lesson 08 answers the band <band> in its own words
    Given the coach lab shows lesson "c1/08-inside-the-number" at the scene "find-answer"
    When I click the band "<band>"
    Then the coach replies "<reply>"
    And the coach is on the scene "find-answer"

    Examples:
      | band   | reply                                   |
      | rs1    | names the first box to read             |
      | rs2    | names the second box to read            |
      | opcode | which type of job this is               |
      | funct3 | picks the exact job                     |
      | funct7 | picks the exact job too                 |

  Scenario Outline: Lesson 08 answers the wrong choice <choice> and lets the machine show the truth
    Given the coach lab shows lesson "c1/08-inside-the-number" at the scene "predict"
    When I choose "<choice>"
    Then the coach replies "Try it"
    And the coach is on the scene "flip"

    Examples:
      | choice   |
      | Add      |
      | Multiply |

  Scenario: Lesson 08 allows only lamp 30 to be switched
    Given the coach lab shows lesson "c1/08-inside-the-number" at the scene "flip"
    Then lamp 30 is not locked
    And lamp 29 is locked
    When I switch lamp 29
    Then the player's cards are "0x00900513, 0x00200593, 0x00b50633"

  Scenario: Lesson 08 shows a box below zero as the bonus
    Given the coach lab shows lesson "c1/08-inside-the-number" at the scene "flip"
    When I switch lamp 30
    And I press Step
    And I press Step
    And I press Step
    Then the coach is on the scene "below-zero"
    When I set the number on card 1 to 0
    And I press Step
    And I press Step
    And I press Step
    Then box "a2" shows -2
    And the stored progress of "c1/08-inside-the-number" has passed with the bonus "below-zero"
