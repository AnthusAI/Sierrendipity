@web
Feature: Practice Rust in the browser IDE
  Rust is a native practice language beside Python, C and C++: a starter project, syntax
  highlighting, and runs on the backend like the others.

  Background:
    Given a mock backend that needs 0 ms to start
    And the IDE is opened in dev mode

  Scenario: Rust is in the language list with a greeting starter
    When I switch the language to Rust
    Then the file tree lists "main.rs"
    And the editor shows "use std::io"
    And the editor shows "read_line"

  Scenario: The editor highlights Rust
    When I switch the language to Rust
    Then the editor highlights the Rust keyword "fn"

  Scenario: Run the starter and answer its prompt
    When I switch the language to Rust
    And I press Run
    Then the terminal shows "Name: "
    When I type "Ada" into the terminal and press Enter
    Then the terminal shows "Hello, Ada!"
    And the program has finished
    And the backend received a "rust" run request with the file "main.rs"

  Scenario: A multi-file Rust project is sent with all its files
    When I create a project "crate" in Rust
    And I create the file "util.rs"
    And I press Run
    Then the terminal shows "files: main.rs util.rs"
    And the backend received a "rust" run request with the file "util.rs"

  Scenario: Switching language keeps every language's project
    When I replace the editor text with "// my python"
    And I switch the language to Rust
    And I replace the editor text with "// my rust"
    And I switch the language to Python
    Then the editor shows "// my python"
    When I switch the language to Rust
    Then the editor shows "// my rust"
    When I switch the language to C++
    Then the file tree lists "main.cpp"
