@web
Feature: Diagrams tell the truth about faults, limits and every kind of card
  A diagram is a pure view of what the real machine recorded. When a card makes the machine stop
  with a fault, when a program never ends, or when a card does something other than fill a box, the
  words on screen say exactly that, in plain language, and the layout holds on small screens.

  Scenario: A card that faults is narrated as a stop, never as a success
    Given the lab runs the program "addi a0,zero,1; lw a1,2(zero); addi a2,zero,3" with the boxes "a0, a1, a2"
    When I press Step in the "Custom program" demo 2 times
    Then the "Custom program" log says "The machine stopped: that shelf number is not a multiple of 4."
    And the "Custom program" log does not say "end of the list"
    And the "Custom program" log does not say "changed from – to 0"
    And the "Custom program" demo shows box a0 as "1", box a1 as "–" and box a2 as "–"
    And the "Custom program" demo shows the stop notice in 3 places
    And the Step button of the "Custom program" demo is disabled
    And the Back button of the "Custom program" demo is enabled

  Scenario: Running past the last card is a stop, not a card that does not exist
    Given the lab runs the program "addi a0,zero,1" with the boxes "a0" and no hidden end
    When I press Step in the "Custom program" demo 2 times
    Then the "Custom program" log says "The machine stopped: it ran past the last card."
    And the "Custom program" log does not say "followed card"
    And the "Custom program" demo reports "Step 2 of 2"

  Scenario: An empty program has nothing to step
    Given the lab runs the program "" with the boxes "a0"
    Then the "Custom program" demo reports "Step 0 of 0"
    And the Step button of the "Custom program" demo is disabled
    And the page has no errors

  Scenario: A program that never ends is cut off and says so
    Given the lab runs the program "addi a0,zero,1; jal zero,0" with the boxes "a0" and a limit of 300 steps
    When I focus the Position scrubber of the "Custom program" demo and press End
    Then the "Custom program" demo reports "Step 300 of 300"
    And the "Custom program" log says "This program keeps going. The machine stopped after 300 steps to protect you."
    And the "Custom program" log does not say "end of the list"
    And the "Custom program" log has at most 51 entries

  Scenario: Every kind of card gets a true sentence
    Given the lab runs the program "addi a0,zero,5; sw a0,64(zero); lw a1,64(zero); bne a0,a1,8; beq a0,a1,8; addi a2,zero,9; addi zero,zero,0; addi zero,zero,7" with the boxes "a0, a1, a2"
    When I press Step in the "Custom program" demo 2 times
    Then the "Custom program" log says "Saved 5 on shelf 64."
    When I press Step in the "Custom program" demo
    Then the "Custom program" log says "Fetched 5 from shelf 64 into box a1."
    When I press Step in the "Custom program" demo
    Then the "Custom program" log says "Did not jump."
    When I press Step in the "Custom program" demo
    Then the "Custom program" log says "Jumped to card 7."
    When I press Step in the "Custom program" demo
    Then the "Custom program" log says "Nothing changed."
    When I press Step in the "Custom program" demo
    Then the "Custom program" log says "This card changes box zero, which never changes, so nothing happened."
    And the "Custom program" log does not say "followed card"

  Scenario: A Stop card in the middle of a program is shown, only a trailing one is hidden
    Given the lab runs the program "addi a0,zero,1; ebreak; addi a1,zero,2" with the boxes "a0, a1"
    Then the "Custom program" demo reports "Step 0 of 2"
    And the "Custom program" demo lists the cards "Put 1 in box a0 | Stop | Put 2 in box a1"
    When I press Step in the "Custom program" demo 2 times
    Then the "Custom program" log says "Reached the Stop card, so the machine stopped."
    And the "Custom program" demo shows the end of the list marker as not reached

  Scenario: Stepping to the end and back with the keyboard keeps focus on the button
    Given the component lab is open with the test clock
    When I focus the Step button of the "Clerk and boxes" demo and press Enter
    And I press Enter 2 times on the focused control
    Then the focused control is the "Step" button of the "Clerk and boxes" demo
    And the "Clerk and boxes" demo reports "Step 3 of 3"
    When I press Enter on the focused control
    Then the "Clerk and boxes" demo reports "Step 3 of 3"
    When I press Shift+Tab
    Then the focused control is the "Back" button of the "Clerk and boxes" demo
    When I press Enter 3 times on the focused control
    Then the "Clerk and boxes" demo reports "Step 0 of 3"
    And the focused control is the "Back" button of the "Clerk and boxes" demo

  Scenario: A value past 15 is an other-colour pixel with its own legend entry
    Given the lab runs the program "addi t0,zero,200; sb t0,1024(zero)" with the boxes "t0"
    When I press Step in the "Custom program" demo 2 times
    Then the "Custom program" demo shows pixel (0, 0) as color 200 named "other"
    And the legend of the "Custom program" demo explains the "other" color

  Scenario: A word store lights every pixel it touches
    Given the lab runs the program "addi t0,zero,3; sw t0,1024(zero)" with the boxes "t0"
    When I press Step in the "Custom program" demo 2 times
    Then the "Custom program" demo has 4 most recent pixels

  Scenario: A store outside the screen clears the most recent pixel
    Given the lab runs the program "addi t0,zero,3; sb t0,1024(zero); sb t0,2000(zero)" with the boxes "t0"
    When I press Step in the "Custom program" demo 2 times
    Then the most recent pixel of the "Custom program" demo is (0, 0)
    When I press Step in the "Custom program" demo
    Then the "Custom program" demo has no most recent pixel

  Scenario: Assistive technology hears what changed, not only what is colored
    Given the component lab is open with the test clock
    Then box a0 of the "Clerk and boxes" demo is announced as empty
    When I press Step in the "Clerk and boxes" demo 2 times
    Then the Position scrubber of the "Clerk and boxes" demo says "Step 2 of 3"
    And box a1 of the "Clerk and boxes" demo is the current change
    And card 2 of the "Clerk and boxes" demo is the current card
    When I press Back in the "Clerk and boxes" demo
    Then the "Clerk and boxes" demo announces "Went back to step 1."
    When I press Step in the "Pixel display" demo 2 times
    Then the most recent pixel of the "Pixel display" demo is the current change

  Scenario Outline: The diagrams fit a <width> px wide window
    Given the component lab is open with the test clock
    And the window is <width> px wide
    When I press Step in the "Clerk with pointing hand" demo 2 times
    And I press Step in the "Pixel display" demo 2 times
    Then the page does not scroll sideways
    And no card text of the "Clerk with pointing hand" demo spills out of its card
    And the pixel screen of the "Pixel display" demo fits its window

    Examples:
      | width |
      | 320   |
      | 400   |
      | 512   |
      | 1024  |
      | 1440  |

  Scenario Outline: The 16 pixel colors are clear and match their labels in <theme> <mode> mode
    Then the 16 pixel colors of "<theme>" <mode> are all clearly different
    And each of the 16 pixel colors of "<theme>" <mode> looks like its label
    And the number printed on each pixel color of "<theme>" <mode> is readable

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |
