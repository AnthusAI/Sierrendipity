@web
Feature: Color themes and light, dark or system mode
  The interface follows the system's light or dark setting by default and has
  no light or dark control on the main screen. Settings lets a student choose
  Light, Dark or System and one of three color themes: Cool, Warm or Neutral.

  Background:
    Given a mock backend that needs 0 ms to start

  Scenario: A dark system preference gives the dark palette on first load
    Given the system prefers a dark color scheme
    When the IDE is opened in dev mode
    Then the dark palette is applied
    And the color theme is "cool"

  Scenario: A light system preference gives the light palette on first load
    Given the system prefers a light color scheme
    When the IDE is opened in dev mode
    Then the light palette is applied

  Scenario: The palette follows the system while the IDE stays open
    Given the system prefers a light color scheme
    And the IDE is opened in dev mode
    And I mark the page so a reload would be noticed
    When the system switches to a dark color scheme
    Then the dark palette is applied
    When the system switches to a light color scheme
    Then the light palette is applied
    And the page was not reloaded

  Scenario: There is no light or dark control on the main screen
    Given the IDE is opened in dev mode
    Then the main screen has no light or dark control
    When I open Settings
    Then Settings offers the modes "Light", "Dark" and "System"
    And Settings offers the color themes "Cool", "Warm" and "Neutral"

  Scenario: Settings opens from the header and defaults to System and Cool
    Given the IDE is opened in dev mode
    When I open Settings
    Then the mode "System" is chosen
    And the color theme "Cool" is chosen

  Scenario: Each color theme shows a live palette preview
    Given the IDE is opened in dev mode
    When I open Settings
    Then each color theme option shows a palette preview

  Scenario: Choosing Warm recolors the header, the editor and the terminal
    Given the system prefers a light color scheme
    And the IDE is opened in dev mode
    And I note the colors of the header, the editor and the terminal
    When I open Settings
    And I choose the color theme "Warm"
    Then the color theme is "warm"
    And the header, the editor and the terminal differ from the noted colors
    And the header, the editor and the terminal match the "warm" theme in light mode

  Scenario: Choosing Neutral also recolors the interface
    Given the system prefers a dark color scheme
    And the IDE is opened in dev mode
    When I open Settings
    And I choose the color theme "Neutral"
    Then the header, the editor and the terminal match the "neutral" theme in dark mode

  Scenario: Choosing Dark forces dark while the system is light
    Given the system prefers a light color scheme
    And the IDE is opened in dev mode
    When I open Settings
    And I choose the mode "Dark"
    Then the dark palette is applied
    And the header, the editor and the terminal match the "cool" theme in dark mode
    When the system switches to a dark color scheme
    And the system switches to a light color scheme
    Then the dark palette is applied

  Scenario: Choosing System returns to following the system
    Given the system prefers a light color scheme
    And the IDE is opened in dev mode
    When I open Settings
    And I choose the mode "Dark"
    And I choose the mode "System"
    Then the light palette is applied
    When the system switches to a dark color scheme
    Then the dark palette is applied

  Scenario: Choices survive a reload and the first paint already has them
    Given the page records the theme from its first moment
    And the system prefers a light color scheme
    And the IDE is opened in dev mode
    When I open Settings
    And I choose the color theme "Warm"
    And I choose the mode "Dark"
    And I reload the page
    Then the color theme is "warm"
    And the dark palette is applied
    And the theme was "warm" and dark before the app started

  Scenario: Settings are saved under the local user in dev mode
    Given the IDE is opened in dev mode
    When I open Settings
    And I choose the color theme "Warm"
    Then the saved settings for "local" are the theme "warm" and the mode "system"

  Scenario: Damaged saved settings fall back to the defaults without errors
    Given the saved settings are damaged
    And the system prefers a light color scheme
    When the IDE is opened in dev mode
    Then the color theme is "cool"
    And the light palette is applied
    And no page errors occurred
    When I open Settings
    Then the mode "System" is chosen
    And the color theme "Cool" is chosen

  Scenario: The terminal and the editor keep their content when the theme changes
    Given the IDE is opened in dev mode
    And I press Run
    And the terminal shows "Name: "
    When I open Settings
    And I choose the color theme "Warm"
    And I close Settings
    Then the terminal shows "Name: "
    And the editor shows "name"

  Scenario: Focus stays visible and motion respects the reduced motion setting
    Given the system prefers reduced motion
    And the IDE is opened in dev mode
    Then buttons do not animate
    When I focus the "Run" button with the keyboard
    Then the focused control has a visible focus ring

  Scenario: Bit fields use palette colors and keep their text labels
    Given the IDE is opened in dev mode
    And I switch the language to C
    And I press "Explore"
    And I open the "Bits" tab
    Then every bit segment has a text label
    And the bit segments use the theme palette

  Scenario Outline: Key elements are legible in <theme> <mode>
    Given the saved settings are the theme "<theme>" and the mode "<mode>"
    And the IDE is opened in dev mode
    Then the "Run" button, the header and the project selector are legible

    Examples:
      | theme   | mode  |
      | cool    | light |
      | cool    | dark  |
      | warm    | light |
      | warm    | dark  |
      | neutral | light |
      | neutral | dark  |

  Scenario: Bracket pair colors come from the theme
    Given the saved settings are the theme "warm" and the mode "light"
    And the IDE is opened in dev mode
    Then the editor's outermost brackets use the "warm" theme in light mode

  Scenario: A stale last-used theme from another user does not flash
    Given the page records the theme from its first moment
    And another user's warm theme is the last one used in this browser
    And this browser session belongs to a user without saved settings
    When the IDE is opened in dev mode
    Then the color theme is "cool"
    And the theme was never "warm" before the app started

  Scenario: Forced colors keep the highlights visible in the assembly pane
    Given the system uses forced colors
    And the IDE is opened in dev mode
    When I create a project "asm" in RISC-V assembly
    And I press "Step"
    And I select the instruction "lui t0, 0x6c6c6"
    Then the current instruction row, the changed register and the selected row are outlined
    And the Bits segments have borders

  Scenario: Forced colors keep linked instructions visible after Explore
    Given the system uses forced colors
    And the IDE is opened in dev mode
    And I switch the language to C
    And I press "Explore"
    When I select the instruction "addi sp, sp, -32"
    Then the linked instructions are outlined

  Scenario: Long file names stay on one line
    Given the window is 1024 by 768
    And the IDE is opened in dev mode
    When I create the file "an-extremely-long-file-name-that-keeps-going-and-going-until-it-no-longer-fits-in-a-tab.py"
    Then the editor tabs stay on one line
    And the file tree stays on one line

  Scenario: Long project names do not stretch the header
    Given the window is 1024 by 768
    And the IDE is opened in dev mode
    When I create a project "an-extremely-long-project-name-that-keeps-going-and-going-until-it-no-longer-fits-in-a-select" in Python
    Then the project selector is at most 300 pixels wide
