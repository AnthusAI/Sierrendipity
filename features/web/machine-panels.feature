@web @coach
Feature: The first real machine panels: the Registers panel and the glass strip
  The boxes are drawn by one reusable Registers panel in the lesson box skin. A lesson may also turn on the
  glass strip: a faint line under each card with the card's real assembly and its machine word. The line
  changes at once when the number on the card changes. These scenarios drive the real lessons.

  Scenario: Lesson 2 shows the glass line with the real assembly and machine word
    Given the coach lab shows lesson "c1/02-change-the-number"
    Then the glass line under card 1 says "addi a0, zero, 5 · 0x00500513"

  Scenario: The glass line changes when the number changes
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I select the plus button on card 1 4 times
    Then the glass line under card 1 says "addi a0, zero, 9 · 0x00900513"
    When I select the minus button on card 1
    Then the glass line under card 1 says "addi a0, zero, 8 · 0x00800513"

  Scenario: Lesson 2 introduces the glass line in one short sentence
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I select the plus button on card 1 4 times
    And I select Run
    Then the coach says "Under the card is the machine's own text for it."

  Scenario: Lesson 1 shows no glass line
    Given the coach lab shows lesson "c1/01-press-the-button"
    Then the lesson shows no glass line

  Scenario: Lesson 4 shows a glass line under each card
    Given the coach lab shows lesson "c1/04-two-boxes"
    Then the glass line under card 1 says "addi a0, zero, 4 · 0x00400513"
    And the glass line under card 2 says "addi a1, zero, 6 · 0x00600593"

  Scenario: Lesson 5 shows the add card in the machine's own words
    Given the coach lab shows lesson "c1/05-add"
    Then the glass line under card 3 says "add a2, a0, a1 · 0x00b50633"

  Scenario: A scene can point at a glass line
    Given the coach lab shows lesson "c1/02-change-the-number"
    Then the stage shows "glass:0"
    And the stage shows "box:a0"

  Scenario: The glass line is hidden from a screen reader until a scene names it
    Given the coach lab shows lesson "c1/02-change-the-number"
    Then the glass line under card 1 is hidden from a screen reader
    When I select the plus button on card 1 4 times
    And I select Run
    Then the glass line under card 1 is read to a screen reader as "The machine's own text for this card is on the screen."
    And the glass line never gives a screen reader the register name "a0"

  Scenario: A lesson that shows register names reads the assembly once it is named
    Given the coach lab shows lesson "c1/05-add"
    Then the glass line under card 3 is read to a screen reader as "The machine's own text for this card: add a2, a0, a1"

  Scenario: The Registers panel is one named group of boxes
    Given the coach lab shows lesson "c1/05-add"
    Then the registers panel is named "Registers" and holds 3 boxes
    And the stage shows "box:a2"

  Scenario: The panel is called Boxes when the lesson hides register names
    Given the coach lab shows lesson "c1/02-change-the-number"
    Then the registers panel is named "Boxes" and holds 1 boxes

  Scenario: Lesson 3 shows the glass line too
    Given the coach lab shows lesson "c1/03-last-one-wins"
    Then the glass line under card 1 says "addi a0, zero, 3 · 0x00300513"

  Scenario: The boxes still fill with reduced motion
    Given the coach lab shows lesson "c1/04-two-boxes" with reduced motion
    When I select Run
    And I select Run
    Then box "a0" shows 4
    And box "a1" shows 6
    And the glass line under card 1 says "addi a0, zero, 4 · 0x00400513"

  Scenario Outline: The panel and the glass line fit a phone
    Given the coach lab shows lesson "<lesson>" at 320 by 568
    Then the lab page does not scroll sideways
    And the glass line under card 1 shows its whole text

    Examples:
      | lesson                  |
      | c1/02-change-the-number |
      | c1/05-add               |
      | c1/03-last-one-wins     |

  Scenario: The glass line shows its whole text on a phone-sized window
    Given the coach lab shows lesson "c1/05-add" at 390 by 844
    Then the glass line under card 3 shows its whole text
