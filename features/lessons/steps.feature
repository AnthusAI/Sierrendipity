Feature: The lesson step vocabulary
  One set of Gherkin-style phrases is used both in checks.feature files and in scene "until"
  conditions. Each phrase is a pure function of a recorded lesson run.

  Background:
    Given the lesson program "addi a0, zero, 5; addi a1, zero, 7; add a2, a0, a1; ebreak"
    And the program has run

  Scenario Outline: A phrase passes or fails against the run
    When I check the phrase: <phrase>
    Then the phrase <verdict>

    Examples: how the machine ended
      | phrase                                   | verdict |
      | the machine halted normally              | passes  |
      | the machine halted with exit code 0      | fails   |
      | the machine faulted                      | fails   |
      | the machine faulted with "illegal"       | fails   |
      | the machine has taken 4 steps            | passes  |
      | the machine has taken 3 steps            | fails   |
      | the machine has taken at least 3 steps   | passes  |
      | the machine has taken at least 5 steps   | fails   |

    Examples: boxes, by ABI name or x-name, signed or unsigned, decimal or hex
      | phrase                  | verdict |
      | box a2 holds 12         | passes  |
      | box x12 holds 12        | passes  |
      | box a2 holds 0xc        | passes  |
      | box a2 holds 13         | fails   |
      | box a0 holds 5          | passes  |
      | box a1 holds -5         | fails   |
      | box zero still holds 0  | passes  |
      | box zero holds 5        | fails   |
      | box a3 holds 4294967295 | fails   |
      | box a3 holds -1         | fails   |
      | box a3 holds 0          | passes  |

    Examples: the program text
      | phrase                                          | verdict |
      | the program has at most 4 cards                 | passes  |
      | the program has at most 3 cards                 | fails   |
      | the program ran at most 4 steps                 | passes  |
      | the program ran at most 3 steps                 | fails   |
      | the program ends with a Stop card               | passes  |
      | the program uses only the cards: addi, add, ebreak | passes  |
      | the program uses only the cards: addi, ebreak   | fails   |
      | the program does not use: sub, mul              | passes  |
      | the program does not use: add                   | fails   |
      | the loop ran 0 laps                             | passes  |
      | the loop ran 1 lap                              | fails   |

    Examples: memory
      | phrase                                       | verdict |
      | the word at address 0 is 0x00500513          | passes  |
      | the word at address 8 is 0x00b50633          | passes  |
      | the word at address 8 is 0x40b50633          | fails   |
      | memory at 0 holds 0x13                       | passes  |
      | memory at 0 holds 0                          | fails   |
      | shelf 1040 holds 0                           | passes  |
      | shelf 1040 holds 3                           | fails   |
      | the output is ""                             | passes  |
      | the output is "x"                            | fails   |

  Scenario: Memory, shelves and the pixel display are read from the machine
    Given the lesson program "addi t0, zero, 3; sb t0, 1040(zero); addi t0, zero, 9; sw t0, 1044(zero); addi t1, zero, 7; sb t1, 1029(zero); ebreak"
    And the program has run
    Then the phrase "shelf 1044 holds 9" passes
    And the phrase "memory at 1040 holds 3" passes
    And the phrase "shelf 1040 holds 3" passes
    And the phrase "memory at 1041 holds 3" fails
    And the phrase "the pixel at row 1 column 0 is color 3" passes
    And the phrase "the pixel at row 0 column 5 is color 7" passes
    And the phrase "the pixel at row 0 column 5 is color 6" fails
    And the phrase "at least 2 pixels are lit" passes
    And the phrase "at least 5 pixels are lit" fails
    And the phrase "bytes 1040 to 1040 are all non-zero" passes
    And the phrase "bytes 1040 to 1041 are all non-zero" fails

  Scenario: Faults and exit codes
    Given the lesson program "addi a0, zero, 3; addi a7, zero, 93; ecall"
    And the program has run
    Then the phrase "the machine halted with exit code 3" passes
    And the phrase "the machine halted normally" fails
    And the phrase "the machine faulted" fails
    Given the lesson program "addi a7, zero, 7; ecall"
    And the program has run
    Then the phrase "the machine faulted" passes
    And the phrase "the machine faulted with \"ecall\"" passes
    And the phrase "the machine faulted with \"banana\"" fails
    And the phrase "the machine halted normally" fails

  Scenario: Output comes from the write ecall
    Given the lesson program "addi a7, zero, 64; addi a0, zero, 1; addi a1, zero, 24; addi a2, zero, 2; ecall; ebreak; .word 0x6948"
    And the program has run
    Then the phrase "the output is \"Hi\"" passes
    And the phrase "the output is \"Ho\"" fails

  Scenario: Static and executed card use differ
    Given the lesson program "jal zero, 8; sub a0, a0, a0; ebreak"
    And the program has run
    Then the phrase "the program does not use: sub" fails
    And the phrase "the program uses only the cards: jal, ebreak" fails
    And the phrase "the program uses only the cards: jal, sub, ebreak" passes

  Scenario: Laps are backward branches taken
    Given the lesson program "addi t0, zero, 3; addi t0, t0, -1; bne t0, zero, -4; ebreak"
    And the program has run
    Then the phrase "the loop ran 2 laps" passes
    And the phrase "the loop ran at least 2 laps" passes
    And the phrase "the loop ran at least 3 laps" fails
    And the phrase "the loop ran 3 laps" fails
    And the phrase "box t0 holds 0" passes

  Scenario: Predictions and the starter
    Given the lesson program "addi a0, zero, 5; addi a1, zero, 7; add a2, a0, a1; ebreak"
    And the starter program "addi a0, zero, 5; addi a1, zero, 7; sub a2, a0, a1; ebreak"
    And the student predicted "a2" as 57
    And the student predicted "a2" as 12
    And the program has run
    Then the phrase "the student's first prediction for \"a2\" was 57" passes
    And the phrase "the student's first prediction for \"a2\" was 12" fails
    And the phrase "the student's first prediction for \"a1\" was 12" fails
    And the phrase "the program differs from the starter by exactly 1 bit" passes
    And the phrase "the program differs from the starter by exactly 2 bits" fails

  Scenario: Recorded student events
    Given the lesson program "addi a0, zero, 5; ebreak"
    And the student edited card 0 to 0x00700513
    And the student toggled bit 3 of card 1
    And the student rewound
    And the student looked at step 1
    And the program has run
    Then the phrase "the student edited a card" passes
    And the phrase "the student edited at least 2 cards" fails
    And the phrase "the student toggled at least 1 bit" passes
    And the phrase "the student rewound" passes
    And the phrase "the timeline is at step 1" passes
    And the phrase "the student has predicted \"a2\"" fails

  Scenario: The program counter
    Given the lesson program "addi a0, zero, 5; ebreak"
    And the program has run
    Then the phrase "the program counter is 4" passes
    And the phrase "the program counter is 0" fails

  Scenario: A program that never stops is cut off by the step cap
    Given the lesson program "loop: jal zero, loop"
    And the program has run with a cap of 50 steps
    Then the run was stopped by the step cap
    And the phrase "the machine halted normally" fails
    And the phrase "the program ran at most 50 steps" passes
    And the phrase "the program ran at most 49 steps" fails

  Scenario: Programs can start with registers and memory set up
    Given the lesson program "add a2, a0, a1; lw a3, 100(zero); ebreak"
    And the starting boxes a0 = 4 and a1 = 38
    And the starting memory at 100 is 77
    And the program has run
    Then the phrase "box a2 holds 42" passes
    And the phrase "box a3 holds 77" passes

  Scenario: Unknown phrases get a clear error that lists close matches
    When I parse the phrase: the machine halts normally
    Then the parse error mentions "unknown step"
    And the parse error suggests "the machine halted normally"

  Scenario Outline: Malformed phrases are rejected when parsed
    When I parse the phrase: <phrase>
    Then the parse error mentions "<message>"

    Examples:
      | phrase                          | message                 |
      | box q9 holds 3                  | no box called           |
      | box a2 holds 99999999999        | out of range            |
      | the pixel at row 16 column 0 is color 1 | row                 |
      | the pixel at row 0 column 0 is color 16 | color               |
      | bytes 1040 to 1030 are all non-zero | order               |
      | the word at address 3 is 5      | multiple of 4           |
      | the program has at most 0 cards | at least 1              |
      |                                 | empty                   |

  Scenario: Keywords are ignored and a feature file is run scenario by scenario
    Given the lesson program "addi a0, zero, 5; addi a1, zero, 7; add a2, a0, a1; ebreak"
    And the program has run
    When I run the checks:
      """
      Feature: Wake the machine

        @pass
        Scenario: The machine adds
          Then the machine halted normally
          And box a2 holds 12

        @bonus @star=perfect
        Scenario: Never matches
          Then box a2 holds 99
          But the machine halted normally
      """
    Then the scenario "The machine adds" passed
    And the scenario "Never matches" failed with "box a2 holds 99"
    And the earned stars are "pass"
