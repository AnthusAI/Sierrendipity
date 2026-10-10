Feature: One session drives every view of the machine
  The Session wraps a Timeline over a Machine. The player, the checker and the stage all read the same
  session: step, back, reset, the registers, memory and the history are one model. It is pure and has no
  timers, and it reaches the same answers as running the program straight through.

  Background:
    Given a session for the program
      """
      addi t0, zero, 3
      addi t1, zero, 0
      addi t1, t1, 2
      addi t0, t0, -1
      bne t0, zero, -8
      sb t1, 1024(zero)
      ebreak
      """

  Scenario: A fresh session is at position 0
    Then the session is at position 0 with 0 steps
    And the session machine is "ready" at pc 0

  Scenario: Step and back are exact inverses
    When I step the session 4 times
    Then the session is at position 4 with 4 steps
    And the session register t1 is 2 and register t0 is 2
    When I step the session back 4 times
    Then the session is at position 0 with 0 steps
    And the session register t0 is 0 and register t1 is 0
    And stepping the session back is refused

  Scenario: Stepping again after Back replays the same steps
    When I step the session 6 times
    And I step the session back 3 times
    And I step the session 3 times
    Then the session register t0 is 2 and register t1 is 4
    And the session history has 6 steps

  Scenario: Memory writes show only at and after the step that made them
    When I step the session 11 times
    Then the session byte at 1024 is 0
    When I step the session 1 times
    Then the session byte at 1024 is 6
    When I step the session back 1 times
    Then the session byte at 1024 is 0

  Scenario: State after a halt
    When I step the session until it stops
    Then the session machine is "halted"
    And the session cannot step
    And stepping the session forward is refused

  Scenario: State after a fault
    Given a session for the program
      """
      addi t0, zero, 1
      lw t1, 1(zero)
      """
    When I step the session until it stops
    Then the session machine is "faulted"
    And the session has 1 steps
    And the session is at position 2
    When I step the session back 1 times
    Then the session machine is "running"
    And the session register t0 is 1

  Scenario: A run that never ends stops at the step limit
    Given a session limited to 5 steps for the program
      """
      loop: jal zero, loop
      """
    When I step the session until it stops
    Then the session is at position 5 with 5 steps
    And the session hit the step limit
    And the session cannot step
    When I step the session back 1 times
    Then the session can step

  Scenario: Recording ahead does not move the position
    When I step the session 2 times
    And I record the whole session ahead
    Then the session is at position 2 with 2 steps
    And the session recorded 13 steps
    When I step the session 1 times
    Then the session register t1 is 2

  Scenario: A live lesson machine at its step limit counts as over
    Then a live machine on a program that never ends stops after 2000 steps and reports the cap

  Scenario: Reset starts over and the run is the same again
    When I step the session until it stops
    And I reset the session
    Then the session is at position 0 with 0 steps
    When I step the session until it stops
    Then the session register t1 is 6

  Scenario: A hidden end marker is not a student step
    Given a session with a hidden end for the program
      """
      addi a0, zero, 5
      addi a0, a0, 1
      """
    When I step the session 2 times
    Then the session has 2 steps
    And the session machine is "halted"
    When I step the session back 1 times
    Then the session has 1 steps
    And the session machine is "running"
    And the session register a0 is 5

  Scenario: Words make a program image
    Then the program image of the words 0x00500513 and 0x00100073 has 2 rows and 8 bytes
    And the row at address 4 is the word 0x00100073
    And there is no row at address 6

  Scenario: The session agrees with running straight through on every Course 1 and x1 solution
    Then the session agrees with the checker on every solution of every Course 1 and x1 lesson

  Scenario: A session can start with a value in a register, and Reset brings it back
    Given a session with register a0 starting at 7 for the program
      """
      mul a0, a0, a0
      addi a0, a0, 1
      ebreak
      """
    Then the session register a0 is 7
    When I step the session 2 times
    Then the session register a0 is 50
    When I reset the session
    Then the session register a0 is 7
