Feature: Explorer machine code and assembly library
  As a student
  I want a small RISC-V computer I can write programs for in machine code or assembly
  so that I see exactly what the computer does, one instruction at a time

  Scenario Outline: The decoder reads machine code words
    When I decode the word <word>
    Then the instruction is "<text>"

    Examples:
      | word       | text               |
      | 0x00500093 | addi ra, zero, 5   |
      | 0x002081b3 | add gp, ra, sp     |
      | 0x402081b3 | sub gp, ra, sp     |
      | 0x00812283 | lw t0, 8(sp)       |
      | 0x00512423 | sw t0, 8(sp)       |
      | 0x00208463 | beq ra, sp, 8      |
      | 0x123452b7 | lui t0, 0x12345    |
      | 0xffdff06f | jal zero, -4       |
      | 0x40315093 | srai ra, sp, 3     |
      | 0x00000073 | ecall              |

  Scenario: The decoder rejects words that are not instructions
    When I decode the word 0xffffffff
    Then the word is not a valid instruction

  Scenario Outline: The assembler produces the same machine code
    When I assemble "<source>"
    Then the machine code is <word>

    Examples:
      | source              | word       |
      | addi x1, x0, 5     | 0x00500093 |
      | add gp, ra, sp      | 0x002081b3 |
      | sub x3, x1, x2      | 0x402081b3 |
      | lw t0, 8(sp)        | 0x00812283 |
      | sw t0, 8(sp)        | 0x00512423 |
      | beq x1, x2, 8       | 0x00208463 |
      | lui t0, 0x12345     | 0x123452b7 |
      | j -4                | 0xffdff06f |
      | srai x1, x2, 3      | 0x40315093 |
      | ecall               | 0x00000073 |
      | nop                 | 0x00000013 |
      | mv a0, a1           | 0x00058513 |
      | ret                 | 0x00008067 |

  Scenario: Every instruction survives an encode, decode and disassemble round trip
    Then every instruction round-trips through its machine code and its assembly text

  Scenario: Labels, comments and large constants assemble
    When I assemble the program
      """
      start:            # count down from three
          li   t0, 3
      loop:
          addi t0, t0, -1
          bnez t0, loop
          li   a0, 0x12345678
      """
    Then there are no assembly errors
    And label "loop" is at address 4
    And the program has 5 words

  Scenario: Mistakes are reported with line numbers
    When I assemble the program
      """
      addi x1, x0, 5
      frobnicate x1
      addi x1, x0, 5000
      beq x1, x2, nowhere
      addi x99, x0, 1
      """
    Then the assembly errors are
      | line | message                                  |
      | 2    | unknown instruction frobnicate           |
      | 3    | immediate 5000 out of range for addi     |
      | 4    | unknown label nowhere                    |
      | 5    | expected a register, got x99             |

  Scenario: The same program runs from assembly and from machine code
    Given the program
      """
      li   a0, 0
      li   t0, 5
      loop:
        add  a0, a0, t0
        addi t0, t0, -1
        bnez t0, loop
      li   a7, 93
      ecall
      """
    When I run it from assembly
    Then the machine halts with exit code 15
    When I run it from its machine code
    Then the machine halts with exit code 15

  Scenario: Single-stepping changes registers, memory and the program counter
    Given the program
      """
      li  t0, 42
      sw  t0, 16(zero)
      lw  t1, 16(zero)
      """
    When I load it into a machine and step 1 time
    Then register t0 is 42
    And the program counter is 4
    When I step 2 times
    Then memory word at 16 is 42
    And register t1 is 42
    And the program counter is 12

  Scenario: Register zero is always zero
    Given the program
      """
      addi zero, zero, 7
      """
    When I load it into a machine and step 1 time
    Then register zero is 0

  Scenario: Arithmetic wraps to 32 bits and shifts keep their sign
    Given the program
      """
      li   t0, 0x7fffffff
      addi t1, t0, 1
      srai t2, t1, 31
      srli t3, t1, 31
      """
    When I run it from assembly
    Then register t1 is -2147483648
    And register t2 is -1
    And register t3 is 1

  Scenario: Loads and stores of bytes sign-extend or zero-extend
    Given the program
      """
      li  t0, 0xff
      sb  t0, 32(zero)
      lb  t1, 32(zero)
      lbu t2, 32(zero)
      """
    When I run it from assembly
    Then register t1 is -1
    And register t2 is 255

  Scenario: Teaching environment calls print and exit
    Given the program
      """
      li a0, 72
      li a7, 11
      ecall
      li a0, 7
      li a7, 1
      ecall
      li a0, 0
      li a7, 93
      ecall
      """
    When I run it from assembly
    Then the machine output is "H7"
    And the machine halts with exit code 0

  Scenario Outline: The machine stops on a fault instead of misbehaving
    Given the program
      """
      <program>
      """
    When I run it from assembly
    Then the machine faults with "<fault>"

    Examples:
      | program                              | fault                       |
      | lw t0, 3(zero)                       | misaligned 4-byte access    |
      | lui t0, 0x10\nlw t1, 0(t0)           | memory access out of range  |
