@web
Feature: Settings belong to the signed-in user
  Two students who share a browser keep their own appearance settings.

  Background:
    Given a mock backend that needs 0 ms to start
    And Cognito is the hosted UI at "https://auth.example.test"
    And the system prefers a light color scheme

  Scenario: Two users on the same browser keep separate settings
    Given the IDE is opened with sign-in required
    And I press "Sign in with Google"
    And Google sends me back with a valid code for "ada@example.test" whose subject is "sub-ada"
    When I open Settings
    And I choose the color theme "Warm"
    And I choose the mode "Dark"
    And I close Settings
    Then the saved settings for "sub-ada" are the theme "warm" and the mode "dark"
    When I press "Sign out"
    And I press "Sign in with Google"
    And Google sends me back with a valid code for "bob@example.test" whose subject is "sub-bob"
    Then the color theme is "cool"
    And the light palette is applied
    When I open Settings
    And I choose the color theme "Neutral"
    And I close Settings
    Then the saved settings for "sub-bob" are the theme "neutral" and the mode "system"
    And the saved settings for "sub-ada" are the theme "warm" and the mode "dark"
    When I press "Sign out"
    And I press "Sign in with Google"
    And Google sends me back with a valid code for "ada@example.test" whose subject is "sub-ada"
    Then the color theme is "warm"
    And the dark palette is applied

  Scenario: The sign-in screen already uses the last chosen theme
    Given the IDE is opened in dev mode
    When I open Settings
    And I choose the color theme "Warm"
    And I close Settings
    And the IDE is opened with sign-in required
    Then I see the sign-in screen
    And the color theme is "warm"
