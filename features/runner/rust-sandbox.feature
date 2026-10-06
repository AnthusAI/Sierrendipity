@linux-only
Feature: Contain Rust student code
  Rust runs in the same sandbox as C and C++: its own unprivileged uid, seccomp filter, resource
  limits, a scrubbed environment and cleanup by uid. Hostile programs must end with a limit status.

  Scenario: An infinite loop is stopped at the time limit
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { loop {} }
      """
    And a time limit of 2000 ms
    When the project is run
    Then the status is "time_limit_exceeded"

  Scenario: Excessive output is truncated
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { loop { println!("0123456789abcde"); } }
      """
    When the project is run
    Then the status is "output_limit_exceeded"
    And the output was truncated

  Scenario: Runaway recursion is a runtime error, not a hang
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn deep(n: u64) -> u64 { if n == u64::MAX { 0 } else { 1 + deep(std::hint::black_box(n) + 1) } }
      fn main() { println!("{}", deep(0)); }
      """
    When the project is run
    Then the status is "runtime_error"
    And the program error output mentions "overflowed its stack"

  Scenario: A huge allocation is a memory limit
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let v = vec![0u8; std::hint::black_box(1usize << 40)];
          println!("{}", v.len());
      }
      """
    When the project is run
    Then the status is "memory_limit_exceeded"

  Scenario: Cloud credentials and the runner secret are not passed to student code
    Given the runner has secrets in its environment
    And a Rust project
    And the file "main.rs" containing:
      """
      fn main() {
          let mut names: Vec<String> = std::env::vars().map(|(k, _)| k).collect();
          names.sort();
          println!("{}", names.join(","));
      }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "HOME,LANG,PATH,PYTHONUNBUFFERED\n"

  Scenario: Rust cannot open a network connection
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
    When the project is run
    Then the status is "ok"
    And the program output is "PermissionDenied\n"

  Scenario: A raw socket call through extern C is refused
    Given a Rust project
    And the file "main.rs" containing:
      """
      extern "C" { fn socket(domain: i32, kind: i32, protocol: i32) -> i32; }
      fn main() {
          let fd = unsafe { socket(2, 1, 0) };
          println!("{} {:?}", fd, std::io::Error::last_os_error().kind());
      }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "-1 PermissionDenied\n"

  Scenario: A raw syscall is filtered by seccomp too
    Given a Rust project
    And the file "main.rs" containing:
      """
      extern "C" { fn syscall(number: i64, ...) -> i64; }
      #[cfg(target_arch = "aarch64")]
      const SYS_SOCKET: i64 = 198;
      #[cfg(target_arch = "x86_64")]
      const SYS_SOCKET: i64 = 41;
      fn main() {
          let r = unsafe { syscall(SYS_SOCKET, 2i64, 1i64, 0i64) };
          println!("{} {:?}", r, std::io::Error::last_os_error().kind());
      }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "-1 PermissionDenied\n"

  Scenario: Student code cannot read the runner's environment or root's files
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::fs;
      fn main() {
          for path in ["/proc/1/environ", "/root"] {
              let denied = match fs::read(path) {
                  Ok(_) => false,
                  Err(e) => e.kind() == std::io::ErrorKind::PermissionDenied,
              };
              println!("{} {}", path, if denied { "denied" } else { "read" });
          }
          println!("{}", if fs::read_dir("/root").is_err() { "no listing" } else { "listing" });
      }
      """
    When the project is run
    Then the program output is "/proc/1/environ denied\n/root denied\nno listing\n"

  Scenario: A shell started by the program is the same unprivileged user without secrets
    Given the runner has secrets in its environment
    And a Rust project
    And the file "main.rs" containing:
      """
      use std::process::Command;
      fn main() {
          let out = Command::new("sh").arg("-c").arg("id -u; env").output().unwrap();
          let text = String::from_utf8_lossy(&out.stdout).to_string();
          let uid: u32 = text.lines().next().unwrap().parse().unwrap();
          let leaked = text.contains("AWS_") || text.contains("RUNNER_SECRET") || text.contains("ECS_");
          println!("{} {}", uid >= 20001, leaked);
      }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "true false\n"

  Scenario: A shell cannot reach the network either
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::process::Command;
      fn main() {
          let out = Command::new("bash")
              .arg("-c")
              .arg("exec 3<>/dev/tcp/93.184.216.34/80 2>/dev/null && echo open || echo closed")
              .output()
              .unwrap();
          print!("{}", String::from_utf8_lossy(&out.stdout));
      }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "closed\n"

  Scenario: Spawning threads in a loop is capped and the runner survives
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::{thread, time::Duration};
      fn main() {
          let mut handles = Vec::new();
          loop {
              handles.push(thread::spawn(|| thread::sleep(Duration::from_secs(60))));
          }
      }
      """
    And a time limit of 3000 ms
    When the project is run
    Then the status is one of "runtime_error, time_limit_exceeded, memory_limit_exceeded"
    And the runner still answers health checks
    And no process of a sandbox user is left running

  Scenario: A spinning thread does not outlive main
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::thread;
      fn main() {
          thread::spawn(|| loop {});
          println!("main done");
      }
      """
    When the project is run
    Then the status is "ok"
    And the program output is "main done\n"
    And no process of a sandbox user is left running

  Scenario: A background process left behind is killed with the run
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::process::{Command, Stdio};
      fn main() {
          Command::new("sh")
              .arg("-c")
              .arg("sleep 1000 &")
              .stdin(Stdio::null())
              .stdout(Stdio::null())
              .stderr(Stdio::null())
              .spawn()
              .unwrap();
          println!("done");
      }
      """
    When the project is run
    Then the status is "ok"
    And no sleep process is left running
    And no process of a sandbox user is left running

  Scenario: Files left behind are removed
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { std::fs::write("/tmp/rust-left-behind.txt", "x").unwrap(); println!("ok"); }
      """
    When the project is run
    Then the status is "ok"
    And no files owned by sandbox users remain

  Scenario: A huge file write is stopped by the file size limit
    Given a Rust project
    And the file "main.rs" containing:
      """
      use std::io::Write;
      fn main() {
          let block = vec![0u8; 1 << 20];
          let mut f = std::fs::File::create("big.dat").unwrap();
          for _ in 0..512 { f.write_all(&block).unwrap(); }
          println!("finished");
      }
      """
    When the project is run
    Then the status is "runtime_error"

  # Compile-time attacks: the compiler runs as the run's uid under an address-space limit.
  Scenario: Embedding a file the user cannot read is a compile error
    Given a Rust project
    And the file "main.rs" containing:
      """
      static DATA: &str = include_str!("/proc/1/environ");
      fn main() { println!("{}", DATA); }
      """
    When the project is run
    Then the status is "compile_error"
    And the program was not executed

  Scenario Outline: Embedding an endless device ends with a limit and does not hang the runner
    Given a Rust project
    And the file "main.rs" containing:
      """
      static DATA: &[u8] = <macro>;
      fn main() { println!("{}", DATA.len()); }
      """
    And a time limit of 2000 ms
    When the project is run
    Then the status is one of "compile_error, time_limit_exceeded, output_limit_exceeded, memory_limit_exceeded"
    And the program was not executed
    And the runner still answers health checks
    And no process of a sandbox user is left running

    Examples:
      | macro                          |
      | include_bytes!("/dev/zero")    |
      | include_bytes!("/dev/urandom") |

  Scenario: Including an endless file as source ends with a limit
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { println!("{}", include!("/dev/zero")); }
      """
    When the project is run
    Then the status is one of "compile_error, time_limit_exceeded, output_limit_exceeded, memory_limit_exceeded"
    And the program was not executed
    And the runner still answers health checks

  Scenario: Reading standard input at compile time finds nothing and ends
    Given a Rust project
    And the file "main.rs" containing:
      """
      static DATA: &str = include_str!("/dev/stdin");
      fn main() { println!("{}", DATA); }
      """
    When the project is run
    Then the status is one of "compile_error, time_limit_exceeded, output_limit_exceeded, memory_limit_exceeded"
    And the runner still answers health checks

  Scenario: A compile-time explosion is stopped
    Given a Rust project
    And the file "main.rs" containing:
      """
      macro_rules! a { ($($x:tt)*) => { $($x)* $($x)* $($x)* $($x)* $($x)* $($x)* $($x)* $($x)* $($x)* $($x)* } }
      macro_rules! b { ($($x:tt)*) => { a!(a!($($x)*)) } }
      macro_rules! c { ($($x:tt)*) => { b!(b!($($x)*)) } }
      macro_rules! d { ($($x:tt)*) => { c!(c!($($x)*)) } }
      fn main() { let _ = [d!(0,)]; }
      """
    When the project is run
    Then the status is "compile_error"
    And the runner still answers health checks
    And no process of a sandbox user is left running

  Scenario: Failing and timed-out runs release their sandbox users
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { let x: i32 = "no"; }
      """
    When the project is run 6 times in a row
    Then every run finished with status "compile_error" in under 20 seconds
    And no process of a sandbox user is left running
    And no files owned by sandbox users remain

  Scenario: Runs beyond the cap are refused and the rest are served
    Given a Rust project
    And the file "main.rs" containing:
      """
      fn main() { loop {} }
      """
    And a time limit of 2000 ms
    When 6 projects are run at once
    Then 4 of them finish with status "time_limit_exceeded"
    And 2 of them are refused with status 429
    And no process of a sandbox user is left running
