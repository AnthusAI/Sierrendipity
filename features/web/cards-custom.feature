@web
Feature: Custom cards are functions made from cards
  Select two or more cards in a row and save them as a new card. The student's custom card
  takes its input in box a0 and leaves its answer in box a0. It runs as a real function call:
  a jal to the body and a jalr back.

  Background:
    Given I open the cards lab
    And I build the program "put 7", "multiply a0 by a0" and "add 1"

  Scenario: Saving two cards makes a custom card with an input slot
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    Then the tray has a custom card "Square-and-add-one" with the input slot "uses box a0, answer in box a0"
    And the builder program has these cards:
      | Put 7 in box a0                                   |
      | Square-and-add-one, uses box a0, answer in box a0 |

  Scenario: Peeking inside shows the cards it is made from
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    And I peek inside program card 2
    Then the peeked cards are:
      | Multiply box a0 by box a0, put the answer in box a0 |
      | Add 1 to box a0                                     |

  Scenario: The program with 7 gives 50 through a real call and return
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    Then the builder machine leaves box a0 holding 50
    And the builder words are the assembly of:
      """
      addi a0, zero, 7
      jal ra, body
      ebreak
      body:
      mul a0, a0, a0
      addi a0, a0, 1
      jalr zero, 0(ra)
      """
    And the builder words include 0x02a50533, 0x00150513 and 0x00008067
    And the builder machine trace shows a "jal" and a "jalr"

  Scenario: A custom card can be used three times
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    And I remove every card from the program
    And I add the tray card "Put 5 in box a0"
    And I type "3" into the number of program card 1
    And I add the tray card "Square-and-add-one, uses box a0, answer in box a0"
    And I add the tray card "Put 5 in box a0"
    And I add the tray card "Square-and-add-one, uses box a0, answer in box a0"
    And I add the tray card "Put 5 in box a0"
    And I type "7" into the number of program card 5
    And I add the tray card "Square-and-add-one, uses box a0, answer in box a0"
    Then the builder machine leaves box a0 holding 50
    And the builder machine trace shows box a0 becoming 10, 26 and 50 in that order

  Scenario: A custom card can take its own result as input
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    And I add the tray card "Square-and-add-one, uses box a0, answer in box a0"
    Then the builder machine leaves box a0 holding 2501

  Scenario: A custom card cannot hold a jump
    When I add the tray card "If box a0 and box a1 differ, jump back 2 cards"
    And I select program cards 3 to 4
    And I click the "Save as card" button in the builder
    Then the builder shows the message "A custom card can't contain a jump yet. Pick cards that only work with boxes."
    And no name dialog is open

  Scenario: A custom card cannot hold another custom card
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    And I add the tray card "Put 5 in box a0"
    And I select program cards 2 to 3
    And I click the "Save as card" button in the builder
    Then the builder shows the message "A custom card can't contain another custom card yet."

  Scenario: The selected cards must sit next to each other
    When I select program cards 1 and 3
    And I click the "Save as card" button in the builder
    Then the builder shows the message "Pick cards that sit next to each other."

  Scenario Outline: A bad name is explained and the dialog stays open
    When I select program cards 2 to 3
    And I click the "Save as card" button in the builder
    And I name the custom card "<name>"
    Then the name dialog says "<problem>"

    Examples:
      | name                        | problem                     |
      |                             | Give the card a name.       |
      | A name that is way too long | Use 24 characters or fewer. |

  Scenario: A name already in use is refused
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    And I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I select program cards 3 to 4
    And I click the "Save as card" button in the builder
    And I name the custom card "square-and-add-one"
    Then the name dialog says "You already have a card called that."

  Scenario: At most six custom cards
    Given I have saved 6 custom cards
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I select program cards 2 to 3
    And I click the "Save as card" button in the builder
    Then the builder shows the message "You can make up to 6 custom cards."

  Scenario: The program and its custom cards survive a round trip through JSON
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    And I note the program JSON
    And I open the cards lab
    And I load the noted program JSON
    Then the builder program has these cards:
      | Put 7 in box a0                                   |
      | Square-and-add-one, uses box a0, answer in box a0 |
    And the tray has a custom card "Square-and-add-one" with the input slot "uses box a0, answer in box a0"
    And the builder machine leaves box a0 holding 50

  Scenario: Broken JSON is refused with a friendly message
    When I load this program JSON: "{not json"
    Then the builder shows the message "That is not a saved program."
