@web
Feature: Bit lamps and the binary counter
  A number is a row of lamps. Each lamp is a switch worth a power of two, lamp 0 sits on the
  right, and the lit lamps add up to the number. Everything works with a mouse or the keyboard.

  Background:
    Given the lamp lab is open

  Scenario Outline: The total under the lamps equals the number
    When I light exactly the lamps for <number> in "Bit lamps demo"
    Then "Bit lamps demo" says the lit lamps add up to <number>

    Examples:
      | number     |
      | 0          |
      | 5          |
      | 12         |
      | 42         |
      | 4294967295 |

  Scenario: Lamps are labelled switches with their place values
    Then "Bit lamps demo" has 32 lamps
    And lamp 30 of "Bit lamps demo" is named "bit 30, worth 1073741824, off"
    And lamp 0 of "Bit lamps demo" is the rightmost lamp
    And lamp 31 of "Bit lamps demo" is the leftmost lamp
    And "Bit lamps demo" shows the place value "2^30" under lamp 30

  Scenario: Lamps are grouped in fours
    Then "Bit lamps demo" has 8 groups of lamps

  Scenario: A lamp's name follows its state
    When I light exactly the lamps for 5 in "Bit lamps demo"
    Then lamp 2 of "Bit lamps demo" is named "bit 2, worth 4, on"
    And lamp 1 of "Bit lamps demo" is named "bit 1, worth 2, off"

  Scenario: The signed readout reads the top lamp as a minus sign
    When I light exactly the lamps for 4294967294 in "Bit lamps demo"
    Then "Bit lamps demo" says the lit lamps add up to 4294967294
    And "Bit lamps demo" reads as the signed number -2

  Scenario: Eight lamps are enough for small numbers
    When I light exactly the lamps for 200 in "Eight lamps demo"
    Then "Eight lamps demo" has 8 lamps
    And "Eight lamps demo" says the lit lamps add up to 200

  Scenario: The keyboard moves between lamps and flips them
    When I focus lamp 0 of "Bit lamps demo"
    And I hit the "ArrowLeft" key
    Then lamp 1 of "Bit lamps demo" has the focus
    When I hit the "Space" key
    Then "Bit lamps demo" says the lit lamps add up to 2
    When I hit the "ArrowRight" key
    And I hit the "Space" key
    Then "Bit lamps demo" says the lit lamps add up to 3

  Scenario: Read-only lamps show a number but cannot be changed
    Then lamp 0 of "Read-only lamps demo" is lit
    When I click lamp 0 of "Read-only lamps demo"
    Then lamp 0 of "Read-only lamps demo" is lit
    And lamp 0 of "Read-only lamps demo" is announced as read-only

  Scenario: The counter counts up while the student watches
    Then "Binary counter" keeps counting up by itself
    When I pause "Binary counter"
    And I reset "Binary counter"
    Then "Binary counter" says the lit lamps add up to 0
    When I step "Binary counter" 3 times
    Then "Binary counter" says the lit lamps add up to 3

  Scenario: Make this number completes when the lamps match
    Then "Make this number" asks for the number 12
    And "Make this number" is not done
    When I light exactly the lamps for 8 in "Make this number"
    Then "Make this number" is not done
    When I light exactly the lamps for 12 in "Make this number"
    Then "Make this number" is done
    When I light exactly the lamps for 13 in "Make this number"
    Then "Make this number" is not done
