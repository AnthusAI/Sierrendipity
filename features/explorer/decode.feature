Feature: Decoding RV32IM machine words
  The Compilation Explorer shows each 32-bit word as an instruction and as coloured bit fields.
  The expected encodings were checked against the RISC-V unprivileged specification.

  Scenario Outline: A word decodes to canonical assembly text
    When I decode the word <word>
    Then the text is "<text>"

    Examples: every instruction format
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

  Scenario Outline: Aliases print the familiar short forms when asked
    When I decode the word <word> with aliases
    Then the text is "<text>"

    Examples:
      | word       | text            |
      | 0x00000013 | nop             |
      | 0x00500513 | li a0, 5        |
      | 0x00058513 | mv a0, a1       |
      | 0x00008067 | ret             |
      | 0x00028067 | jr t0           |
      | 0xffdff06f | j -4            |
      | 0x00b50633 | add a2, a0, a1  |
      | 0x00c280e7 | jalr ra, 12(t0) |

  Scenario: Without aliases the canonical form is printed
    When I decode the word 0x00008067
    Then the text is "jalr zero, 0(ra)"

  Scenario Outline: Words that are not valid RV32IM decode to nothing
    When I decode the word <word>
    Then there is no instruction

    Examples:
      | word       | why                                  |
      | 0x00000000 | all zeros is illegal                 |
      | 0xffffffff | all ones is illegal                  |
      | 0x00000001 | a compressed encoding                |
      | 0x40b51633 | sll with a nonzero funct7            |
      | 0x40051513 | slli with a nonzero funct7           |
      | 0x00c2a0e7 | jalr with a nonzero funct3           |
      | 0x00003003 | load with funct3 = 3 (ld is RV64)    |
      | 0x00003023 | store with funct3 = 3 (sd is RV64)   |
      | 0x00002063 | branch with funct3 = 2               |
      | 0x00200073 | system word that is not ecall/ebreak |

  Scenario: Registers print as ABI names
    Then register 0 is named "zero"
    And register 1 is named "ra"
    And register 2 is named "sp"
    And register 8 is named "s0"
    And register 10 is named "a0"
    And register 17 is named "a7"
    And register 31 is named "t6"

  Scenario: R-type fields
    When I decode the word 0x40b50633
    Then the format is R
    And the fields are
      | name   | hi | lo | value | label          |
      | funct7 | 31 | 25 | 32    | funct7 = 0x20  |
      | rs2    | 24 | 20 | 11    | rs2 = a1 (x11) |
      | rs1    | 19 | 15 | 10    | rs1 = a0 (x10) |
      | funct3 | 14 | 12 | 0     | funct3 = 0     |
      | rd     | 11 | 7  | 12    | rd = a2 (x12)  |
      | opcode | 6  | 0  | 51    | opcode = 0x33  |

  Scenario: I-type fields
    When I decode the word 0xfdc32293
    Then the format is I
    And the fields are
      | name   | hi | lo | value | label         |
      | imm    | 31 | 20 | 4060  | imm = -36     |
      | rs1    | 19 | 15 | 6     | rs1 = t1 (x6) |
      | funct3 | 14 | 12 | 2     | funct3 = 2    |
      | rd     | 11 | 7  | 5     | rd = t0 (x5)  |
      | opcode | 6  | 0  | 19    | opcode = 0x13 |

  Scenario: S-type immediates are two fields with one name
    When I decode the word 0xfcb12e23
    Then the format is S
    And the fields are
      | name   | hi | lo | value | label                 |
      | imm    | 31 | 25 | 126   | imm = -36 (bits 11:5) |
      | rs2    | 24 | 20 | 11    | rs2 = a1 (x11)        |
      | rs1    | 19 | 15 | 2     | rs1 = sp (x2)         |
      | funct3 | 14 | 12 | 2     | funct3 = 2            |
      | imm    | 11 | 7  | 28    | imm = -36 (bits 4:0)  |
      | opcode | 6  | 0  | 35    | opcode = 0x23         |

  Scenario: B-type immediates are four fields with one name
    When I decode the word 0xfeb506e3
    Then the format is B
    And the fields are
      | name   | hi | lo | value | label                 |
      | imm    | 31 | 31 | 1     | imm = -20 (bit 12)    |
      | imm    | 30 | 25 | 63    | imm = -20 (bits 10:5) |
      | rs2    | 24 | 20 | 11    | rs2 = a1 (x11)        |
      | rs1    | 19 | 15 | 10    | rs1 = a0 (x10)        |
      | funct3 | 14 | 12 | 0     | funct3 = 0            |
      | imm    | 11 | 8  | 6     | imm = -20 (bits 4:1)  |
      | imm    | 7  | 7  | 1     | imm = -20 (bit 11)    |
      | opcode | 6  | 0  | 99    | opcode = 0x63         |

  Scenario: U-type fields
    When I decode the word 0x12345537
    Then the format is U
    And the fields are
      | name   | hi | lo | value | label         |
      | imm    | 31 | 12 | 74565 | imm = 0x12345 |
      | rd     | 11 | 7  | 10    | rd = a0 (x10) |
      | opcode | 6  | 0  | 55    | opcode = 0x37 |

  Scenario: J-type immediates are four fields with one name
    When I decode the word 0x001000ef
    Then the format is J
    And the fields are
      | name   | hi | lo | value | label                   |
      | imm    | 31 | 31 | 0     | imm = 2048 (bit 20)     |
      | imm    | 30 | 21 | 0     | imm = 2048 (bits 10:1)  |
      | imm    | 20 | 20 | 1     | imm = 2048 (bit 11)     |
      | imm    | 19 | 12 | 0     | imm = 2048 (bits 19:12) |
      | rd     | 11 | 7  | 1     | rd = ra (x1)            |
      | opcode | 6  | 0  | 111   | opcode = 0x6f           |

  Scenario Outline: The fields of every valid word tile all 32 bits
    When I decode the word <word>
    Then the fields cover bits 31 down to 0 exactly once

    Examples:
      | word       |
      | 0x00b50633 |
      | 0x00351513 |
      | 0x41f55513 |
      | 0xff812483 |
      | 0xfcb12e23 |
      | 0xfeb506e3 |
      | 0x12345537 |
      | 0x001000ef |
      | 0x00000073 |
