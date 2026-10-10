@web
Feature: One card, several ways to look at it
  A card is one real 32-bit word. Flip it to see the same word as a card, as lamps, as hex and as
  assembly. Early lessons can offer only some of the views.

  Background:
    Given the lamp lab is open

  Scenario: The card steps through all four views
    Then "Card flip demo" shows the "card" view with the text "Put 5 in box a0"
    When I flip "Card flip demo" to "Lamps"
    Then "Card flip demo" shows the "lamps" view with 32 lamps and labelled bands
    When I flip "Card flip demo" to "Hex"
    Then "Card flip demo" shows the "hex" view with the text "0x00500513"
    And "Card flip demo" explains hex as "a short way to write the lamps"
    When I flip "Card flip demo" to "Assembly"
    Then "Card flip demo" shows the "assembly" view with the text "li a0, 5"

  Scenario: The flip button goes to the next view and wraps around
    When I press the flip button of "Card flip demo"
    Then "Card flip demo" shows the "lamps" view with 32 lamps and labelled bands
    When I press the flip button of "Card flip demo" 3 times
    Then "Card flip demo" shows the "card" view with the text "Put 5 in box a0"

  Scenario: Only the offered views appear
    Then "Early card flip demo" offers exactly the views "Card" and "Lamps"

  Scenario: Every view is reachable with the keyboard alone
    When I focus the "Card" view button of "Card flip demo"
    And I hit the "Tab" key
    And I hit the "Enter" key
    Then "Card flip demo" shows the "lamps" view with 32 lamps and labelled bands
    When I hit the "Tab" key
    And I hit the "Space" key
    Then "Card flip demo" shows the "hex" view with the text "0x00500513"

  Scenario: The view can be controlled from outside
    Then "Card flip demo" reports the view "card" to the page
    When I flip "Card flip demo" to "Hex"
    Then "Card flip demo" reports the view "hex" to the page

  Scenario: The flip is an animation by default
    Then "Card flip demo" flips with an animation
    When I flip "Card flip demo" to "Hex"
    Then "Card flip demo" flips with an animation

  Scenario: With reduced motion the flip is instant
    Given the system prefers reduced motion
    And the lamp lab is open
    Then "Card flip demo" flips instantly
    When I flip "Card flip demo" to "Hex"
    Then "Card flip demo" shows the "hex" view with the text "0x00500513"
    And "Card flip demo" flips instantly

  Scenario: Assembly can be shown without the friendly aliases
    When I flip "Card flip plain demo" to "Assembly"
    Then "Card flip plain demo" shows the "assembly" view with the text "addi a0, zero, 5"

  Scenario: Aliases are on by default for beginners
    When I flip "Card flip demo" to "Assembly"
    Then "Card flip demo" shows the "assembly" view with the text "li a0, 5"

  Scenario: A card with no other views shows just the card face
    Then "Card only demo" has no view buttons
    And "Card only demo" shows the "card" view with the text "Put 5 in box a0"

  Scenario: The number view shows only the lamps of a put card's number
    Then "Number view demo" shows the "number" view with the text "Lit lamps add up to 5"
    And "Number view demo" has the lamps named "Lamps of the number"

  Scenario: The number view of a card that is not a put card falls back to the card face
    Then "Number view fallback demo" shows the "number" view with the text "Add box a0 and box a0"
