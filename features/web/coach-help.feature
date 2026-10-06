@web
Feature: The coach helps without penalty
  Help is free and escalates: a hint ladder of three rungs, then Show me, where a ghost cursor does the
  step on a copy of the machine and hands control back. The coach notices when a student is stuck and
  offers a quiet nudge, and after 12 minutes it suggests a good place to stop.

  Scenario: The hint ladder goes from a nudge to a near-answer and is free
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And I ask for a hint
    Then the hint says "Do you see the Step button under the card?"
    When I ask for a hint
    Then the hint says "A card is an instruction"
    When I ask for a hint
    Then the hint says "Click Step once."
    And no more hints are offered
    When I press Step
    And I press Continue
    And I press Continue
    Then the stored progress of "c1/01-press-the-button" has passed
    And the stored progress of "c1/01-press-the-button" used the hints 1, 1 and 1 and no Show me

  Scenario: Show me replays the ghost on a copy and hands control back
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I ask to be shown
    Then the ghost pointer is visible
    And the coach announces "Show me"
    When the clock advances 3 seconds
    Then box "a0" shows 9
    When the clock advances 3 seconds
    Then the coach says "Your turn"
    And the ghost pointer is hidden
    And box "a0" shows 0
    And the number on card 1 is 5
    When I set the number on card 1 to 9
    And I press Step
    Then box "a0" shows 9
    And the coach says "Try a different number"
    And the stored progress of "c1/02-change-the-number" has passed and used Show me once

  Scenario: Two failed checks on the same goal offer a nudge
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Step
    And I press Reset
    And I press Step
    And I press Step
    Then no nudge is offered
    When I press Reset
    And I press Step
    And I press Step
    Then the coach offers "Want a nudge?"

  Scenario: Seventy-five seconds without input offer a nudge
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And the clock advances 74 seconds
    Then no nudge is offered
    When the clock advances 2 seconds
    Then the coach offers "Want a nudge?"

  Scenario: Input restarts the idle timer
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And the clock advances 60 seconds
    And I press Back
    And the clock advances 60 seconds
    Then no nudge is offered

  Scenario: Three resets within two minutes offer a nudge
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Reset
    And I press Step
    And I press Reset
    Then no nudge is offered
    When I press Step
    And I press Reset
    Then the coach offers "Want a nudge?"

  Scenario: Resets spread over more than two minutes do not
    Given the coach lab shows lesson "c1/04-two-boxes"
    When I press Continue
    And I press Step
    And I press Reset
    And the clock advances 70 seconds
    And I press Step
    And I press Reset
    And the clock advances 70 seconds
    And I press Step
    And I press Reset
    Then no nudge is offered

  Scenario: The same edit toggled back and forth three times offers a nudge
    Given the coach lab shows lesson "c1/02-change-the-number"
    When I press Continue
    And I set the number on card 1 to 6
    And I set the number on card 1 to 5
    And I set the number on card 1 to 6
    Then no nudge is offered
    When I set the number on card 1 to 5
    Then the coach offers "Want a nudge?"

  Scenario: The nudge gives the next rung and Show me is on offer
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And the clock advances 76 seconds
    Then the coach offers "Want a nudge?"
    When I choose "Nudge"
    Then the hint says "Do you see the Step button under the card?"
    And no nudge is offered

  Scenario: Choosing Show me from the nudge plays the ghost
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And the clock advances 76 seconds
    And I choose "Show me"
    Then the ghost pointer is visible

  Scenario: "I'm fine" silences the nudge for two minutes
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And the clock advances 76 seconds
    And I choose "I'm fine"
    Then no nudge is offered
    When the clock advances 100 seconds
    Then no nudge is offered
    When the clock advances 60 seconds
    Then the coach offers "Want a nudge?"

  Scenario: After twelve minutes the coach suggests stopping after the current goal
    Given the coach lab shows lesson "c1/01-press-the-button"
    When I press Continue
    And the clock advances 12 minutes
    Then the coach suggests stopping after this goal
