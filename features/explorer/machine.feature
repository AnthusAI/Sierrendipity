Feature: Stepping RV32IM programs in the emulator
  Programs are written in assembly and assembled with the explorer's own assembler. Registers
  are shown as unsigned 32-bit values, so -1 is 0xffffffff.

  Scenario: A new machine is ready with the stack pointer at the top of memory
    Given a machine running the program
      """
      ebreak
      """
    Then the machine is ready
    And the program counter is 0x0
    And register sp holds 0x100000
    And register a0 holds 0
    And the step count is 0
    And there is no exit code

  Scenario: The stack pointer follows a custom memory size
    Given a machine with 4096 bytes of memory running the program
      """
      ebreak
      """
    Then register sp holds 0x1000

  Scenario Outline: Integer arithmetic, including signed and unsigned corner cases
    When I compute "<instruction>" with a0 = <a0> and a1 = <a1>
    Then the result is <a2>

    Examples: base integer register-register operations
      | instruction     | a0         | a1         | a2         |
      | add a2, a0, a1  | 0x7fffffff | 1          | 0x80000000 |
      | add a2, a0, a1  | 0xffffffff | 1          | 0          |
      | sub a2, a0, a1  | 0          | 1          | 0xffffffff |
      | sll a2, a0, a1  | 1          | 31         | 0x80000000 |
      | sll a2, a0, a1  | 1          | 33         | 2          |
      | srl a2, a0, a1  | 0x80000000 | 4          | 0x08000000 |
      | sra a2, a0, a1  | 0x80000000 | 4          | 0xf8000000 |
      | slt a2, a0, a1  | -1         | 1          | 1          |
      | slt a2, a0, a1  | 1          | -1         | 0          |
      | sltu a2, a0, a1 | -1         | 1          | 0          |
      | sltu a2, a0, a1 | 1          | -1         | 1          |
      | xor a2, a0, a1  | 0xff00ff00 | 0x0ff00ff0 | 0xf0f0f0f0 |
      | or a2, a0, a1   | 0xff00ff00 | 0x0ff00ff0 | 0xfff0fff0 |
      | and a2, a0, a1  | 0xff00ff00 | 0x0ff00ff0 | 0x0f000f00 |

    Examples: register-immediate operations
      | instruction         | a0         | a1 | a2         |
      | addi a2, a0, 1      | 0x7fffffff | 0  | 0x80000000 |
      | addi a2, a0, -1     | 0          | 0  | 0xffffffff |
      | slti a2, a0, -1     | -2         | 0  | 1          |
      | slti a2, a0, -1     | 0          | 0  | 0          |
      | sltiu a2, a0, -1    | 5          | 0  | 1          |
      | sltiu a2, a0, -1    | -1         | 0  | 0          |
      | sltiu a2, a0, 1     | 0          | 0  | 1          |
      | xori a2, a0, -1     | 0x0f0f0f0f | 0  | 0xf0f0f0f0 |
      | ori a2, a0, 0xf     | 0xf0       | 0  | 0xff       |
      | andi a2, a0, -256   | 0xffffffff | 0  | 0xffffff00 |
      | slli a2, a0, 31     | 1          | 0  | 0x80000000 |
      | srli a2, a0, 4      | 0x80000000 | 0  | 0x08000000 |
      | srai a2, a0, 4      | 0x80000000 | 0  | 0xf8000000 |
      | lui a2, 0x80000     | 0          | 0  | 0x80000000 |

    Examples: multiplication is exact for every variant
      | instruction       | a0         | a1         | a2         |
      | mul a2, a0, a1    | 0x10000    | 0x10000    | 0          |
      | mul a2, a0, a1    | -1         | -1         | 1          |
      | mul a2, a0, a1    | 0x7fffffff | 2          | 0xfffffffe |
      | mulh a2, a0, a1   | -1         | -1         | 0          |
      | mulh a2, a0, a1   | 0x80000000 | 0x80000000 | 0x40000000 |
      | mulh a2, a0, a1   | 0x80000000 | 2          | 0xffffffff |
      | mulh a2, a0, a1   | 0x7fffffff | 0x7fffffff | 0x3fffffff |
      | mulhsu a2, a0, a1 | -1         | 0xffffffff | 0xffffffff |
      | mulhsu a2, a0, a1 | 1          | 0xffffffff | 0          |
      | mulhsu a2, a0, a1 | 0x80000000 | 2          | 0xffffffff |
      | mulhu a2, a0, a1  | 0xffffffff | 0xffffffff | 0xfffffffe |
      | mulhu a2, a0, a1  | 0x80000000 | 2          | 1          |

    Examples: division rounds toward zero; division by zero and overflow do not trap
      | instruction       | a0         | a1 | a2         |
      | div a2, a0, a1    | 7          | -2 | 0xfffffffd |
      | div a2, a0, a1    | -7         | 2  | 0xfffffffd |
      | rem a2, a0, a1    | 7          | -2 | 1          |
      | rem a2, a0, a1    | -7         | 2  | 0xffffffff |
      | divu a2, a0, a1   | 0xffffffff | 2  | 0x7fffffff |
      | remu a2, a0, a1   | 0xffffffff | 10 | 5          |
      | div a2, a0, a1    | 5          | 0  | 0xffffffff |
      | divu a2, a0, a1   | 5          | 0  | 0xffffffff |
      | rem a2, a0, a1    | 5          | 0  | 5          |
      | remu a2, a0, a1   | 5          | 0  | 5          |
      | div a2, a0, a1    | 0x80000000 | -1 | 0x80000000 |
      | rem a2, a0, a1    | 0x80000000 | -1 | 0          |

  Scenario: Register x0 always reads as zero
    Given a machine running the program
      """
      addi zero, zero, 5
      addi a0, zero, 1
      ebreak
      """
    When I run the machine
    Then register zero holds 0
    And register a0 holds 1

  Scenario: auipc adds the upper immediate to the address of the instruction itself
    Given a machine running the program
      """
      nop
      auipc a0, 1
      ebreak
      """
    When I run the machine
    Then register a0 holds 0x1004

  Scenario: Loads and stores are little-endian and extend by sign or zero
    Given a machine running the program
      """
      li a0, 0x2000
      li a1, 0x80ff8081
      sw a1, 0(a0)
      lb a2, 0(a0)
      lbu a3, 0(a0)
      lh a4, 2(a0)
      lhu a5, 2(a0)
      lw a6, 0(a0)
      sb a1, 4(a0)
      sh a1, 6(a0)
      ebreak
      """
    When I run the machine
    Then memory at 0x2000 holds "81 80 ff 80 81 00 81 80"
    And register a2 holds 0xffffff81
    And register a3 holds 0x81
    And register a4 holds 0xffff80ff
    And register a5 holds 0x80ff
    And register a6 holds 0x80ff8081

  Scenario Outline: Conditional branches compare signed or unsigned
    When I branch with <branch> on a0 = <a0> and a1 = <a1>
    Then the branch is <outcome>

    Examples:
      | branch | a0         | a1         | outcome   |
      | beq    | 5          | 5          | taken     |
      | beq    | 5          | 6          | not taken |
      | bne    | 5          | 6          | taken     |
      | bne    | 5          | 5          | not taken |
      | blt    | -1         | 1          | taken     |
      | blt    | 5          | 5          | not taken |
      | bltu   | 0xffffffff | 1          | not taken |
      | bltu   | 1          | 0xffffffff | taken     |
      | bge    | 1          | -1         | taken     |
      | bge    | 5          | 5          | taken     |
      | bgeu   | 1          | 0xffffffff | not taken |
      | bgeu   | 5          | 5          | taken     |

  Scenario: jal links the return address and ret jumps back
    Given a machine running the program
      """
          jal ra, f
          ebreak
      f:  addi a0, zero, 7
          ret
      """
    When I run the machine
    Then register a0 holds 7
    And register ra holds 4
    And the machine is halted
    And there is no exit code

  Scenario: jalr clears the low bit of its target
    Given a machine running the program
      """
          li t0, 13
          jalr ra, 0(t0)
          ebreak
          addi a0, zero, 9
          ebreak
      """
    When I run the machine
    Then register a0 holds 9
    And register ra holds 8

  Scenario: One step reports what it did
    Given a machine running the program
      """
      addi a0, zero, 5
      addi a0, a0, 0
      addi zero, a0, 1
      li t0, 0x2000
      sw a0, 4(t0)
      """
    When I step the machine
    Then the step result shows pc 0x0, word 0x00500513 and text "addi a0, zero, 5"
    And the step changed registers "a0"
    And the step wrote no memory
    And the machine is running
    And the program counter is 0x4
    When I step the machine
    Then the step changed registers ""
    When I step the machine
    Then the step changed registers ""
    When I step the machine
    Then the step changed registers "t0"
    When I step the machine
    Then the step changed registers ""
    And the step wrote 4 bytes at 0x2004

  Scenario: exit stops the machine with the exit code
    Given a machine running the program
      """
      li a0, 42
      li a7, 93
      ecall
      """
    When I run the machine
    Then the machine is halted
    And the machine exit code is 42
    And the step count is 3

  Scenario: ebreak halts without an exit code
    Given a machine running the program
      """
      ebreak
      """
    When I run the machine
    Then the machine is halted
    And there is no exit code

  Scenario: write sends bytes to the file descriptor and returns the length
    Given the text "hello\n" is in memory at 0x2000
    And a machine running the program
      """
      li a0, 1
      li a1, 0x2000
      li a2, 6
      li a7, 64
      ecall
      mv s1, a0
      li a0, 0
      li a7, 93
      ecall
      """
    When I run the machine
    Then the output on file descriptor 1 is "hello\n"
    And register s1 holds 6
    And the machine exit code is 0

  Scenario: read waits for input, then retries the same ecall once input is provided
    Given a machine running the program
      """
      li a0, 0
      li a1, 0x3000
      li a2, 5
      li a7, 63
      ecall
      mv s1, a0
      li a7, 93
      ecall
      """
    When I run the machine
    Then the machine is waiting-input
    And the program counter is 0x10
    When I step the machine
    Then the machine is waiting-input
    When I provide the input "abc"
    And I run the machine
    Then the machine is halted
    And register s1 holds 3
    And memory at 0x3000 holds "61 62 63"

  Scenario: Input provided before the read is consumed without waiting
    Given a machine running the program
      """
      li a0, 0
      li a1, 0x3000
      li a2, 2
      li a7, 63
      ecall
      mv s1, a0
      ebreak
      """
    When I provide the input "abcd"
    And I run the machine
    Then register s1 holds 2
    And memory at 0x3000 holds "61 62"

  Scenario: read returns 0 at end of input
    Given a machine running the program
      """
      li a0, 0
      li a1, 0x3000
      li a2, 5
      li a7, 63
      ecall
      mv s1, a0
      li a7, 93
      ecall
      """
    When I run the machine
    And I provide end of input
    And I run the machine
    Then the machine is halted
    And register s1 holds 0

  Scenario: A custom io is asked again on each step while waiting
    Given an io whose read has nothing the first time and then supplies "xyz"
    And a machine running the program
      """
      li a0, 0
      li a1, 0x3000
      li a2, 5
      li a7, 63
      ecall
      mv s1, a0
      ebreak
      """
    When I run the machine
    Then the machine is waiting-input
    When I step the machine
    And I run the machine
    Then the machine is halted
    And register s1 holds 3
    And memory at 0x3000 holds "78 79 7a"

  Scenario Outline: Faults stop the machine and say where
    Given a machine running the program
      """
      <program>
      """
    When I run the machine
    Then the machine is faulted
    And the fault is "<fault>"

    Examples:
      | program          | fault                                    |
      | .word 0          | illegal instruction 0x00000000 at pc 0x0 |
      | .word 0xffffffff | illegal instruction 0xffffffff at pc 0x0 |

  Scenario: A misaligned word load faults
    Given a machine running the program
      """
      li a0, 0x2001
      lw a1, 0(a0)
      """
    When I run the machine
    Then the machine is faulted
    And the fault is "misaligned lw address 0x2001 at pc 0x8"

  Scenario: A misaligned halfword store faults but a byte store at an odd address does not
    Given a machine running the program
      """
      li a0, 0x2001
      sb a1, 0(a0)
      sh a1, 0(a0)
      """
    When I run the machine
    Then the machine is faulted
    And the fault is "misaligned sh address 0x2001 at pc 0xc"

  Scenario: A misaligned halfword load faults
    Given a machine running the program
      """
      li a0, 0x2001
      lhu a1, 0(a0)
      """
    When I run the machine
    Then the fault is "misaligned lhu address 0x2001 at pc 0x8"

  Scenario: A misaligned word store faults
    Given a machine running the program
      """
      li a0, 0x2002
      sw a1, 0(a0)
      """
    When I run the machine
    Then the fault is "misaligned sw address 0x2002 at pc 0x8"

  Scenario: An access outside memory faults
    Given a machine running the program
      """
      li a0, 0x200000
      lbu a1, 0(a0)
      """
    When I run the machine
    Then the fault is "lbu address 0x200000 out of range at pc 0x4"

  Scenario: A negative address is outside memory
    Given a machine running the program
      """
      li a0, -4
      sw a1, 0(a0)
      """
    When I run the machine
    Then the fault is "sw address 0xfffffffc out of range at pc 0x4"

  Scenario: Jumping outside memory faults at the jump
    Given a machine running the program
      """
      li t0, 0x200000
      jr t0
      """
    When I run the machine
    Then the fault is "jump target 0x200000 out of range at pc 0x4"

  Scenario: Jumping to an address that is not a multiple of four faults
    Given a machine running the program
      """
      jal zero, 2
      """
    When I run the machine
    Then the fault is "misaligned jump target 0x2 at pc 0x0"

  Scenario: An unknown ecall number faults
    Given a machine running the program
      """
      li a7, 1
      ecall
      """
    When I run the machine
    Then the fault is "unsupported ecall 1 at pc 0x4"

  Scenario: Running off the end of the program hits an illegal zero word
    Given a machine running the program
      """
      nop
      """
    When I run the machine
    Then the fault is "illegal instruction 0x00000000 at pc 0x4"
    And the step count is 1

  Scenario: A faulted machine stays faulted
    Given a machine running the program
      """
      .word 0
      """
    When I run the machine
    And I step the machine
    Then the machine is faulted
    And the step count is 0

  Scenario: Breakpoints stop the machine before the instruction runs
    Given a machine running the program
      """
      nop
      nop
      addi a0, zero, 1
      nop
      ebreak
      """
    And a breakpoint at 0x8
    When I run the machine
    Then the machine is running
    And the program counter is 0x8
    And register a0 holds 0
    When I run the machine
    Then the machine is halted
    And register a0 holds 1

  Scenario: A single step ignores breakpoints
    Given a machine running the program
      """
      addi a0, zero, 1
      ebreak
      """
    And a breakpoint at 0x0
    When I step the machine
    Then register a0 holds 1

  Scenario: run stops after the step limit
    Given a machine running the program
      """
      loop: j loop
      """
    When I run the machine for at most 100 steps
    Then the machine is running
    And the step count is 100

  Scenario: Stepping back restores registers, memory, pc and state exactly
    Given a machine running the program
      """
          li a0, 0x2000
          li a1, 0x1234
          sw a1, 0(a0)
          lw a2, 0(a0)
          addi a2, a2, 1
          sb a2, 4(a0)
          jal ra, end
          nop
      end: ebreak
      """
    When I step the machine 9 times recording each state
    Then the machine is halted
    And stepping back 9 times restores every recorded state exactly
    And stepping back once more fails

  Scenario: Stepping back from a fault returns to the state before it
    Given a machine running the program
      """
      li a7, 1
      ecall
      """
    When I run the machine
    Then the machine is faulted
    When I step back
    Then the machine is running
    And the program counter is 0x4
    And the fault is none

  Scenario: Stepping back puts consumed input back
    Given a machine running the program
      """
      li a0, 0
      li a1, 0x3000
      li a2, 5
      li a7, 63
      ecall
      ebreak
      """
    When I provide the input "abc"
    And I run the machine
    And I step back 2 times
    Then memory at 0x3000 holds "00 00 00"
    When I run the machine
    Then memory at 0x3000 holds "61 62 63"

  Scenario: The step-back history is bounded
    Given a machine running the program
      """
      loop: addi a0, a0, 1
            j loop
      """
    When I run the machine for at most 30000 steps
    Then I can step back between 10000 and 20000 times

  Scenario: Reset restores the program and clears memory, registers and history
    Given a machine running the program
      """
      li a0, 0x2000
      sw a0, 0(a0)
      li a7, 93
      ecall
      """
    When I run the machine
    Then the machine is halted
    When I reset the machine
    Then the machine is ready
    And the program counter is 0x0
    And register sp holds 0x100000
    And register a0 holds 0
    And memory at 0x2000 holds "00 00 00 00"
    And the step count is 0
    And there is no exit code
    And stepping back once more fails
    When I run the machine
    Then the machine exit code is 8192

  Scenario: Summing 1 to 10 and printing the result with ecall write
    Given a machine running the program
      """
          li t0, 1
          li t1, 10
          li a0, 0
      loop:
          add a0, a0, t0
          addi t0, t0, 1
          bge t1, t0, loop
          li t2, 10
          div t3, a0, t2
          rem t4, a0, t2
          addi t3, t3, 48
          addi t4, t4, 48
          li a1, 0x2000
          sb t3, 0(a1)
          sb t4, 1(a1)
          sb t2, 2(a1)
          li a0, 1
          li a2, 3
          li a7, 64
          ecall
          li a0, 0
          li a7, 93
          ecall
      """
    When I run the machine
    Then the output on file descriptor 1 is "55\n"
    And the machine is halted
    And the machine exit code is 0
