Feature: Interact with a running program
  A student sees prompts as they happen and types answers while the program runs.

  Scenario Outline: A program prompts for input and greets the student
    Given a <language> project
    And the file "<file>" containing:
      """
      <source>
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "Name: "
    When "Ada\n" is sent to stdin
    Then the stream shows "Hello, Ada"
    And the run exits with status "ok"

    Examples:
      | language | file     | source                                                                                                                                          |
      | Python   | main.py  | name = input("Name: ")\nprint("Hello, " + name)                                                                                                 |
      | C        | main.c   | #include <stdio.h>\nint main(){char n[64]; printf("Name: "); scanf("%63s", n); printf("Hello, %s\\n", n);}                                     |
      | C++      | main.cpp | #include <iostream>\n#include <string>\nint main(){std::string n; std::cout << "Name: "; std::cin >> n; std::cout << "Hello, " << n << "\\n";}  |

  Scenario: The stream carries program output only, not the echoed input
    Given a Python project
    And the file "main.py" containing:
      """
      name = input("Name: ")
      print("Hello, " + name)
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "Name: "
    When "Ada\n" is sent to stdin
    Then the run exits with status "ok"
    And the stream output is exactly "Name: Hello, Ada\r\n"

  Scenario: Output arrives while the program waits for input
    Given a C project
    And the file "main.c" containing:
      """
      #include <stdio.h>
      int main() { printf("tick\n"); getchar(); }
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "tick"

  Scenario: Compiler errors are reported on the stream
    Given a C project
    And the file "main.c" containing:
      """
      int main() { return x; }
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows a failed compile mentioning "main.c"
    And the run exits with status "compile_error"

  Scenario: A reconnecting client receives only later events
    Given a Python project
    And the file "main.py" containing:
      """
      print("first")
      input()
      print("second")
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "first"
    When the stream is disconnected
    And "go\n" is sent to stdin
    And the stream is reopened with the Last-Event-ID header
    Then the stream shows "second"
    And every event on the stream is newer than the last one seen before
    And the stream does not show "first"
    And the run exits with status "ok"

  Scenario: A client can resume with the after parameter
    Given a Python project
    And the file "main.py" containing:
      """
      print("first")
      input()
      print("second")
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "first"
    When the stream is disconnected
    And "go\n" is sent to stdin
    And the stream is reopened with the after parameter
    Then the stream shows "second"
    And every event on the stream is newer than the last one seen before
    And the stream does not show "first"

  Scenario: A client that fell too far behind is told events were dropped
    Given a Python project
    And the file "main.py" containing:
      """
      for i in range(20000):
          print("line %05d" % i, "x" * 90)
      """
    And a maximum output of 5000000 bytes
    When the project is started interactively
    And the event stream is opened
    Then the run exits with status "ok"
    When the stream is reopened from the beginning
    Then the stream reports dropped events
    And the stream shows "line 19999"
    And the stream does not show "line 00000"

  Scenario: A running program can be stopped
    Given a Python project
    And the file "main.py" containing:
      """
      print("working", flush=True)
      while True:
          pass
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "working"
    When the run is stopped
    Then the run exits with status "stopped"

  Scenario: Only one run is active at a time
    Given a Python project
    And the file "main.py" containing:
      """
      input()
      """
    When the project is started interactively
    And a second run is started
    Then the second start is refused with status 409

  Scenario: A new run can start after the previous one ends
    Given a Python project
    And the file "main.py" containing:
      """
      print("done")
      """
    When the project is started interactively
    And the event stream is opened
    Then the run exits with status "ok"
    When a second run is started
    Then the second start is accepted

  @linux-only
  Scenario: Interactive programs are sandboxed too
    Given a Python project
    And the file "main.py" containing:
      """
      import socket
      try:
          socket.socket()
      except PermissionError:
          print("PermissionError")
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "PermissionError"

  @linux-only
  Scenario: One run cannot read another run's files
    Given a Python project
    And the file "main.py" containing:
      """
      open("secret.txt", "w").write("hidden")
      print("ready", flush=True)
      input()
      """
    When the project is started interactively
    And the event stream is opened
    Then the stream shows "ready"
    Given a different project
    And a Python project
    And the file "main.py" containing:
      """
      import glob
      print(len(glob.glob("/tmp/sierrendipity-*/secret.txt")))
      """
    When the project is run
    Then the program output is "0\n"

  Scenario: A huge stdin post does not stall the program's output
    Given a Python project
    And the file "main.py" containing:
      """
      import sys
      sys.stdout.write("x" * 400000 + "\n")
      sys.stdout.flush()
      input()
      print("done")
      """
    And a maximum output of 5000000 bytes
    When the project is started interactively
    And a large stdin is sent
    And the event stream is opened
    Then the stream shows "done"

  Scenario: Interactive runs are bounded by a wall-clock limit
    Given a runner process with an interactive wall limit of 2 seconds
    And a Python project
    And the file "main.py" containing:
      """
      input()
      """
    When the project is started interactively
    And the event stream is opened
    Then the run exits with status "time_limit_exceeded"
