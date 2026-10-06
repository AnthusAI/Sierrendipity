@web
Feature: Field bands split the 32 lamps into labelled, coloured jobs
  An instruction word is 32 lamps. The bands colour them by what each run of lamps is for, and
  every band says so in words: colour is never the only clue.

  Background:
    Given the lamp lab is open

  Scenario Outline: A <format> word has labelled bands that tile all 32 bits
    Then the field bands of the <format> word tile bits 31 to 0 without gaps
    And every band of the <format> word has a plain-English label and shows its bits
    And the bands of the <format> word are labelled <labels>

    Examples:
      | format | labels                                                                    |
      | R      | exact job, second box, first box, exact job, answer goes in box, what kind of job |
      | I      | the number, first box, exact job, answer goes in box, what kind of job    |
      | S      | the number, box to save, address from box, exact job, the number, what kind of job |
      | B      | where to jump, where to jump, second box, first box, exact job, where to jump, where to jump, what kind of job |
      | U      | the number (placed in the top 20 bits), answer goes in box, what kind of job |
      | J      | where to jump, where to jump, where to jump, where to jump, answer goes in box, what kind of job |
      | load   | the number, address from box, exact job, answer goes in box, what kind of job |
      | jalr   | where to jump, address from box, exact job, answer goes in box, what kind of job |
      | ecall  | special job |

  Scenario Outline: The scattered pieces of a <format> immediate share one label and one colour
    Then the number in the <format> word is split into 4 or fewer pieces under one label
    And every piece of the number in the <format> word has the same colour
    And the pieces of the number in the <format> word name their bit ranges

    Examples:
      | format |
      | S      |
      | B      |
      | J      |

  Scenario: Bands show what each run of lamps means
    Then the band "answer goes in box" of the R word shows the meaning "a2"
    And the band "first box" of the R word shows the meaning "a0"
    And the band "second box" of the R word shows the meaning "a1"

  Scenario: Bands that do nothing are plain list items, not tab stops
    Then the field bands of the R word are a list of 6 items with no buttons
    And the page has no focusable band outside the interactive demos

  Scenario: An interactive band has a short name and describes its bit range separately
    Then the band "answer goes in box" of "Band explorer" is named "answer goes in box: a2"
    And the band "answer goes in box" of "Band explorer" is described as "bits 11 to 7"
    And the band "the number" of the S word describes its bits as "bits 31 to 25 and 11 to 7; this piece is bits 31 to 25"

  Scenario: Beginners are told what each box is for
    Then the band "address from box" of the load word shows the meaning "a1"
    And the band "box to save" of the S word shows the meaning "a1"
    And the band "special job" of the ecall word shows the meaning "ecall"

  Scenario: A big number says where it ends up
    Then the band "the number (placed in the top 20 bits)" of the U word shows the meaning "0x12345 (used as 0x12345000)"

  Scenario: Long bit strings wrap instead of clipping on a narrow screen
    When the screen is 320 pixels wide
    Then no band of the U word is clipped

  Scenario: Pointing at a repeated box highlights only that box
    When I point at the band "answer goes in box" in "Repeated boxes explorer"
    Then the highlighted words of the card in "Repeated boxes explorer" are "box a0"
    And the card in "Repeated boxes explorer" has 1 highlighted word

  Scenario: Highlighting does not rewrite the card text
    When I point at the band "first box" in "Band explorer"
    Then the card face of "Band explorer" keeps the same elements while highlighted

  Scenario: A band that disappears when the word changes does not leave stale text behind
    When I focus the band "second box" in "Word editor demo"
    And I switch bit 2 of "Word editor demo" without moving the focus
    Then the band caption of "Word editor demo" is the plain prompt

  Scenario: Pointing at a band tells the page and lights up the matching card words
    When I point at the band "answer goes in box" in "Band explorer"
    Then "Band explorer" reports pointing at "rd"
    And the highlighted words of the card in "Band explorer" are "box a2"
    When I point at the band "what kind of job" in "Band explorer"
    Then the highlighted words of the card in "Band explorer" are "Add"
    When I move away from the bands in "Band explorer"
    Then "Band explorer" reports pointing at nothing
    And the card in "Band explorer" has no highlighted words

  Scenario: Focusing a band by keyboard does the same
    When I tab to the band "first box" in "Band explorer"
    Then "Band explorer" reports pointing at "rs1"
    And the highlighted words of the card in "Band explorer" are "box a0"

  Scenario: Bands can be clicked to answer a question
    Then "Band explorer" asks which band says which box gets the answer
    When I click the band "first box" in "Band explorer"
    Then "Band explorer" answers "Not that one"
    When I click the band "answer goes in box" in "Band explorer"
    Then "Band explorer" answers "Yes"

  Scenario: A word that is not an instruction has no bands to show
    When I switch bit 0 in "Word editor demo"
    Then "Word editor demo" has no bands
