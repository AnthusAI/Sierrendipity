Feature: Lesson fields for the real stage
  The real stage draws more than cards and boxes: heartbeat, pointer walk, pixel screen, bit lamps, card
  flip, field bands, carry ripple, a timeline and a program builder. A scene says which ones with `show`
  and configures them with `lamps`, `flip`, `bands`, `carry` and `tray`. Lessons may point at the new parts,
  and a lesson may be marked `draft: true` to stay out of the shipping course.

  Background:
    Given a valid test lesson
    And the known concepts are "machine, boxes"

  Scenario Outline: A scene may show <show>
    When I replace "show: [cards]" with "show: [<show>]" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads

    Examples:
      | show     |
      | D1       |
      | D3       |
      | D6       |
      | D9       |
      | timeline |

  Scenario Outline: A scene may spotlight the new part <target>
    When I replace "spotlight: \"button:step\"" with "spotlight: \"<target>\"" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads

    Examples:
      | target     |
      | band:rd    |
      | band:imm   |
      | band:funct7 |
      | lamp:0     |
      | lamp:31    |
      | flip       |
      | tray       |

  Scenario Outline: A spotlight on <target> is rejected
    When I replace "spotlight: \"button:step\"" with "spotlight: \"<target>\"" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "not a known UI target"

    Examples:
      | target       |
      | band:bogus   |
      | lamp:32      |
      | lamp:-1      |
      | flip:1       |
      | tray:2       |

  Scenario: Bit lamps on a card, with locked and allowed bits and a target
    When I replace "show: [cards]" with "show: [D4]\n    lamps: { card: 0, allowedBits: [20, 21, 22], lockedBits: [22], target: 5 }" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads
    And the scene "intro" has lamps on card 0 with target 5

  Scenario: Lamps can show just the number of a put card
    When I replace "show: [cards]" with "show: [D4]\n    lamps: { card: 0, of: number, width: 6, target: 5 }" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads

  Scenario Outline: A broken <what> is rejected
    When I replace "show: [cards]" with "<scene>" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | what                      | scene                                                          | message                                  |
      | lamps without D4          | show: [cards]\n    lamps: { card: 0 }                          | lamps needs D4 in show                   |
      | lamps card out of range   | show: [D4]\n    lamps: { card: 5 }                         | lamps card 5 is not a card               |
      | lamps bit out of range    | show: [D4]\n    lamps: { card: 0, allowedBits: [40] }      | bits must be whole numbers from 0 to 31  |
      | lamps unknown key         | show: [D4]\n    lamps: { card: 0, glow: 1 }                | unknown key "glow"                       |
      | lamps target not a number | show: [D4]\n    lamps: { card: 0, target: lots }           | target must be a whole number            |
      | number lamps too wide     | show: [D4]\n    lamps: { card: 0, of: number, width: 12 }  | width must be a whole number from 1 to 11 |
      | number lamps unknown of   | show: [D4]\n    lamps: { card: 0, of: soul }               | of must be word or number                |
      | flip without D5           | show: [cards]\n    flip: { card: 0 }                       | flip needs D5 in show                    |
      | flip unknown lens         | show: [D5]\n    flip: { card: 0, lenses: [card, mist] }    | unknown lens "mist"                      |
      | bands without D8          | show: [cards]\n    bands: { card: 0 }                      | bands needs D8 in show                   |
      | bands card out of range   | show: [D8]\n    bands: { card: 3 }                         | bands card 3 is not a card               |
      | carry without D7          | show: [cards]\n    carry: { a: 5, b: 7 }                   | carry needs D7 in show                   |
      | carry not numbers         | show: [D7]\n    carry: { a: five, b: 7 }                   | carry a and b must be whole numbers      |
      | tray without builder      | show: [cards]\n    tray: ["addi a0, zero, 5"]              | tray needs builder in show               |
      | tray that does not assemble | show: [builder]\n    tray: ["addi a0, zero, banana"]       | tray[0]                                  |
      | empty tray                | show: [builder]\n    tray: []                              | tray must list at least one card         |

  Scenario: Flip, bands, carry and a tray load and are published as data
    When I replace "show: [cards]" with "show: [D5, D8, D7, builder]\n    flip: { card: 0, lenses: [card, lamps] }\n    bands: { card: 0 }\n    carry: { a: 5, b: 7 }\n    tray: [\"addi a0, zero, 5\", \"addi a0, a0, 1\"]" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads
    And the scene "intro" has a tray of 2 cards
    When I publish the lesson
    Then the published lesson survives a JSON round trip

  Scenario: Ghosts may toggle lamps, type into a spinner and drag a tray card into the builder
    When I replace "showMe: demo" with "showMe: demo\n    show: [builder]\n    tray: [\"addi a0, zero, 5\"]" in "lesson.yaml"
    And I replace "{\"at\": 500, \"type\": \"press\", \"control\": \"back\"}" with "{\"at\": 500, \"type\": \"toggle\", \"card\": 0, \"bit\": 20},\n    {\"at\": 600, \"type\": \"type\", \"text\": \"9\"},\n    {\"at\": 700, \"type\": \"drag\", \"tray\": 0, \"to\": 0},\n    {\"at\": 800, \"type\": \"point\", \"target\": \"lamp:3\"},\n    {\"at\": 900, \"type\": \"point\", \"target\": \"tray\"}" in "ghosts/demo.json"
    And I load the lesson
    Then the lesson loads
    And the lesson has a ghost "demo" with 7 events

  Scenario Outline: A ghost that points at <what> is rejected
    When I replace "\"target\": \"button:step\"" with "\"target\": \"<target>\"" in "ghosts/demo.json"
    And I load the lesson
    Then the lesson fails to load with "not a known UI target"

    Examples:
      | what          | target     |
      | a made-up band | band:fog   |
      | lamp 40       | lamp:40    |

  Scenario: A ghost may drag a card within the list, but a tray drag must name a tray card
    When I replace "{\"at\": 500, \"type\": \"press\", \"control\": \"back\"}" with "{\"at\": 500, \"type\": \"drag\", \"tray\": 0, \"to\": 0}" in "ghosts/demo.json"
    And I load the lesson
    Then the lesson fails to load with "needs a tray"

  Scenario: A drag may not mix a card and a tray card
    When I replace "{\"at\": 500, \"type\": \"press\", \"control\": \"back\"}" with "{\"at\": 500, \"type\": \"drag\", \"from\": 0, \"tray\": 0, \"to\": 1}" in "ghosts/demo.json"
    And I load the lesson
    Then the lesson fails to load with "not both"

  Scenario: A lesson can be a draft, kept out of the shipping course
    When I replace "minutes: 5" with "minutes: 5\ndraft: true" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads
    And the lesson is a draft
    When I publish the lesson
    Then the published lesson is a draft

  Scenario: A lesson is not a draft unless it says so
    When I load the lesson
    Then the lesson is not a draft

  Scenario: Draft must be true or false
    When I replace "minutes: 5" with "minutes: 5\ndraft: maybe" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "draft must be true or false"
