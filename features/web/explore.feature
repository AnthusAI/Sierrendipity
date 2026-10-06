@web
Feature: Explore how C becomes machine code
  The Explore button compiles the C program and shows the compilation
  hierarchy: source lines, RISC-V instructions, machine words and their bits.

  Background:
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    And I switch the language to C
    And I paste this into the editor:
      """
      int putchar(int c);
      int main(void) {
        int sum = 0;
        for (int i = 1; i <= 3; i++) {
          sum += i;
        }
        putchar('0' + sum);
        return 0;
      }
      """
    When I press "Explore"

  Scenario: Instructions are grouped under their C source lines
    Then the assembly group for source line 5 lists "add a5, a4, a5"
    And the assembly group for source line 3 lists "sw zero, -20(s0)"
    And the assembly group for source line 5 is headed "sum += i;"

  Scenario: A for loop line appears as several chips
    Then source line 4 has 2 assembly chips
    And the assembly chips for source line 4 are labelled "part 1 of 2" and "part 2 of 2"

  Scenario: Runtime instructions are hidden until asked for
    Then the instruction "sb a0, 15(sp)" is not listed
    When I switch on "Show runtime"
    Then the instruction "sb a0, 15(sp)" is listed

  Scenario: Hovering a source line highlights its instructions
    When I hover over source line 5
    Then the instructions for source line 5 are highlighted
    And the instructions for source line 3 are not highlighted

  Scenario Outline: The Bits card labels every field
    When I select the instruction "<instruction>"
    Then the Bits card shows the decoded text "<instruction>"
    And the Bits card has the segment "<segment>"
    And source line <line> is highlighted in the editor

    Examples: R-type, I-type load, S-type store, B-type branch
      | instruction      | segment      | line |
      | add a5, a4, a5   | rd = a5 (x15)      | 5    |
      | add a5, a4, a5   | rs2 = a5 (x15)     | 5    |
      | lw a4, -20(s0)   | rd = a4 (x14)      | 5    |
      | lw a4, -20(s0)   | rs1 = s0 (x8)     | 5    |
      | lw a4, -20(s0)   | imm = -20    | 5    |
      | sw a5, -20(s0)   | rs2 = a5 (x15)     | 5    |
      | sw a5, -20(s0)   | imm = -20    | 5    |
      | bge a5, a4, -36  | rs1 = a5 (x15)     | 4    |
      | bge a5, a4, -36  | rs2 = a4 (x14)     | 4    |
      | bge a5, a4, -36  | imm = -36    | 4    |

  Scenario: The Machine tab shows address, bytes and the word
    When I open the "Machine" tab
    Then the machine row for "add a5, a4, a5" shows the bytes "b3 07 f7 00"
    And the machine row for "add a5, a4, a5" shows the word "0x00f707b3"
    And the machine row for "add a5, a4, a5" shows the binary "0000 0000 1111 0111 0000 0111 1011 0011"

  Scenario: Bit segments carry text labels
    When I select the instruction "add a5, a4, a5"
    Then every bit segment has a text label

  Scenario: The compiled program runs in the emulator
    When I press "Run in emulator"
    Then the terminal shows "6"
    And the terminal shows "exit code 0"

  Scenario: The compiled program can be stepped
    When I press "Step"
    Then the machine status is "Ready"
    And the PC is 0x00000030
    And the current instruction is "addi sp, sp, -32"
    When I press "Step Back"
    Then the PC is 0x00000000

  Scenario: Compile errors appear in the terminal and no panes are shown
    When I paste this into the editor:
      """
      #error boom
      """
    And I press "Explore"
    Then the terminal shows "error: boom"
    And the compiler error is styled distinctly
    And there is no inspector pane
