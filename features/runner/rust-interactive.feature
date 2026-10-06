@linux-only
Feature: Interact with a running Rust program
  Rust programs run under the same pty wrapper as C and C++, so the student sees output as it happens.
  Rust's stdout is line-buffered even on a terminal and, unlike C, it is not flushed when the program
  reads stdin: a prompt written with print! needs io::stdout().flush() to appear before the input.

  Scenario: A program prompts with a flush and greets the student
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io::{self, Write};
      fn main() {
          print!("Name: ");
          io::stdout().flush().unwrap();
          let mut name = String::new();
          io::stdin().read_line(&mut name).unwrap();
          println!("Hello, {}", name.trim());
      }
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "Name: "
    When "Ada\n" is sent to stdin
    Then the stream shows "Hello, Ada"
    And the run exits with status "ok"

  Scenario: A prompt without a flush stays hidden until the line ends
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io;
      fn main() {
          print!("Name: ");
          let mut name = String::new();
          io::stdin().read_line(&mut name).unwrap();
          println!("Hello, {}", name.trim());
      }
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream has shown nothing for 1500 ms
    When "Ada\n" is sent to stdin
    Then the stream shows "Name: Hello, Ada"
    And the run exits with status "ok"

  Scenario: Output arrives while the program waits for input
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io;
      fn main() {
          println!("tick");
          let mut s = String::new();
          io::stdin().read_line(&mut s).unwrap();
      }
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "tick"

  Scenario: A program reads until end of input
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io::{self, BufRead};
      fn main() {
          let mut n = 0;
          for line in io::stdin().lock().lines() { line.unwrap(); n += 1; }
          println!("{} lines", n);
      }
      """
    When the project is started interactively
    And the event stream is opened
    And "a\nb\n" is sent to stdin
    And the end of input is sent
    Then the stream shows "2 lines"
    And the run exits with status "ok"

  Scenario: Compiler errors are reported on the stream
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { let x: i32 = "no"; }
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows a failed compile mentioning "main.rs:1"
    And the run exits with status "compile_error"

  Scenario: A panic is a runtime error and its message is on the stream
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { panic!("boom"); }
      """
    When the project is started interactively
    And the event stream is opened
    Then the run exits with status "runtime_error"

  Scenario: Interactive Rust runs are sandboxed too
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::net::TcpStream;
      fn main() {
          match TcpStream::connect("93.184.216.34:80") {
              Ok(_) => println!("connected"),
              Err(e) => println!("{:?}", e.kind()),
          }
      }
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "PermissionDenied"
    And the run exits with status "ok"
