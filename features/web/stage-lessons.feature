@web @coach @stage
Feature: Lessons 06 to 08 prove the new visuals
  Three draft lessons exercise the flip, the lamps and the bands: 06 Flip the Card, 07 Counting with Lamps and
  08 Inside the Number. Each plays to the end by its intended path, and each anticipated wrong path gets its own
  kind reply. They are drafts, so the lab plays them but the course path does not list them.

  # 06 Flip the Card

  Scenario: Lesson 06 matches three cards to their lamps and runs the cards
    Given the coach lab shows lesson "c1/06-flip-the-card"
    When I press Continue
    Then the coach says "Flip the card"
    And the stage shows "flip"
    When I press Continue
    Then the coach says "These lamps spell"
    And the lamps add up to 3
    When I click the card 3
    Then the coach says "Here are different lamps"
    And the lamps add up to 1
    When I click the card 1
    Then the coach says "One more pattern"
    And the lamps add up to 2
    When I click the card 2
    Then the coach says "Press Step three times"
    When I press Step
    And I press Step
    And I press Step
    Then box "a0" shows 3
    And the Now you can card is shown
    And the stored progress of "c1/06-flip-the-card" has passed

  Scenario Outline: Lesson 06 answers the wrong card <card> in its own words
    Given the coach lab shows lesson "c1/06-flip-the-card" at the scene "match-one"
    When I click the card <card>
    Then the coach replies "<reply>"
    And the reply is not styled as an error
    And the coach is on the scene "match-one"
    When I click the card 3
    Then the coach is on the scene "match-two"

    Examples:
      | card | reply                                                |
      | 1    | That card puts 1, but these lamps add up to 3        |
      | 2    | That card puts 2, but these lamps add up to 3        |

  Scenario: Lesson 06 offers three free hints on a match
    Given the coach lab shows lesson "c1/06-flip-the-card" at the scene "match-one"
    When I ask for a hint
    Then the hint says "Read the total under the lamps"
    When I ask for a hint
    And I ask for a hint
    Then the hint says "click the card that puts 3"
    And no more hints are offered

  # 07 Counting with Lamps

  Scenario: Lesson 07 makes 5, 7, 12 and 42 with lamps
    Given the coach lab shows lesson "c1/07-counting-with-lamps"
    When I press Continue
    And I answer 4
    Then the coach says "Switch lamps on until they add up to 5"
    When I switch lamp 2
    And I press Step
    Then box "a0" shows 5
    And the coach confirms "make 5, and the box agrees"
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
    And the stored progress of "c1/07-counting-with-lamps" has passed

  Scenario Outline: Lesson 07 answers the place-value guess <guess> kindly
    Given the coach lab shows lesson "c1/07-counting-with-lamps" at the scene "place"
    When I answer <guess>
    Then the coach replies "<reply>"
    And the reply is not styled as an error

    Examples:
      | guess | reply                              |
      | 3     | Three is the lamp's place          |
      | 6     | the lamps double                   |
      | 8     | That is the fourth lamp            |
      | 99    | Let's look at the lamps again      |

  Scenario: Lesson 07 only lets the lamps that the scene allows be switched
    Given the coach lab shows lesson "c1/07-counting-with-lamps" at the scene "make-five"
    Then lamp 5 is locked
    And lamp 2 is not locked
    When I switch lamp 5
    Then the player's cards are "0x00100513"

  Scenario: Lesson 07 keeps the spinner out of the way so the lamps do the work
    Given the coach lab shows lesson "c1/07-counting-with-lamps" at the scene "make-five"
    Then the number on card 1 is locked with the explanation "Not yet"

  Scenario: Lesson 07 shows the carry as an optional peek
    Given the coach lab shows lesson "c1/07-counting-with-lamps" at the scene "carry"
    Then the stage shows "diagram:D7"
    When I press Continue
    Then the coach is on the scene "make-twelve"

  Scenario: A wrong number is answered by the machine, not by a red screen
    Given the coach lab shows lesson "c1/07-counting-with-lamps" at the scene "make-five"
    When I switch lamp 1
    And I press Step
    Then box "a0" shows 3
    And the coach is on the scene "make-five"

  # 08 Inside the Number

  Scenario: Lesson 08 finds the answer band, predicts, flips lamp 30 and gets 7
    Given the coach lab shows lesson "c1/08-inside-the-number"
    When I press Continue
    Then the coach says "Which band says which box gets the answer?"
    When I click the band "rd"
    Then the coach says "With lamp 30 switched on"
    When I answer 7
    Then the coach says "Switch on lamp 30"
    And the spotlight surrounds "lamp:30"
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
      | opcode | what kind of job this is                |
      | funct3 | picks the exact job                     |
      | funct7 | picks the exact job too                 |

  Scenario Outline: Lesson 08 answers the prediction <guess> and lets the machine show the truth
    Given the coach lab shows lesson "c1/08-inside-the-number" at the scene "predict"
    When I answer <guess>
    Then the coach replies "<reply>"
    And the coach is on the scene "<scene>"

    Examples:
      | guess | reply                     | scene |
      | 11    | That is what Add gives    | flip  |
      | 9     | what box a0 holds         | flip  |
      | 2     | what box a1 holds         | flip  |
      | -7    | not 2 minus 9             | flip  |
      | 40    | Let's look at the bands   | look  |

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
