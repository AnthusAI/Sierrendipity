@web
Feature: Cards use the theme tokens
  The coloured parts of a card come from the theme, so they change with the theme and
  stay readable in every theme and mode.

  Scenario Outline: Card parts are readable in <theme> <mode> mode
    Given the cards appearance is the "<theme>" theme in <mode> mode
    And I open the cards lab
    Then every coloured part of the gallery card "Add box a0 and box a1, put the answer in box a2" has contrast of at least 4.5 on its card
    And the assembly chip of the gallery card "Put 5 in box a0" has contrast of at least 4.5 on its card

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario: Switching the theme changes the card colours
    Given the cards appearance is the "cool" theme in light mode
    And I open the cards lab
    And I note the colour of the verb part of the gallery card "Put 5 in box a0"
    When the cards appearance is the "warm" theme in dark mode
    And I open the cards lab
    Then the colour of the verb part of the gallery card "Put 5 in box a0" has changed
