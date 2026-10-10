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
              li t0, 0x656d614e
              sw t0, -64(sp)
              li t0, 0x203a
              sw t0, -60(sp)
              li t0, 0x6c6c6548
              sw t0, -48(sp)
              li t0, 0x202c6f
              sw t0, -44(sp)
              li a0, 1
              addi a1, sp, -64
              li a2, 6
              li a7, 64
              ecall
              li a0, 0
              addi a1, sp, -32
              li a2, 16
              li a7, 63
              ecall
              mv s1, a0
              li a0, 1
              addi a1, sp, -48
              li a2, 7
              li a7, 64
              ecall
              li a0, 1
              addi a1, sp, -32
              mv a2, s1
              li a7, 64
              ecall
              li a0, 0
              li a7, 93
              ecall
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

  Scenario: Machine code lines map to the right editor lines
    Given a project "hex" in Machine code with the program:
      """
      // a comment with words: 00000013 00000013
      00500513
      0b0000_0000 0101_0000 0000_0101 0001_0011
      0x00000073
      """
    When I toggle the breakpoint at address 0x00000008
    And I press "Continue"
    Then the PC is 0x00000008
    And the editor marks the current instruction on line 4
    And the editor marks a breakpoint on line 4

  Scenario: ebreak halts without an exit code
    Given a project "hex" in Machine code with the program:
      """
      0x00100073
      """
    When I press Run
    Then the terminal shows "[ebreak]"
    And the machine status is "Halted (ebreak)"

  Scenario: Stop while waiting for input updates the status
    Given a project "wait" in RISC-V assembly with the program:
      """
      addi a0, zero, 0
      addi a1, sp, -32
      addi a2, zero, 8
      addi a7, zero, 63
      ecall
      """
    When I press Run
    Then the machine status is "Waiting for input"
    When I press Stop
    Then the machine status is "Stopped"

  Scenario: A long Continue keeps the registers and step count fresh
    Given a project "loop" in RISC-V assembly with the program:
      """
      spin: jal zero, spin
      """
    When I press "Continue"
    Then the step count exceeds 1000
    And the machine status is "Running"
    When I press Stop
    Then the machine status is "Ready"

  Scenario: Reset then Continue is not ignored
    Given a project "loop" in RISC-V assembly with the program:
      """
      spin: jal zero, spin
      """
    When I press "Continue"
    And I press "Reset"
    And I press "Continue"
    Then the machine status is "Running"
    And the step count exceeds 1000
    When I press Stop

  Scenario: Editing while stepping resets the program and says so
    Given a project "edit" in RISC-V assembly with the program:
      """
      addi a0, zero, 5
      addi a1, zero, 7
      """
    When I press "Step"
    And I paste this into the editor:
      """
      addi a0, zero, 6
      addi a1, zero, 7
      """
    Then I see the message "The program was reset because the source changed"
    And the PC is 0x00000000

  Scenario: The Memory address box validates its input and is remembered
    Given a project "mem" in RISC-V assembly with the program:
      """
      addi a0, zero, 12
      """
    When I open the "Memory" tab
    And I enter the memory address "zz"
    Then the memory address problem is "not a hex address"
    When I enter the memory address "0x100"
    Then the memory shows address 0x00000100
    When I enter the memory address "0xffffffff"
    Then the memory address problem is "beyond the end of memory"
    When I open the "Registers" tab
    And I open the "Memory" tab
    Then the memory address box shows "0xffffffff"

  Scenario: Machine tab rows and the splitter are accessible
    Given a project "a11y" in RISC-V assembly with the program:
      """
      addi a0, zero, 5
      """
    When I open the "Machine" tab
    And I select the machine row "addi a0, zero, 5" with the keyboard
    Then the Bits card shows the decoded text "addi a0, zero, 5"
    And the splitter has the limits 260 to 900
