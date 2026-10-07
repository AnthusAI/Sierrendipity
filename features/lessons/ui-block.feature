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
      | spotlight: glow                       | spotlight must be ring or dim             |
      | colour: red                           | unknown key "colour"                      |
