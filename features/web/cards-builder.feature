@web
Feature: Build a program by dragging cards
  The program builder has a tray of cards and a list. Everything that can be dragged can
  also be done with the keyboard and with buttons.

  Background:
    Given I open the cards lab

  Scenario: Dragging a card from the tray to the list assembles its word
    When I drag the tray card "Put 5 in box a0" to the program
    And I drag the tray card "Add 1 to box a0" to the program
    Then the builder program has these cards:
      | Put 5 in box a0 |
      | Add 1 to box a0 |
    And the builder words are the assembly of:
      """
      addi a0, zero, 5
      addi a0, a0, 1
      ebreak
      """
    And the builder machine leaves box a0 holding 6

  Scenario: Dropping a tray card onto a program card inserts it before that card
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I drag the tray card "Multiply box a0 by box a0, put the answer in box a0" onto program card 2
    Then the builder program has these cards:
      | Put 5 in box a0                                     |
      | Multiply box a0 by box a0, put the answer in box a0 |
      | Add 1 to box a0                                     |
    And the builder machine leaves box a0 holding 26

  Scenario: Reordering by dragging
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I add the tray card "Multiply box a0 by box a0, put the answer in box a0"
    And I drag program card 3 onto program card 1
    Then the builder program has these cards:
      | Multiply box a0 by box a0, put the answer in box a0 |
      | Put 5 in box a0                                     |
      | Add 1 to box a0                                     |

  Scenario: Reordering with the move buttons
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I click the "Move card 2 up" button in the builder
    Then the builder program has these cards:
      | Add 1 to box a0 |
      | Put 5 in box a0 |
    When I click the "Move card 1 down" button in the builder
    Then the builder program has these cards:
      | Put 5 in box a0 |
      | Add 1 to box a0 |

  Scenario: Reordering with the drag handle and the keyboard
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I lift program card 2 with the keyboard, move it up and drop it
    Then the builder program has these cards:
      | Add 1 to box a0 |
      | Put 5 in box a0 |

  Scenario: Removing and duplicating
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I click the "Duplicate card 2" button in the builder
    Then the builder program has these cards:
      | Put 5 in box a0 |
      | Add 1 to box a0 |
      | Add 1 to box a0 |
    When I click the "Remove card 1" button in the builder
    Then the builder program has these cards:
      | Add 1 to box a0 |
      | Add 1 to box a0 |

  Scenario: Undo and redo with buttons and with the keyboard
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I click the "Undo" button in the builder
    Then the builder program has these cards:
      | Put 5 in box a0 |
    When I click the "Redo" button in the builder
    Then the builder program has these cards:
      | Put 5 in box a0 |
      | Add 1 to box a0 |
    When I press the undo shortcut
    Then the builder program has these cards:
      | Put 5 in box a0 |
    When I press the redo shortcut
    Then the builder program has these cards:
      | Put 5 in box a0 |
      | Add 1 to box a0 |

  Scenario: The list holds at most the maximum number of cards
    Given the maximum number of cards is 3
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I add the tray card "Add 1 to box a0"
    And I add the tray card "Add 1 to box a0"
    Then the builder program has 3 cards
    And the builder shows the message "The list is full: 3 cards is the most. Remove one to make room."

  Scenario: The end of the list is shown instead of a Stop card, and the program still halts
    Then I see the end of the list marker
    And the tray has no Stop card
    When I add the tray card "Put 5 in box a0"
    Then the end of the list marker is the last row
    And the builder machine has halted
    And the builder words are the assembly of:
      """
      addi a0, zero, 5
      ebreak
      """

  Scenario: Without hiding the end a Stop card is offered and a missing one is flagged
    When I untick the lab option "Hide the Stop card"
    And I add the tray card "Put 5 in box a0"
    Then I see no end of the list marker
    And the builder shows the warning "There is no Stop card yet. Add one at the end so the machine knows where to finish."
    When I add the tray card "Stop"
    Then the builder shows no warning
    And the builder machine has halted

  Scenario: Building a three-card program with the keyboard only
    When I press Tab until the tray card "Put 5 in box a0" is focused
    And I press Enter on the focused card
    And I press Tab until the tray card "Add 1 to box a0" is focused
    And I press Enter on the focused card
    And I press Tab until the tray card "Multiply box a0 by box a0, put the answer in box a0" is focused
    And I press Enter on the focused card
    Then the builder program has these cards:
      | Put 5 in box a0                                     |
      | Add 1 to box a0                                     |
      | Multiply box a0 by box a0, put the answer in box a0 |
    And the builder machine leaves box a0 holding 36
