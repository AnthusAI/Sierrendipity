@web
Feature: Sign in with Google
  Students sign in through the Cognito hosted UI with Google.

  Background:
    Given a mock backend that needs 0 ms to start
    And Cognito is the hosted UI at "https://auth.example.test"

  Scenario: Sign-in redirects to the hosted UI with PKCE
    Given the IDE is opened with sign-in required
    Then I see the sign-in screen
    When I press "Sign in with Google"
    Then I am sent to the hosted UI with PKCE and Google as the identity provider

  Scenario: A Cognito domain configured without a scheme still reaches the hosted UI
    Given the config names the Cognito domain without a scheme
    And the IDE is opened with sign-in required
    When I press "Sign in with Google"
    Then I am sent to the hosted UI with PKCE and Google as the identity provider

  Scenario: The callback signs the student in
    Given the IDE is opened with sign-in required
    And I press "Sign in with Google"
    When Google sends me back with a valid code for "user1@example.test"
    Then the IDE shows I am signed in as "user1@example.test"
    And the token exchange used the PKCE verifier
    And the backend status is "ready"

  Scenario: A refused sign-in shows why and offers another try
    Given the IDE is opened with sign-in required
    And I press "Sign in with Google"
    When Google sends me back with the error "access_denied" and "User is not on the allowlist"
    Then I see the sign-in screen
    And I see the error "User is not on the allowlist"

  Scenario: Incomplete configuration shows a clear error
    Given the IDE is opened with sign-in required but without "clientId"
    Then I see the message "clientId"

  Scenario: Sign out returns to the sign-in screen
    Given the IDE is opened with sign-in required
    And I press "Sign in with Google"
    And Google sends me back with a valid code for "user1@example.test"
    When I press "Sign out"
    Then I see the sign-in screen
