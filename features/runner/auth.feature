Feature: Shared-secret authentication
  When RUNNER_SECRET is set, only callers that know it can use the runner.

  Scenario: Requests without the secret are rejected
    Given a runner process requiring the secret "hunter2"
    Then a health check without the secret succeeds
    And a run request without the secret is answered with status 401
    And a run request with the secret "wrong" is answered with status 401
    And an interactive start without the secret is answered with status 401

  Scenario: Requests with the secret are served
    Given a runner process requiring the secret "hunter2"
    Then a run request with the secret "hunter2" is answered with status 200

  Scenario: Without a configured secret no header is needed
    Given a runner process with no secret
    Then a run request without the secret is answered with status 200
