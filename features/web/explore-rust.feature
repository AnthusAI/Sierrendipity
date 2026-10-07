@web
Feature: Explore how Rust becomes machine code
  Rust is explored like C: the same Explore button, the same panes (source lines, RISC-V instructions,
  machine words, bits) and the same in-browser emulator. Rust adds a "Show safety checks" toggle
  (overflow and bounds checks) and demangled function names for the runtime rows.

  Background:
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode
    And I switch the language to Rust
    And I paste this into the editor:
      """
      fn main() {
          let mut sum = 0;
          for i in 1..=3 {
              sum += i;
          }
          println!("{}", sum);
      }
      """

  Scenario: Explore is offered for Rust and groups instructions under their Rust lines
    When I press "Explore"
    Then the "Assembly" tab is selected
    And the assembly group for source line 4 lists "add a5, a4, a5"
    And the assembly group for source line 4 is headed "sum += i;"
    And the assembly group for source line 2 lists "sw zero, -20(s0)"

  Scenario: The request says Rust and leaves the safety checks off by default
    When I press "Explore"
    Then the backend received an explain request for "rust" with checks "false" and the file "main.rs"

  Scenario: Runtime rows carry demangled names and stay hidden until asked for
    When I press "Explore"
    Then the instruction "sub a0, a0, a1" is not listed
    When I switch on "Show runtime"
    Then the instruction "sub a0, a0, a1" is listed
    And the assembly shows a runtime group for the function "core::fmt::Formatter::pad"
    And the assembly shows a runtime group for the function "<std::io::Stdout as core::fmt::Write>::write_str"

  Scenario: The safety checks toggle maps to the checks field
    When I switch on "Show safety checks"
    And I press "Explore"
    Then the backend received an explain request for "rust" with checks "true" and the file "main.rs"

  Scenario: The compiled Rust program runs in the emulator
    When I press "Explore"
    And I press "Run in emulator"
    Then the terminal shows "6"
    And the terminal shows "exit code 0"

  Scenario: The compiled Rust program can be stepped
    When I press "Explore"
    And I press "Step"
    Then the machine status is "Ready"
    And the PC is 0x00000030
    When I press "Step Back"
    Then the PC is 0x00000000

  Scenario: Compile errors appear in the terminal and no panes are shown
    When I paste this into the editor:
      """
      compile_error!("boom");
      """
    And I press "Explore"
    Then the terminal shows "error: boom"
    And the terminal shows "main.rs:1:1"
    And the compiler error is styled distinctly
    And there is no inspector pane

  Scenario: The starter project can be explored
    When I create a project "starter" in Rust
    And I press "Explore"
    Then the "Assembly" tab is selected
    And the file tree lists "main.rs"

  Scenario: The safety checks toggle is only offered for Rust
    Then the "Show safety checks" toggle is offered
    When I switch the language to C
    Then the "Show safety checks" toggle is not offered
    And the "Explore" button is offered
    When I switch the language to Python
    Then the "Explore" button is not offered
