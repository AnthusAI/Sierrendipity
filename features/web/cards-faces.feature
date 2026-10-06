@web
Feature: Instruction cards are plain-English faces over real machine words
  Every card is one real RISC-V word. The face says what it does in plain English,
  colours its parts, and lets the student change numbers and boxes. The component lab
  at /lab shows each card beside its word.

  Background:
    Given I open the cards lab

  Scenario Outline: The gallery shows the card text and the real word of <assembly>
    Then the gallery shows the card "<text>" with the word of "<assembly>"

    Examples:
      | text                                                   | assembly          |
      | Put 5 in box a0                                        | addi a0, zero, 5  |
      | Add 3 to box a0                                        | addi a0, a0, 3    |
      | Add box a0 and box a1, put the answer in box a2        | add a2, a0, a1    |
      | Subtract box a1 from box a0, put the answer in box a2  | sub a2, a0, a1    |
      | Multiply box a0 by box a0, put the answer in box a0    | mul a0, a0, a0    |
      | Multiply box a0 by box a1, put the answer in box a2    | mul a2, a0, a1    |
      | Paint pixel 0 with the colour in box a1                | sb a1, 1024(zero) |
      | Copy one byte of box a1 onto shelf 100                 | sb a1, 100(zero)  |
      | Copy box a0 onto shelf 100                             | sw a0, 100(zero)  |
      | Fetch the number on shelf 100 into box a0              | lw a0, 100(zero)  |
      | If box a0 and box a1 differ, jump back 2 cards         | bne a0, a1, -8    |
      | If box a0 and box a1 differ, jump forward 2 cards      | bne a0, a1, 8     |
      | If box a0 is smaller than box a1, jump back 1 card     | blt a0, a1, -4    |
      | If box a0 is smaller than box a1, jump forward 2 cards | blt a0, a1, 8     |
      | Stop                                                   | ebreak            |

  Scenario: Words turn back into the same cards
    Then every gallery card turns back into itself from its word

  Scenario: The faint assembly chip is hidden until asked for
    When I add the tray card "Put 5 in box a0"
    Then program card 1 shows no assembly
    When I tick the lab option "Show assembly"
    Then program card 1 shows the assembly "addi a0, zero, 5"

  Scenario: Cards can be focused and are named by their text
    When I add the tray card "Put 5 in box a0"
    And I focus program card 1
    Then the focused element is named "Put 5 in box a0"

  Scenario: The number part of a card is a spin button that announces itself
    When I add the tray card "Put 5 in box a0"
    Then the number of program card 1 is announced as "number, 5"

  Scenario: Typing a number rewrites the word and the machine result
    When I add the tray card "Put 5 in box a0"
    And I type "9" into the number of program card 1
    Then program card 1 reads "Put 9 in box a0"
    And the builder words are the assembly of:
      """
      addi a0, zero, 9
      ebreak
      """
    And the builder machine leaves box a0 holding 9

  Scenario: Arrow keys step the number and stop at the limits
    When I add the tray card "Put 5 in box a0"
    And I press ArrowUp in the number of program card 1
    Then program card 1 reads "Put 6 in box a0"
    When I press ArrowDown in the number of program card 1 3 times
    Then program card 1 reads "Put 3 in box a0"
    When I press Home in the number of program card 1
    Then program card 1 reads "Put 0 in box a0"
    When I press ArrowDown in the number of program card 1
    Then program card 1 reads "Put 0 in box a0"
    When I press End in the number of program card 1
    Then program card 1 reads "Put 2047 in box a0"

  Scenario: A number outside the limits is not accepted
    When I add the tray card "Put 5 in box a0"
    And I type "99999" into the number of program card 1
    Then program card 1 reads "Put 5 in box a0"

  Scenario: Box parts can be changed with a picker
    When I add the tray card "Multiply box a0 by box a0, put the answer in box a0"
    And I choose box "a1" in picker 2 of program card 1
    Then program card 1 reads "Multiply box a0 by box a1, put the answer in box a0"
    And the builder words are the assembly of:
      """
      mul a0, a0, a1
      ebreak
      """
