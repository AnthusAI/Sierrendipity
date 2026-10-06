@web
Feature: Editing a real instruction word by flipping lamps
  Toggling a lamp changes the real 32-bit word, and the card says what the machine would now do.

  Background:
    Given the lamp lab is open

  Scenario: Flipping bit 30 turns add into subtract, and back
    Then the card of "Word editor demo" says "Add box a0 and box a1, put the answer in box a2"
    And the word of "Word editor demo" is 0x00b50633
    When I switch bit 30 in "Word editor demo"
    Then the card of "Word editor demo" starts with "Subtract"
    And the word of "Word editor demo" is 0x40b50633
    And the assembly of "Word editor demo" is "sub a2, a0, a1"
    When I switch bit 30 in "Word editor demo"
    Then the card of "Word editor demo" starts with "Add"
    And the word of "Word editor demo" is 0x00b50633

  Scenario: The fields follow the lamps live
    When I switch bit 7 in "Word editor demo"
    Then the band "answer goes in box" of "Word editor demo" shows the meaning "a3"

  Scenario: A word the machine cannot read gets a friendly message
    When I switch bit 0 in "Word editor demo"
    Then the card of "Word editor demo" says "The machine would not understand this one yet"
    When I switch bit 0 in "Word editor demo"
    Then the card of "Word editor demo" starts with "Add"

  Scenario: Only the allowed lamps can be flipped with the mouse
    Then lamp 30 of "Flip only bit 30" can be switched
    And lamp 29 of "Flip only bit 30" is announced as disabled
    When I click lamp 29 of "Flip only bit 30"
    Then the word of "Flip only bit 30" is 0x00b50633
    When I click lamp 30 of "Flip only bit 30"
    Then the word of "Flip only bit 30" is 0x40b50633

  Scenario: Locked lamps ignore the keyboard too
    When I focus lamp 29 of "Flip only bit 30"
    And I hit the "Space" key
    And I hit the "Enter" key
    Then the word of "Flip only bit 30" is 0x00b50633
    When I hit the "ArrowRight" key
    And I hit the "ArrowLeft" key
    And I hit the "ArrowLeft" key
    Then lamp 30 of "Flip only bit 30" has the focus
    When I hit the "Space" key
    Then the word of "Flip only bit 30" is 0x40b50633

  Scenario: Locked lamps look different from lamps that can be flipped
    Then lamp 29 of "Flip only bit 30" is visibly marked as locked
