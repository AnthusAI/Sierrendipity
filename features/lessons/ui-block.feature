Feature: A lesson chooses which parts of the machine it shows
  The optional ui block keeps early lessons small. The loader accepts a good block and rejects a bad one
  with a message that names the key.

  Background:
    Given a valid test lesson
    And the known concepts are "machine, boxes"

  Scenario: A good ui block loads
    When I replace "tabs: [cards, boxes]" with "tabs: [cards, boxes]\nui:\n  controls: [step, reset]\n  stepLabel: Run\n  resetLabel: Start again\n  log: false\n  deskTitle: false\n  endMarker: false\n  boxNames: false\n  spotlight: dim" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads
    And the lesson ui shows the controls "step, reset" with the step label "Run"
    And the lesson ui says the spotlight is "dim" and the reset label is "Start again"

  Scenario: A ui block may fade the spotlight until the first hint
    When I replace "tabs: [cards, boxes]" with "tabs: [cards, boxes]\nui:\n  spotlightAfterHint: true" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads

  Scenario Outline: A bad ui block is rejected
    When I replace "tabs: [cards, boxes]" with "tabs: [cards, boxes]\nui:\n  <line>" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | line                                  | message                                   |
      | controls: [step, jump]                | controls must be a list of step, back and reset |
      | controls: [step, step]                | controls must be a list of step, back and reset |
      | stepLabel: ""                         | stepLabel must be a short word            |
      | stepLabel: A very long label for it   | stepLabel must be a short word            |
      | resetLabel: ""                        | resetLabel must be a short phrase         |
      | log: sometimes                        | log must be true or false                 |
      | boxNames: 1                           | boxNames must be true or false            |
      | glass: 1                              | glass must be true or false               |
      | spotlightAfterHint: soon              | spotlightAfterHint must be true or false  |
      | spotlight: glow                       | spotlight must be ring or dim             |
      | colour: red                           | unknown key "colour"                      |

  Scenario: The controls must include step
    When I replace "tabs: [cards, boxes]" with "tabs: [cards, boxes]\nui:\n  controls: [reset]" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "controls must include step"

  Scenario: A scene cannot point at Back when the controls hide it
    When I replace "tabs: [cards, boxes]" with "tabs: [cards, boxes]\nui:\n  controls: [step, reset]" in "lesson.yaml"
    And I replace "    say: This is a test. It has two short sentences.\n    show: [cards]" with "    say: This is a test. It has two short sentences.\n    spotlight: \"button:back\"\n    show: [cards]" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "points at a button that ui.controls hides"

  Scenario: A ui block may turn on the glass strip
    When I replace "tabs: [cards, boxes]" with "tabs: [cards, boxes]\nui:\n  glass: true" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads

  Scenario: A scene cannot point at a glass line when the glass strip is off
    When I replace "    say: This is a test. It has two short sentences.\n    show: [cards]" with "    say: This is a test. It has two short sentences.\n    spotlight: \"glass:0\"\n    show: [cards]" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "needs ui.glass: true"
