Feature: Course stores keep what a student made and did
  The Instruction Deck, the Gallery and the Learning settings are stored per user in this browser.
  Bad stored data never breaks the page.

  Scenario: A passing program adds its card kinds to the Instruction Deck once
    Given an empty progress store for "ada"
    When "ada" passes "c1/01-press-the-button" using the card kinds "put"
    And "ada" passes "c1/02-change-the-number" using the card kinds "put, add-boxes"
    Then the Instruction Deck of "ada" holds "put, add-boxes"

  Scenario: A failed try does not add card kinds
    Given an empty progress store for "ada"
    When "ada" tries "c1/01-press-the-button" and does not pass, using the card kinds "put"
    Then the Instruction Deck of "ada" holds nothing

  Scenario: Progress saved before the Instruction Deck existed still loads
    Given stored progress for "ada" from before the Instruction Deck
    Then the Instruction Deck of "ada" holds nothing
    And "ada" has passed "c1/01-press-the-button"

  Scenario: Damaged card kinds are repaired when progress loads
    Given stored progress for "ada" whose card kinds are damaged
    Then the Instruction Deck of "ada" holds "put"

  Scenario: Card kinds in an attempt must be card-kind ids
    Given an empty progress store for "ada"
    Then recording an attempt with the card kinds "Not A Kind!" is refused

  Scenario: The Gallery keeps items per user
    Given an empty Gallery store
    When "ada" adds a pixel picture "Heart" from "c1/01-press-the-button"
    And "bob" adds a program "Two boxes" from "c1/04-two-boxes"
    Then the Gallery of "ada" holds "Heart"
    And the Gallery of "bob" holds "Two boxes"
    And the browser storage holds the Gallery of "ada" under "sierrendipity:gallery:ada"

  Scenario: Removing an item removes it for good
    Given an empty Gallery store
    And "ada" adds a pixel picture "Heart" from "c1/01-press-the-button"
    And "ada" adds a pixel picture "Star" from "c1/01-press-the-button"
    When "ada" removes "Heart" from the Gallery
    Then the Gallery of "ada" holds "Star"
    And a fresh Gallery store over the same storage shows the Gallery of "ada" holding "Star"

  Scenario: The Gallery is bounded and drops the oldest item
    Given an empty Gallery store
    When "ada" adds 60 pixel pictures
    Then the Gallery of "ada" holds 48 items
    And the Gallery of "ada" no longer holds "Picture 1"
    And the Gallery of "ada" holds "Picture 60"

  Scenario Outline: Items that are not valid are refused
    Given an empty Gallery store
    Then adding a Gallery item with <problem> is refused

    Examples:
      | problem                             |
      | a pixel picture of 10 pixels        |
      | a pixel color outside the palette   |
      | a program of 1000 words             |
      | a program word that is not 32 bits  |
      | a title of 500 characters           |
      | a lesson id that is not a lesson id |

  Scenario Outline: Damaged Gallery data falls back to an empty Gallery and is kept as a backup
    Given a Gallery store whose storage holds <stored> for "ada"
    Then the Gallery of "ada" holds nothing
    And the damaged Gallery data of "ada" is kept as a backup

    Examples:
      | stored                       |
      | {definitely not json         |
      | {"version":1,"items":"nope"} |
      | {"version":9,"items":[]}     |
      | [1,2,3]                      |

  Scenario: One damaged item is dropped and the others kept
    Given a Gallery store with one good and one damaged item stored for "ada"
    Then the Gallery of "ada" holds "Heart"

  Scenario: A Gallery store whose storage always fails still works for this session
    Given a Gallery store whose storage always fails
    When "ada" adds a pixel picture "Heart" from "c1/01-press-the-button"
    Then the Gallery of "ada" holds "Heart"

  Scenario: Subscribers hear about Gallery changes
    Given an empty Gallery store
    And I subscribe to the Gallery of "ada"
    When "ada" adds a pixel picture "Heart" from "c1/01-press-the-button"
    And "ada" removes "Heart" from the Gallery
    Then I was told about 2 Gallery changes

  Scenario: Learning settings are per user and off by default
    Given an empty Learning settings store
    Then "Unlock all lessons" is off for "ada"
    When I turn "Unlock all lessons" on for "ada"
    Then "Unlock all lessons" is on for "ada"
    And "Unlock all lessons" is off for "bob"
    And the browser storage holds the Learning settings of "ada" under "sierrendipity:learning:ada"

  Scenario: Damaged Learning settings fall back to the defaults
    Given a Learning settings store whose storage holds "{nope" for "ada"
    Then "Unlock all lessons" is off for "ada"
