@web @coach @stage
Feature: Show me works on the real components, on a copy
  The ghost toggles a lamp, types into a spinner, drags a card into the builder or points at a band on a COPY of
  the machine. The student's own cards, boxes and progress are not touched until control is handed back, and then
  they are exactly what they were.

  Scenario: The ghost toggles a lamp on the copy and the real cards are restored
    Given the coach lab shows lesson "x1/02-lamps" at the scene "lamps-word"
    And lamp 20 is lit
    When I ask to be shown
    Then the ghost pointer is visible
    And the ghost pointer is on "lamp:20"
    When the clock advances 1 seconds
    Then lamp 20 is dark
    And the player's cards are "0x00400513, 0x00700593, 0x00b50633"
    When the clock advances 4 seconds
    Then lamp 20 is lit
    And the player's cards are "0x00500513, 0x00700593, 0x00b50633"
    And the ghost pointer is hidden
    And the coach says "Your turn"

  Scenario: While the ghost works, the lamps cannot be switched by hand
    Given the coach lab shows lesson "x1/02-lamps" at the scene "lamps-word"
    When I ask to be shown
    And I switch lamp 21
    And the clock advances 4 seconds
    Then the player's cards are "0x00500513, 0x00700593, 0x00b50633"

  Scenario: The ghost types into a card spinner on the copy
    Given the coach lab shows lesson "x1/03-builder" at the scene "spin"
    When I ask to be shown
    And the clock advances 1 seconds
    Then the number on card 1 is 9
    And the player's cards are "0x00900513"
    When the clock advances 4 seconds
    Then the number on card 1 is 1
    And the player's cards are "0x00100513"

  Scenario: The ghost drags tray cards into the builder on the copy
    Given the coach lab shows lesson "x1/03-builder" at the scene "build"
    When I ask to be shown
    Then the ghost pointer is on "tray"
    When the clock advances 2 seconds
    Then the player has 3 cards
    When the clock advances 5 seconds
    Then the player has 1 cards
    And the player's cards are "0x00100513"
    And the coach says "Drag two cards from the tray"
    And the stored progress of "x1/03-builder" has not passed

  Scenario: The ghost points at the band that answers the question and the question stays open
    Given the coach lab shows lesson "x1/02-lamps" at the scene "bands"
    When I ask to be shown
    Then the ghost pointer is on "band:rd"
    When the clock advances 4 seconds
    Then the coach is on the scene "bands"

  Scenario: Escape stops the demo early and gives control back
    Given the coach lab shows lesson "x1/02-lamps" at the scene "lamps-word"
    When I ask to be shown
    And the clock advances 1 seconds
    And I press the Escape key
    Then the player's cards are "0x00500513, 0x00700593, 0x00b50633"
    And lamp 20 is lit
