Feature: Per-user settings are stored safely
  The first per-user setting is the appearance: a color theme and a light,
  dark or system mode. Settings are kept per user in the browser, validated on
  load, and never crash the app even when the saved data is damaged.

  Scenario: A new user gets the defaults
    Given an empty settings store
    Then the settings of "local" are the theme "cool" and the mode "system"

  Scenario: Settings round-trip and are kept per user
    Given an empty settings store
    When I save the theme "warm" and the mode "dark" for "sub-1"
    And I save the theme "neutral" and the mode "light" for "sub-2"
    Then the settings of "sub-1" are the theme "warm" and the mode "dark"
    And the settings of "sub-2" are the theme "neutral" and the mode "light"
    And the settings of "sub-3" are the theme "cool" and the mode "system"

  Scenario: Settings are stored under a key per user with a version
    Given an empty settings store
    When I save the theme "warm" and the mode "dark" for "sub-1"
    Then the browser storage holds "sierrendipity:settings:sub-1" with version 1

  Scenario: The last used appearance is remembered for the first paint
    Given an empty settings store
    When I save the theme "warm" and the mode "dark" for "sub-1"
    Then the last used appearance is the theme "warm" and the mode "dark"

  Scenario Outline: Damaged saved settings fall back to the defaults
    Given a settings store holding <stored> for "local"
    Then the settings of "local" are the theme "cool" and the mode "system"

    Examples:
      | stored                                                     |
      | {not json                                                  |
      | null                                                       |
      | []                                                         |
      | "text"                                                     |
      | {"version":1}                                              |
      | {"version":1,"appearance":7}                               |
      | {"version":99,"appearance":{"mode":"dark","theme":"warm"}} |

  Scenario: Unknown values fall back one setting at a time
    Given a settings store holding {"version":1,"appearance":{"mode":"purple","theme":"warm"}} for "local"
    Then the settings of "local" are the theme "warm" and the mode "system"

  Scenario: Settings saved before versions existed are migrated
    Given a settings store holding {"appearance":{"mode":"dark","theme":"neutral"}} for "local"
    Then the settings of "local" are the theme "neutral" and the mode "dark"

  Scenario: Subscribers hear about changes
    Given an empty settings store
    And I subscribe to the settings of "sub-1"
    When I save the theme "warm" and the mode "light" for "sub-1"
    And I save the theme "neutral" and the mode "light" for "sub-2"
    Then I was told about 1 change for "sub-1"

  Scenario: A browser that refuses to store anything does not crash the app
    Given a settings store whose storage always fails
    When I save the theme "warm" and the mode "dark" for "local"
    Then the settings of "local" are the theme "cool" and the mode "system"
