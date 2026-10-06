@web
Feature: Animated machine diagrams
  The tutor shows the real machine as live diagrams: a clerk who puts numbers in boxes, a heartbeat of
  three stations, a hand that walks along the cards and a 16 by 16 pixel screen. Every diagram is a
  pure view of the recorded machine, so it steps forward and back, and it works with animation off.
  The developer lab at /lab shows each one with the lesson 5 program (put 5, put 7, add them).

  Background:
    Given the component lab is open with the test clock

  Scenario: Stepping the add program fills the boxes and tells what happened
    Then the "Clerk and boxes" demo shows box a0 as "–", box a1 as "–" and box a2 as "–"
    When I press Step in the "Clerk and boxes" demo
    Then the "Clerk and boxes" demo shows box a0 as "5"
    And the "Clerk and boxes" log says "Box a0 changed from – to 5."
    When I press Step in the "Clerk and boxes" demo
    Then the "Clerk and boxes" demo shows box a1 as "7"
    When I press Step in the "Clerk and boxes" demo
    Then the "Clerk and boxes" demo shows box a2 as "12"
    And the "Clerk and boxes" log says "Box a2 changed from – to 12."
    And the "Clerk and boxes" log says "Box a0 changed from – to 5."

  Scenario: The card list uses the plain words of the boxes vocabulary
    Then the "Clerk and boxes" demo lists the cards "Put 5 in box a0 | Put 7 in box a1 | Add box a0 and box a1, put the answer in box a2"

  Scenario: The hidden end marker is not a student step
    Then the "Clerk and boxes" demo reports "Step 0 of 3"
    When I press Step in the "Clerk and boxes" demo 3 times
    Then the "Clerk and boxes" demo reports "Step 3 of 3"
    And the Step button of the "Clerk and boxes" demo is disabled
    And the "Clerk and boxes" demo has a scrubber from 0 to 3

  Scenario: The end of the list is a marker and never a Stop card
    Then the "Clerk and boxes" demo shows the end of the list marker as not reached
    And the "Clerk and boxes" demo shows no Stop card
    When I press Step in the "Clerk and boxes" demo 3 times
    Then the "Clerk and boxes" demo shows the end of the list marker as reached
    And the "Clerk and boxes" log says "That was the end of the list."
    And the "Clerk and boxes" demo shows no Stop card

  Scenario: Scrubbing back to the start blanks the boxes
    When I press Step in the "Clerk and boxes" demo 3 times
    And I scrub the "Clerk and boxes" demo to 0
    Then the "Clerk and boxes" demo shows box a0 as "–", box a1 as "–" and box a2 as "–"
    And the "Clerk and boxes" log says "Nothing has happened yet."
    When I scrub the "Clerk and boxes" demo to 2
    Then the "Clerk and boxes" demo shows box a1 as "7" and box a2 as "–"

  Scenario: Instant speed reaches the final state without waiting
    When I choose the speed "Instant" in the "Clerk and boxes" demo
    And I press Play in the "Clerk and boxes" demo
    Then the "Clerk and boxes" demo shows box a2 as "12"
    And the "Clerk and boxes" demo reports "Step 3 of 3"

  Scenario: Reset goes back to the start
    When I press Step in the "Clerk and boxes" demo 2 times
    And I press Reset in the "Clerk and boxes" demo
    Then the "Clerk and boxes" demo reports "Step 0 of 3"
    And the "Clerk and boxes" demo shows box a0 as "–"

  Scenario: A number flies from the card to the box
    When I press Step in the "Clerk and boxes" demo
    And I set the test clock to 0.5
    Then the "Clerk and boxes" demo shows a flying token holding "5"
    When I set the test clock to 1
    Then the "Clerk and boxes" demo shows no flying token

  Scenario: Reduced motion swaps movement for a highlight and a caption
    Given the system prefers reduced motion
    When I press Step in the "Clerk and boxes" demo
    And I set the test clock to 0.5
    Then the "Clerk and boxes" demo shows no flying token
    And no animation is running on any token
    And box a0 of the "Clerk and boxes" demo is highlighted as changed
    And the "Clerk and boxes" log says "Box a0 changed from – to 5."

  Scenario: Reduced motion without the test clock never starts an animation
    Given the component lab is open
    And the system prefers reduced motion
    When I press Step in the "Clerk and boxes" demo
    Then no animation is running on any token
    And box a0 of the "Clerk and boxes" demo is highlighted as changed

  Scenario: Only the listed boxes are drawn
    Then the "Clerk with one box" demo has a box a0
    And the "Clerk with one box" demo has no box a1
    When I press Step in the "Clerk with one box" demo 2 times
    Then the "Clerk with one box" demo shows box a0 as "5"
    And the "Clerk with one box" log says "The machine followed card 2. No box you can see changed."

  Scenario: The pointing hand is only drawn when asked for
    Then the "Clerk and boxes" demo has no pointing hand
    And the "Clerk with pointing hand" demo has a pointing hand at address 0

  Scenario: The pointing hand moves four bytes for every card
    When I press Step in the "Clerk with pointing hand" demo
    Then the "Clerk with pointing hand" demo has a pointing hand at address 4
    When I press Step in the "Clerk with pointing hand" demo
    Then the "Clerk with pointing hand" demo has a pointing hand at address 8

  Scenario: The arrow slides along the cards with their byte addresses
    Then the "Pointer walk" demo labels the cards with the addresses "0, 4, 8"
    And the "Pointer walk" demo has a pointing hand at address 0
    When I press Step in the "Pointer walk" demo 2 times
    Then the "Pointer walk" demo has a pointing hand at address 8
    When I press Step in the "Pointer walk" demo
    Then the "Pointer walk" demo has a pointing hand at address 12
    When I scrub the "Pointer walk" demo to 1
    Then the "Pointer walk" demo has a pointing hand at address 4

  Scenario: The heartbeat stations light in order within a step
    When I press Step in the "Heartbeat" demo
    And I set the test clock to 0.1
    Then the "Heartbeat" demo has the station "Fetch" lit and the stations "Do, Move on" waiting
    When I set the test clock to 0.5
    Then the "Heartbeat" demo has the station "Do" lit
    When I set the test clock to 0.9
    Then the "Heartbeat" demo has the station "Move on" lit
    When I set the test clock to 1
    Then the "Heartbeat" demo has all stations done
    And the "Heartbeat" demo shows the card "Put 5 in box a0"
    And the "Heartbeat" demo says the arrow points at address 4

  Scenario: The pixel display lights the first pixel green after the store program
    Then the "Pixel display" demo shows pixel (0, 0) as color 0
    When I press Step in the "Pixel display" demo 2 times
    Then the "Pixel display" demo shows pixel (0, 0) as color 3 named "green"
    And the most recent pixel of the "Pixel display" demo is (0, 0)
    And the legend of the "Pixel display" demo lists 16 colors with the text label "green" for color 3

  Scenario: The pixel display counts rows and columns from zero
    Then the "Pixel display" demo has pixels from (0, 0) to (15, 15)
    And the "Pixel display" demo has no pixel (16, 16)

  Scenario: The pixel display works at positions in the past
    When I press Step in the "Pixel display" demo 2 times
    And I scrub the "Pixel display" demo to 1
    Then the "Pixel display" demo shows pixel (0, 0) as color 0
    And the "Pixel display" demo has no most recent pixel
    When I scrub the "Pixel display" demo to 2
    Then the "Pixel display" demo shows pixel (0, 0) as color 3 named "green"

  Scenario: The controls work from the keyboard
    When I focus the Step button of the "Clerk and boxes" demo and press Enter
    Then the "Clerk and boxes" demo shows box a0 as "5"
    When I focus the Position scrubber of the "Clerk and boxes" demo and press End
    Then the "Clerk and boxes" demo reports "Step 3 of 3"
    When I focus the Position scrubber of the "Clerk and boxes" demo and press Home
    Then the "Clerk and boxes" demo reports "Step 0 of 3"
    When I focus the Position scrubber of the "Clerk and boxes" demo and press ArrowRight
    Then the "Clerk and boxes" demo reports "Step 1 of 3"
    When I focus the Back button of the "Clerk and boxes" demo and press Space
    Then the "Clerk and boxes" demo reports "Step 0 of 3"
    And the "Clerk and boxes" demo has these named controls "Back, Step, Play, Position, Speed, Reset"

  Scenario: Playing steps through the program
    When I press Play in the "Clerk and boxes" demo
    Then the "Clerk and boxes" demo has a Pause button
    And the "Clerk and boxes" demo reports "Step 3 of 3"
    And the "Clerk and boxes" demo has a Play button

  Scenario Outline: Diagram text and tokens are readable in <theme> <mode> mode
    Given the component lab is open with the test clock in the "<theme>" theme and <mode> mode
    When I press Step in the "Clerk and boxes" demo
    And I set the test clock to 0.5
    Then the diagram text and token colors of the "Clerk and boxes" demo meet WCAG AA
    And the pixel legend of the "Pixel display" demo meets WCAG AA

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario Outline: Pixel colors come from the theme tokens in <theme> <mode> mode
    Given the component lab is open with the test clock in the "<theme>" theme and <mode> mode
    When I press Step in the "Pixel display" demo 2 times
    Then pixel (0, 0) of the "Pixel display" demo is painted with the token "field-3" of "<theme>" <mode>
    And the 16 palette colors of the "Pixel display" demo are all different

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario: Switching the theme recolors the diagrams without reloading
    Given the component lab is open with the test clock in the "cool" theme and light mode
    And I mark the page so a reload would be noticed
    When the theme of the page changes to "warm"
    Then the "Clerk and boxes" demo surface uses the token "card" of "warm" light
    And the page was not reloaded
