Feature: A timeline over a running machine
  The interface scrubs, steps and plays a program like a video. The Timeline records every step the
  real Machine takes, plus sparse checkpoints, so that any position can be shown exactly, forward or
  back, however long the run. It is synchronous and has no timers: the interface drives playback.

  Background:
    Given a timeline for the program
      """
      addi t0, zero, 3
      addi t1, zero, 0
      addi t1, t1, 2
      addi t0, t0, -1
      bne t0, zero, -8
      sb t1, 1024(zero)
      ebreak
      """

  Scenario: Stepping forward records steps and moves the position
    Then the timeline has length 0 and position 0
    When I step the timeline forward 3 times
    Then the timeline has length 3 and position 3
    And at the current position register t0 is 3 and register t1 is 2
    And the timeline is not at the end

  Scenario: Position 0 is the freshly reset machine
    Then the snapshot at position 0 has state "ready", pc 0 and 0 steps
    And the snapshot at position 0 has no last step

  Scenario: Each snapshot remembers the step that led to it
    When I run the timeline to the end
    Then the snapshot at position 1 has last step pc 0 and text "addi t0, zero, 3"
    And the snapshot at position 5 has last step pc 16 and text "bne t0, zero, -8"

  Scenario: Scrubbing back restores registers and memory exactly
    When I run the timeline to the end
    Then the timeline is at the end
    And at the current position register t1 is 6 and the byte at 1024 is 6
    When I seek to position 0
    Then at the current position register t0 is 0 and register t1 is 0 and the byte at 1024 is 0
    And the snapshot at the current position has state "ready"
    When I seek to position 11
    Then at the current position register t1 is 6 and the byte at 1024 is 0
    When I seek to position 12
    Then at the current position the byte at 1024 is 6
    And the snapshot at the current position has state "running"
    And the snapshot at the current position has 12 steps

  Scenario: Seeking forward after seeking back replays identically
    When I run the timeline to the end
    And I record a snapshot at every position
    And I seek to position 0
    Then visiting every position forwards gives the recorded snapshots
    And visiting every position backwards gives the recorded snapshots

  Scenario: Stepping backward and forward walks the recorded steps
    When I run the timeline to the end
    Then stepping backward 13 times succeeds and a 14th time fails
    And the timeline has length 13 and position 0
    And stepping forward again 13 times succeeds without recording new steps

  Scenario: Playing four steps at a time reaches the end
    When I play 4 steps at a time until the timeline is at the end
    Then it took 4 plays
    And the snapshot at the current position has state "halted"
    And the timeline has length 13 and position 13

  Scenario: Playing stops before a breakpoint and then carries on past it
    Given the machine has a breakpoint at 20
    When I play up to 100 steps
    Then the play advanced 11 steps and the timeline is at position 11
    When I play up to 100 steps
    Then the timeline is at the end

  Scenario: The end of the program cannot be stepped past
    When I run the timeline to the end
    Then stepping forward once more fails
    And the timeline has length 13 and position 13

  Scenario Outline: Seeking outside the recorded steps is an error
    When I seek to position <position> expecting an error
    Then the seek was refused with a range error

    Examples: out of range
      | position |
      | -1       |
      | 1        |
      | 1.5      |

  Scenario: Between two positions the diff lists the changed registers and bytes
    When I run the timeline to the end
    Then the diff from 0 to 3 changes registers
      | register | before | after |
      | t0       | 0      | 3     |
      | t1       | 0      | 2     |
    And the diff from 0 to 3 changes no memory
    And the diff from 11 to 12 changes memory at 1024 from "00" to "06"
    And the diff from 12 to 11 changes memory at 1024 from "06" to "00"
    And the diff from 11 to 12 changes no registers
    And the diff from 11 to 12 moves the pc from 20 to 24

  Scenario: Reset forgets the recording and starts again
    When I run the timeline to the end
    And I reset the timeline
    Then the timeline has length 0 and position 0
    And at the current position register t0 is 0 and register t1 is 0 and the byte at 1024 is 0
    When I run the timeline to the end
    Then at the current position register t1 is 6 and the byte at 1024 is 6

  Scenario: The step limit stops recording
    Given a timeline limited to 5 steps for the program
      """
      addi t0, t0, 1
      jal zero, -4
      """
    When I run the timeline to the end
    Then the timeline has length 5 and position 5
    And stepping forward once more fails
    And the timeline is not at the end

  Scenario: A fault is recorded as the last step
    Given a timeline for the program
      """
      addi t0, zero, 1
      lw t1, 1(zero)
      """
    When I run the timeline to the end
    Then the timeline is at the end
    And the snapshot at the current position has state "faulted"
    And the snapshot at the current position has a fault mentioning "misaligned lw"

  Scenario: Seeking far beyond the Machine's own undo history works
    Given a timeline for the program
      """
      li t0, 15000
      addi t0, t0, -1
      bne t0, zero, -4
      ebreak
      """
    When I run the timeline to the end
    Then the timeline has more than 25000 steps
    When I seek to position 10
    Then the snapshot at the current position matches a fresh machine after 10 steps
    When I seek to the end
    Then the snapshot at the current position matches a fresh machine after all the steps
    And at the current position register t0 is 0
    When I seek to position 25001
    Then the snapshot at the current position matches a fresh machine after 25001 steps

  Scenario: Output is recorded once, keyed by step, and replay does not repeat it
    Given a timeline for the program
      """
      addi a7, zero, 64
      addi a0, zero, 1
      addi a1, zero, 1024
      addi t0, zero, 72
      sb t0, 1024(zero)
      addi t0, zero, 105
      sb t0, 1025(zero)
      addi a2, zero, 2
      ecall
      addi a7, zero, 93
      addi a0, zero, 0
      ecall
      """
    When I run the timeline to the end
    Then the machine's own output on fd 1 is "Hi"
    And the timeline output at position 8 is ""
    And the timeline output at position 9 is "Hi"
    And the timeline output at the end is "Hi"
    When I seek to position 0
    And I run the timeline to the end
    And I seek to position 5
    And I step the timeline forward 20 times
    Then the machine's own output on fd 1 is "Hi"
    And the timeline output at the end is "Hi"
    And the timeline output log has 1 entry for step 8 on fd 1

  Scenario: Input given to a waiting program is recorded and replays identically
    Given a timeline for the program
      """
      addi a7, zero, 63
      addi a0, zero, 0
      addi a1, zero, 1500
      addi a2, zero, 1
      ecall
      lb t0, 1500(zero)
      ebreak
      """
    When I run the timeline to the end
    Then the snapshot at the current position has state "waiting-input"
    And the timeline is not at the end
    And stepping forward once more fails
    When I provide the input "A" to the timeline
    And I run the timeline to the end
    Then the timeline is at the end
    And at the current position register t0 is 65 and the byte at 1500 is 65
    And the input log has one entry of "A" at position 5
    When I record a snapshot at every position
    And I seek to position 0
    Then visiting every position forwards gives the recorded snapshots
    And visiting every position backwards gives the recorded snapshots
    And the snapshot at position 5 has state "waiting-input"
    And the snapshot at position 6 has state "running"

  Scenario: Input given while scrubbed back still goes to the end of the recording
    Given a timeline for the program
      """
      addi a7, zero, 63
      addi a0, zero, 0
      addi a1, zero, 1500
      addi a2, zero, 1
      ecall
      lb t0, 1500(zero)
      ebreak
      """
    When I run the timeline to the end
    And I seek to position 2
    And I provide the input "Z" to the timeline
    Then the input log has one entry of "Z" at position 5
    When I seek to the end
    And I run the timeline to the end
    Then at the current position register t0 is 90 and the byte at 1500 is 90

  Scenario: Snapshots agree with a fresh machine at 200 random positions
    Given a timeline for the program
      """
      addi t0, zero, 80
      addi t2, zero, 1100
      sb t0, 0(t2)
      addi t2, t2, 1
      addi t0, t0, -1
      bne t0, zero, -12
      ebreak
      """
    When I run the timeline to the end
    Then 200 random positions match a fresh machine run
