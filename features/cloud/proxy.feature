@cloud
Feature: Proxy to the runner task
  The proxy Lambda checks the session token locally and streams the
  runner's responses back to the browser.

  Background:
    Given a proxy signing key
    And a runner task at "10.0.0.7" that answers on port 8080

  Scenario Outline: Bad tokens are rejected
    When a client calls GET /healthz with <kind> token
    Then the proxy answers 401
    And the runner received no request

    Examples:
      | kind      |
      | no        |
      | a garbage |
      | an expired |
      | a tampered |
      | a wrongly signed |

  Scenario: A valid token forwards an allowed request
    Given a valid session token for "user1" and "10.0.0.7"
    When the client posts '{"language":"python"}' to /runs
    Then the proxy answers 202
    And the runner received POST /runs with body '{"language":"python"}'
    And the runner did not receive the session token
    And the runner received the task secret in x-runner-secret

  Scenario: A compile-and-explain request is forwarded
    Given a valid session token for "user1" and "10.0.0.7"
    When the client posts '{"language":"c"}' to /explain
    Then the proxy answers 202
    And the runner received POST /explain with body '{"language":"c"}'
    And the runner received the task secret in x-runner-secret

  Scenario: Server-sent events stream chunk by chunk
    Given a valid session token for "user1" and "10.0.0.7"
    And the runner will stream the events "one", "two" and "three"
    When the client calls GET /runs/abc123/events
    Then the proxy answers 200 with content type "text/event-stream"
    And "one" reaches the client before the runner emits "two"
    And "two" reaches the client before the runner emits "three"

  Scenario: Hop-by-hop headers are not forwarded back
    Given a valid session token for "user1" and "10.0.0.7"
    And the runner answers with hop-by-hop headers
    When the client calls GET /healthz
    Then the proxy answers 200
    And the response has no hop-by-hop headers

  Scenario Outline: Paths outside the runner API are refused
    Given a valid session token for "user1" and "10.0.0.7"
    When the client calls <method> <path>
    Then the proxy answers 404
    And the runner received no request

    Examples:
      | method | path                |
      | GET    | /etc/passwd         |
      | GET    | /                   |
      | GET    | /runs/a/b/events    |
      | DELETE | /runs/abc123        |
      | POST   | /healthz            |
      | POST   | /runs/../stop       |
      | GET    | /runs/%2e%2e/events |
      | GET    | /runs/a.b/events    |
      | GET    | /explain            |
      | POST   | /explain/x          |
      | POST   | /explain/           |
      | POST   | /explainer          |

  Scenario: An unreachable task yields a clear 502
    Given a valid session token for "user1" and "10.0.0.7"
    And the runner task is down
    When the client calls GET /healthz
    Then the proxy answers 502
    And the response message mentions that the runner is unreachable
