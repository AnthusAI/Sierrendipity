@web @coach @stage
Feature: Every picture a scene can show is drawn by the real stage
  A scene says what to show (`show`) and how to set it up (`lamps`, `flip`, `bands`, `carry`, `tray`). These
  scenarios play the stage fixtures (draft lessons that are never listed in the course) one scene at a time.

  Scenario Outline: The scene "<scene>" of <lesson> shows <target>
    Given the coach lab shows lesson "<lesson>" at the scene "<scene>"
    Then the stage shows "<target>"

    Examples:
      | lesson         | scene      | target     |
      | x1/01-diagrams | machine    | diagram:D1 |
      | x1/01-diagrams | heartbeat  | diagram:D3 |
      | x1/01-diagrams | walk       | diagram:D6 |
      | x1/01-diagrams | screen     | diagram:D9 |
      | x1/01-diagrams | screen     | tab:screen |
      | x1/01-diagrams | timeline   | diagram:D1 |
      | x1/02-lamps    | lamps-word | diagram:D4 |
      | x1/02-lamps    | lamps-word | tab:lamps  |
      | x1/02-lamps    | flip       | diagram:D5 |
      | x1/02-lamps    | flip       | flip       |
      | x1/02-lamps    | bands      | diagram:D8 |
      | x1/02-lamps    | carry      | diagram:D7 |
      | x1/03-builder  | build      | tray       |

  Scenario: A scene that shows only one picture does not also draw the clerk
    Given the coach lab shows lesson "x1/01-diagrams" at the scene "heartbeat"
    Then the stage does not show "diagram:D1"
    And the stage shows "button:step"

  Scenario: The pointer walk and the heartbeat follow the player's Step
    Given the coach lab shows lesson "x1/01-diagrams" at the scene "walk"
    Then the pointing hand is at address 0
    When I press Step
    Then the pointing hand is at address 4
    And the stage shows "card:0"

  Scenario: The pixel screen shows what the player's cards paint
    Given the coach lab shows lesson "x1/01-diagrams" at the scene "screen"
    When I press Step
    And I press Step
    And I press Step
    Then the pixel screen has pixel 0 painted with color 3
    When I press Back
    Then the pixel screen has pixel 0 painted with color 0

  Scenario: The timeline scrubber drives the player and Run steps it along
    Given the coach lab shows lesson "x1/01-diagrams" at the scene "timeline"
    Then the timeline scrubber is shown
    When I press Step
    And I press Step
    Then the scrubber reads "Step 2 of 3"
    And the diagram agrees with the player
    When I move the scrubber to 1
    Then the timeline is at step 1
    And the diagram agrees with the player
    And box "t0" is empty
    When I press Run on the timeline
    Then box "t0" shows 3
    And the timeline is at step 3
    And the diagram agrees with the player

  Scenario: Run can be paused
    Given the coach lab shows lesson "x1/01-diagrams" at the scene "timeline"
    When I press Run on the timeline
    And I press Pause on the timeline
    Then the Run button is back

  # Bit lamps

  Scenario: A lamp toggle edits the whole card word and the card text
    Given the coach lab shows lesson "x1/02-lamps" at the scene "lamps-word"
    Then lamp 20 is lit
    And the lamps name the card "Card 1: Put 5 in box a0"
    When I switch lamp 20
    Then lamp 20 is dark
    And the player's cards are "0x00400513, 0x00700593, 0x00b50633"
    And the lamps name the card "Card 1: Put 4 in box a0"

  Scenario: Locked and not allowed lamps stay as they are
    Given the coach lab shows lesson "x1/02-lamps" at the scene "lamps-word"
    Then lamp 22 is locked
    And lamp 0 is locked
    And lamp 20 is not locked
    When I switch lamp 22
    And I switch lamp 0
    Then the player's cards are "0x00500513, 0x00700593, 0x00b50633"
    When I switch lamp 21
    Then the player's cards are "0x00700513, 0x00700593, 0x00b50633"

  Scenario: Lamps of just the number show place values and a total
    Given the coach lab shows lesson "x1/02-lamps" at the scene "lamps-number"
    Then the lamps add up to 5
    And the lamps ask for a target of 5
    When I switch lamp 1
    Then the lamps add up to 7
    And the player's cards are "0x00700513, 0x00700593, 0x00b50633"

  Scenario: A scene that locks toggling shows lamps that do not switch
    Given the coach lab shows lesson "x1/02-lamps" at the scene "bands"
    When I switch lamp 30
    Then the player's cards are "0x00500513, 0x00700593, 0x00b50633"

  # Card flip

  Scenario: The card flips through its views
    Given the coach lab shows lesson "x1/02-lamps" at the scene "flip"
    Then the spotlight surrounds "flip"
    When I choose the view "Lamps"
    Then the flipped card shows the lamps
    When I choose the view "Hex"
    Then the flipped card shows "0x00b50633"
    When I choose the view "Assembly"
    Then the flipped card shows "add a2, a0, a1"

  # Field bands and click-target questions

  Scenario: Clicking a wrong band gets a kind reply and the right band moves on
    Given the coach lab shows lesson "x1/02-lamps" at the scene "bands"
    When I click the band "rs1"
    Then the coach replies "first box to read"
    And the coach is on the scene "bands"
    When I click the band "rd"
    Then the coach is on the scene "carry"

  Scenario: A band can be chosen with the keyboard
    Given the coach lab shows lesson "x1/02-lamps" at the scene "bands"
    When I focus the band "rd" and press Enter
    Then the coach is on the scene "carry"

  Scenario: Clicking something that is not a band is not an answer
    Given the coach lab shows lesson "x1/02-lamps" at the scene "bands"
    When I click the Step button
    And I click lamp 3
    Then the coach is on the scene "bands"
    And no coach reply is shown

  # The program builder

  Scenario: Dragging tray cards builds the program the machine runs
    Given the coach lab shows lesson "x1/03-builder" at the scene "build"
    Then the spotlight surrounds "tray"
    When I drag the tray card "Put 5 in box a0" into the lesson's program
    Then the player has 2 cards
    When I drag the tray card "Add 1 to box a0" into the lesson's program
    Then the player has 3 cards
    And the player's cards are "0x00100513, 0x00500513, 0x00150513"
    And the coach confirms "Three cards in the program."

  Scenario: Typing a number into a card spinner on the real face
    Given the coach lab shows lesson "x1/03-builder" at the scene "spin"
    When I set the number on card 1 to 9
    Then the player's cards are "0x00900513"
