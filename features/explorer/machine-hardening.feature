Feature: Emulator hardening

  Scenario Outline: Loading an invalid image is refused before anything changes
    Given a machine running the program
      """
      li a0, 7
      ebreak
      """
    When I try to load 4 bytes at <address> with entry <entry>
    Then loading fails with "<message>"
    When I run the machine
    Then the machine is halted
    And register a0 holds 7

    Examples:
      | address  | entry    | message                                                     |
      | 0        | -4       | entry point -4 must be a 4-byte aligned address inside memory |
      | 0        | 2        | entry point 2 must be a 4-byte aligned address inside memory  |
      | 0        | 1048576  | entry point 1048576 must be a 4-byte aligned address inside memory |
      | -4       | 0        | load address -4 must be inside memory                       |
      | 1048576  | 0        | image of 4 bytes at 1048576 does not fit in memory          |

  Scenario: Input beyond what one read asked for is kept for the next read
    Given an io whose read supplies "abcdef" the first time and then has nothing
    And a machine running the program
      """
      li a0, 0
      li a1, 0x3000
      li a2, 2
      li a7, 63
      ecall
      li a1, 0x3002
      li a2, 4
      ecall
      ebreak
      """
    When I run the machine
    Then the machine is halted
    And memory at 0x3000 holds "61 62 63 64 65 66"

  Scenario: Memory kept for stepping back is bounded
    Given a machine running the program
      """
      li a0, 0
      li a1, 0x2000
      li a2, 0x80000
      li a7, 63
      loop: ecall
      j loop
      """
    When I provide 100 MiB of input
    And I run the machine for at most 200 steps
    Then I can step back between 20 and 50 times

  Scenario: Stepping back over a read that had to wait does not leave the machine waiting
    Given a machine running the program
      """
      li a0, 0
      li a1, 0x3000
      li a2, 5
      li a7, 63
      ecall
      ebreak
      """
    When I run the machine
    And I provide the input "abc"
    And I run the machine
    Then the machine is halted
    When I step back 2 times
    Then the machine is running
    And stepping back to the start leaves the machine ready

  Scenario: Machine state cannot be assigned from outside
    Given a machine running the program
      """
      ebreak
      """
    Then the machine state cannot be assigned from outside

  Scenario: fence is decoded, assembled and executed as a no-op
    When I decode the word 0x0ff0000f
    Then the text is "fence"
    And the fields cover bits 31 down to 0 exactly once
    Given a machine running the program
      """
      fence
      li a0, 3
      ebreak
      """
    When I run the machine
    Then the machine is halted
    And register a0 holds 3

  Scenario Outline: Only the plain fence word is accepted from the MISC-MEM opcode
    When I decode the word <word>
    Then there is no instruction

    Examples:
      | word       |
      | 0x0000100f |
      | 0x8330000f |
      | 0x0ff0008f |
