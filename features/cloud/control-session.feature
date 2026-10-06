@cloud
Feature: Control API session lifecycle
  The control Lambda starts one runner task per signed-in user and hands out
  a short-lived session token once the task is ready.

  Background:
    Given a control API with a task cap of 3
    And the signed-in users "user1", "user2", "user3" and "user4"
    And the control allowlist admits "user1", "user2", "user3" and "user4"

  Scenario: Requests without a token are rejected
    When an anonymous client calls POST /session
    Then the control API answers 401
    And no task has been started

  Scenario: Requests with an invalid token are rejected
    When a client with a bad token calls POST /session
    Then the control API answers 401
    And no task has been started

  Scenario: The first session request starts a task
    When "user1" calls POST /session
    Then the control API answers 200 with state "starting"
    And exactly 1 task has been started
    And the started task is tagged with the sub of "user1" and not an email

  Scenario: The session becomes ready with a signed token
    Given "user1" has called POST /session
    When the task for "user1" is running at "10.0.0.7"
    And "user1" calls GET /session
    Then the control API answers 200 with state "ready"
    And the response carries a session token for "user1" and "10.0.0.7" valid for 15 minutes
    And the task was started with a RUNNER_SECRET equal to the one in the session token

  Scenario: A second concurrent session reuses the existing task
    Given "user1" has called POST /session
    And the task for "user1" is running at "10.0.0.7"
    When "user1" calls POST /session
    Then the control API answers 200 with state "ready"
    And exactly 1 task has been started

  Scenario: The global cap of three tasks is enforced
    Given "user1", "user2" and "user3" have called POST /session
    When "user4" calls POST /session
    Then the control API answers 429
    And exactly 3 tasks have been started

  Scenario: A user at the cap may still reach their own task
    Given "user1", "user2" and "user3" have called POST /session
    When "user2" calls POST /session
    Then the control API answers 200 with state "starting"
    And exactly 3 tasks have been started

  Scenario: Deleting the session stops the task
    Given "user1" has called POST /session
    When "user1" calls DELETE /session
    Then the control API answers 200 with state "stopped"
    And the task for "user1" has been stopped

  Scenario: Reading a session that does not exist
    When "user1" calls GET /session
    Then the control API answers 200 with state "none"

  Scenario: Spot capacity is unavailable
    Given Fargate Spot has no capacity
    When "user1" calls POST /session
    Then the control API answers 200 with state "starting"
    And the task for "user1" was started on on-demand capacity

  Scenario: A task that is stopping is never reported ready
    Given "user1" has called POST /session
    And the task for "user1" is running at "10.0.0.7"
    And the task for "user1" is stopping
    When "user1" calls POST /session
    Then the control API answers 200 with state "starting"
    And exactly 2 tasks have been started

  Scenario: A stopping task still counts toward the cap
    Given "user1", "user2" and "user3" have called POST /session
    And the task for "user1" is stopping
    When "user4" calls POST /session
    Then the control API answers 429

  Scenario: A duplicate task from a concurrent request is stopped
    Given another request already started an older task for "user1"
    When "user1" calls POST /session
    Then the control API answers 200 with state "starting"
    And only the older task for "user1" is left running

  Scenario: A user who is not on the allowlist is refused
    When "outsider" calls POST /session
    Then the control API answers 403
    And no task has been started
    When "outsider" calls GET /session
    Then the control API answers 403

  Scenario: A missing allowlist refuses everyone
    Given the control allowlist is not configured
    When "user1" calls POST /session
    Then the control API answers 403
    And no task has been started

  Scenario: The allowlist is cached for at most a minute
    Given "user1" calls GET /session
    And the control allowlist no longer admits "user1"
    When "user1" calls GET /session
    Then the control API answers 200 with state "none"
    When 61 seconds pass
    And "user1" calls GET /session
    Then the control API answers 403

  Scenario: A RunTask failure is reported as a bad gateway
    Given starting a task fails
    When "user1" calls POST /session
    Then the control API answers 502 with a JSON error

  Scenario: ECS throttling is reported as service unavailable
    Given ECS is throttling requests
    When "user1" calls POST /session
    Then the control API answers 503 with a JSON error
