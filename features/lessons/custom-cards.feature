Feature: A lesson can use custom cards and ask the student to save one
  A lesson may give custom cards (a name and the cards inside) and a scene may ask the student to select
  cards and save them as one named card. The card program compiler lives in lesson-core, so the checker
  runs card programs, a call to a custom card is a real call, and three step phrases describe it: the
  program uses the card "Name", the machine made at least N calls, and every call returned.

  Scenario: The fixture lesson loads and its scene asks for a save
    Given the lesson "x1/06-custom-card"
    Then the lesson loads from disk
    And the scene "make" lets the student save 2 to 2 cards named "Square-plus-one"
    And the lesson is a draft

  Scenario: The fixture lesson is checked with a card program as its solution
    Given the lesson "x1/06-custom-card"
    When I check the lesson
    Then the check passes
    And the solution "good.cards" earned "pass" in 4 steps with 1 cards
    And the solution "wrong.s" earned "nothing" in 1 steps with 1 cards

  Scenario: A lesson can give a custom card
    Given the lesson "x1/06-custom-card"
    When I replace "tabs: [cards]\n" with "customCards:\n  - name: Double\n    cards: [\"add a0, a0, a0\"]\ntabs: [cards]\n" in "lesson.yaml"
    And I load the lesson
    Then the lesson gives the custom card "Double" with 1 cards

  Scenario Outline: A broken custom card is refused when the lesson loads
    Given the lesson "x1/06-custom-card"
    When I replace "tabs: [cards]\n" with "<yaml>tabs: [cards]\n" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | yaml                                                                          | message                                   |
      | customCards:\n  - name: Jumper\n    cards: [\"bne a0, a0, -4\"]\n            | can't contain a jump                      |
      | customCards:\n  - name: Put\n    cards: [\"add a0, a0, a0\"]\n               | already used by a built-in card           |
      | customCards:\n  - name: Wide\n    cards: [\"add a0, a0, t0\"]\n              | uses box t0 but boxes lists only a0       |
      | customCards:\n  - name: Odd\n    cards: [\"frobnicate a0\"]\n                | must be one instruction that assembles    |
      | customCards:\n  - name: Quiet\n    cards: [\"sw a0, 512(zero)\"]\n            | needs to put its answer in box a0         |
      | customCards:\n  - name: Empty\n    cards: []\n                                 | cards must be a list of lines of assembly |
      | customCards:\n  - name: A\n    cards: [\"add a0, a0, a0\"]\n  - name: a\n    cards: [\"add a0, a0, a0\"]\n | You already have a card called that |
      | customCards: 3\n                                                              | customCards must be a list                |

  Scenario Outline: A broken save block is refused when the lesson loads
    Given the lesson "x1/06-custom-card"
    When I replace "<find>" with "<replace>" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | find                                    | replace                              | message                                          |
      | save: { min: 2, max: 2, name: Square-plus-one } | save: { min: 3, max: 2 }      | save min must not be more than max               |
      | save: { min: 2, max: 2, name: Square-plus-one } | save: { min: 0, max: 2 }      | save min and max must be whole numbers from 1 to |
      | save: { min: 2, max: 2, name: Square-plus-one } | save: { min: 2, max: 20 }     | save min and max must be whole numbers from 1 to |
      | save: { min: 2, max: 2, name: Square-plus-one } | save: { min: 2, max: 2, name: Put } | already used by a built-in card            |
      | save: { min: 2, max: 2, name: Square-plus-one } | save: { min: 2, extra: 1 }    | save: unknown key "extra"                        |
      | save: { min: 2, max: 2, name: Square-plus-one } | save: 2                       | save must be a mapping                           |

  Scenario: A save needs the builder
    Given the lesson "x1/06-custom-card"
    When I replace "show: [builder, D1]" with "show: [D1]" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "save"

  Scenario Outline: A ghost that saves a card must agree with the scene
    Given the lesson "x1/06-custom-card"
    When I replace "<find>" with "<replace>" in "<file>"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | file                    | find                                            | replace                    | message                                |
      | ghosts/demo-save.json   | \"to\": 1                                       | \"to\": 4                  | saves 5 cards but scene                |
      | ghosts/demo-save.json   | \"from\": 0                                     | \"from\": 3                | to must not be before from             |
      | ghosts/demo-save.json   | \"to\": 1                                       | \"to\": 1, \"name\": \"\" | name must be 1 to 24 characters        |
      | lesson.yaml             | save: { min: 2, max: 2, name: Square-plus-one } | save: { min: 2, max: 2 }   | needs a name because scene             |

  Scenario: A ghost that saves a card is part of the lesson
    Given the lesson "x1/06-custom-card"
    Then the lesson loads from disk
    And the lesson has a ghost "demo-save" with 2 events

  Scenario Outline: A broken card solution is refused when the lesson loads
    Given the lesson "x1/06-custom-card"
    When I replace "<find>" with "<replace>" in "<file>"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | file                        | find                          | replace                       | message                                   |
      | solutions/good.cards        | Square-plus-one               | Other                         | there is no custom card called            |
      | solutions/good.cards        | card \"Square-plus-one\"      | frobnicate a0                 | must be one instruction that assembles    |
      | solutions/solutions.yaml    | customCards:\n      - name: Square-plus-one\n        cards: [\"mul a0, a0, a0\", \"addi a0, a0, 1\"] | customCards: 3 | customCards must be a list |
      | solutions/solutions.yaml    | file: wrong.s                 | file: wrong.s\n    customCards: [{ name: X, cards: [\"add a0, a0, a0\"] }] | belongs to a card program |

  Scenario: The checker fails when a card program does not do what the lesson says
    Given the lesson "x1/06-custom-card"
    When I replace "mul a0, a0, a0\", \"addi a0, a0, 1\"]" with "mul a0, a0, a0\", \"addi a0, a0, 2\"]" in "solutions/solutions.yaml"
    And I check the lesson
    Then the check fails with "declared to pass but fails @pass"

  Scenario: The early-lesson limit counts the main program only
    Given the lesson "x1/06-custom-card"
    When I replace "cards: [\"mul a0, a0, a0\", \"addi a0, a0, 1\"]" with "cards: [\"mul a0, a0, a0\", \"addi a0, a0, 1\", \"addi a0, a0, 0\", \"addi a0, a0, 0\", \"addi a0, a0, 0\"]" in "solutions/solutions.yaml"
    And I load the lesson
    Then the lesson loads

  Scenario Outline: A card program runs with real calls and the phrases describe them
    Given the card program "<program>" where the custom card "Square-plus-one" is "mul a0, a0, a0; addi a0, a0, 1"
    When I check the call phrase: <phrase>
    Then the call phrase <verdict>

    Examples:
      | program                                                  | phrase                                        | verdict |
      | call Square-plus-one                                   | the program uses the card "Square-plus-one"   | passes  |
      | call Square-plus-one                                   | the program uses the card "Other"             | fails   |
      | addi a0, a0, 1                                           | the program uses the card "Square-plus-one"   | fails   |
      | call Square-plus-one                                   | the machine made at least 1 call              | passes  |
      | call Square-plus-one                                   | the machine made at least 2 calls             | fails   |
      | call Square-plus-one; call Square-plus-one           | the machine made 2 calls                      | passes  |
      | call Square-plus-one; call Square-plus-one           | every call returned                           | passes  |
      | addi a0, a0, 1                                           | every call returned                           | fails   |
      | addi a0, a0, 1                                           | the machine made 0 calls                      | passes  |

  Scenario: A call that never returns is not a call that returned
    Given the program "jal ra, 8; ebreak" with the tail "addi a0, a0, 1; ebreak"
    When I check the call phrase: every call returned
    Then the call phrase fails
    And the call phrase says "1 call made and 0 returned"

  Scenario Outline: The function check runs the program through the call
    Given the card program "call Square-plus-one" where the custom card "Square-plus-one" is "mul a0, a0, a0; addi a0, a0, 1"
    And the call program is the function f from box a0 to box a0
    When I check the call phrase: <phrase>
    Then the call phrase <verdict>

    Examples:
      | phrase        | verdict |
      | f(3) is 10    | passes  |
      | f(3) is 9     | fails   |
      | f(f(2)) is 26 | passes  |
      | f(-2) is 5    | passes  |
