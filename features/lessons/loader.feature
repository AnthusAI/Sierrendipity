Feature: Loading and validating a lesson
  A lesson is a directory of files. The loader works on an in-memory map of file names to text, so
  it runs in the browser tooling and in CI alike, and reports every problem with a clear message.

  Background:
    Given a valid test lesson
    And the known concepts are "machine, boxes"

  Scenario: A valid lesson loads
    When I load the lesson
    Then the lesson loads
    And the lesson id is "c1/99-test"
    And the lesson has 2 scenes
    And the starter has 2 cards
    And the lesson has a ghost "demo" with 3 events
    And the lesson declares the solution "good.s" earning "pass, called-it"
    And the checks have 2 scenarios

  Scenario: A scene may say something when it is done, and the default wrong reply may name a scene
    When I replace "showMe: demo" with "showMe: demo\n    doneSay: \"There it is: the box holds 5.\"" in "lesson.yaml"
    And I replace "onWrongDefault: Not quite yet. Watch what the machine does, then try again.\n" with "onWrongDefault:\n  say: Let's watch what happens.\n  goto: intro\n" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads
    And the scene "step" says when done "There it is: the box holds 5."
    And the lesson sends other wrong answers to "intro" saying "Let's watch what happens."

  Scenario: With hideEnd the programs list only the student's cards
    When I make the test lesson hide its end marker
    And I load the lesson
    Then the lesson loads
    And the starter has 1 cards

  Scenario: The starter can be assembly text
    When I replace the starter with the assembly "addi a0, zero, 5; ebreak"
    And I load the lesson
    Then the lesson loads
    And the starter has 2 cards

  Scenario Outline: A broken lesson is rejected with a clear message
    When I replace "<find>" with "<replace>" in "<file>"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples: lesson.yaml basics
      | file        | find                 | replace              | message                                  |
      | lesson.yaml | id: c1/99-test       | id: c1/98-other      | does not match the directory             |
      | lesson.yaml | minutes: 5           | minutes: 90          | minutes                                  |
      | lesson.yaml | title: Test lesson   | title: ""            | title                                    |
      | lesson.yaml | tabs: [cards, boxes] | tabs: [cards, bogus] | unknown tab "bogus"                      |
      | lesson.yaml | introduces: [machine] | introduces: [wizardry] | unknown concept "wizardry"            |
      | lesson.yaml | requires: []         | requires: [phantom]  | unknown concept "phantom"                |

    Examples: the small machine and the hidden end
      | file        | find                 | replace                                          | message                              |
      | lesson.yaml | boxes: [a0]          | boxes: [q9]                                      | boxes must be a non-empty list       |
      | lesson.yaml | boxes: [a0]          | boxes: []                                        | boxes must be a non-empty list       |
      | lesson.yaml | minutes: 5           | minutes: 5\npointer: maybe                       | pointer must be true or false        |
      | lesson.yaml | minutes: 5           | minutes: 5\nhideEnd: true                        | remove the final Stop card           |
      | lesson.yaml | minutes: 5           | minutes: 5\nhideEnd: sometimes                   | hideEnd must be true or false        |

    Examples: boxes, tabs and the new content rules
      | file        | find                                     | replace                                  | message                                   |
      | lesson.yaml | boxes: [a0]                              | boxes: [a1]                              | uses box a0 but boxes lists only a1       |
      | lesson.yaml | boxes: [a0]                              | boxes: [a0, a0]                          | duplicate box "a0"                        |
      | lesson.yaml | show: [cards]                            | show: [screen]                           | shows "screen" but tabs does not include it |
      | lesson.yaml | tabs: [cards, boxes]                     | tabs: []                                 | shows "cards" but tabs does not include it |
      | lesson.yaml | spotlight: "button:step"                 | spotlight: "button:explode"              | not a known UI target                     |
      | lesson.yaml | spotlight: "button:step"                 | spotlight: "card:9"                      | not a known UI target                     |
      | lesson.yaml | spotlight: "button:step"                 | spotlight: "box:a3"                      | not a known UI target                     |
      | lesson.yaml | - the machine has taken at least 1 step  | - the machine has taken 1 step           | exact step counts                         |
      | lesson.yaml | lock: [edit]                             | lock: [step]                             | locks Step but waits for steps            |
      | lesson.yaml | - match: 57                              | - match: 5                               | is the correct answer                     |
      | lesson.yaml | - match: 57                              | - match: fifty                           | number ask needs a number match           |
      | lesson.yaml | showMe: demo                             | showMe: demo\n    doneSay: One. Two. Three.               | doneSay has 3 sentences                   |
      | lesson.yaml | showMe: demo                             | showMe: demo\n    doneSay: ""                            | doneSay must be non-empty text            |
      | lesson.yaml | onWrongDefault: Not quite yet. Watch what the machine does, then try again.\n | onWrongDefault:\n  say: Look again.\n  goto: nowhere\n | onWrongDefault goto unknown scene "nowhere" |
      | lesson.yaml | - match: 57\n        say: Close.\n        goto: intro | - match: 57\n        say: A.\n      - match: 57\n        say: B. | duplicate onWrong match 57 |
      | lesson.yaml | onWrongDefault: Not quite yet. Watch what the machine does, then try again.\n | \n                    | needs an onWrongDefault                   |
      | lesson.yaml | - Look at the Step button.               | - Look at the Step button and the word on it and the arrow that points at the card and all of the other things on the screen around it please | too long |
      | lesson.yaml | question: What will a0 hold?             | question: What will a0 hold?\n      extra: 1               | unknown key "extra"                       |
      | checks.feature | Feature: Test lesson                  | # language: fr\nFeature: Test lesson     | language header                           |
      | checks.feature | @pass                                 | @pass,@x                                 | not a valid tag                           |

    Examples: scenes
      | file        | find                              | replace                                  | message                                |
      | lesson.yaml | - id: step                        | - id: intro                              | duplicate scene id "intro"             |
      | lesson.yaml | say: Press Step.                  | say: One. Two. Three.                    | at most 2 sentences                    |
      | lesson.yaml | say: Press Step.                  | say: Press the button that is on the right side of the screen right next to the picture of the machine that follows the list of cards all day long and then look closely at it. | at most 30 words |
      | lesson.yaml | - It is on the right.             | - ""                                     | exactly 3 hints                        |
      | lesson.yaml | showMe: demo                      | showMe: nothing                          | no ghost "nothing"                     |
      | lesson.yaml | goto: intro                       | goto: nowhere                            | goto unknown scene "nowhere"           |
      | lesson.yaml | - the machine has taken at least 1 step | - the machine has gone for a walk   | unknown step                           |
      | lesson.yaml | spotlight: "button:step"          | spotlight: "!!"                          | spotlight                              |
      | lesson.yaml | show: [cards]                     | show: [teapot]                           | unknown thing to show "teapot"         |

    Examples: asking the student
      | file        | find                                     | replace                                   | message                          |
      | lesson.yaml | kind: number                             | kind: telepathy                           | ask kind                         |
      | lesson.yaml | answer: 5                                | answer: five                              | answer must be a number          |
      | lesson.yaml | target: a0                               | target: q9                                | no box called                    |

    Examples: starter, warm-ups and solutions
      | file                      | find                  | replace              | message                                |
      | lesson.yaml               | hex: ["0x00500513", "0x00100073"] | hex: ["0x00500513", "banana"] | starter                    |
      | lesson.yaml               | concept: machine      | concept: boxes       | must be a concept this lesson introduces |
      | lesson.yaml               | expected: 5           | expected: x          | expected must be a number               |
      | checks.feature            | @pass                 | @slow                | has no @pass                           |
      | checks.feature            | @bonus @star=called-it | @bonus              | no @star                               |
      | checks.feature            | box a0 holds 5        | box a0 has 5         | unknown step                           |
      | solutions/solutions.yaml  | file: good.s          | file: missing.s      | missing.s                              |
      | solutions/solutions.yaml  | earns: [pass, called-it] | earns: [pass, bogus] | star "bogus"                        |
      | solutions/solutions.yaml  | capped: true          | capped: maybe        | capped must be true or false            |
      | solutions/good.s          | addi a0, zero, 5      | addi a0, zero, banana | good.s                                |
      | ghosts/demo.json          | "type": "press"       | "type": "juggle"     | ghost "demo"                           |
      | ghosts/demo.json          | "control": "step"     | "control": "blow"    | control                                |
      | ghosts/demo.json          | "at": 100             | "at": -5             | at                                     |

  Scenario Outline: Whole files can be missing
    When I remove the file "<file>"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | file                     | message                       |
      | lesson.yaml              | missing lesson.yaml           |
      | checks.feature           | missing checks.feature        |
      | solutions/solutions.yaml | missing solutions/solutions.yaml |

  Scenario: Malformed YAML and JSON are reported, not thrown
    When I replace "title: Test lesson" with "title: [unclosed" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "lesson.yaml"

  Scenario: A lesson can be published as plain JSON for the browser
    When I load the lesson
    And I publish the lesson
    Then the published lesson survives a JSON round trip
    And the published lesson has no solutions
    And the published checks run without parsing Gherkin

  Scenario: Early lessons (hidden end, no pointer) are capped at 3 cards and 5 minutes
    When I make the test lesson hide its end marker
    And I replace "[\"0x00500513\"]" with "[\"0x00500513\", \"0x00500513\", \"0x00500513\", \"0x00500513\"]" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "at most 3 cards"

  Scenario: Early lessons are capped at 5 minutes
    When I make the test lesson hide its end marker
    And I replace "minutes: 5" with "minutes: 6" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "at most 5 minutes"

  Scenario: A lesson can opt out of the early-lesson caps explicitly
    When I make the test lesson hide its end marker
    And I replace "minutes: 5" with "minutes: 20\nearlyLesson: false" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads

  Scenario: Every register a lesson names must be one of its boxes
    When I replace "target: a0\n      answer" with "target: a1\n      answer" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "box a1"

  Scenario: Warm-ups and solutions are held to the boxes too
    When I replace "addi a0, zero, 6" with "addi a2, zero, 6" in "solutions/wrong.s"
    And I load the lesson
    Then the lesson fails to load with "wrong.s"
    And the lesson fails to load with "box a2"
