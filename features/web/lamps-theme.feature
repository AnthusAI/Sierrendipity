@web
Feature: Lamps, bands and cards follow the colour theme and stay readable
  Band colours come from the theme's field tokens, never hard-coded colours, and every text and
  background pair of the lamp components meets WCAG AA in all six theme and mode combinations.

  Background:
    Given the lamp lab is open

  Scenario Outline: Bands use the <theme> theme's field colours in <mode> mode
    When the lamp lab switches to the "<theme>" theme in <mode> mode
    Then every band of the R word is painted with a field token of "<theme>" in <mode> mode
    And the bands of the R word have different colours for different labels

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario Outline: All text in the lamp lab is readable in <theme> <mode> mode
    When the lamp lab switches to the "<theme>" theme in <mode> mode
    And I light exactly the lamps for 5 in "Bit lamps demo"
    And I switch bit 29 in "Word editor demo"
    Then every piece of text in the lamps section meets WCAG AA

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario: Switching the theme recolours the bands without reloading
    When I note the colour of the band "what kind of job" in the "R" word
    And the lamp lab switches to the "warm" theme in dark mode
    Then the band "what kind of job" in the "R" word has a different colour from the one noted

  Scenario Outline: Lamp outlines are visible and locked lamps look different in <theme> <mode> mode
    When the lamp lab switches to the "<theme>" theme in <mode> mode
    And I light exactly the lamps for 5 in "Bit lamps demo"
    Then the outline of every lamp of "Bit lamps demo" has at least 3:1 contrast with the page
    And the outline of every lamp of "Band explorer" has at least 3:1 contrast with the page
    And lit lamps look different from unlit lamps in "Band explorer"
    And lamp 29 and lamp 30 of "Flip only bit 30" differ in shape, not only in colour
    When I switch bit 30 in "Flip only bit 30"
    Then lamp 0 and lamp 30 of "Flip only bit 30" differ in shape, not only in colour
    And the lit locked lamp 0 of "Flip only bit 30" shows a lock mark

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |
