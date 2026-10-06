Feature: Sandbox opt-out
  The sandbox is on by default on Linux. RUNNER_SANDBOX=off is an explicit opt-out for environments
  without root, such as unprivileged CI runners; the Linux container specs keep full coverage.

  Scenario: With RUNNER_SANDBOX=off student code is not wrapped by the launcher
    Given the runner module is loaded with RUNNER_SANDBOX "off"
    Then a student command is left unwrapped
    And the sandbox is reported as disabled only on Linux

  @linux-only
  Scenario: By default on Linux student code runs under the sandbox launcher
    Given the runner module is loaded with RUNNER_SANDBOX unset
    Then a student command is wrapped by the launcher
    And no sandbox warning is given

  @linux-only
  Scenario: Disabling the sandbox on Linux gives a loud warning
    Given the runner module is loaded with RUNNER_SANDBOX "off"
    Then the sandbox warning mentions that student code is unconfined
