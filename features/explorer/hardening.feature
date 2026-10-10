Feature: Assembler and parser hardening
  Odd input must never be dropped silently or make the browser hang.

  Scenario Outline: Every kind of line ending separates lines
    When I assemble the source with escapes "<source>"
    Then the words are "<words>"

    Examples:
      | source           | words                 |
      | nop\r            | 0x00000013            |
      | nop\r\nret       | 0x00000013 0x00008067 |
      | nop\nret         | 0x00000013 0x00008067 |
      | nop\rret         | 0x00000013 0x00008067 |
      | nop ret     | 0x00000013 0x00008067 |
      | nop\nret\n       | 0x00000013 0x00008067 |
      | nop\r\n\r\nret\r | 0x00000013 0x00008067 |
      | ret              | 0x00008067            |

  Scenario: Line numbers count lone carriage returns as line ends
    When I assemble the source with escapes "nop\rfrob"
    Then the only error is at line 2 column 1: "unknown mnemonic 'frob'"

  Scenario Outline: Mnemonics and register names are not case sensitive
    When I assemble "<source>"
    Then the words are "<words>"

    Examples:
      | source           | words      |
      | ADD A0, A1, A2   | 0x00c58533 |
      | Lw a0, 0(SP)     | 0x00012503 |
      | NOP              | 0x00000013 |
      | .WORD 3          | 0x00000003 |
      | Addi X5, Zero, 1 | 0x00100293 |

  Scenario: fence assembles to the plain fence word
    When I assemble "fence"
    Then the words are "0x0ff0000f"

  Scenario: A very long line is refused quickly instead of being scanned
    When I assemble a line of 100000 open parentheses after "lw a0, "
    Then the only error is at line 1 column 1: "line is longer than 4096 characters"
    And that took less than 1000 ms

  Scenario: A line at the length limit is handled quickly
    When I assemble a line of 4000 open parentheses after "lw a0, "
    Then there is one error and it mentions "expected offset(register)"
    And that took less than 1000 ms

  Scenario: An absurdly large number is reported clearly
    When I assemble an addi with a decimal literal of 400 digits
    Then the only error is at line 1 column 14: "number is too large"

  Scenario: A register error inside a memory operand points at the register
    When I assemble "lw a0, 4(q9)"
    Then the only error is at line 1 column 10: "bad register 'q9'"

  Scenario Outline: Bare hex words are not mistaken for binary
    When I parse the machine code "<text>"
    Then the parsed words are "<words>"

    Examples:
      | text       | words      |
      | 0b1234ef   | 0x0b1234ef |
      | 0b0b0b0b   | 0x0b0b0b0b |
      | 0B1234EF   | 0x0b1234ef |

  Scenario: Too many binary digits is one clear error
    When I parse the machine code "0b101010101010101010101010101010101"
    Then the only parse error is at line 1 column 1: "binary word has more than 32 bits"

  Scenario: A very long machine code line is refused quickly
    When I parse a line of 100000 words
    Then the only parse error is at line 1 column 1: "line is longer than 4096 characters"
    And that took less than 1000 ms
