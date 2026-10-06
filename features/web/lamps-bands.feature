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
      | S      | the number, second box, first box, exact job, the number, what kind of job |
      | B      | the number, second box, first box, exact job, the number, what kind of job |
      | U      | the number, answer goes in box, what kind of job                          |
      | J      | the number, answer goes in box, what kind of job                          |

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

  Scenario: A band's accessible name carries its bit range
    Then the band "answer goes in box" of the R word is named "answer goes in box (rd): a2, bits 11 to 7"
    And the band "the number" of the S word has a name containing "bits 31 to 25 and 11 to 7"

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
