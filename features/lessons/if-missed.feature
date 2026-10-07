Feature: A scene says what to do when the student runs the machine and misses the goal
  The ifMissed text belongs to a scene with a goal. It is the help the coach shows after a run that did not meet it.

  Background:
    Given a valid test lesson
    And the known concepts are "machine, boxes"

  Scenario: A scene with a goal accepts ifMissed
    When I replace "    ask:\n      kind: number\n      question: What will a0 hold?\n      target: a0\n      answer: 5\n" with "" in "lesson.yaml"
    And I replace "    onWrong:\n      - match: 57\n        say: Close.\n        goto: intro\n" with "" in "lesson.yaml"
    And I replace "    showMe: demo\n" with "    showMe: demo\n    ifMissed: The box shows 5. Change the card, then select Step.\n" in "lesson.yaml"
    And I load the lesson
    Then the lesson loads
    And the scene "step" says if missed "The box shows 5. Change the card, then select Step."

  Scenario Outline: A bad ifMissed is rejected
    When I replace "    ask:\n      kind: number\n      question: What will a0 hold?\n      target: a0\n      answer: 5\n" with "" in "lesson.yaml"
    And I replace "    onWrong:\n      - match: 57\n        say: Close.\n        goto: intro\n" with "" in "lesson.yaml"
    And I replace "    showMe: demo\n" with "    showMe: demo\n    ifMissed: <text>\n" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "<message>"

    Examples:
      | text                                     | message                   |
      | ""                                       | ifMissed must be non-empty text |
      | One. Two. Three. Four.                   | ifMissed has 4 sentences  |

  Scenario: A scene with no goal cannot have ifMissed
    When I replace "    say: This is a test. It has two short sentences.\n    show: [cards]" with "    say: This is a test. It has two short sentences.\n    ifMissed: Try the card.\n    show: [cards]" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "ifMissed needs an until goal to miss"

  Scenario: A scene that asks a question cannot have ifMissed
    When I replace "    showMe: demo\n    onWrong:" with "    showMe: demo\n    ifMissed: The box shows 5. Change the card, then select Step.\n    onWrong:" in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "ifMissed cannot be used with ask"
