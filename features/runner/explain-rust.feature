Feature: Explain a Rust program as RISC-V machine code
  POST /explain with language "rust" compiles a student's ordinary Rust (`fn main`, `println!`, `String`,
  `Vec`, `use std::io;`) for bare-metal RV32IM and returns the same program image, instruction list and
  line map as for C. The returned image runs in the browser's emulator (the real explorer Machine here).

  @linux-only
  Scenario: A hello world compiles to a program, instructions and a line map
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          println!("hello");
      }
      """
    When the project is explained
    Then the status is "ok"
    And the program has load address 0, entry 0, stack top 1048576 and memory size 1048576
    And the line map has entries for "main.rs" lines "1,2,3"
    And the instructions of function "main::main" have origin "user"
    And some instructions have origin "runtime"
    And the compile output has no temporary paths
    And no instruction names a temporary path

  @linux-only
  Scenario: Hello world runs in the emulator
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          println!("hello, {}!", "world");
          eprintln!("to stderr");
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "hello, world!\n"
    And the explorer error output is "to stderr\n"
    And the explorer exit code is 0

  @linux-only
  Scenario: A program reads a number with read_line and prints its square
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io;

      fn main() {
          let mut line = String::new();
          io::stdin().read_line(&mut line).unwrap();
          let n: i32 = line.trim().parse().unwrap();
          println!("{}", n * n);
      }
      """
    And the stdin "12\n"
    When the project is explained and run in the explorer
    Then the explorer output is "144\n"
    And the explorer exit code is 0

  @linux-only
  Scenario: Lines of input are read with lines()
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io::{self, BufRead};

      fn main() {
          let mut total = 0;
          for line in io::stdin().lock().lines() {
              total += line.unwrap().trim().parse::<i32>().unwrap();
          }
          println!("total {}", total);
      }
      """
    And the stdin "1\n2\n39\n"
    When the project is explained and run in the explorer
    Then the explorer output is "total 42\n"

  @linux-only
  Scenario: Vec, String and format! work
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let mut words: Vec<String> = Vec::new();
          for i in 0..3 {
              words.push(format!("w{}", i * 2));
          }
          let joined = words.join("-");
          let boxed = Box::new(joined.len());
          println!("{} {} {:?}", joined, boxed, vec![1, 2, 3]);
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "w0-w2-w4 8 [1, 2, 3]\n"

  @linux-only
  Scenario: A BTreeMap program works
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::collections::BTreeMap;

      fn main() {
          let mut counts = BTreeMap::new();
          for word in "b a c a b a".split(' ') {
              *counts.entry(word).or_insert(0) += 1;
          }
          for (word, n) in &counts {
              println!("{word}: {n}");
          }
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "a: 3\nb: 2\nc: 1\n"

  @linux-only
  Scenario: Recursion works
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn factorial(n: u64) -> u64 {
          if n <= 1 { 1 } else { n * factorial(n - 1) }
      }

      fn main() {
          println!("{}", factorial(15));
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "1307674368000\n"

  @linux-only
  Scenario: A while loop sum compiles close to C
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn sum_to(n: u32) -> u32 {
          let mut total = 0;
          let mut i = 1;
          while i <= n {
              total += i;
              i += 1;
          }
          total
      }

      fn main() {
          println!("{}", sum_to(100));
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "5050\n"
    And the function "main::sum_to" has fewer than 40 instructions
    And the instructions of function "main::sum_to" have origin "user"
    And the line map has entries for "main.rs" lines "1,3,4,5,6,8"

  @linux-only
  Scenario: process::exit sets the exit code
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          println!("bye");
          std::process::exit(7);
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "bye\n"
    And the explorer exit code is 7

  @linux-only
  Scenario: A panic prints its location on standard error and exits with 101
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let numbers = [1, 2, 3];
          let index = numbers.len() + 2;
          println!("before");
          println!("{}", numbers[index]);
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "before\n"
    And the explorer error output contains "thread 'main' panicked at main.rs:5:20:\nindex out of bounds: the len is 3 but the index is 5"
    And the explorer exit code is 101

  @linux-only
  Scenario: unwrap on an error panics with 101
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let n: i32 = "abc".parse().unwrap();
          println!("{}", n);
      }
      """
    When the project is explained and run in the explorer
    Then the explorer error output contains "called `Result::unwrap()` on an `Err` value: ParseIntError"
    And the explorer exit code is 101

  @linux-only
  Scenario: Integer overflow panics when safety checks are on
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let mut x: u8 = 250;
          for _ in 0..10 {
              x += 1;
          }
          println!("{}", x);
      }
      """
    And safety checks are on
    When the project is explained and run in the explorer
    Then the explorer error output contains "attempt to add with overflow"
    And the explorer exit code is 101

  @linux-only
  Scenario: Integer overflow wraps silently when safety checks are off
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let mut x: u8 = 250;
          for _ in 0..10 {
              x += 1;
          }
          println!("{}", x);
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "4\n"
    And the explorer exit code is 0

  @linux-only
  Scenario: Safety checks add instructions that belong to the student's line
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn add(a: i32, b: i32) -> i32 {
          a + b
      }

      fn main() {
          println!("{}", add(1, 2));
      }
      """
    And safety checks are on
    When the project is explained
    Then the status is "ok"
    And the instruction count differs from a build of the same project with safety checks off
    And the instructions of the line "main.rs:2" include more than the same line without safety checks

  @linux-only
  Scenario: The optimization level changes the generated code
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn sum_to(n: u32) -> u32 {
          let mut total = 0;
          let mut i = 1;
          while i <= n {
              total += i;
              i += 1;
          }
          total
      }

      fn main() {
          println!("{}", sum_to(100));
      }
      """
    And the optimization level "Og"
    When the project is explained
    Then the status is "ok"
    And the instruction count differs from an "O0" build of the same project

  @linux-only
  Scenario: A for loop over a range pulls in runtime rows that are not the student's
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let mut total = 0;
          for i in 0..10 {
              total += i;
          }
          println!("{}", total);
      }
      """
    When the project is explained
    Then the status is "ok"
    And some instructions of a function in "core" have origin "runtime"
    And the instructions of those functions have no line map entries
    And the line map has entries for "main.rs" lines "1,3,4,6"

  @linux-only
  Scenario: Function names are demangled and carry no hash
    Given a Rust project
    And the file "main.rs" containing:
      """
      struct Point { x: i32 }

      impl Point {
          fn double(&self) -> i32 { self.x * 2 }
      }

      impl std::fmt::Display for Point {
          fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
              write!(f, "P({})", self.x)
          }
      }

      fn main() {
          let p = Point { x: 4 };
          println!("{} {}", p, p.double());
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "P(4) 8\n"
    And the instruction function names include "main::main"
    And the instruction function names include "main::Point::double"
    And the instruction function names include "<main::Point as core::fmt::Display>::fmt"
    And the instruction function names include "core::fmt::Formatter::pad"
    And no instruction function name looks mangled or carries a hash
    And the instructions of function "<main::Point as core::fmt::Display>::fmt" have origin "user"
    And the instructions of function "core::fmt::Formatter::pad" have origin "runtime"

  @linux-only
  Scenario: A student's own modules in other files are mapped
    Given a Rust project
    And the file "main.rs" containing:
      """
      mod util;
      mod geometry;

      fn main() {
          println!("{} {}", util::twice(21), geometry::area(3, 4));
      }
      """
    And the file "util.rs" containing:
      """
      pub fn twice(x: i32) -> i32 {
          x * 2
      }
      """
    And the file "geometry/mod.rs" containing:
      """
      pub fn area(w: i32, h: i32) -> i32 {
          w * h
      }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "42 12\n"
    And the line map has entries for "util.rs" lines "1,2,3"
    And the line map has entries for "geometry/mod.rs" lines "1,2,3"
    And the instruction function names include "main::util::twice"
    And the instructions of function "main::util::twice" have origin "user"
    And no instruction names a temporary path

  @linux-only
  Scenario: A syntax or type error is reported with its file, line and column and no program
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let x: i32 = "no";
      }
      """
    When the project is explained
    Then the status is "compile_error"
    And the compile output mentions "error[E0308]: mismatched types"
    And the compile output mentions "main.rs:2:18"
    And the compile output has no temporary paths
    And there is no program and no instruction list

  @linux-only
  Scenario: An error in a nested module names the student's path
    Given a Rust project
    And the file "main.rs" containing:
      """
      mod geometry;
      fn main() { println!("{}", geometry::area(1, 2)); }
      """
    And the file "geometry/mod.rs" containing:
      """
      pub fn area(w: i32, h: i32) -> i32 { w * undefined }
      """
    When the project is explained
    Then the status is "compile_error"
    And the compile output mentions "geometry/mod.rs:1:"
    And the compile output has no temporary paths

  @linux-only
  Scenario Outline: Parts of std the emulator lacks are reported in a friendly way
    Given a Rust project
    And the file "main.rs" containing:
      """
      <code>
      fn main() {
      }
      """
    When the project is explained
    Then the status is "compile_error"
    And the compile output mentions "This is not available in the emulator yet: <item>"
    And the compile output mentions "The emulator supports"
    And the compile output has no temporary paths

    Examples:
      | code                                  | item                      |
      | use std::collections::HashMap;        | std::collections::HashMap |
      | use std::thread;                      | std::thread               |
      | use std::fs::File;                    | std::fs                   |
      | use std::time::Instant;               | std::time            |
      | use std::env;                         | std::env                  |
      | use std::net::TcpStream;              | std::net             |

  @linux-only
  Scenario: A std path used in an expression is also reported in a friendly way
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let mut m = std::collections::HashMap::new();
          m.insert(1, 2);
      }
      """
    When the project is explained
    Then the status is "compile_error"
    And the compile output mentions "This is not available in the emulator yet: std::collections::HashMap"

  Scenario Outline: Only Rust sources are accepted
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {}
      """
    And the file "<path>" containing:
      """
      nop
      """
    When the project is explained
    Then the request is rejected

    Examples:
      | path        |
      | boot.S      |
      | link.ld     |
      | notes.txt   |
      | util.c      |
      | Cargo.toml  |
      | UTIL.RS     |
      | ../evil.rs  |

  Scenario: A Rust project without main.rs is refused
    Given a Rust project
    And the file "util.rs" containing:
      """
      pub fn f() {}
      """
    When the project is explained
    Then the request is rejected

  Scenario Outline: A bad optimization level or safety-checks value is refused
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {}
      """
    And the request field "<field>" set to the JSON <value>
    When the project is explained
    Then the request is rejected

    Examples:
      | field    | value  |
      | optLevel | "O2"   |
      | optLevel | 0      |
      | checks   | "yes"  |
      | checks   | 1      |
      | checks   | null   |

  Scenario: Other languages cannot be explained
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {}
      """
    And the request field "language" set to the JSON "go"
    When the project is explained
    Then the request is rejected

  # ---- hostile inputs (the Rust counterparts of the C explain review) ----

  @linux-only
  Scenario: include_str! of a world-readable file is accepted
    Given a Rust project
    And the file "main.rs" containing:
      """
      static PASSWD: &str = include_str!("/etc/hostname");
      fn main() { println!("{}", PASSWD.len() > 0); }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "true\n"

  @linux-only
  Scenario: include_str! of a file the compiler's user cannot read is a compile error
    Given the runner has secrets in its environment
    And a Rust project
    And the file "main.rs" containing:
      """
      static DATA: &str = include_str!("/proc/1/environ");
      fn main() { println!("{}", DATA); }
      """
    When the project is explained
    Then the status is "compile_error"
    And there is no program and no instruction list

  @linux-only
  Scenario Outline: Embedding an endless device ends with a limit and does not hang the runner
    Given a Rust project
    And the file "main.rs" containing:
      """
      static DATA: &[u8] = <macro>;
      fn main() { println!("{}", DATA.len()); }
      """
    When the project is explained while health checks are polled
    Then the status is one of "compile_error, time_limit_exceeded, output_limit_exceeded"
    And there is no program and no instruction list
    And every health check was answered within 3 seconds
    And the compile output has no temporary paths

    Examples:
      | macro                          |
      | include_bytes!("/dev/zero")    |
      | include_bytes!("/dev/urandom") |

  @linux-only
  Scenario Outline: An endless .incbin through global_asm! ends with a limit
    Given a Rust project
    And the file "main.rs" containing:
      """
      core::arch::global_asm!(".incbin \"<device>\"");
      fn main() {}
      """
    When the project is explained while health checks are polled
    Then the status is one of "compile_error, time_limit_exceeded, output_limit_exceeded"
    And there is no program and no instruction list
    And every health check was answered within 3 seconds

    Examples:
      | device       |
      | /dev/zero    |
      | /dev/urandom |

  @linux-only
  Scenario: Malformed debug sections from global_asm! cannot break the parser
    Given a Rust project
    And the file "main.rs" containing:
      """
      core::arch::global_asm!(
          ".section .debug_line,\"\",@progbits",
          ".4byte 0x7fffffff",
          ".2byte 5",
          ".4byte 0x40, 0xffffffff, 0x41414141",
          ".text"
      );
      fn main() { println!("still fine"); }
      """
    When the project is explained and run in the explorer
    Then the explorer output is "still fine\n"

  @linux-only
  Scenario: A hostile line table with many sequences cannot stall the runner
    Given a Rust project
    And a Rust project whose debug line table has 200000 sequences
    When the project is explained while health checks are polled
    Then the status is "output_limit_exceeded"
    And the request completed within 8 seconds
    And every health check was answered within 3 seconds
    And there is no program and no instruction list

  @linux-only
  Scenario: Redefining the entry symbols gives a clear error
    Given a Rust project
    And the file "main.rs" containing:
      """
      #[no_mangle]
      pub extern "C" fn main(_argc: i32, _argv: *const *const u8) -> i32 { 3 }
      fn something() {}
      """
    When the project is explained
    Then the status is one of "compile_error, link_error"
    And the compile output has no temporary paths

  @linux-only
  Scenario: Redefining _start is a link error
    Given a Rust project
    And the file "main.rs" containing:
      """
      #[no_mangle]
      pub extern "C" fn _start() {}
      fn main() {}
      """
    When the project is explained
    Then the status is one of "compile_error, link_error"
    And the compile output has no temporary paths

  @linux-only
  Scenario: link_section abuse cannot place code or data outside the image
    Given a Rust project
    And the file "main.rs" containing:
      """
      #[link_section = ".text.start"]
      #[no_mangle]
      pub static HOSTILE: [u32; 4] = [0x13, 0x13, 0x13, 0x13];
      #[link_section = ".debug_line"]
      #[used]
      static NOISE: [u8; 64] = [0xff; 64];
      fn main() { println!("ok {}", HOSTILE[0]); }
      """
    When the project is explained while health checks are polled
    Then the status is one of "ok, compile_error, link_error, output_limit_exceeded"
    And every health check was answered within 3 seconds
    And the compile output has no temporary paths

  @linux-only
  Scenario: Ten thousand tiny modules are handled within the limits
    Given a Rust project
    And a main.rs with 10000 tiny modules
    When the project is explained while health checks are polled
    Then the status is one of "ok, compile_error, time_limit_exceeded, output_limit_exceeded"
    And every health check was answered within 3 seconds

  @linux-only
  Scenario: A giant string literal does not break the image limit
    Given a Rust project
    And a main.rs with a string literal of 3000000 bytes
    When the project is explained
    Then the status is "output_limit_exceeded"
    And there is no program and no instruction list

  @linux-only
  Scenario: Macro recursion hits the recursion limit and is a compile error
    Given a Rust project
    And the file "main.rs" containing:
      """
      macro_rules! r { ($($x:tt)*) => { r!($($x)* $($x)*) }; }
      fn main() { r!(1); }
      """
    When the project is explained while health checks are polled
    Then the status is one of "compile_error, time_limit_exceeded, output_limit_exceeded"
    And there is no program and no instruction list
    And every health check was answered within 3 seconds

  @linux-only
  Scenario: A const-eval infinite loop ends and does not hang the runner
    Given a Rust project
    And the file "main.rs" containing:
      """
      const X: u32 = { loop {} };
      fn main() { println!("{}", X); }
      """
    When the project is explained while health checks are polled
    Then the status is one of "compile_error, time_limit_exceeded, output_limit_exceeded"
    And there is no program and no instruction list
    And every health check was answered within 3 seconds
    And no process of a sandbox user is left running

  @linux-only
  Scenario: The compiler runs as an unprivileged user and sandbox slots are released after failures
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { let x: i32 = "no"; }
      """
    When the project is explained 6 times in a row
    Then every explain finished with status "compile_error" in under 40 seconds
    And no process of a sandbox user is left running
    And no files owned by sandbox users remain
