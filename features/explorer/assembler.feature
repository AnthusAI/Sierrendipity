Feature: Assembling the lesson subset of RV32IM in the browser
  Columns and lines in errors are 1-based. A program with errors produces no words.

  Scenario Outline: Every instruction assembles to the word the decoder shows for it
    When I assemble "<text>"
    Then the words are "<word>"
    And decoding each word and assembling the text again gives the same words

    Examples: the same table the decoder is specified with
      | word       | text              |
      | 0x00b50633 | add a2, a0, a1    |
      | 0x40b50633 | sub a2, a0, a1    |
      | 0x00b51633 | sll a2, a0, a1    |
      | 0x00b52633 | slt a2, a0, a1    |
      | 0x00b53633 | sltu a2, a0, a1   |
      | 0x00b54633 | xor a2, a0, a1    |
      | 0x00b55633 | srl a2, a0, a1    |
      | 0x40b55633 | sra a2, a0, a1    |
      | 0x00b56633 | or a2, a0, a1     |
      | 0x00b57633 | and a2, a0, a1    |
      | 0x02b50633 | mul a2, a0, a1    |
      | 0x02b51633 | mulh a2, a0, a1   |
      | 0x02b52633 | mulhsu a2, a0, a1 |
      | 0x02b53633 | mulhu a2, a0, a1  |
      | 0x02b54633 | div a2, a0, a1    |
      | 0x02b55633 | divu a2, a0, a1   |
      | 0x02b56633 | rem a2, a0, a1    |
      | 0x02b57633 | remu a2, a0, a1   |
      | 0x00530293 | addi t0, t1, 5    |
      | 0xfdc32293 | slti t0, t1, -36  |
      | 0xfdc33293 | sltiu t0, t1, -36 |
      | 0xfdc34293 | xori t0, t1, -36  |
      | 0xfdc36293 | ori t0, t1, -36   |
      | 0xfdc37293 | andi t0, t1, -36  |
      | 0x00351513 | slli a0, a0, 3    |
      | 0x01f55513 | srli a0, a0, 31   |
      | 0x41f55513 | srai a0, a0, 31   |
      | 0xff810483 | lb s1, -8(sp)     |
      | 0xff811483 | lh s1, -8(sp)     |
      | 0xff812483 | lw s1, -8(sp)     |
      | 0xff814483 | lbu s1, -8(sp)    |
      | 0xff815483 | lhu s1, -8(sp)    |
      | 0x00c280e7 | jalr ra, 12(t0)   |
      | 0x00000073 | ecall             |
      | 0x00100073 | ebreak            |
      | 0xfcb10e23 | sb a1, -36(sp)    |
      | 0xfcb11e23 | sh a1, -36(sp)    |
      | 0xfcb12e23 | sw a1, -36(sp)    |
      | 0xfeb506e3 | beq a0, a1, -20   |
      | 0xfeb516e3 | bne a0, a1, -20   |
      | 0xfeb546e3 | blt a0, a1, -20   |
      | 0xfeb556e3 | bge a0, a1, -20   |
      | 0xfeb566e3 | bltu a0, a1, -20  |
      | 0xfeb576e3 | bgeu a0, a1, -20  |
      | 0x7eb50fe3 | beq a0, a1, 4094  |
      | 0x12345537 | lui a0, 0x12345   |
      | 0x00001517 | auipc a0, 0x1     |
      | 0x001000ef | jal ra, 2048      |
      | 0xffdff06f | jal zero, -4      |
      | 0x800000ef | jal ra, -1048576  |

  Scenario Outline: Pseudo-instructions and literals
    When I assemble "<source>"
    Then the words are "<words>"

    Examples:
      | source                 | words                 |
      | nop                    | 0x00000013            |
      | mv a0, a1              | 0x00058513            |
      | mv fp, sp              | 0x00010413            |
      | add x5, x6, x7         | 0x007302b3            |
      | ret                    | 0x00008067            |
      | jr t0                  | 0x00028067            |
      | addi a0, zero, 0b101   | 0x00500513            |
      | addi a0, zero, 0x5     | 0x00500513            |
      | addi a0, zero, -0x10   | 0xff000513            |
      | lw a0, (sp)            | 0x00012503            |
      | .word 0xdeadbeef       | 0xdeadbeef            |
      | .word -1               | 0xffffffff            |
      | .word 3                | 0x00000003            |
      | .text                  |                       |
      | addi a0, zero, 5 # five | 0x00500513           |
      | addi a0, zero, 5 // five | 0x00500513          |
      | # only a comment       |                       |

  Scenario Outline: li expands to lui plus addi with the carry fix when it must
    When I assemble "li a0, <value>"
    Then the words are "<words>"

    Examples:
      | value      | words                 |
      | 5          | 0x00500513            |
      | -2048      | 0x80000513            |
      | 2047       | 0x7ff00513            |
      | 2048       | 0x00001537 0x80050513 |
      | 0x12345800 | 0x12346537 0x80050513 |
      | 0x12345000 | 0x12345537            |
      | 0x7fffffff | 0x80000537 0xfff50513 |
      | 0x80000000 | 0x80000537            |
      | 4294967295 | 0xfff00513            |
      | -2147483648 | 0x80000537           |

  Scenario: Labels work forwards and backwards in branches and jumps
    When I assemble the program
      """
      start: addi a0, a0, 1
             bne a0, a1, start
             beq a0, a1, done
             nop
      done:  ret
      """
    Then the words are "0x00150513 0xfeb51ee3 0x00b50463 0x00000013 0x00008067"
    And label start is at 0x0
    And label done is at 0x10

  Scenario: call is jal ra and j is jal zero
    When I assemble the program
      """
             call func
             ret
      func:  j func
      """
    Then the words are "0x008000ef 0x00008067 0x0000006f"

  Scenario: The listing maps source lines to addresses, and li takes two words
    When I assemble the program at base 0x1000
      """
      # a comment line

      main:
          li a0, 0x12345800
          ret
      """
    Then the listing is
      | line | addr   | word       |
      | 4    | 0x1000 | 0x12346537 |
      | 4    | 0x1004 | 0x80050513 |
      | 5    | 0x1008 | 0x00008067 |
    And label main is at 0x1000

  Scenario Outline: Errors say which line and column and why
    When I assemble "<source>"
    Then the only error is at line 1 column <column>: "<message>"
    And there are no words

    Examples:
      | source                | column | message                                                     |
      | frob a0, a1           | 1      | unknown mnemonic 'frob'                                     |
      | add a0, a1, q7        | 13     | bad register 'q7'                                           |
      | add a0, a1            | 1      | add expects 3 operands but found 2                          |
      | addi a0, a0, 2048     | 14     | immediate 2048 out of range (-2048 to 2047)                 |
      | addi a0, a0, -2049    | 14     | immediate -2049 out of range (-2048 to 2047)                |
      | slli a0, a0, 32       | 14     | shift amount 32 out of range (0 to 31)                      |
      | addi a0, a0, banana   | 14     | bad number 'banana'                                         |
      | lw a0, 4(sp           | 8      | expected offset(register) but found '4(sp'                  |
      | li a0, 4294967296     | 8      | immediate 4294967296 out of range (-2147483648 to 4294967295) |
      | lui a0, 0x100000      | 9     | immediate 1048576 out of range (-524288 to 1048575)         |
      | j nowhere             | 3      | undefined label 'nowhere'                                   |
      | beq a0, a1, nowhere   | 13     | undefined label 'nowhere'                                   |
      | beq a0, a1, 4096      | 13     | branch offset 4096 out of range (-4096 to 4094)             |
      | beq a0, a1, 3         | 13     | branch offset 3 must be even                                |
      | jal ra, 1048576       | 9     | jump offset 1048576 out of range (-1048576 to 1048574)      |
      | .incbin 'secret.bin'  | 1      | directive '.incbin' is not supported: the assembler never reads files |
      | .include 'other.s'    | 1      | directive '.include' is not supported: the assembler never reads files |
      | .banana               | 1      | unknown directive '.banana'                                 |
      | .word                 | 1      | .word expects a number                                      |
      | x: x2                 | 4      | unknown mnemonic 'x2'                                       |

  Scenario: A branch more than 4 KiB away is out of range
    When I assemble a branch to a label 1025 instructions away
    Then the only error is at line 1 column 13: "branch offset 4100 out of range (-4096 to 4094)"

  Scenario: A duplicate label is an error, and every bad line is reported
    When I assemble the program
      """
      a: nop
      a: nop
         frob
      """
    Then the errors are
      | line | column | message                      |
      | 2    | 1      | label 'a' is already defined |
      | 3    | 4      | unknown mnemonic 'frob'      |

  Scenario Outline: Machine code text parses to words
    When I parse the machine code "<text>"
    Then the parsed words are "<words>"

    Examples:
      | text                                 | words                 |
      | 0x00500513                           | 0x00500513            |
      | 00b50633                             | 0x00b50633            |
      | 0X00B50633                           | 0x00b50633            |
      | 0x00500513 00b50633                  | 0x00500513 0x00b50633 |
      | 0x00500513 # li a0, 5                | 0x00500513            |
      | 0x00500513 // li a0, 5               | 0x00500513            |
      | 0b00000000010100000000010100010011   | 0x00500513            |
      | 0b0000_0000_0101_0000_0000_0101_0001_0011 | 0x00500513       |
      | 0b00000000 01010000 00000101 00010011 | 0x00500513           |
      | 0x13                                 | 0x00000013            |
      | # nothing here                       |                       |

  Scenario: Machine code lines may be separated and blank lines are skipped
    When I parse the machine code
      """
      0x00500513   # li a0, 5

      0x00700593
      0b00000000101101010000011000110011
      """
    Then the parsed words are "0x00500513 0x00700593 0x00b50633"

  Scenario: Each parsed machine code word records its source line
    When I parse the machine code
      """
      // a comment with words: 00000013 00000013
      00500513 # one
      0b0000_0000 0101_0000 0000_0101 0001_0011
      00b50633
      """
    Then the parsed words are "0x00500513 0x00500513 0x00b50633"
    And the parsed word lines are "2 3 4"

  Scenario Outline: Bad machine code is reported with its position
    When I parse the machine code "<text>"
    Then the only parse error is at line 1 column <column>: "<message>"

    Examples:
      | text               | column | message                                          |
      | 0x00500513 zzzz    | 12     | 'zzzz' is not a hex or binary word               |
      | 12345              | 1      | '12345' is not a hex or binary word              |
      | 0xGG               | 1      | '0xGG' is not a valid hex word                   |
      | 0x123456789        | 1      | '0x123456789' has more than 32 bits              |
      | 0b0101             | 1      | binary word has 4 bits but needs 32              |
