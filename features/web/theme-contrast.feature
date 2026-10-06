Feature: Every color theme is readable
  The three color themes (cool, warm, neutral) each come in a light and a dark
  mode, built from Radix Colors. Every text and background pair the interface
  uses must meet WCAG AA (4.5:1 for text, 3:1 for large text and UI parts).

  Scenario Outline: Declared color pairs meet WCAG AA in <theme> <mode> mode
    Then every declared color pair of the "<theme>" theme in <mode> mode meets WCAG AA

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario: Every theme defines every token in both modes
    Then each of the 3 themes defines the same tokens in light and dark mode

  Scenario: The stylesheet is generated from the token table
    Then the committed theme stylesheet matches the token table

  Scenario: The bit-field palette colors are distinct in every theme and mode
    Then the 7 bit-field colors differ from each other in every theme and mode
