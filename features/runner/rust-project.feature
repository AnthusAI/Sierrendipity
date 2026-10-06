Feature: Run a multi-file Rust project
  As a student I can submit Rust files, compiled with rustc alone (no cargo, no crates), and see what they print.
  Compiling needs the Rust toolchain, which only the runner image has: those scenarios are @linux-only.

  @linux-only
  Scenario: Hello world reads a name from stdin
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io;
      fn main() {
          let mut name = String::new();
          io::stdin().read_line(&mut name).unwrap();
          println!("Hello, {}!", name.trim());
      }
      """
    And the stdin "Ada\n"
    When the project is run
    Then the status is "ok"
    And the exit code is 0
    And the program output is "Hello, Ada!\n"

  @linux-only
  Scenario: A program reads standard input to the end
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io::{self, Read};
      fn main() {
          let mut all = String::new();
          io::stdin().read_to_string(&mut all).unwrap();
          let total: i32 = all.split_whitespace().map(|n| n.parse::<i32>().unwrap()).sum();
          println!("{}", total);
      }
      """
    And the stdin "1 2\n3\n"
    When the project is run
    Then the status is "ok"
    And the program output is "6\n"

  @linux-only
  Scenario: A program reads standard input line by line
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io::{self, BufRead};
      fn main() {
          for (i, line) in io::stdin().lock().lines().enumerate() {
              println!("{}: {}", i + 1, line.unwrap());
          }
      }
      """
    And the stdin "a\nb\n"
    When the project is run
    Then the status is "ok"
    And the program output is "1: a\n2: b\n"

  @linux-only
  Scenario: Modules in other files are compiled with the crate root
    Given a Rust project
    And the file "util.rs" containing:
      """
      pub fn greeting() -> &'static str { "Hello from util" }
      """
    And the file "main.rs" containing:
      """
      mod util;
      fn main() { println!("{}", util::greeting()); }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "Hello from util\n"

  @linux-only
  Scenario: Nested modules resolve in a/mod.rs and in a.rs with a/b.rs
    Given a Rust project
    And the file "main.rs" containing:
      """
      mod a;
      mod c;
      fn main() { println!("{} {}", a::name(), c::d::name()); }
      """
    And the file "a/mod.rs" containing:
      """
      pub fn name() -> &'static str { "a" }
      """
    And the file "c.rs" containing:
      """
      pub mod d;
      """
    And the file "c/d.rs" containing:
      """
      pub fn name() -> &'static str { "c::d" }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "a c::d\n"

  @linux-only
  Scenario: The entry field names another crate root
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { println!("main"); }
      """
    And the file "app.rs" containing:
      """
      fn main() { println!("app"); }
      """
    And the entry "app.rs"
    When the project is run
    Then the status is "ok"
    And the program output is "app\n"

  @linux-only
  Scenario: A compile error reads file, line and column with no temporary path
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let x: i32 = "text";
          println!("{}", x);
      }
      """
    When the project is run
    Then the status is "compile_error"
    And the compiler output mentions "error[E0308]"
    And the compiler output mentions "main.rs:2:18"
    And the compiler output does not mention "sierrendipity-"
    And the compiler output does not mention "[0m"
    And the program was not executed

  @linux-only
  Scenario: An error in a module file names that file
    Given a Rust project
    And the file "util.rs" containing:
      """
      pub fn two() -> i32 { "2" }
      """
    And the file "main.rs" containing:
      """
      mod util;
      fn main() { println!("{}", util::two()); }
      """
    When the project is run
    Then the status is "compile_error"
    And the compiler output mentions "util.rs:1"
    And the compiler output does not mention "sierrendipity-"

  @linux-only
  Scenario: Nightly feature attributes are refused by the compiler
    Given a Rust project
    And the file "main.rs" containing:
      """
      #![feature(never_type)]
      fn main() { println!("hi"); }
      """
    When the project is run
    Then the status is "compile_error"
    And the compiler output mentions "E0554"
    And the program was not executed

  @linux-only
  Scenario: A panic exits with code 101 and keeps its message
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          println!("before");
          panic!("boom");
      }
      """
    When the project is run
    Then the status is "runtime_error"
    And the exit code is 101
    And the program output is "before\n"
    And the program error output mentions "boom"
    And the program error output mentions "main.rs:3"

  @linux-only
  Scenario: Integer overflow panics as it does in a debug build
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::hint::black_box;
      fn main() {
          let x: i32 = black_box(i32::MAX);
          println!("{}", x + 1);
      }
      """
    When the project is run
    Then the status is "runtime_error"
    And the exit code is 101
    And the program error output mentions "attempt to add with overflow"

  @linux-only
  Scenario: An index out of bounds panics
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::hint::black_box;
      fn main() {
          let v = vec![1, 2, 3];
          println!("{}", v[black_box(7)]);
      }
      """
    When the project is run
    Then the status is "runtime_error"
    And the exit code is 101
    And the program error output mentions "index out of bounds"

  @linux-only
  Scenario: process::exit sets the exit code
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { println!("bye"); std::process::exit(3); }
      """
    When the project is run
    Then the status is "runtime_error"
    And the exit code is 3
    And the program output is "bye\n"

  @linux-only
  Scenario: Linking a library by attribute works for the C library
    Given a Rust project
    And the file "main.rs" containing:
      """
      #[link(name = "m")]
      extern "C" { fn cos(x: f64) -> f64; }
      fn main() { println!("{}", unsafe { cos(0.0) }); }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "1\n"

  @linux-only
  Scenario: Linking a library that does not exist is a compile error
    Given a Rust project
    And the file "main.rs" containing:
      """
      #[link(name = "no_such_library_here")]
      extern "C" { fn nothing(); }
      fn main() { unsafe { nothing() } }
      """
    When the project is run
    Then the status is "compile_error"
    And the compiler output does not mention "sierrendipity-"

  # Request validation: refused before any compiler runs, so these need no toolchain.
  Scenario Outline: Only .rs files are accepted
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {}
      """
    And the file "<other>" containing:
      """
      x
      """
    When the project is run
    Then the request is rejected

    Examples:
      | other      |
      | util.c     |
      | notes.txt  |
      | Cargo.toml |
      | build.rs.x |

  Scenario: A project without main.rs and without an entry is refused
    Given a Rust project
    And the file "util.rs" containing:
      """
      pub fn f() {}
      """
    When the project is run
    Then the request is rejected

  Scenario Outline: Rust requests are validated like C and C++ requests
    Given a Rust project
    And the file "<first>" containing:
      """
      fn main() {}
      """
    And the file "<second>" containing:
      """
      pub fn f() {}
      """
    When the project is run
    Then the request is rejected

    Examples:
      | first   | second   |
      | main.rs | main.rs  |
      | a       | a/b.rs   |
      | a/b.rs  | a        |
      | main.rs | ../x.rs  |
      | main.rs | /tmp/x.rs |

  Scenario: The entry must be one of the submitted files
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {}
      """
    And the entry "other.rs"
    When the project is run
    Then the request is rejected

  Scenario Outline: Invalid limits are refused for Rust too
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {}
      """
    And a time limit of <limit> ms
    When the project is run
    Then the request is rejected

    Examples:
      | limit |
      | 0     |
      | -5    |
