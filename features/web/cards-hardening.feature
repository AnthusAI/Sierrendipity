@web
Feature: Cards and the builder hold up against hostile and careless input
  Saved programs can be huge or hand-edited, numbers can be negative, custom cards can be
  written to break the machine, and students use keyboards. These specs pin down the limits.

  Background:
    Given I open the cards lab

  # Size

  Scenario: A saved program that is far too big is refused and the page stays usable
    When I load a saved program of 16400 "stop" cards
    Then the builder shows the message "That program is too big."
    And the tray is still shown

  Scenario: Loading honours the maximum number of cards
    Given the maximum number of cards is 3
    When I load a saved program of 5 "put" cards
    Then the builder shows the message "That program is too big."
    And the builder program has 0 cards

  # Signed numbers

  Scenario: A negative number can be typed and shows its minus sign
    When I add the tray card "Put 5 in box a0"
    And I type "-5" into the number of program card 1
    Then program card 1 reads "Put -5 in box a0"
    And the number box of program card 1 shows "-5"
    And the builder words are the assembly of:
      """
      addi a0, zero, -5
      ebreak
      """

  Scenario: The arrows step through zero
    When I add the tray card "Put 5 in box a0"
    And I type "1" into the number of program card 1
    And I press ArrowDown in the number of program card 1
    Then program card 1 reads "Put 0 in box a0"
    When I press ArrowDown in the number of program card 1
    Then program card 1 reads "Put -1 in box a0"
    And the number box of program card 1 shows "-1"
    When I press Home in the number of program card 1
    Then program card 1 reads "Put -2048 in box a0"
    And the number of program card 1 is announced as "number, -2048"

  Scenario: Adding a negative number reads as arithmetic
    When I add the tray card "Add 1 to box a0"
    And I type "-3" into the number of program card 1
    Then program card 1 reads "Add -3 to box a0"
    And the builder words are the assembly of:
      """
      addi a0, a0, -3
      ebreak
      """

  Scenario: A number that is not allowed gets an inline explanation
    When I add the tray card "Put 5 in box a0"
    And I type "99999" into the number of program card 1
    Then program card 1 shows the number error "Use a whole number from -2048 to 2047."
    And program card 1 reads "Put 5 in box a0"

  # Boxes

  Scenario: The box pickers offer only the boxes of Course 1
    When I add the tray card "Put 5 in box a0"
    And I choose box "t5" in picker 1 of program card 1
    Then program card 1 reads "Put 5 in box t5"
    And picker 1 of program card 1 offers only boxes a0 to a7 and t0 to t6

  # Custom cards: what a body may do

  Scenario: A custom card may not change boxes the program does not expect
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I choose box "t5" in picker 1 of program card 2
    And I select program cards 1 to 2
    And I click the "Save as card" button in the builder
    Then the builder shows the message "This card changes box t5, which would surprise the program that uses it. Use box a0 for your answer."
    And no name dialog is open

  Scenario: A custom card must put its answer in box a0
    When I add the tray card "Multiply box a0 by box a0, put the answer in box a0"
    And I add the tray card "Multiply box a0 by box a0, put the answer in box a0"
    And I choose box "a1" in picker 3 of program card 1
    And I choose box "a1" in picker 3 of program card 2
    And I select program cards 1 to 2
    And I click the "Save as card" button in the builder
    Then the builder shows the message "A custom card needs to put its answer in box a0."

  Scenario: The input slot tells the truth about the boxes a card reads
    When I add the tray card "Add box a0 and box a1, put the answer in box a0"
    And I add the tray card "Add 1 to box a0"
    And I save program cards 1 to 2 as a custom card named "Sum-plus-one"
    Then the tray has a custom card "Sum-plus-one" with the input slot "uses boxes a0 and a1, answer in box a0"

  Scenario: The input slot names scratch boxes
    When I add the tray card "Add box a0 and box a1, put the answer in box a0"
    And I add the tray card "Add box a0 and box a1, put the answer in box a0"
    And I choose box "t0" in picker 3 of program card 1
    And I choose box "t0" in picker 1 of program card 2
    And I save program cards 1 to 2 as a custom card named "Uses-scratch"
    Then the tray has a custom card "Uses-scratch" with the input slot "uses boxes a0 and a1, answer in box a0 (box t0 is scratch)"

  # Jumps

  Scenario: A jump to a card that is not in the list is flagged
    When I add the tray card "If box a0 and box a1 differ, jump back 2 cards"
    Then program card 1 shows the jump warning "This card jumps to a card that is not in your list."
    And the build error "Card 1 jumps to a card that is not in your list." is shown

  Scenario: The jump spinner stays inside the list
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I add the tray card "If box a0 and box a1 differ, jump back 2 cards"
    And I press ArrowUp in the number of program card 3
    Then program card 3 reads "If box a0 and box a1 differ, jump back 2 cards"
    And the build error list is empty

  Scenario: Random programs never jump out of range
    Then no accepted random program jumps out of range

  # Undo and redo

  Scenario: Loading a program starts a fresh history
    When I add the tray card "Put 5 in box a0"
    And I load a saved program of 1 "put" cards
    Then the builder "Undo" button is disabled

  Scenario: Saving a card can be undone and redone as a whole
    Given I build the program "put 7", "multiply a0 by a0" and "add 1"
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    And I press the undo shortcut
    Then the builder program has these cards:
      | Put 7 in box a0                                     |
      | Multiply box a0 by box a0, put the answer in box a0 |
      | Add 1 to box a0                                     |
    And the tray has no custom card "Square-and-add-one"
    When I press the redo shortcut
    Then the tray has a custom card "Square-and-add-one" with the input slot "uses box a0, answer in box a0"
    And the builder machine leaves box a0 holding 50

  Scenario: Only the last 100 changes can be undone
    When I add the tray card "Put 5 in box a0"
    And I press ArrowUp in the number of program card 1 120 times
    And I press the "Undo" button 100 times
    Then program card 1 reads "Put 25 in box a0"
    And the builder "Undo" button is disabled

  # Focus and shortcuts

  Scenario: Removing the only card moves focus to the tray
    When I add the tray card "Put 5 in box a0"
    And I click the "Remove card 1" button in the builder
    Then the focused element is a tray card

  Scenario: Removing a card moves focus to its neighbour
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I add the tray card "Multiply box a0 by box a0, put the answer in box a0"
    And I click the "Remove card 2" button in the builder
    Then the focused element is named "Multiply box a0 by box a0, put the answer in box a0"

  Scenario: After saving a custom card focus is on it
    Given I build the program "put 7", "multiply a0 by a0" and "add 1"
    When I save program cards 2 to 3 as a custom card named "Square-and-add-one"
    Then the focused element is named "Square-and-add-one, uses box a0, answer in box a0"

  Scenario: Focus follows a card that is moved down
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I focus the "Move card 1 down" button
    And I press Enter on the focused card
    Then the focused element is named "Move card 2 down"

  Scenario: Undo works with nothing focused
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I put focus on nothing
    And I press the undo shortcut without focusing a card
    Then the builder program has these cards:
      | Put 5 in box a0 |

  Scenario: The undo shortcut leaves a number box to its own text editing
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I press the undo shortcut in the number of program card 1
    Then the builder program has 2 cards

  # Shelves and pixels

  Scenario: A shelf number steps by 4 and stays in range
    When I add the tray card "Copy box a0 onto shelf 512"
    And I press ArrowUp in the number of program card 1
    Then program card 1 reads "Copy box a0 onto shelf 516"
    When I press ArrowDown in the number of program card 1
    And I press End in the number of program card 1
    Then program card 1 reads "Copy box a0 onto shelf 2044"
    When I type "10" into the number of program card 1
    Then program card 1 shows the number error "Use a whole number from 0 to 2044 in steps of 4."

  Scenario: Saving onto the shelves that hold the program is flagged
    When I add the tray card "Copy box a0 onto shelf 512"
    Then program card 1 shows no shelf warning
    When I press Home in the number of program card 1
    Then program card 1 shows the shelf warning "This shelf holds your program. Saving there would change it."

  Scenario: The pixel number stays within the screen
    When I add the tray card "Paint pixel 0 with the colour in box a0"
    And I press ArrowDown in the number of program card 1
    Then program card 1 reads "Paint pixel 0 with the colour in box a0"
    When I press End in the number of program card 1
    Then program card 1 reads "Paint pixel 255 with the colour in box a0"
    When I press ArrowUp in the number of program card 1
    Then program card 1 reads "Paint pixel 255 with the colour in box a0"

  # Names

  Scenario: Names are tidied before they are saved
    Given I build the program "put 7", "multiply a0 by a0" and "add 1"
    When I save program cards 2 to 3 as a custom card named "  Spaced   out  "
    Then the tray has a custom card "Spaced out" with the input slot "uses box a0, answer in box a0"

  Scenario: Invisible characters are removed from names
    Given I build the program "put 7", "multiply a0 by a0" and "add 1"
    When I save program cards 2 to 3 as a custom card named "Sq​uare"
    Then the tray has a custom card "Square" with the input slot "uses box a0, answer in box a0"

  Scenario: A name cannot be the title of a built-in card
    Given I build the program "put 7", "multiply a0 by a0" and "add 1"
    When I select program cards 2 to 3
    And I click the "Save as card" button in the builder
    And I name the custom card "Stop"
    Then the name dialog says "That name is already used by a built-in card."

  Scenario: Name length counts characters, not code units
    Given I build the program "put 7", "multiply a0 by a0" and "add 1"
    When I select program cards 2 to 3
    And I click the "Save as card" button in the builder
    And I name the custom card "😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀"
    Then the name dialog says "Use 24 characters or fewer."

  Scenario: Names in a saved program are tidied on load
    When I load a saved program whose custom card is named "  Sq​  "
    Then the tray has a custom card "Sq" with the input slot "uses no boxes, answer in box a0"

  Scenario: A jump of zero cards is refused when loading
    When I load a saved program with a jump of 0 cards
    Then the builder shows the message "That is not a saved program."

  Scenario: Box names are normalised when loading and the stack pointer is refused
    When I load a saved program that puts 5 in box "x10"
    Then the builder program has these cards:
      | Put 5 in box a0 |
    When I load a saved program that puts 5 in box "sp"
    Then the builder shows the message "That is not a saved program."

  # Layout and announcements

  Scenario: A long unbroken name keeps the buttons on screen in a narrow window
    Given the window is 400 pixels wide
    And I open the cards lab
    And I build the program "put 7", "multiply a0 by a0" and "add 1"
    When I save program cards 2 to 3 as a custom card named "WWWWWWWWWWWWWWWWWWWWWWWW"
    Then the buttons of program card 2 are inside the window

  Scenario: Dropping a card announces its position
    When I add the tray card "Put 5 in box a0"
    And I add the tray card "Add 1 to box a0"
    And I drag the tray card "Multiply box a0 by box a0, put the answer in box a0" onto program card 2
    Then the screen reader is told "Dropped at position 2 of 3"
