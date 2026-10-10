Feature: Lesson text follows Simplified Technical English
  Everything a student reads is short, plain and exact. The loader checks what a program can check:
  sentence length, contractions, and words the lesson avoids. A lesson with a problem does not load,
  so `npm run lesson -- check --all` fails on it.

  Scenario Outline: The checker names each problem
    Then the text "<text>" has the Simplified Technical English problem "<problem>"

    Examples:
      | text                                                                                          | problem             |
      | Spin the number up to 9.                                                                      | change              |
      | Press Run to start.                                                                           | select              |
      | Click the card.                                                                               | select              |
      | Do not do that, it is just a card.                                                            | only                |
      | We do not know what is wrong with it but it is not good and it is not bad and it is not clear. | a sentence has 24 words |
      | Let's watch the box.                                                                          | contraction         |
      | Don’t select it.                                                                              | contraction         |
      | Let’s watch the box.                                                                          | contraction         |
      | She is pressing the button.                                                                   | select              |
      | He pressed Run.                                                                               | select              |
      | The student clicked the card.                                                                 | select              |
      | Tapping the card is not needed.                                                               | select              |
      | The box is getting a number.                                                                  | precise verb        |
      | The number is spinning.                                                                       | change              |
      | Find the blue Run button above the card.                                                      | colour              |
      | Select the green card.                                                                        | colour              |

  Scenario Outline: Good text has no problem
    Then the text "<text>" has no Simplified Technical English problem

    Examples:
      | text                                                |
      | Select Run. The box holds 5.                        |
      | Change the number on the card. Then select Continue. |
      | The computer follows each instruction in order.     |

  Scenario: A lesson with a word the lesson avoids is rejected
    Given a valid test lesson
    And the known concepts are "machine, boxes"
    When I replace "say: Select Step." with "say: Spin the number." in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "change"

  Scenario: A hint with a contraction is rejected
    Given a valid test lesson
    And the known concepts are "machine, boxes"
    When I replace "It is on the right." with "It's on the right." in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "contraction"

  Scenario: A wrong-answer reply that is too long is rejected
    Given a valid test lesson
    And the known concepts are "machine, boxes"
    When I replace "say: Close." with "say: This reply is a very long sentence that keeps going on and on and on and on past twenty words in total." in "lesson.yaml"
    And I load the lesson
    Then the lesson fails to load with "a sentence has"

  Scenario: Every lesson written for students passes
    Then every lesson on disk has no Simplified Technical English problem

  Scenario: The coach and warm-up screens follow the same rule
    Then the interface text in "web/src/coach" and "web/src/course/WarmupCard.tsx" has no contraction
