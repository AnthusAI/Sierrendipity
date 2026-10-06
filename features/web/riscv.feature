@web
Feature: Write and run RISC-V programs in the browser
  Students write RISC-V assembly or raw machine code, run it in an in-browser
  emulator and step through it. No backend session is involved.

  Background:
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode

  Scenario: The assembly starter prints a greeting
    When I create a project "asm" in RISC-V assembly
    And I press Run
    Then the terminal shows "Hello"
    And the terminal shows "exit code 0"
    And the program has finished

  Scenario: A typed assembly program runs
    When I create a project "asm" in RISC-V assembly
    And I paste this into the editor:
      """
      addi a0, zero, 3
      addi a7, zero, 93
      ecall
      """
    And I press Run
    Then the terminal shows "exit code 3"

  Scenario: A syntax error is reported with its line number
    When I create a project "asm" in RISC-V assembly
    And I paste this into the editor:
      """
      addi a0, zero, 1
      bogus a0, a1
      """
    Then the problems list shows "Line 2"
    And the editor marks an error
    When I press Run
    Then the terminal shows "Line 2"

  Scenario: The machine code starter exits with code 0
    When I create a project "hex" in Machine code
    And I press Run
    Then the terminal shows "exit code 0"

  Scenario: Hex words are run directly
    When I create a project "hex" in Machine code
    And I paste this into the editor:
      """
      0x00700513   # addi a0, zero, 7
      0x05d00893   # addi a7, zero, 93
      0x00000073   # ecall
      """
    And I press Run
    Then the terminal shows "exit code 7"

  Scenario: Bad hex is reported with its line number
    When I create a project "hex" in Machine code
    And I paste this into the editor:
      """
      0x00000013
      0xZZZZ
      """
    Then the problems list shows "Line 2"

  Scenario: Stepping advances the PC and highlights the changed register
    Given a project "steps" in RISC-V assembly with the program:
      """
      addi a0, zero, 5
      addi a1, zero, 7
      add a2, a0, a1
      sw a2, -4(sp)
      addi a7, zero, 93
      ecall
      """
    When I open the "Registers" tab
    Then the PC is 0x00000000
    When I press "Step"
    Then the PC is 0x00000004
    And register a0 is 0x00000005 and marked changed
    And register a1 is not marked changed
    When I press "Step"
    Then register a1 is 0x00000007 and marked changed
    And register a0 is not marked changed

  Scenario: Step Back restores the previous registers
    Given a project "steps" in RISC-V assembly with the program:
      """
      addi a0, zero, 5
      addi a1, zero, 7
      """
    When I press "Step"
    And I press "Step"
    And I press "Step Back"
    Then the PC is 0x00000004
    And register a1 is 0x00000000

  Scenario: A breakpoint stops Continue
    Given a project "steps" in RISC-V assembly with the program:
      """
      addi a0, zero, 5
      addi a1, zero, 7
      addi a2, zero, 9
      addi a7, zero, 93
      ecall
      """
    When I toggle the breakpoint at address 0x00000008
    And I press "Continue"
    Then the PC is 0x00000008
    And register a1 is 0x00000007 and marked changed
    And the machine status is "Ready"
    When I press "Continue"
    Then the machine status is "Halted"

  Scenario: The Memory tab shows bytes written by a store
    Given a project "mem" in RISC-V assembly with the program:
      """
      addi a0, zero, 12
      sw a0, -4(sp)
      """
    When I press "Step"
    And I press "Step"
    And I open the "Memory" tab
    Then memory byte 0x0000fffc shows "0c" and is marked written

  Scenario: Terminal input feeds a read system call
    Given a project "echo" in RISC-V assembly with the program:
      """
              addi a0, zero, 1
              la a1, ask
              addi a2, zero, 6
              addi a7, zero, 64
              ecall
              addi a0, zero, 0
              addi a1, sp, -32
              addi a2, zero, 16
              addi a7, zero, 63
              ecall
              addi s1, a0, 0
              addi a0, zero, 1
              la a1, hi
              addi a2, zero, 7
              addi a7, zero, 64
              ecall
              addi a0, zero, 1
              addi a1, sp, -32
              addi a2, s1, 0
              addi a7, zero, 64
              ecall
              addi a0, zero, 0
              addi a7, zero, 93
              ecall
      ask:    .string "Name: "
      hi:     .string "Hello, "
      """
    When I press Run
    Then the terminal shows "Name: "
    And the machine status is "Waiting for input"
    When I type "Ada" into the terminal and press Enter
    Then the terminal shows "Hello, Ada"
    And the machine status is "Halted"

  Scenario: Tabs can be operated from the keyboard
    Given a project "steps" in RISC-V assembly with the program:
      """
      addi a0, zero, 5
      """
    When I press "Step"
    And I focus the "Registers" tab and press "ArrowRight"
    Then the "Memory" tab is selected
