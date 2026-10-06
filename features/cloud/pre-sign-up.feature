@cloud
Feature: Sign-in allowlist
  Only people on the maintainer's allowlist may create an account.
  The allowlist lives in AWS, never in the repository.

  Scenario: An allowlisted identity may sign up
    Given the allowlist contains "user1@example.test" and "user2@example.test"
    When "user1@example.test" tries to sign up
    Then the sign-up is allowed

  Scenario: The comparison ignores letter case
    Given the allowlist contains "User1@Example.test"
    When "USER1@example.TEST" tries to sign up
    Then the sign-up is allowed

  Scenario: An identity outside the allowlist is rejected
    Given the allowlist contains "user1@example.test"
    When "stranger@example.test" tries to sign up
    Then the sign-up is rejected

  Scenario: A missing allowlist rejects everyone
    Given the allowlist is not configured
    When "user1@example.test" tries to sign up
    Then the sign-up is rejected
